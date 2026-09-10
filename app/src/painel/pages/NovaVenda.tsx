import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AlertTriangle, ArrowLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Campo, Segmentado } from '@/components/ui/field';
import { registrarVenda, taxaDe } from '@/painel/data/queries';
import { gravando } from '@/painel/data/escritas';
import { emitirNotaFiscal } from '@/painel/data/notaFiscal';
import { useEstoque, useVendedores } from '@/painel/data/hooks';
import { useFiltros } from '@/painel/store/filtros';
import {
  CANAIS_COBRANCA, CANAIS_VENDA, FORMAS_PAGAMENTO_MANUAL, valorBrutoParcelado,
  type CanalCobranca, type FormaPagamento,
} from '@/painel/types';
import { cn, fmtBRL, fmtPct, isoDia } from '@/lib/utils';

const schema = z.object({
  clienteNome: z.string().trim().min(1, 'Informe o nome do cliente'),
  clienteFone: z.string().trim().optional(),
  cidade: z.string().trim().optional(),

  produtoId: z.string().min(1, 'Selecione o produto'),
  quantidade: z.coerce.number().int().min(1, 'Mínimo 1'),
  precoUnit: z.coerce.number().min(0.01, 'Informe o valor'),

  data: z.string().min(1),
  vendedorId: z.string().min(1, 'Selecione o vendedor'),
  canal: z.string().optional(),

  entrega: z.enum(['pendente', 'entregue']),

  temTradeIn: z.boolean(),
  tradeInModelo: z.string().trim().optional(),
  tradeInValor: z.coerce.number().min(0),
  tradeInRecebida: z.boolean(),

  // Uma ou mais formas de pagamento cobrindo o valor da venda (Pix + cartão
  // parcelado na mesma venda, por exemplo) — a soma tem que bater com o total.
  pagamentos: z.array(z.object({
    forma: z.string().min(1),
    parcelas: z.coerce.number().int().min(1).max(12),
    valor: z.coerce.number().min(0),
    // Auxiliar, não é enviado: o líquido que a loja quer embolsar nesta
    // perna, usado só pelo simulador (a base não pode ser o próprio `valor`,
    // que muda a cada clique — senão o segundo clique bruteia um valor que já
    // era bruto).
    liquidoAlvo: z.coerce.number().min(0).optional(),
    // Maquininha física ou Link de Pagamento — só importa pra crédito/débito,
    // que têm tabela de taxa diferente por canal (ver CanalCobranca).
    canal: z.enum(['maquininha', 'link_pagamento']),
  })).min(1),
  receberAgora: z.boolean(),

  observacoes: z.string().trim().optional(),
});

type Form = z.infer<typeof schema>;
type PernaForm = Form['pagamentos'][number];

/**
 * DESLIGADO A PEDIDO (09/2026): emitir nota automaticamente logo depois de
 * registrar a venda estava dando erro com a combinação de pagamento em
 * pernas (múltiplas formas) — em vez de resolver às pressas, a loja prefere
 * registrar a venda e emitir a nota manualmente por enquanto. A venda
 * continua sendo gravada e o estoque baixa normalmente; só o passo
 * automático de nota fica pausado. Religar é só voltar isto para `true`.
 */
const EMISSAO_NOTA_AUTOMATICA = false;

/** O que o painel do lead manda ao abrir esta tela a partir de um "ganho". */
interface PrefillDoLead {
  clienteNome?: string;
  clienteFone?: string;
  origemLead?: string;
}

