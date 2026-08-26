import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Campo, Segmentado } from '@/components/ui/field';
import { registrarVenda } from '@/painel/data/queries';
import { useEstoque, useVendedores } from '@/painel/data/hooks';
import { useFiltros } from '@/painel/store/filtros';
import { CANAIS_VENDA, FORMAS_PAGAMENTO, type FormaPagamento } from '@/painel/types';
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

  formaPagamento: z.string().min(1),
  parcelas: z.coerce.number().int().min(1).max(24),

  registrarPagamento: z.boolean(),
  pagamentoData: z.string().optional(),
  pagamentoValor: z.coerce.number().min(0),

  observacoes: z.string().trim().optional(),
});

type Form = z.infer<typeof schema>;

export default function NovaVenda() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hoje = isoDia(new Date());
  const vendedorLogado = useFiltros((s) => s.vendedorLogado);
  const admin = useFiltros((s) => s.papel === 'admin');

  const { data: produtos } = useEstoque();
  const { data: vendedores } = useVendedores();
  const [salvo, setSalvo] = useState<string | null>(null);

  const {
    register, handleSubmit, control, setValue, reset, formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      data: hoje, quantidade: 1, precoUnit: 0, entrega: 'pendente',
      temTradeIn: false, tradeInValor: 0, tradeInRecebida: false,
      formaPagamento: 'pix', parcelas: 1,
      registrarPagamento: true, pagamentoData: hoje, pagamentoValor: 0,
      vendedorId: admin ? '' : vendedorLogado.id,
    },
  });

  const v = useWatch({ control });
  const produto = produtos?.find((p) => p.id === v.produtoId);
  const vendedor = vendedores?.find((x) => x.id === v.vendedorId);

  /* Cálculo ao vivo — o vendedor precisa ver a margem ANTES de conceder desconto. */
  const calc = useMemo(() => {
    const qtd = Number(v.quantidade) || 0;
    const preco = Number(v.precoUnit) || 0;
    const receita = preco * qtd;
    const custo = (produto?.custo ?? 0) * qtd;
    const taxaPct = FORMAS_PAGAMENTO.find((f) => f.id === v.formaPagamento)?.taxa ?? 0;
    const taxa = receita * (taxaPct / 100);
    const margem = receita - custo - taxa;
    const credito = v.temTradeIn ? Number(v.tradeInValor) || 0 : 0;
    const comissaoPct = vendedor?.comissaoPct ?? 0;
    return {
      receita, custo, taxa, taxaPct, margem,
      margemPct: receita > 0 ? (margem / receita) * 100 : 0,
      credito,
      aReceber: receita - credito,
      comissao: (receita - credito) * (comissaoPct / 100),
      comissaoPct,
      semCusto: !!produto && produto.custo <= 0,
      saldoInsuficiente: !!produto && qtd > produto.estoque,
    };
  }, [v, produto, vendedor]);

  function aoSelecionarProduto(id: string) {
    setValue('produtoId', id);
    const p = produtos?.find((x) => x.id === id);
    if (p) setValue('precoUnit', p.preco);
  }

  function salvar(f: Form) {
    registrarVenda({
      data: f.data,
      produtoId: f.produtoId,
      vendedorId: f.vendedorId,
      quantidade: f.quantidade,
      precoUnit: f.precoUnit,
      formaPagamento: f.formaPagamento as FormaPagamento,
      parcelas: f.parcelas,
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
      primeiroPagamento: f.registrarPagamento && f.pagamentoValor > 0
        ? {
            data: f.pagamentoData || f.data,
            valor: f.pagamentoValor,
            forma: f.formaPagamento as FormaPagamento,
          }
        : undefined,
    });

    qc.invalidateQueries();
    setSalvo(f.clienteNome);
    reset({
      data: hoje, quantidade: 1, precoUnit: 0, entrega: 'pendente',
      temTradeIn: false, tradeInValor: 0, tradeInRecebida: false,
      formaPagamento: 'pix', parcelas: 1,
      registrarPagamento: true, pagamentoData: hoje, pagamentoValor: 0,
      vendedorId: admin ? '' : vendedorLogado.id,
      clienteNome: '', clienteFone: '', cidade: '', produtoId: '', observacoes: '',
    });
    setTimeout(() => setSalvo(null), 5000);
  }

  return (
    <form onSubmit={handleSubmit(salvar)} className="stagger space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="iconSm" onClick={() => navigate('/painel/vendas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted">Preencha e registre. O custo vem do catálogo.</span>
      </div>

      {salvo && (
        <div className="flex items-center gap-2 rounded-md border border-positive/25 bg-positive-soft px-3 py-2 text-xs text-positive">
          <Check className="h-3.5 w-3.5" />
          Venda de <strong className="font-semibold">{salvo}</strong> registrada. Estoque baixado.
        </div>
      )}

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
        <Campo label="Forma">
          <Select {...register('formaPagamento')}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.id} value={f.id}>{f.label} — {f.taxa}%</option>
            ))}
          </Select>
        </Campo>
        <Campo label="Parcelas"><Input type="number" {...register('parcelas')} /></Campo>
        <Campo label="Recebeu algo agora?">
          <Segmentado
            opcoes={[{ valor: true, label: 'Sim' }, { valor: false, label: 'Não' }]}
            valor={v.registrarPagamento}
            aoMudar={(x) => {
              setValue('registrarPagamento', x);
              if (x) setValue('pagamentoValor', calc.aReceber);
            }}
          />
        </Campo>
        {v.registrarPagamento && (
          <>
            <Campo label="Data do recebimento"><Input type="date" {...register('pagamentoData')} /></Campo>
            <Campo label="Valor recebido (R$)" hint={`a receber: ${fmtBRL(calc.aReceber)}`}>
              <Input type="number" step="0.01" {...register('pagamentoValor')} />
            </Campo>
          </>
        )}
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
