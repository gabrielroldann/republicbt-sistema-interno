import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/painel/components/KpiCard';
import { DataTable } from '@/painel/components/DataTable';
import { GraficoFluxo } from '@/painel/components/charts';
import { CustoPorUnidade } from '@/painel/components/CustoPorUnidade';
import { DialogoConta } from '@/painel/components/DialogoConta';
import { Despesas } from '@/painel/components/Despesas';
import {
  useContas, useExcluirConta, useFluxoCaixa, useLiquidarConta, useMovimentos,
  useResumo,
} from '@/painel/data/hooks';
import { fmtBRL, fmtData, isoDia } from '@/lib/utils';
import type { Conta, MovimentoCaixa, StatusConta } from '@/painel/types';

export default function Financeiro() {
  return (
    <Tabs defaultValue="fluxo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="fluxo">Fluxo de caixa</TabsTrigger>
        <TabsTrigger value="contas">Contas a pagar e receber</TabsTrigger>
        <TabsTrigger value="despesas">Despesas</TabsTrigger>
        <TabsTrigger value="unidade">Custo por raquete</TabsTrigger>
      </TabsList>
      <TabsContent value="fluxo"><FluxoCaixa /></TabsContent>
      <TabsContent value="contas"><Contas /></TabsContent>
      <TabsContent value="despesas"><Despesas /></TabsContent>
      <TabsContent value="unidade"><CustoPorUnidade /></TabsContent>
    </Tabs>
  );
}

/* ---------------- fluxo de caixa ---------------- */

