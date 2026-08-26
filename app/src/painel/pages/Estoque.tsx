import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { KpiCard } from '@/painel/components/KpiCard';
import { DataTable } from '@/painel/components/DataTable';
import { DialogoProduto } from '@/painel/components/DialogoProduto';
import { DialogoEntrada } from '@/painel/components/DialogoEntrada';
import { useArquivarProduto, useEstoque } from '@/painel/data/hooks';
import { useEhAdmin } from '@/painel/store/filtros';
import { CATEGORIAS, type Categoria, type ItemEstoque } from '@/painel/types';
import { fmtBRL, fmtNum, fmtPct } from '@/lib/utils';

const rotuloGiro: Record<ItemEstoque['giro'], { label: string; variant: 'positive' | 'neutral' | 'attention' | 'negative' }> = {
  rapido: { label: 'Rápido', variant: 'positive' },
  normal: { label: 'Normal', variant: 'neutral' },
  lento: { label: 'Lento', variant: 'attention' },
  parado: { label: 'Parado', variant: 'negative' },
};

export default function Estoque() {
  const admin = useEhAdmin();
  const { data, isLoading } = useEstoque();
  const arquivar = useArquivarProduto();

  const [categoria, setCategoria] = useState<Categoria | 'todas'>('todas');
  const [marca, setMarca] = useState('todas');
  const [busca, setBusca] = useState('');

  const [editando, setEditando] = useState<ItemEstoque | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [entrada, setEntrada] = useState<ItemEstoque | null>(null);
  const [erroArquivar, setErroArquivar] = useState<string | null>(null);

  const marcas = useMemo(
    () => [...new Set((data ?? []).map((p) => p.marca))].sort(),
    [data],
  );

  const filtrados = useMemo(() => {
    let itens = data ?? [];
    if (categoria !== 'todas') itens = itens.filter((p) => p.categoria === categoria);
    if (marca !== 'todas') itens = itens.filter((p) => p.marca === marca);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      itens = itens.filter((p) => p.nome.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    return itens;
  }, [data, categoria, marca, busca]);

  const totais = useMemo(() => {
    const itens = data ?? [];
    return {
      unidades: itens.reduce((s, p) => s + p.estoque, 0),
      capital: itens.reduce((s, p) => s + p.capitalParado, 0),
      repor: itens.filter((p) => p.abaixoDoMinimo).length,
      parados: itens.filter((p) => p.giro === 'parado' || p.giro === 'lento').length,
    };
  }, [data]);

  const colunas = useMemo<ColumnDef<ItemEstoque, unknown>[]>(() => {
    const base: ColumnDef<ItemEstoque, unknown>[] = [
      {
        id: 'produto', header: 'Produto', accessorKey: 'nome',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{row.original.nome}</span>
              {row.original.abaixoDoMinimo && (
                <Badge variant={row.original.estoque === 0 ? 'negative' : 'attention'}>
                  {row.original.estoque === 0 ? 'sem estoque' : 'repor'}
                </Badge>
              )}
            </div>
            <div className="text-2xs text-faint">{row.original.sku} · {row.original.marca}</div>
          </div>
        ),
      },
      {
        id: 'categoria', header: 'Categoria', accessorKey: 'categoria',
        cell: ({ row }) => (
          <span className="text-muted">
            {CATEGORIAS.find((c) => c.id === row.original.categoria)?.label}
          </span>
        ),
      },
      {
        id: 'estoque', header: 'Em estoque', accessorKey: 'estoque',
        cell: ({ row }) => (
          <span className={`tabular-nums font-medium ${
            row.original.estoque === 0 ? 'text-negative'
            : row.original.abaixoDoMinimo ? 'text-attention' : 'text-ink'
          }`}>
            {fmtNum(row.original.estoque)}
            <span className="ml-1 text-2xs font-normal text-faint">/ mín {row.original.estoqueMin}</span>
          </span>
        ),
      },
      {
        id: 'vendidos', header: 'Vendidos 30d', accessorKey: 'vendidos30d',
        cell: ({ row }) => <span className="tabular-nums text-ink-2">{fmtNum(row.original.vendidos30d)}</span>,
      },
      {
        id: 'giro', header: 'Giro', accessorKey: 'giro',
        cell: ({ row }) => {
          const g = rotuloGiro[row.original.giro];
          return (
            <div>
              <Badge variant={g.variant}>{g.label}</Badge>
              {row.original.diasDeCobertura !== null && (
                <div className="mt-0.5 text-2xs text-faint">
                  {fmtNum(row.original.diasDeCobertura, 0)} dias de cobertura
                </div>
              )}
            </div>
          );
        },
      },
    ];

    // Custo e margem são dado financeiro — vendedor vê só disponibilidade.
    const financeiro: ColumnDef<ItemEstoque, unknown>[] = [
      {
        id: 'custo', header: 'Custo', accessorKey: 'custo',
        cell: ({ row }) => <span className="tabular-nums text-muted">{fmtBRL(row.original.custo)}</span>,
      },
      {
        id: 'preco', header: 'Preço', accessorKey: 'preco',
        cell: ({ row }) => <span className="tabular-nums text-ink">{fmtBRL(row.original.preco)}</span>,
      },
      {
        id: 'margem', header: 'Margem', accessorFn: (p) => p.margemPct,
        cell: ({ row }) => (
          <div>
            <div className="tabular-nums font-medium text-ink">{fmtPct(row.original.margemPct)}</div>
            <div className="text-2xs text-faint">{fmtBRL(row.original.margemUnit)}</div>
          </div>
        ),
      },
      {
        id: 'capital', header: 'Capital parado', accessorKey: 'capitalParado',
        cell: ({ row }) => <span className="tabular-nums text-ink-2">{fmtBRL(row.original.capitalParado)}</span>,
      },
    ];

    // As ações: só o admin cadastra, dá entrada e arquiva.
    const acoes: ColumnDef<ItemEstoque, unknown>[] = [
      {
        id: 'acoes', header: '', enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost" size="iconSm" title="Dar entrada ou ajustar"
              onClick={() => setEntrada(row.original)}
            >
              <PackagePlus className="h-3.5 w-3.5 text-faint" />
            </Button>
            <Button
              variant="ghost" size="iconSm" title="Editar produto"
              onClick={() => { setEditando(row.original); setCadastroAberto(true); }}
              className="opacity-40 transition-opacity hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5 text-faint" />
            </Button>
            <Button
              variant="ghost" size="iconSm" title="Arquivar produto"
              onClick={async () => {
                setErroArquivar(null);
                try { await arquivar.mutateAsync(row.original.id); }
                catch (e) {
                  setErroArquivar(e instanceof Error ? e.message : 'não deu para arquivar');
                }
              }}
              className="opacity-40 transition-opacity hover:opacity-100 hover:text-negative"
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ];

    return admin ? [...base, ...financeiro, ...acoes] : base;
  }, [admin, arquivar]);

  return (
    <div className="stagger space-y-4">
      {admin && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Unidades em estoque" valor={fmtNum(totais.unidades)} carregando={isLoading} />
          <KpiCard label="Capital parado" valor={fmtBRL(totais.capital)} destaque carregando={isLoading}
            hint="avaliado ao custo" />
          <KpiCard label="Itens a repor" valor={fmtNum(totais.repor)} carregando={isLoading}
            hint="no mínimo ou abaixo" />
          <KpiCard label="Giro lento ou parado" valor={fmtNum(totais.parados)} carregando={isLoading}
            hint="candidatos a promoção" />
        </div>
      )}

      {erroArquivar && (
        <div className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
          {erroArquivar}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              className="pl-8" placeholder="Buscar por produto ou SKU"
              value={busca} onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select className="w-40" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria | 'todas')}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <Select className="w-40" value={marca} onChange={(e) => setMarca(e.target.value)}>
            <option value="todas">Todas as marcas</option>
            {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>

          {admin && (
            <Button
              className="ml-auto shrink-0"
              onClick={() => { setEditando(null); setCadastroAberto(true); }}
            >
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <DataTable
          colunas={colunas}
          dados={filtrados}
          carregando={isLoading}
          colunasNumericas={['estoque', 'vendidos', 'custo', 'preco', 'margem', 'capital']}
          ordenacaoInicial={[{ id: 'estoque', desc: false }]}
          porPagina={20}
          vazio="Nenhum produto encontrado com estes filtros."
        />
        <div className="border-t border-line-soft px-5 py-3 text-2xs text-faint">
          O giro compara as unidades vendidas nos últimos 30 dias com o saldo atual. Um item
          "parado" não vendeu nenhuma unidade no período — é capital imobilizado sem retorno.
          {admin && (
            <>
              {' '}O saldo é a soma dos movimentos, nunca um campo guardado: por isso ele
              não tem como divergir das vendas.
            </>
          )}
        </div>
      </Card>

      <DialogoProduto
        aberto={cadastroAberto}
        produto={editando}
        onFechar={() => { setCadastroAberto(false); setEditando(null); }}
      />
      <DialogoEntrada
        aberto={entrada != null}
        produto={entrada}
        onFechar={() => setEntrada(null)}
      />
    </div>
  );
}
