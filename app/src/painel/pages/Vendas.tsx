import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Download, Plus, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/painel/components/DataTable';
import { useVendas, useVendedores } from '@/painel/data/hooks';
import { useEhAdmin, useFiltros } from '@/painel/store/filtros';
import { CATEGORIAS, FORMAS_PAGAMENTO, type Categoria, type FormaPagamento, type VendaCompleta } from '@/painel/types';
import { fmtBRL, fmtData, fmtNum, fmtPct } from '@/lib/utils';

export default function Vendas() {
  const admin = useEhAdmin();
  const vendedorLogado = useFiltros((s) => s.vendedorLogado);

  const [categoria, setCategoria] = useState<Categoria | 'todas'>('todas');
  const [vendedorId, setVendedorId] = useState<string>('todos');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: vendedores } = useVendedores();

  const { data, isLoading } = useVendas({
    categoria,
    // vendedor só enxerga o próprio histórico — a trava é aqui, não na tela
    vendedorId: admin ? vendedorId : vendedorLogado.id,
    formaPagamento,
    busca,
  });

  const totais = useMemo(() => {
    const vs = data ?? [];
    const receita = vs.reduce((s, v) => s + v.receita, 0);
    const custo = vs.reduce((s, v) => s + v.custo, 0);
    const margem = vs.reduce((s, v) => s + v.margem, 0);
    return {
      qtd: vs.length,
      unidades: vs.reduce((s, v) => s + v.quantidade, 0),
      receita, custo, margem,
      margemPct: receita ? (margem / receita) * 100 : 0,
      recebido: vs.reduce((s, v) => s + v.recebido, 0),
      emAberto: vs.reduce((s, v) => s + v.emAberto, 0),
      comissao: vs.reduce((s, v) => s + v.comissao, 0),
      pendentes: vs.filter((v) => v.entrega === 'pendente').length,
    };
  }, [data]);

  const colunas = useMemo<ColumnDef<VendaCompleta, unknown>[]>(() => {
    const base: ColumnDef<VendaCompleta, unknown>[] = [
      {
        id: 'data', header: 'Data', accessorKey: 'data',
        cell: ({ row }) => <span className="tabular-nums text-muted">{fmtData(row.original.data)}</span>,
      },
      {
        id: 'produto', header: 'Produto',
        accessorFn: (v) => v.produto.nome,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{row.original.produto.nome}</div>
            <div className="text-2xs text-faint">{row.original.produto.sku}</div>
          </div>
        ),
      },
      {
        id: 'categoria', header: 'Categoria',
        accessorFn: (v) => v.produto.categoria,
        cell: ({ row }) => (
          <span className="text-muted">
            {CATEGORIAS.find((c) => c.id === row.original.produto.categoria)?.label}
          </span>
        ),
      },
      {
        id: 'vendedor', header: 'Vendedor',
        accessorFn: (v) => v.vendedor.nome,
        cell: ({ row }) => <span className="text-ink-2">{row.original.vendedor.nome}</span>,
      },
      {
        id: 'qtd', header: 'Qtd', accessorKey: 'quantidade',
        cell: ({ row }) => <span className="tabular-nums">{row.original.quantidade}</span>,
      },
      {
        id: 'receita', header: 'Valor', accessorFn: (v) => v.receita,
        cell: ({ row }) => (
          <div>
            <span className="tabular-nums font-medium text-ink">{fmtBRL(row.original.receita)}</span>
            {row.original.creditoTradeIn > 0 && (
              <div className="text-2xs text-faint" title={row.original.tradeIn?.modelo}>
                trade-in − {fmtBRL(row.original.creditoTradeIn)}
              </div>
            )}
          </div>
        ),
      },
    ];

    // Custo e margem são dado financeiro: não aparecem para vendedor.
    const financeiro: ColumnDef<VendaCompleta, unknown>[] = [
      {
        id: 'custo', header: 'Custo', accessorFn: (v) => v.custo,
        cell: ({ row }) => <span className="tabular-nums text-muted">{fmtBRL(row.original.custo)}</span>,
      },
      {
        id: 'margem', header: 'Margem', accessorFn: (v) => v.margem,
        cell: ({ row }) => (
          <div>
            <div className={`tabular-nums font-medium ${row.original.margem >= 0 ? 'text-positive' : 'text-negative'}`}>
              {fmtBRL(row.original.margem)}
            </div>
            <div className="text-2xs text-faint">{fmtPct(row.original.margemPct)}</div>
          </div>
        ),
      },
    ];

    const pagamento: ColumnDef<VendaCompleta, unknown>[] = [
      {
        id: 'pagamento', header: 'Recebido',
        accessorFn: (v) => v.recebido,
        cell: ({ row }) => {
          const v = row.original;
          const pct = v.aReceber > 0 ? (v.recebido / v.aReceber) * 100 : 100;
          return (
            <div className="min-w-[120px]">
              <div className="flex items-center justify-end gap-1.5">
                <Badge
                  variant={
                    v.statusPagamento === 'pago' ? 'positive'
                    : v.statusPagamento === 'parcial' ? 'attention' : 'negative'
                  }
                >
                  {v.statusPagamento === 'pago' ? 'pago'
                    : v.statusPagamento === 'parcial' ? 'parcial' : 'aberto'}
                </Badge>
                <span className="tabular-nums text-ink-2">{fmtBRL(v.recebido)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-elev">
                <div
                  className={`h-full rounded-full ${
                    v.statusPagamento === 'pago' ? 'bg-positive' : 'bg-attention'
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="mt-0.5 text-right text-2xs text-faint">
                {FORMAS_PAGAMENTO.find((f) => f.id === v.formaPagamento)?.label}
                {v.parcelas > 1 && ` · ${v.parcelas}x`}
              </div>
            </div>
          );
        },
      },
      {
        id: 'entrega', header: 'Entrega',
        accessorFn: (v) => v.entrega,
        cell: ({ row }) => (
          <Badge variant={row.original.entrega === 'entregue' ? 'positive' : 'attention'}>
            {row.original.entrega}
          </Badge>
        ),
      },
    ];

    return admin ? [...base, ...financeiro, ...pagamento] : [...base, ...pagamento];
  }, [admin]);

  return (
    <div className="stagger space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              className="pl-8"
              placeholder="Buscar por produto, SKU ou vendedor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <Select className="w-40" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria | 'todas')}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>

          {admin && (
            <Select className="w-44" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="todos">Todos os vendedores</option>
              {(vendedores ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </Select>
          )}

          <Select
            className="w-44"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | 'todas')}
          >
            <option value="todas">Todas as formas</option>
            {FORMAS_PAGAMENTO.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>

          <Button asChild>
            <Link to="/painel/vendas/nova"><Plus className="h-3.5 w-3.5" /> Nova venda</Link>
          </Button>

          <Button
            variant="outline" size="default"
            onClick={() => {
              setAviso(`${fmtNum(totais.qtd)} registros preparados para exportação.`);
              setTimeout(() => setAviso(null), 3200);
            }}
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        </CardContent>
      </Card>

      {aviso && (
        <div className="rounded-md border border-navy-500/40 bg-navy-600/20 px-3 py-2 text-xs text-navy-200">
          {aviso} <span className="text-navy-500">Geração de arquivo entra junto com os dados reais.</span>
        </div>
      )}

      <Card>
        {/* Totais do filtro atual, não da página — é o que a pessoa quer conferir */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-line-soft px-5 py-3">
          <Resumo titulo="Vendas" valor={fmtNum(totais.qtd)} sub={`${fmtNum(totais.unidades)} un`} />
          <Resumo titulo="Contratado" valor={fmtBRL(totais.receita)} destaque />
          <Resumo
            titulo="Recebido"
            valor={fmtBRL(totais.recebido)}
            sub={totais.emAberto > 0 ? `${fmtBRL(totais.emAberto)} em aberto` : 'nada em aberto'}
            cor="text-positive"
          />
          {admin && <Resumo titulo="Custo" valor={fmtBRL(totais.custo)} />}
          {admin && (
            <Resumo
              titulo="Margem"
              valor={fmtBRL(totais.margem)}
              sub={fmtPct(totais.margemPct)}
              cor={totais.margem >= 0 ? 'text-positive' : 'text-negative'}
            />
          )}
          {admin && (
            <Resumo
              titulo="Comissão a pagar"
              valor={fmtBRL(totais.comissao)}
              sub="sobre o recebido"
            />
          )}
          {totais.pendentes > 0 && (
            <Resumo titulo="Entregas pendentes" valor={fmtNum(totais.pendentes)} cor="text-attention" />
          )}
          <Badge variant="neutral" className="ml-auto">
            {admin ? 'Todos os vendedores' : `Somente ${vendedorLogado.nome}`}
          </Badge>
        </div>

        <DataTable
          colunas={colunas}
          dados={data}
          carregando={isLoading}
          colunasNumericas={['qtd', 'receita', 'custo', 'margem']}
          ordenacaoInicial={[{ id: 'data', desc: true }]}
          porPagina={20}
        />
      </Card>
    </div>
  );
}

function Resumo({
  titulo, valor, sub, cor, destaque,
}: { titulo: string; valor: string; sub?: string; cor?: string; destaque?: boolean }) {
  return (
    <div>
      <div className="label-caps">{titulo}</div>
      <div className={`tabular-nums text-num ${cor ?? (destaque ? 'text-navy-200' : 'text-ink')}`}>
        {valor}
        {sub && <span className="ml-1.5 text-2xs font-normal text-faint">{sub}</span>}
      </div>
    </div>
  );
}