function FluxoCaixa() {
  const fluxo = useFluxoCaixa();
  const movimentos = useMovimentos();
  const resumo = useResumo();
  const [tipo, setTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');

  const totais = useMemo(() => {
    const pts = fluxo.data ?? [];
    return {
      entradas: pts.reduce((s, p) => s + p.entradas, 0),
      saidas: pts.reduce((s, p) => s + p.saidas, 0),
      saldoFinal: pts.length ? pts[pts.length - 1].saldo : 0,
      saldoInicial: pts.length ? pts[0].saldo - pts[0].entradas + pts[0].saidas : 0,
    };
  }, [fluxo.data]);

  const filtrados = useMemo(
    () => (movimentos.data ?? []).filter((m) => tipo === 'todos' || m.tipo === tipo),
    [movimentos.data, tipo],
  );

  const colunas = useMemo<ColumnDef<MovimentoCaixa, unknown>[]>(() => [
    {
      id: 'data', header: 'Data', accessorKey: 'data',
      cell: ({ row }) => <span className="tabular-nums text-muted">{fmtData(row.original.data)}</span>,
    },
    {
      id: 'descricao', header: 'Descrição', accessorKey: 'descricao',
      cell: ({ row }) => <span className="text-ink">{row.original.descricao}</span>,
    },
    {
      id: 'categoria', header: 'Categoria', accessorKey: 'categoria',
      cell: ({ row }) => <span className="capitalize text-muted">{row.original.categoria}</span>,
    },
    {
      id: 'tipo', header: 'Tipo', accessorKey: 'tipo',
      cell: ({ row }) => (
        <Badge variant={row.original.tipo === 'entrada' ? 'positive' : 'negative'}>
          {row.original.tipo === 'entrada' ? 'Entrada' : 'Saída'}
        </Badge>
      ),
    },
    {
      id: 'valor', header: 'Valor', accessorKey: 'valor',
      cell: ({ row }) => (
        <span className={`tabular-nums font-medium ${row.original.tipo === 'entrada' ? 'text-positive' : 'text-negative'}`}>
          {row.original.tipo === 'entrada' ? '+' : '−'} {fmtBRL(row.original.valor)}
        </span>
      ),
    },
  ], []);

  return (
    <div className="stagger space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Entradas no período" valor={fmtBRL(totais.entradas)} carregando={fluxo.isLoading}
          hint="líquido de taxas de pagamento" />
        <KpiCard label="Saídas no período" valor={fmtBRL(totais.saidas)} carregando={fluxo.isLoading} />
        <KpiCard
          label="Resultado do período"
          valor={fmtBRL(totais.entradas - totais.saidas)}
          carregando={fluxo.isLoading}
        />
        <KpiCard label="Saldo em caixa" valor={fmtBRL(totais.saldoFinal)} destaque carregando={fluxo.isLoading}
          hint={`início: ${fmtBRL(totais.saldoInicial)}`} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Saldo acumulado</CardTitle>
            <CardDescription>
              Entradas líquidas de taxa, saídas por data de pagamento. O saldo considera todo o
              histórico anterior ao período — não começa do zero.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          {fluxo.isLoading ? <Skeleton className="mx-3 h-[280px]" /> : <GraficoFluxo dados={fluxo.data ?? []} />}
        </CardContent>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
          <div>
            <CardTitle>Movimentações</CardTitle>
            <CardDescription>
              {resumo.data && `${resumo.data.numeroVendas} vendas e despesas lançadas no período`}
            </CardDescription>
          </div>
          <Select className="w-36" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="todos">Tudo</option>
            <option value="entrada">Só entradas</option>
            <option value="saida">Só saídas</option>
          </Select>
        </div>
        <DataTable
          colunas={colunas}
          dados={filtrados}
          carregando={movimentos.isLoading}
          colunasNumericas={['valor']}
          ordenacaoInicial={[{ id: 'data', desc: true }]}
          porPagina={20}
        />
      </Card>
    </div>
  );
}

/* ---------------- contas a pagar e receber ---------------- */

const rotuloStatus: Record<StatusConta, string> = {
  paga: 'Paga', pendente: 'Pendente', vencida: 'Vencida',
};

function Contas() {
  const { data, isLoading } = useContas();
  const excluir = useExcluirConta();
  const liquidar = useLiquidarConta();

  // Quem está sendo editado, e de que tipo é a próxima conta nova.
  const [editando, setEditando] = useState<Conta | null>(null);
  const [tipoNovo, setTipoNovo] = useState<'pagar' | 'receber'>('pagar');
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState<Conta | null>(null);

  // O status vem PRONTO da camada de dados, derivado de `pagoEm` + vencimento.
  // Antes ele era remendado aqui com um Set no estado do componente: trocar de
  // aba desfazia a marcação, e não havia como desmarcar um clique errado.
  const pagar = (data ?? []).filter((c) => c.tipo === 'pagar');
  const receber = (data ?? []).filter((c) => c.tipo === 'receber');

  const somaAberto = (cs: Conta[]) =>
    cs.filter((c) => c.status !== 'paga').reduce((s, c) => s + c.valor, 0);
  const somaVencido = (cs: Conta[]) =>
    cs.filter((c) => c.status === 'vencida').reduce((s, c) => s + c.valor, 0);

  const vencidas = (data ?? []).filter((c) => c.status === 'vencida');

  const abrirNova = (tipo: 'pagar' | 'receber') => {
    setEditando(null); setTipoNovo(tipo); setDialogoAberto(true);
  };
  const abrirEdicao = (c: Conta) => {
    setEditando(c); setDialogoAberto(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="A pagar em aberto" valor={fmtBRL(somaAberto(pagar))} carregando={isLoading} />
        <KpiCard label="A receber em aberto" valor={fmtBRL(somaAberto(receber))} carregando={isLoading} />
        <KpiCard
          label="Vencido a pagar" valor={fmtBRL(somaVencido(pagar))} carregando={isLoading}
          hint={somaVencido(pagar) > 0 ? 'exige ação hoje' : 'nada vencido'}
        />
        <KpiCard
          label="Saldo previsto"
          valor={fmtBRL(somaAberto(receber) - somaAberto(pagar))}
          destaque carregando={isLoading}
          hint="se tudo for liquidado"
        />
      </div>

      {vencidas.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-negative/20 bg-negative-soft px-3 py-2 text-xs text-negative">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">{vencidas.length} conta(s) vencida(s)</strong> somando{' '}
            {fmtBRL(vencidas.reduce((s, c) => s + c.valor, 0))}.
          </span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <TabelaContas
          titulo="Contas a pagar" descricao="Fornecedores, aluguel e obrigações"
          contas={pagar} carregando={isLoading}
          onNova={() => abrirNova('pagar')} onEditar={abrirEdicao}
          onExcluir={setAExcluir}
          onLiquidar={(id, pago) => liquidar.mutate({ id, pago })}
        />
        <TabelaContas
          titulo="Contas a receber" descricao="Parcelamentos e vendas faturadas"
          contas={receber} carregando={isLoading}
          onNova={() => abrirNova('receber')} onEditar={abrirEdicao}
          onExcluir={setAExcluir}
          onLiquidar={(id, pago) => liquidar.mutate({ id, pago })}
        />
      </div>

      <DialogoConta
        aberto={dialogoAberto}
        conta={editando}
        tipoPadrao={tipoNovo}
        onFechar={() => { setDialogoAberto(false); setEditando(null); }}
      />

      {/* Excluir conta pede confirmação: some do saldo previsto e não volta. */}
      <Dialog open={aExcluir != null} onOpenChange={(v) => !v && setAExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Excluir esta conta?</DialogTitle>
          <DialogDescription>
            <strong className="text-ink-2">{aExcluir?.descricao}</strong>, de{' '}
            {aExcluir ? fmtBRL(aExcluir.valor) : ''}. Ela sai do saldo previsto e
            do fluxo de caixa, e não tem como desfazer.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAExcluir(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { excluir.mutate(aExcluir!.id); setAExcluir(null); }}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabelaContas({
  titulo, descricao, contas, carregando, onNova, onEditar, onExcluir, onLiquidar,
}: {
  titulo: string; descricao: string; contas: Conta[]; carregando: boolean;
  onNova: () => void;
  onEditar: (c: Conta) => void;
  onExcluir: (c: Conta) => void;
  onLiquidar: (id: string, pago: boolean) => void;
}) {
  const hoje = isoDia(new Date());

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <CardTitle>{titulo}</CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onNova} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        </div>
      </CardHeader>
      {carregando ? (
        <div className="space-y-2 px-5 pb-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      ) : (
        <div className="divide-y divide-line-soft border-t border-line-soft">
          {contas.map((c) => {
            const st = c.status;
            const paga = st === 'paga';
            return (
              <div
                key={c.id}
                data-conta={c.id}
                data-status={st}
                className={`group flex items-center gap-3 px-5 py-2.5 transition-colors ${
                  st === 'vencida' ? 'bg-negative-soft/50' : 'hover:bg-elev/60'
                }`}
              >
                {/* Clicar na linha abre a edição: é o alvo maior e o que a mão
                    procura primeiro. Os ícones ficam para as ações destrutivas. */}
                <button
                  onClick={() => onEditar(c)}
                  className="min-w-0 flex-1 text-left"
                  title="Editar"
                >
                  <div className={`truncate text-body font-medium ${paga ? 'text-muted line-through' : 'text-ink'}`}>
                    {c.descricao}
                  </div>
                  <div className="text-2xs text-faint">{c.contraparte}</div>
                </button>

                <div className="text-right">
                  <div className={`text-2xs tabular-nums ${st === 'vencida' ? 'font-semibold text-negative' : 'text-muted'}`}>
                    {fmtData(c.vencimento)}
                    {st === 'pendente' && c.vencimento === hoje && ' · hoje'}
                  </div>
                  <div className="tabular-nums text-body font-semibold text-ink">{fmtBRL(c.valor)}</div>
                </div>

                <div className="w-20 text-right">
                  {paga ? (
                    <Badge variant="positive">{rotuloStatus.paga}</Badge>
                  ) : st === 'vencida' ? (
                    <Badge variant="negative">{rotuloStatus.vencida}</Badge>
                  ) : (
                    <Badge variant="attention">{rotuloStatus.pendente}</Badge>
                  )}
                </div>

                {/* Marcar E desmarcar. Antes era mão única: um clique errado
                    deixava a conta paga para sempre. */}
                <Button
                  variant="ghost" size="iconSm"
                  title={paga ? 'Desmarcar — voltar para em aberto' : 'Marcar como paga'}
                  onClick={() => onLiquidar(c.id, !paga)}
                >
                  {paga
                    ? <Undo2 className="h-3.5 w-3.5 text-faint" />
                    : <Check className="h-3.5 w-3.5 text-faint" />}
                </Button>

                <Button
                  variant="ghost" size="iconSm" title="Editar"
                  onClick={() => onEditar(c)}
                  // Visível sempre, discreto. Escondido no hover a ação existe
                  // mas ninguém sabe — que é o mesmo que não existir.
                  className="opacity-40 transition-opacity group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5 text-faint" />
                </Button>

                <Button
                  variant="ghost" size="iconSm" title="Excluir"
                  onClick={() => onExcluir(c)}
                  className="opacity-40 transition-opacity group-hover:opacity-100 hover:text-negative"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          {contas.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-faint">Nada lançado.</p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={onNova}>
                <Plus className="h-3.5 w-3.5" /> Lançar a primeira
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
