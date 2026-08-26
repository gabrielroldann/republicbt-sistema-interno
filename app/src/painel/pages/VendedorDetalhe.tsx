import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/painel/components/KpiCard';
import { DataTable } from '@/painel/components/DataTable';
import { GraficoReceita, GraficoBarrasHorizontal } from '@/painel/components/charts';
import { useDesempenho, useSerie, useVendas } from '@/painel/data/hooks';
import { useEhAdmin } from '@/painel/store/filtros';
import { CATEGORIAS, FORMAS_PAGAMENTO, type VendaCompleta } from '@/painel/types';
import { fmtBRL, fmtData, fmtNum, fmtPct } from '@/lib/utils';

export default function VendedorDetalhe() {
  const { id = '' } = useParams();
  const admin = useEhAdmin();

  const desempenho = useDesempenho();
  const serie = useSerie();
  const vendas = useVendas({ vendedorId: id });

  const d = desempenho.data?.find((x) => x.vendedor.id === id);

  const porCategoria = useMemo(() => {
    const vs = vendas.data ?? [];
    return CATEGORIAS.map((c) => ({
      label: c.label,
      valor: vs.filter((v) => v.produto.categoria === c.id).reduce((s, v) => s + v.receita, 0),
    })).filter((x) => x.valor > 0).sort((a, b) => a.valor - b.valor);
  }, [vendas.data]);

  const serieDele = useMemo(() => {
    const vs = vendas.data ?? [];
    return (serie.data ?? []).map((p) => ({
      data: p.data,
      faturamento: vs.filter((v) => v.data === p.data).reduce((s, v) => s + v.receita, 0),
      lucro: vs.filter((v) => v.data === p.data).reduce((s, v) => s + v.margem, 0),
    }));
  }, [serie.data, vendas.data]);

  const colunas = useMemo<ColumnDef<VendaCompleta, unknown>[]>(() => [
    {
      id: 'data', header: 'Data', accessorKey: 'data',
      cell: ({ row }) => <span className="tabular-nums text-muted">{fmtData(row.original.data)}</span>,
    },
    {
      id: 'produto', header: 'Produto', accessorFn: (v) => v.produto.nome,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-ink">{row.original.produto.nome}</div>
          <div className="text-2xs text-faint">{row.original.produto.sku}</div>
        </div>
      ),
    },
    {
      id: 'categoria', header: 'Categoria', accessorFn: (v) => v.produto.categoria,
      cell: ({ row }) => (
        <span className="text-muted">
          {CATEGORIAS.find((c) => c.id === row.original.produto.categoria)?.label}
        </span>
      ),
    },
    {
      id: 'pagamento', header: 'Pagamento', accessorFn: (v) => v.formaPagamento,
      cell: ({ row }) => (
        <span className="text-ink-2">
          {FORMAS_PAGAMENTO.find((f) => f.id === row.original.formaPagamento)?.label}
          {row.original.parcelas > 1 && <span className="text-faint"> · {row.original.parcelas}x</span>}
        </span>
      ),
    },
    {
      id: 'qtd', header: 'Qtd', accessorKey: 'quantidade',
      cell: ({ row }) => <span className="tabular-nums">{row.original.quantidade}</span>,
    },
    {
      id: 'receita', header: 'Valor', accessorFn: (v) => v.receita,
      cell: ({ row }) => <span className="tabular-nums font-medium text-ink">{fmtBRL(row.original.receita)}</span>,
    },
    ...(admin ? [{
      id: 'margem', header: 'Margem', accessorFn: (v: VendaCompleta) => v.margem,
      cell: ({ row }: { row: { original: VendaCompleta } }) => (
        <span className={`tabular-nums ${row.original.margem >= 0 ? 'text-positive' : 'text-negative'}`}>
          {fmtBRL(row.original.margem)}
        </span>
      ),
    } as ColumnDef<VendaCompleta, unknown>] : []),
  ], [admin]);

  if (desempenho.isLoading) {
    return <div className="stagger space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-24" /></div>;
  }

  if (!d) {
    return (
      <Card><CardContent className="py-14 text-center text-sm text-faint">
        Vendedor não encontrado.
        <div className="mt-3"><Link to="/painel/vendedores" className="text-navy-300 hover:underline">Voltar</Link></div>
      </CardContent></Card>
    );
  }

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to="/painel/vendedores"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">
          {d.vendedor.iniciais}
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">{d.vendedor.nome}</h2>
          <p className="text-2xs text-muted">
            Meta mensal {fmtBRL(d.vendedor.metaMensal)} · comissão {fmtPct(d.vendedor.comissaoPct)}
          </p>
        </div>
        <Badge variant={d.posicao === 1 ? 'destaque' : 'neutral'} className="ml-auto">
          {d.posicao}º no período
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Faturamento" valor={fmtBRL(d.faturamento)} destaque />
        <KpiCard label="Vendas" valor={fmtNum(d.numeroVendas)} hint={`ticket ${fmtBRL(d.ticketMedio)}`} />
        {admin
          ? <KpiCard label="Margem gerada" valor={fmtBRL(d.margem)} hint={fmtPct(d.faturamento ? (d.margem / d.faturamento) * 100 : 0)} />
          : <KpiCard label="Ticket médio" valor={fmtBRL(d.ticketMedio)} />}
        <KpiCard
          label="Comissão"
          valor={fmtBRL(d.comissao)}
          hint={`${fmtPct(d.vendedor.comissaoPct)} do faturamento`}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Progresso da meta</CardTitle>
            <CardDescription>Proporcional ao período selecionado</CardDescription>
          </div>
          <span className={`text-sm font-semibold ${d.progressoMeta >= 100 ? 'text-positive' : 'text-ink-2'}`}>
            {fmtPct(d.progressoMeta, 0)}
          </span>
        </CardHeader>
        <CardContent>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-elev">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                d.progressoMeta >= 100 ? 'bg-positive' : d.progressoMeta >= 70 ? 'bg-navy-600' : 'bg-attention'
              }`}
              style={{ width: `${Math.min(d.progressoMeta, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Vendas ao longo do período</CardTitle></CardHeader>
          <CardContent className="px-2">
            {vendas.isLoading
              ? <Skeleton className="mx-3 h-[260px]" />
              : <GraficoReceita dados={serieDele} metrica="faturamento" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Por categoria</CardTitle></CardHeader>
          <CardContent>
            {vendas.isLoading
              ? <Skeleton className="h-[180px]" />
              : porCategoria.length
                ? <GraficoBarrasHorizontal dados={porCategoria} />
                : <p className="py-10 text-center text-xs text-faint">Sem vendas no período.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Vendas do período</CardTitle></CardHeader>
        <DataTable
          colunas={colunas}
          dados={vendas.data}
          carregando={vendas.isLoading}
          colunasNumericas={['qtd', 'receita', 'margem']}
          ordenacaoInicial={[{ id: 'data', desc: true }]}
          vazio="Este vendedor não registrou vendas no período."
        />
      </Card>
    </div>
  );
}
