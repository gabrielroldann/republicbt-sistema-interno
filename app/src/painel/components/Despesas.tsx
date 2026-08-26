import { useEffect, useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Card, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { KpiCard } from '@/painel/components/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAtualizarDespesa, useCriarDespesa, useDespesas, useExcluirDespesa,
} from '@/painel/data/hooks';
import { cn, fmtBRL, fmtData, isoDia } from '@/lib/utils';
import type { Despesa } from '@/painel/types';

const CATEGORIAS: { id: Despesa['categoria']; label: string }[] = [
  { id: 'aluguel', label: 'Aluguel' },
  { id: 'folha', label: 'Folha' },
  { id: 'operacional', label: 'Operacional' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'impostos', label: 'Impostos' },
];
const rotulo = (c: Despesa['categoria']) =>
  CATEGORIAS.find((x) => x.id === c)?.label ?? c;

/**
 * Lançamento de despesa.
 *
 * A manutenção do ar-condicionado, a reforma da vitrine, o material de
 * embalagem. Antes não havia onde lançar — e despesa que não entra no sistema
 * vira surpresa no fim do mês, quando o caixa não bate com o painel.
 */
export function Despesas() {
  const { data, isLoading } = useDespesas();
  const excluir = useExcluirDespesa();

  const [editando, setEditando] = useState<Despesa | null>(null);
  const [aberto, setAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState<Despesa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Despesa['categoria'] | 'todas'>('todas');

  const lista = useMemo(() => {
    const todas = data ?? [];
    return filtro === 'todas' ? todas : todas.filter((d) => d.categoria === filtro);
  }, [data, filtro]);

  const totais = useMemo(() => {
    const todas = data ?? [];
    // Fornecedores fica de fora do "resultado": comprar estoque é troca de
    // caixa por ativo, e só vira custo quando a peça é vendida.
    const operacional = todas.filter((d) => d.categoria !== 'fornecedores');
    return {
      total: todas.reduce((s, d) => s + d.valor, 0),
      operacional: operacional.reduce((s, d) => s + d.valor, 0),
      estoque: todas.filter((d) => d.categoria === 'fornecedores')
                    .reduce((s, d) => s + d.valor, 0),
      fixas: todas.filter((d) => d.custoFixoId).reduce((s, d) => s + d.valor, 0),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Saída total no período" valor={fmtBRL(totais.total)}
                 carregando={isLoading} />
        <KpiCard label="Despesa do resultado" valor={fmtBRL(totais.operacional)}
                 carregando={isLoading} destaque
                 hint="exclui compra de estoque" />
        <KpiCard label="Compra de estoque" valor={fmtBRL(totais.estoque)}
                 carregando={isLoading} hint="vira ativo, não despesa" />
        <KpiCard label="Vindas do modelo fixo" valor={fmtBRL(totais.fixas)}
                 carregando={isLoading} hint="editáveis em Custo por raquete" />
      </div>

      {erro && (
        <div className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
          {erro}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Despesas do período</CardTitle>
              <CardDescription>
                Tudo que saiu, fora comissão e custo de mercadoria vendida
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filtro} className="h-8 w-36 text-caption"
                      onChange={(e) => setFiltro(e.target.value as Despesa['categoria'] | 'todas')}>
                <option value="todas">Todas</option>
                {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              <Button size="sm" onClick={() => { setEditando(null); setAberto(true); }}>
                <Plus className="h-3.5 w-3.5" /> Nova despesa
              </Button>
            </div>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : (
          <div className="divide-y divide-line-soft border-t border-line-soft">
            {lista.map((d) => {
              const travada = !!d.custoFixoId;
              return (
                <div
                  key={d.id}
                  data-despesa={d.id}
                  data-travada={travada ? '1' : '0'}
                  className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-elev/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body font-medium text-ink">
                        {d.descricao}
                      </span>
                      {travada && (
                        <span
                          title="Vem do modelo de custo fixo. Altere em Custo por raquete."
                          className="flex shrink-0 items-center gap-1 text-2xs text-faint"
                        >
                          <Lock className="h-3 w-3" /> modelo
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-faint">{fmtData(d.data)}</div>
                  </div>

                  <Badge variant={d.categoria === 'fornecedores' ? 'info' : 'neutral'}>
                    {rotulo(d.categoria)}
                  </Badge>

                  <div className="w-28 text-right tabular-nums text-body font-semibold text-ink">
                    {fmtBRL(d.valor)}
                  </div>

                  {/*
                    Linha do modelo não ganha botão desabilitado: botão apagado
                    convida ao clique e depois não faz nada. Ela simplesmente
                    não tem ação, e o cadeado explica onde mexer.
                  */}
                  {travada ? (
                    <div className="w-[58px]" />
                  ) : (
                    <div className="flex w-[58px] justify-end gap-0.5">
                      <Button
                        variant="ghost" size="iconSm" title="Editar"
                        onClick={() => { setEditando(d); setAberto(true); }}
                        className="opacity-40 transition-opacity group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5 text-faint" />
                      </Button>
                      <Button
                        variant="ghost" size="iconSm" title="Excluir"
                        onClick={() => { setErro(null); setAExcluir(d); }}
                        className="opacity-40 transition-opacity group-hover:opacity-100 hover:text-negative"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {lista.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="text-xs text-faint">Nada lançado neste período.</p>
                <Button size="sm" variant="ghost" className="mt-2"
                        onClick={() => { setEditando(null); setAberto(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Lançar a primeira
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <DialogoDespesa
        aberto={aberto} despesa={editando}
        onFechar={() => { setAberto(false); setEditando(null); }}
      />

      <Dialog open={aExcluir != null} onOpenChange={(v) => !v && setAExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Excluir esta despesa?</DialogTitle>
          <DialogDescription>
            <strong className="text-ink-2">{aExcluir?.descricao}</strong>, de{' '}
            {aExcluir ? fmtBRL(aExcluir.valor) : ''}. Sai do resultado e do fluxo
            de caixa, e não tem como desfazer.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAExcluir(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try { await excluir.mutateAsync(aExcluir!.id); }
                catch (e) { setErro(e instanceof Error ? e.message : 'não deu para excluir'); }
                setAExcluir(null);
              }}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── diálogo ─── */

function DialogoDespesa({
  aberto, despesa, onFechar,
}: { aberto: boolean; despesa: Despesa | null; onFechar: () => void }) {
  const criar = useCriarDespesa();
  const atualizar = useAtualizarDespesa();

  const [data, setData] = useState(isoDia(new Date()));
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<Despesa['categoria']>('operacional');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  // useEffect, não useMemo: isto é efeito colateral. `useMemo` pode ser
  // descartado ou reexecutado pelo React quando bem entender, e o formulário
  // reabriria com os dados da despesa anterior — editando a errada.
  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setData(despesa?.data ?? isoDia(new Date()));
    setDescricao(despesa?.descricao ?? '');
    setCategoria(despesa?.categoria ?? 'operacional');
    setValor(despesa ? String(despesa.valor) : '');
  }, [aberto, despesa]);

  async function salvar() {
    setErro(null);
    const v = Number(valor.replace(/\./g, '').replace(',', '.'));
    const dados = { data, descricao, categoria, valor: v };
    try {
      if (despesa) await atualizar.mutateAsync({ id: despesa.id, ...dados });
      else await criar.mutateAsync(dados);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar');
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogTitle>{despesa ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
        <DialogDescription>
          Entra no resultado e no fluxo de caixa assim que salvar. Custo que se
          repete todo mês é melhor cadastrar em Custo por raquete, como modelo.
        </DialogDescription>

        <form className="mt-4 space-y-3"
              onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <Campo rotulo="Descrição">
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                   placeholder="Manutenção do ar-condicionado" autoFocus />
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Categoria">
              <Select value={categoria}
                      onChange={(e) => setCategoria(e.target.value as Despesa['categoria'])}>
                {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Campo>
            <Campo rotulo="Valor">
              <Input value={valor} onChange={(e) => setValor(e.target.value)}
                     inputMode="decimal" placeholder="0,00" className="tabular-nums" />
            </Campo>
            <Campo rotulo="Data">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)}
                     className="tabular-nums" />
            </Campo>
          </div>

          {categoria === 'fornecedores' && (
            <p className={cn(
              'rounded-md border border-info-line bg-info-soft px-3 py-2 text-caption text-muted',
            )}>
              Compra de estoque sai do caixa mas <strong className="text-ink-2">não
              entra no resultado</strong>: vira ativo e só vira custo quando a peça
              é vendida. Para atualizar o custo médio, use “Dar entrada” no Estoque.
            </p>
          )}

          {erro && (
            <p className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending || atualizar.isPending}>
              {despesa ? 'Salvar' : 'Lançar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-label uppercase text-faint">{rotulo}</label>
    {children}
  </div>
);
