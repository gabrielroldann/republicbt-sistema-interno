import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { useAjustarEstoque, useDarEntrada, useMovimentosProduto } from '@/painel/data/hooks';
import { cn, fmtBRL, fmtDataCurta, fmtNum } from '@/lib/utils';
import type { ItemEstoque } from '@/painel/types';

/**
 * Entrada de mercadoria e ajuste de inventário.
 *
 * Os dois moram juntos porque são as duas únicas formas de o saldo subir ou
 * descer sem uma venda — e separá-los em telas diferentes faria o dono procurar
 * em dois lugares o mesmo tipo de correção.
 */
export function DialogoEntrada({
  aberto, produto, onFechar,
}: { aberto: boolean; produto: ItemEstoque | null; onFechar: () => void }) {
  const entrada = useDarEntrada();
  const ajuste = useAjustarEstoque();
  const { data: historico } = useMovimentosProduto(aberto ? produto?.id ?? null : null);

  const [qtd, setQtd] = useState('');
  const [custo, setCusto] = useState('');
  const [frete, setFrete] = useState('');
  const [obs, setObs] = useState('');
  const [contagem, setContagem] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setQtd(''); setFrete(''); setObs(''); setMotivo('');
    // O custo vem preenchido com o atual: na maioria das remessas ele não muda,
    // e obrigar a redigitar é o caminho para alguém digitar errado.
    setCusto(produto ? String(produto.custo) : '');
    setContagem(produto ? String(produto.estoque) : '');
  }, [aberto, produto]);

  if (!produto) return null;

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
  const q = Math.trunc(num(qtd)) || 0;
  const c = num(custo);
  const f = num(frete) || 0;

  const previa = (() => {
    if (!(q > 0) || !Number.isFinite(c)) return null;
    const custoComFrete = c + f / q;
    const base = Math.max(produto.estoque, 0);
    const novo = (base * produto.custo + q * custoComFrete) / (base + q);
    return {
      custoComFrete,
      novoCusto: Math.round(novo * 100) / 100,
      novoSaldo: produto.estoque + q,
      novaMargem: produto.preco > 0 ? ((produto.preco - novo) / produto.preco) * 100 : 0,
    };
  })();

  async function salvarEntrada() {
    setErro(null);
    try {
      await entrada.mutateAsync({
        produtoId: produto!.id, quantidade: q, custoUnit: c, frete: f,
        observacao: obs,
      });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para dar entrada');
    }
  }

  async function salvarAjuste() {
    setErro(null);
    try {
      await ajuste.mutateAsync({
        produtoId: produto!.id,
        contagem: Math.trunc(num(contagem)) || 0,
        observacao: motivo,
      });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para ajustar');
    }
  }

  const diferenca = (Math.trunc(num(contagem)) || 0) - produto.estoque;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{produto.nome}</DialogTitle>
        <DialogDescription>
          {produto.sku} · saldo atual{' '}
          <strong className="tabular-nums text-ink-2">{fmtNum(produto.estoque)}</strong>{' '}
          · custo médio {fmtBRL(produto.custo)}
        </DialogDescription>

        <Tabs defaultValue="entrada" className="mt-4">
          <TabsList>
            <TabsTrigger value="entrada">Dar entrada</TabsTrigger>
            <TabsTrigger value="ajuste">Ajustar inventário</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------- entrada -- */}
          <TabsContent value="entrada" className="space-y-3 pt-3">
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Quantidade">
                <Input value={qtd} onChange={(e) => setQtd(e.target.value)}
                       inputMode="numeric" placeholder="10" className="tabular-nums" autoFocus />
              </Campo>
              <Campo rotulo="Custo por unidade">
                <Input value={custo} onChange={(e) => setCusto(e.target.value)}
                       inputMode="decimal" className="tabular-nums" />
              </Campo>
              <Campo rotulo="Frete da remessa">
                <Input value={frete} onChange={(e) => setFrete(e.target.value)}
                       inputMode="decimal" placeholder="0,00" className="tabular-nums" />
              </Campo>
            </div>

            <Campo rotulo="Observação">
              <Input value={obs} onChange={(e) => setObs(e.target.value)}
                     placeholder="NF 4821 — Drop Shot Brasil" />
            </Campo>

            {/*
              A prévia antes de salvar.
              O custo médio é a conta que menos gente faz de cabeça, e ela muda
              a margem de todas as próximas vendas. Mostrar o resultado ANTES
              evita a descoberta desagradável depois.
            */}
            {previa && (
              <div data-previa className="rounded-md border border-line bg-elev px-3 py-2.5">
                <div className="mb-2 text-label uppercase text-faint">Depois desta entrada</div>

                {f > 0 && (
                  <Linha rotulo="Custo com frete rateado"
                         valor={`${fmtBRL(c)} + ${fmtBRL(f / q)} = ${fmtBRL(previa.custoComFrete)}`} />
                )}
                <Linha rotulo="Saldo" valor={`${fmtNum(produto.estoque)} → ${fmtNum(previa.novoSaldo)}`} />
                <Linha
                  rotulo="Custo médio ponderado"
                  valor={`${fmtBRL(produto.custo)} → ${fmtBRL(previa.novoCusto)}`}
                  destaque={Math.abs(previa.novoCusto - produto.custo) > 0.005}
                />
                <Linha rotulo="Margem no preço atual"
                       valor={`${previa.novaMargem.toFixed(1)}%`}
                       alerta={previa.novaMargem < 15} />
              </div>
            )}

            {erro && <Erro texto={erro} />}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
              <Button onClick={() => void salvarEntrada()}
                      disabled={!previa || entrada.isPending}>
                Dar entrada
              </Button>
            </div>
          </TabsContent>

          {/* -------------------------------------------------- ajuste -- */}
          <TabsContent value="ajuste" className="space-y-3 pt-3">
            <p className="text-caption text-muted">
              Quando a contagem física não bate com o sistema. A diferença é
              gravada como movimento, não sobrescreve o saldo — sumiço repetido
              no mesmo produto é sinal de furto ou de venda não lançada, e um
              saldo sobrescrito apagaria justamente essa pista.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Contagem física">
                <Input value={contagem} onChange={(e) => setContagem(e.target.value)}
                       inputMode="numeric" className="tabular-nums" />
              </Campo>
              <Campo rotulo="Diferença">
                <div className={cn(
                  'flex h-9 items-center rounded-md border border-line bg-app px-3 text-num tabular-nums',
                  diferenca === 0 ? 'text-faint'
                    : diferenca < 0 ? 'text-negative' : 'text-positive',
                )}>
                  {diferenca > 0 ? `+${fmtNum(diferenca)}` : fmtNum(diferenca)}
                </div>
              </Campo>
            </div>

            <Campo rotulo="Motivo">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                     placeholder="Inventário de agosto — 2 unidades a menos" />
            </Campo>

            {erro && <Erro texto={erro} />}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
              <Button onClick={() => void salvarAjuste()}
                      disabled={diferenca === 0 || !motivo.trim() || ajuste.isPending}>
                Registrar ajuste
              </Button>
            </div>
          </TabsContent>

          {/* ----------------------------------------------- histórico -- */}
          <TabsContent value="historico" className="pt-3">
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {(historico ?? []).length === 0 && (
                <p className="py-6 text-center text-caption text-faint">Sem movimento.</p>
              )}
              {(historico ?? []).map((m) => (
                <div key={m.id}
                     className="flex items-center gap-3 rounded border border-line-soft px-3 py-1.5 text-caption">
                  <span className="w-14 shrink-0 tabular-nums text-faint">
                    {fmtDataCurta(m.data)}
                  </span>
                  <span className={cn(
                    'w-12 shrink-0 text-right tabular-nums font-medium',
                    m.quantidade < 0 ? 'text-negative' : 'text-positive',
                  )}>
                    {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                  </span>
                  <span className="w-20 shrink-0 text-muted">{ROTULO[m.tipo]}</span>
                  <span className="min-w-0 flex-1 truncate text-faint">
                    {m.observacao ?? (m.custoUnit != null ? `a ${fmtBRL(m.custoUnit)}` : '')}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO: Record<string, string> = {
  entrada: 'Entrada', venda: 'Venda', ajuste: 'Ajuste',
  devolucao: 'Devolução', perda: 'Perda',
};

const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-label uppercase text-faint">{rotulo}</label>
    {children}
  </div>
);

const Erro = ({ texto }: { texto: string }) => (
  <p className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
    {texto}
  </p>
);

function Linha({
  rotulo, valor, destaque, alerta,
}: { rotulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-caption">
      <span className="text-muted">{rotulo}</span>
      <span className={cn(
        'flex items-center gap-1 tabular-nums',
        alerta ? 'font-semibold text-negative'
          : destaque ? 'font-semibold text-gold-300' : 'text-ink-2',
      )}>
        {destaque && <ArrowRight className="h-3 w-3 opacity-60" />}
        {valor}
      </span>
    </div>
  );
}