export default function NovaVenda() {
  const navigate = useNavigate();
  const local = useLocation();
  const qc = useQueryClient();
  const hoje = isoDia(new Date());
  const vendedorLogado = useFiltros((s) => s.vendedorLogado);
  const admin = useFiltros((s) => s.papel === 'admin');

  const { data: produtos } = useEstoque();
  const { data: vendedores } = useVendedores();

  // Modal central: cobre desde "registrando" até o resultado final (nota
  // saiu ou não). Substituiu os banners no topo da tela -- ficavam fáceis
  // de perder de vista num formulário comprido.
  const [dialogAberto, setDialogAberto] = useState(false);
  const [fase, setFase] = useState<'venda' | 'nota'>('venda');
  const [resultado, setResultado] = useState<
    | { ok: true; cliente: string; chave?: string; url?: string; semNota?: boolean }
    | { ok: false; cliente: string; mensagem: string; vendaFalhou?: boolean }
    | null
  >(null);

  // Vindo do CRM ao registrar a venda de um lead "ganho" -- cliente e origem
  // já preenchidos, só falta o resto (produto, valor, pagamento).
  const doLead = (local.state ?? null) as PrefillDoLead | null;

  const {
    register, handleSubmit, control, setValue, reset, formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      data: hoje, quantidade: 1, precoUnit: 0, entrega: 'pendente',
      temTradeIn: false, tradeInValor: 0, tradeInRecebida: false,
      pagamentos: [{ forma: 'dinheiro', parcelas: 1, valor: 0, canal: 'maquininha' }],
      receberAgora: true,
      vendedorId: admin ? '' : vendedorLogado.id,
      clienteNome: doLead?.clienteNome ?? '',
      clienteFone: doLead?.clienteFone ?? '',
      observacoes: doLead?.origemLead ? `Veio do CRM: ${doLead.origemLead}` : '',
    },
  });

  const { fields: pernas, append, remove } = useFieldArray({ control, name: 'pagamentos' });

  const v = useWatch({ control });
  const produto = produtos?.find((p) => p.id === v.produtoId);
  const vendedor = vendedores?.find((x) => x.id === v.vendedorId);

  /**
   * Cálculo ao vivo — o vendedor precisa ver a margem ANTES de conceder desconto.
   *
   * A venda pode ter mais de uma forma de pagamento (Pix + cartão parcelado,
   * por exemplo) — a taxa de CADA perna depende da sua própria forma/parcela
   * (regra: quem paga o juros do parcelamento é o cliente, nunca a loja — por
   * isso o valor de cada perna já deve ser o BRUTO combinado com o cliente,
   * o "simulador" de cada linha ajuda a chegar nesse número). A margem soma a
   * taxa real de cada perna, não uma taxa única por venda.
   */
  const calc = useMemo(() => {
    const qtd = Number(v.quantidade) || 0;
    const preco = Number(v.precoUnit) || 0;
    const receita = preco * qtd;
    const custo = (produto?.custo ?? 0) * qtd;
    const credito = v.temTradeIn ? Number(v.tradeInValor) || 0 : 0;
    const aReceber = receita - credito;

    const pernasCalc = (v.pagamentos ?? []).map((p) => {
      const valor = Number(p?.valor) || 0;
      const parcelas = Number(p?.parcelas) || 1;
      const forma = (p?.forma ?? 'dinheiro') as FormaPagamento;
      const canal = (p?.canal ?? 'maquininha') as CanalCobranca;
      const taxaPct = taxaDe(forma, parcelas, canal);
      // "Fachada": o que a loja de fato quer daquela perna. Numa perna
      // bruteada pelo simulador (liquidoAlvo preenchido), valor > fachada de
      // propósito — o excedente cobre o juro que o CLIENTE está pagando, não
      // é dinheiro que sobra pra loja, então não pode contar na soma nem virar
      // custo de taxa contra a margem (ver o mesmo cálculo em queries.ts).
      const liquidoAlvo = Number(p?.liquidoAlvo) || 0;
      const fachada = liquidoAlvo > 0 ? liquidoAlvo : valor;
      const liquidoReal = valor * (1 - taxaPct / 100);
      const custoTaxa = Math.max(0, fachada - liquidoReal);
      return { valor, fachada, taxaPct, custoTaxa };
    });
    const somaPernas = pernasCalc.reduce((s, p) => s + p.fachada, 0);
    const taxa = pernasCalc.reduce((s, p) => s + p.custoTaxa, 0);
    const taxaPctBlend = receita > 0 ? (taxa / receita) * 100 : 0;
    const margem = receita - custo - taxa;

    const comissaoPct = vendedor?.comissaoPct ?? 0;
    return {
      receita, custo, taxa, taxaPct: taxaPctBlend, margem,
      margemPct: receita > 0 ? (margem / receita) * 100 : 0,
      credito, aReceber,
      somaPernas,
      pernasBatem: Math.abs(somaPernas - aReceber) <= 0.5,
      comissao: aReceber * (comissaoPct / 100),
      comissaoPct,
      semCusto: !!produto && produto.custo <= 0,
      saldoInsuficiente: !!produto && qtd > produto.estoque,
    };
  }, [v, produto, vendedor]);

  /**
   * O SIMULADOR de uma perna: a partir do valor líquido que a loja quer
   * embolsar NESSA perna (o que já está digitado no campo "Valor"), mostra
   * quanto cobrar — na maquininha ou no Link, conforme `canal` — em CADA
   * parcelamento de 1 a 12x, pra o cliente arcar com o juros. Clicar num
   * chip substitui parcelas + valor daquela perna pelo bruto correspondente.
   */
  function simuladorDaPerna(liquidoAlvo: number | undefined, canal: CanalCobranca) {
    if (!liquidoAlvo || liquidoAlvo <= 0) return null;
    return Array.from({ length: 12 }, (_, i) => i + 1).map((p) => ({
      parcelas: p,
      taxa: taxaDe('credito_parcelado', p, canal),
      cobrar: valorBrutoParcelado(liquidoAlvo, p, canal),
    }));
  }

  function aoSelecionarProduto(id: string) {
    setValue('produtoId', id);
    const p = produtos?.find((x) => x.id === id);
    if (p) {
      setValue('precoUnit', p.preco);
      // Com uma perna só, mantém o valor dela sincronizado com o total —
      // evita o vendedor esquecer de atualizar depois de trocar o produto.
      const qtd = Number(v.quantidade) || 1;
      if ((v.pagamentos?.length ?? 0) === 1) {
        setValue('pagamentos.0.valor', Math.round(p.preco * qtd * 100) / 100);
      }
    }
  }

  async function salvar(f: Form) {
    if (!calc.pernasBatem) {
      setResultado({
        ok: false, cliente: f.clienteNome, vendaFalhou: true,
        mensagem: `A soma das formas de pagamento (${fmtBRL(calc.somaPernas)}) não bate com o valor a receber (${fmtBRL(calc.aReceber)}). Ajuste antes de registrar.`,
      });
      setDialogAberto(true);
      return;
    }

    setResultado(null);
    setFase('venda');
    setDialogAberto(true);

    // Sem try/catch aqui, qualquer falha (rede, RLS recusando, vendedorId
    // que não existe de verdade — ver o guard de MOCK no Sidebar) deixava o
    // diálogo preso no spinner para sempre: `showClose`/`onOpenChange` só
    // fecham quando `resultado` existe, e sem capturar o erro ele nunca era
    // setado. Achado na bateria de testes pré-produção.
    let venda: Awaited<ReturnType<typeof registrarVenda>>;
    try {
      venda = await registrarVenda({
        data: f.data,
        produtoId: f.produtoId,
        vendedorId: f.vendedorId,
        quantidade: f.quantidade,
        precoUnit: f.precoUnit,
        pagamentos: f.pagamentos
          .filter((p) => p.valor > 0)
          .map((p) => ({
            forma: p.forma as FormaPagamento, parcelas: p.parcelas, valor: p.valor,
            liquidoAlvo: p.liquidoAlvo && p.liquidoAlvo > 0 ? p.liquidoAlvo : undefined,
            canal: p.canal as CanalCobranca,
          })),
        receberAgora: f.receberAgora,
        entrega: f.entrega,
        clienteNome: f.clienteNome,
        clienteFone: f.clienteFone || undefined,
        cidade: f.cidade || undefined,
        canal: (f.canal || undefined) as never,
        observacoes: f.observacoes || undefined,
        tradeIn: f.temTradeIn && f.tradeInValor > 0
          ? {
              modelo: f.tradeInModelo || 'Não informado',
              valorCredito: f.tradeInValor,
              recebida: f.tradeInRecebida,
            }
          : undefined,
      });
    } catch (e) {
      setResultado({
        ok: false, cliente: f.clienteNome, vendaFalhou: true,
        mensagem: e instanceof Error ? e.message : 'Falha ao registrar a venda. Nada foi gravado — confira e tente de novo.',
      });
      return;
    }

    qc.invalidateQueries();

    // A venda já está gravada e o estoque já baixou — se a nota falhar daqui
    // pra frente, isso NÃO desfaz a venda. É um problema separado, que dá pra
    // reemitir depois. Por isso tudo aqui embaixo é best-effort dentro de
    // try/catch, nunca impede o vendedor de seguir vendendo.
    //
    // Esta tela hoje só registra venda com retirada na loja (presencial) —
    // por isso sempre emite sem pedir CPF/endereço. "Entrega a domicílio" via
    // NFC-e automática ainda não está pronta (ver task pendente).
    if (EMISSAO_NOTA_AUTOMATICA && gravando() && venda?.id) {
      setFase('nota');
      try {
        const r = await emitirNotaFiscal(venda.id, 'homologacao');
        if (r.resposta?.status === 'autorizado' && r.resposta.chave_nfe) {
          setResultado({ ok: true, cliente: f.clienteNome, chave: r.resposta.chave_nfe, url: r.resposta.url_danfe });
        } else {
          setResultado({
            ok: false, cliente: f.clienteNome,
            mensagem: r.resposta?.mensagem_sefaz ?? r.erro ?? 'Falha desconhecida ao emitir a nota.',
          });
        }
      } catch (e) {
        setResultado({
          ok: false, cliente: f.clienteNome,
          mensagem: e instanceof Error ? e.message : 'Falha ao emitir a nota.',
        });
      }
    } else {
      // Emissão automática desligada (ver EMISSAO_NOTA_AUTOMATICA) ou modo
      // demonstração (sem Edge Function pra chamar) — nos dois casos só
      // confirma o registro, sem tentar a nota.
      setResultado({ ok: true, cliente: f.clienteNome, semNota: true });
    }

    reset({
      data: hoje, quantidade: 1, precoUnit: 0, entrega: 'pendente',
      temTradeIn: false, tradeInValor: 0, tradeInRecebida: false,
      pagamentos: [{ forma: 'dinheiro', parcelas: 1, valor: 0, canal: 'maquininha' }],
      receberAgora: true,
      vendedorId: admin ? '' : vendedorLogado.id,
      clienteNome: '', clienteFone: '', cidade: '', produtoId: '', observacoes: '',
    });
  }

  function fecharDialog() {
    setDialogAberto(false);
    setResultado(null);
  }

  return (
    <form onSubmit={handleSubmit(salvar)} className="stagger space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="iconSm" onClick={() => navigate('/painel/vendas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted">Preencha e registre. O custo vem do catálogo.</span>
      </div>

      <Dialog open={dialogAberto} onOpenChange={(open) => { if (!open && resultado) fecharDialog(); }}>
        <DialogContent showClose={!!resultado} className="text-center">
          {!resultado ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
              <DialogTitle>{fase === 'venda' ? 'Registrando a venda…' : 'Emitindo a nota fiscal…'}</DialogTitle>
              <DialogDescription>Não feche esta janela até terminar.</DialogDescription>
            </div>
          ) : resultado.ok ? (
            <div className="flex flex-col items-center gap-3 py-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive">
                <Check className="h-6 w-6" />
              </div>
              <DialogTitle>Venda de {resultado.cliente} registrada</DialogTitle>
              {resultado.semNota ? (
                <DialogDescription>Estoque baixado. Emissão automática de nota está desligada por enquanto — esta venda ficou sem NFC-e.</DialogDescription>
              ) : (
                <>
                  <DialogDescription>Estoque baixado e NFC-e autorizada (Homologação).</DialogDescription>
                  {resultado.chave && (
                    <p className="break-all rounded bg-elev px-2 py-1 font-mono text-2xs text-faint">
                      {resultado.chave}
                    </p>
                  )}
                  {resultado.url && (
                    <a
                      href={resultado.url} target="_blank" rel="noreferrer"
                      className="text-caption text-gold-300 underline decoration-dotted"
                    >
                      ver DANFE
                    </a>
                  )}
                </>
              )}
              <Button className="mt-1 w-full" onClick={fecharDialog}>Fechar</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-negative-soft text-negative">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <DialogTitle>
                {resultado.vendaFalhou
                  ? `Não deu para registrar a venda de ${resultado.cliente}`
                  : `Venda de ${resultado.cliente} registrada, mas a nota não saiu`}
              </DialogTitle>
              <DialogDescription>{resultado.mensagem}</DialogDescription>
              <Button variant="outline" className="mt-1 w-full" onClick={fecharDialog}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Secao n={1} titulo="Cliente">
        <Campo label="Nome *"><Input {...register('clienteNome')} placeholder="Juliana Freitas" /></Campo>
        <Campo label="WhatsApp"><Input {...register('clienteFone')} placeholder="(85) 99999-9999" /></Campo>
        <Campo label="Cidade"><Input {...register('cidade')} placeholder="Fortaleza" /></Campo>
      </Secao>
      <Erro msg={errors.clienteNome?.message} />

      <Secao n={2} titulo="Produto">
        <Campo label="Item *" className="lg:col-span-2">
          <Select value={v.produtoId ?? ''} onChange={(e) => aoSelecionarProduto(e.target.value)}>
            <option value="">Selecione</option>
            {(produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {p.marca} · saldo {p.estoque}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Quantidade"><Input type="number" {...register('quantidade')} /></Campo>
        <Campo
          label="Valor unitário *"
          hint={produto ? `tabela ${fmtBRL(produto.preco)} · custo ${fmtBRL(produto.custo)}` : undefined}
        >
          <Input type="number" step="0.01" {...register('precoUnit')} />
        </Campo>
      </Secao>
      <Erro msg={errors.produtoId?.message ?? errors.precoUnit?.message} />
      {calc.saldoInsuficiente && (
        <Aviso tom="atencao">
          Quantidade acima do saldo em estoque ({produto?.estoque}). A venda é registrada mesmo assim,
          mas o saldo vai a zero.
        </Aviso>
      )}

      <Secao n={3} titulo="Negócio">
        <Campo label="Data *"><Input type="date" {...register('data')} /></Campo>
        <Campo label="Vendedor *">
          <Select {...register('vendedorId')} disabled={!admin}>
            <option value="">Selecione</option>
            {(vendedores ?? []).filter((x) => x.ativo).map((x) => (
              <option key={x.id} value={x.id}>{x.nome}</option>
            ))}
          </Select>
        </Campo>
        <Campo label="Canal de origem">
          <Select {...register('canal')}>
            <option value="">Não informado</option>
            {CANAIS_VENDA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Campo>
        <Campo label="Entrega">
          <Segmentado
            opcoes={[{ valor: 'entregue', label: 'Entregue' }, { valor: 'pendente', label: 'Pendente' }]}
            valor={v.entrega}
            aoMudar={(x) => setValue('entrega', x)}
          />
        </Campo>
      </Secao>
      <Erro msg={errors.vendedorId?.message} />

      <Secao n={4} titulo="Raquete de entrada (trade-in)">
        <Campo label="Recebeu raquete usada?">
          <Segmentado
            opcoes={[{ valor: false, label: 'Não' }, { valor: true, label: 'Sim' }]}
            valor={v.temTradeIn}
            aoMudar={(x) => setValue('temTradeIn', x)}
          />
        </Campo>
        {v.temTradeIn && (
          <>
            <Campo label="Modelo recebido"><Input {...register('tradeInModelo')} placeholder="Adidas Adipower 3.1" /></Campo>
            <Campo label="Crédito concedido (R$)" hint="Vira estoque de seminovas, não desconto.">
              <Input type="number" step="0.01" {...register('tradeInValor')} />
            </Campo>
            <Campo label="Já está com você?">
              <Segmentado
                opcoes={[{ valor: true, label: 'Recebida' }, { valor: false, label: 'Pendente' }]}
                valor={v.tradeInRecebida}
                aoMudar={(x) => setValue('tradeInRecebida', x)}
              />
            </Campo>
          </>
        )}
      </Secao>

      <Secao n={5} titulo="Pagamento">
        <div className="lg:col-span-4 space-y-3">
          <p className="text-2xs text-muted">
            Uma ou mais formas cobrindo o total da venda — parte no Pix, parte no cartão parcelado,
            por exemplo. Cartão/débito pode ser cobrado na maquininha física ou pelo Link de
            Pagamento (canal abaixo, quando aparecer) — taxas diferentes entre os dois. De qualquer
            jeito a nota sai como não integrada (tipo_integracao=2), válido pela IN 87/2025.
          </p>

          {pernas.map((campo, i) => {
            const perna = v.pagamentos?.[i] as PernaForm | undefined;
            const formaPerna = (perna?.forma ?? 'dinheiro') as FormaPagamento;
            const canalPerna = (perna?.canal ?? 'maquininha') as CanalCobranca;
            const parcelasPerna = Number(perna?.parcelas) || 1;
            const mostraCanal = formaPerna === 'credito' || formaPerna === 'credito_parcelado' || formaPerna === 'debito';
            const simuladorPerna = formaPerna === 'credito_parcelado'
              ? simuladorDaPerna(Number(perna?.liquidoAlvo) || undefined, canalPerna)
              : null;

            return (
              <div key={campo.id} className="rounded-lg border border-line-soft p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo label="Forma">
                    <Select {...register(`pagamentos.${i}.forma` as const)}>
                      {FORMAS_PAGAMENTO_MANUAL.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo
                    label="Parcelas"
                    hint={formaPerna === 'credito_parcelado' ? `taxa real em ${parcelasPerna}x: ${taxaDe('credito_parcelado', parcelasPerna, canalPerna)}%` : undefined}
                  >
                    <Input
                      type="number" disabled={formaPerna !== 'credito_parcelado'}
                      {...register(`pagamentos.${i}.parcelas` as const)}
                    />
                  </Campo>
                  <Campo label="Valor desta forma (R$)">
                    <Input type="number" step="0.01" {...register(`pagamentos.${i}.valor` as const)} />
                  </Campo>
                  <div className="flex items-end">
                    {pernas.length > 1 && (
                      <Button type="button" variant="outline" size="iconSm" onClick={() => remove(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {mostraCanal && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Campo
                      label="Canal"
                      hint={formaPerna !== 'credito_parcelado'
                        ? `taxa nesse canal: ${taxaDe(formaPerna, parcelasPerna, canalPerna)}% — Link é venda remota pela página da Cielo.`
                        : 'taxas diferentes — Link é venda remota pela página da Cielo.'}
                    >
                      <Segmentado
                        opcoes={CANAIS_COBRANCA.map((c) => ({ valor: c.id, label: c.label }))}
                        valor={canalPerna}
                        aoMudar={(x) => setValue(`pagamentos.${i}.canal`, x)}
                      />
                    </Campo>
                  </div>
                )}

                {formaPerna === 'credito_parcelado' && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Campo label="Líquido desejado nesta perna (R$)" hint="o que a loja quer embolsar — o simulador abaixo calcula o bruto.">
                      <Input type="number" step="0.01" {...register(`pagamentos.${i}.liquidoAlvo` as const)} />
                    </Campo>
                  </div>
                )}
                {simuladorPerna && (
                  <div className="mt-2 rounded-md bg-elev p-3 text-xs">
                    <p className="mb-2 font-medium text-ink">
                      Simulador ({CANAIS_COBRANCA.find((c) => c.id === canalPerna)?.label}) — quem paga o
                      juros é o cliente. Clique na parcela combinada pra preencher parcelas + valor:
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                      {simuladorPerna.map((s) => (
                        <button
                          key={s.parcelas} type="button"
                          className={cn(
                            'rounded-md border px-2 py-1.5 text-left transition-colors',
                            parcelasPerna === s.parcelas
                              ? 'border-gold-400/60 bg-gold-400/10 text-gold-300'
                              : 'border-line-soft bg-surface text-ink-2 hover:border-line',
                          )}
                          onClick={() => {
                            setValue(`pagamentos.${i}.parcelas`, s.parcelas);
                            setValue(`pagamentos.${i}.valor`, Math.round(s.cobrar * 100) / 100);
                          }}
                        >
                          <div className="font-semibold tabular-nums">{s.parcelas}x</div>
                          <div className="tabular-nums">{fmtBRL(s.cobrar)}</div>
                          <div className="text-2xs text-faint">{fmtPct(s.taxa)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Button
            type="button" variant="outline" size="sm"
            onClick={() => append({ forma: 'dinheiro', parcelas: 1, valor: 0, canal: 'maquininha' })}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar outra forma de pagamento
          </Button>

          {!calc.pernasBatem && (
            <Aviso tom="atencao">
              A soma das formas ({fmtBRL(calc.somaPernas)}) não bate com o valor a receber
              ({fmtBRL(calc.aReceber)}) — ajuste antes de registrar.
            </Aviso>
          )}

          <Campo label="Já recebeu tudo isso agora?">
            <Segmentado
              opcoes={[{ valor: true, label: 'Sim' }, { valor: false, label: 'Não (fiado)' }]}
              valor={v.receberAgora}
              aoMudar={(x) => setValue('receberAgora', x)}
            />
          </Campo>
        </div>
      </Secao>

      <Secao n={6} titulo="Observações">
        <Campo label="Notas e follow-up" className="lg:col-span-4">
          <Input {...register('observacoes')} placeholder="Prometido brinde de overgrip na entrega" />
        </Campo>
      </Secao>

      {calc.semCusto && (
        <Aviso tom="negativo">
          Este produto está com custo zerado no catálogo. A margem vai aparecer como 100%, que é
          mentira. Cadastre o custo antes de registrar a venda.
        </Aviso>
      )}

      {/* resumo grudado no rodapé: o número tem que estar à vista na hora de decidir */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-7 gap-y-2 px-6 py-3">
          <Resumo rotulo="Valor da venda" valor={fmtBRL(calc.receita)} />
          {calc.credito > 0 && <Resumo rotulo="Crédito trade-in" valor={`− ${fmtBRL(calc.credito)}`} />}
          <Resumo rotulo="A receber" valor={fmtBRL(calc.aReceber)} forte />
          <Resumo rotulo="Custo" valor={fmtBRL(calc.custo)} />
          <Resumo rotulo={`Taxa ${fmtPct(calc.taxaPct)}`} valor={fmtBRL(calc.taxa)} />
          <Resumo
            rotulo="Margem"
            valor={`${fmtBRL(calc.margem)} · ${fmtPct(calc.margemPct)}`}
            tom={calc.margem >= 0 ? 'bom' : 'ruim'}
            forte
          />
          <Resumo rotulo={`Comissão ${fmtPct(calc.comissaoPct)}`} valor={fmtBRL(calc.comissao)} />
          <Button type="submit" className="ml-auto" disabled={isSubmitting}>
            Registrar venda
          </Button>
        </div>
      </div>
    </form>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line-soft px-5 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-400/20 text-[10px] font-bold text-gold-300">
          {n}
        </span>
        <span className="text-sm font-semibold text-ink">{titulo}</span>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </Card>
  );
}

function Resumo({
  rotulo, valor, tom, forte,
}: { rotulo: string; valor: string; tom?: 'bom' | 'ruim'; forte?: boolean }) {
  return (
    <div>
      <div className="text-label uppercase text-faint">{rotulo}</div>
      <div
        className={cn(
          'tabular-nums font-semibold',
          forte ? 'text-num' : 'text-body',
          tom === 'bom' && 'text-positive',
          tom === 'ruim' && 'text-negative',
          !tom && 'text-ink',
        )}
      >
        {valor}
      </div>
    </div>
  );
}

function Erro({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="px-1 text-2xs text-negative">{msg}</p>;
}

function Aviso({ tom, children }: { tom: 'atencao' | 'negativo'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        tom === 'atencao'
          ? 'border-attention/25 bg-attention-soft text-attention'
          : 'border-negative/25 bg-negative-soft text-negative',
      )}
    >
      {children}
    </div>
  );
}
