import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Banknote, Clock3, Coins, Package, Receipt, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';
import { KpiCard } from '@/painel/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GraficoCategorias, GraficoReceita, coresCategoria } from '@/painel/components/charts';
import { useCoresGrafico } from '@/tema/useTema';
import { MetaTracking } from '@/painel/components/MetaTracking';
import {
  useDesempenho, usePorCategoria, useResumo, useResumoAnterior, useSerie, useVendas,
} from '@/painel/data/hooks';
import { useEhAdmin, useFiltros } from '@/painel/store/filtros';
import { fmtBRL, fmtNum, fmtPct, variacao } from '@/lib/utils';

export default function Overview() {
  const admin = useEhAdmin();
  const vendedorLogado = useFiltros((s) => s.vendedorLogado);
  const [metrica, setMetrica] = useState<'faturamento' | 'lucro'>('faturamento');
  const coresCat = coresCategoria(useCoresGrafico());

  const resumo = useResumo();
  const anterior = useResumoAnterior();
  const serie = useSerie();
  const categorias = usePorCategoria();
  const desempenho = useDesempenho();
  const minhasVendas = useVendas(admin ? {} : { vendedorId: vendedorLogado.id });

  const carregando = resumo.isLoading || anterior.isLoading;
  const r = resumo.data;
  const a = anterior.data;

  const meu = useMemo(
    () => desempenho.data?.find((d) => d.vendedor.id === vendedorLogado.id),
    [desempenho.data, vendedorLogado.id],
  );

  /* ---------- visão do vendedor: só o que é dele, sem margem nem imposto ---------- */
  if (!admin) {
    const vs = minhasVendas.data ?? [];
    const receita = vs.reduce((s, v) => s + v.receita, 0);
    return (
      <div className="stagger space-y-5">
        <div>
          <h2 className="text-base font-semibold text-ink">Olá, {vendedorLogado.nome.split(' ')[0]}</h2>
          <p className="text-xs text-muted">Seus números no período selecionado.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Meu faturamento" valor={fmtBRL(receita)} carregando={minhasVendas.isLoading} destaque />
          <KpiCard label="Minhas vendas" valor={fmtNum(vs.length)} carregando={minhasVendas.isLoading} />
          <KpiCard
            label="Meu ticket médio"
            valor={fmtBRL(vs.length ? receita / vs.length : 0)}
            carregando={minhasVendas.isLoading}
          />
          <KpiCard
            label="Comissão estimada"
            valor={fmtBRL(receita * (vendedorLogado.comissaoPct / 100))}
            hint={`${vendedorLogado.comissaoPct}% sobre o faturamento`}
            carregando={minhasVendas.isLoading}
          />
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Progresso da meta</CardTitle>
              <CardDescription>
                Meta mensal de {fmtBRL(vendedorLogado.metaMensal)}, proporcional ao período selecionado
              </CardDescription>
            </div>
            {meu && (
              <Badge variant={meu.progressoMeta >= 100 ? 'positive' : meu.progressoMeta >= 70 ? 'destaque' : 'neutral'}>
                {fmtPct(meu.progressoMeta, 0)}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {desempenho.isLoading || !meu ? (
              <Skeleton className="h-2.5 w-full" />
            ) : (
              <>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-elev">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      meu.progressoMeta >= 100 ? 'bg-positive' : 'bg-navy-600'
                    }`}
                    style={{ width: `${Math.min(meu.progressoMeta, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-2xs text-muted">
                  <span>{fmtBRL(meu.faturamento)} realizado</span>
                  <span>{meu.numeroVendas} vendas</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Minhas vendas ao longo do período</CardTitle></CardHeader>
          <CardContent className="px-2">
            {serie.isLoading ? <Skeleton className="mx-3 h-[260px]" /> : (
              <GraficoReceita
                metrica="faturamento"
                dados={(serie.data ?? []).map((p) => ({
                  ...p,
                  faturamento: vs.filter((v) => v.data === p.data).reduce((s, v) => s + v.receita, 0),
                  lucro: 0,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------- visão do sócio ---------- */
  return (
    <div className="stagger space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Faturamento"
          icone={Banknote}
          valor={fmtBRL(r?.faturamento ?? 0)}
          variacao={r && a ? variacao(r.faturamento, a.faturamento) : undefined}
          hint="vs. período anterior"
          carregando={carregando}
          destaque
        />
        <KpiCard
          label="Lucro líquido"
          icone={TrendingUp}
          valor={fmtBRL(r?.lucroLiquido ?? 0)}
          variacao={r && a ? variacao(r.lucroLiquido, a.lucroLiquido) : undefined}
          hint={r ? `margem ${fmtPct(r.faturamento ? (r.lucroLiquido / r.faturamento) * 100 : 0)}` : undefined}
          carregando={carregando}
          destaque
        />
        <KpiCard
          label="Ticket médio"
          icone={Receipt}
          valor={fmtBRL(r?.ticketMedio ?? 0)}
          variacao={r && a ? variacao(r.ticketMedio, a.ticketMedio) : undefined}
          carregando={carregando}
        />
        <KpiCard
          label="Número de vendas"
          icone={ShoppingBag}
          valor={fmtNum(r?.numeroVendas ?? 0)}
          variacao={r && a ? variacao(r.numeroVendas, a.numeroVendas) : undefined}
          hint={r ? `${fmtNum(r.unidadesVendidas)} unidades` : undefined}
          carregando={carregando}
        />
      </div>

      {/* Contratado ≠ recebido. Com parcelamento, confundir os dois é o erro que
          faz o dono achar que tem caixa que ainda não entrou. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Recebido no período"
          icone={Wallet}
          valor={fmtBRL(r?.recebidoLiquido ?? 0)}
          hint="dinheiro que de fato entrou, já líquido de taxa"
          carregando={carregando}
        />
        <KpiCard
          label="Em aberto"
          icone={Clock3}
          valor={fmtBRL(r?.emAberto ?? 0)}
          hint="parcelas a vencer"
          carregando={carregando}
        />
        <KpiCard
          label="Comissão a pagar"
          icone={Coins}
          valor={fmtBRL(r?.comissaoAPagar ?? 0)}
          hint="calculada sobre o recebido"
          carregando={carregando}
        />
        <KpiCard
          label="Entregas pendentes"
          icone={Package}
          valor={fmtNum(r?.entregasPendentes ?? 0)}
          hint={r?.creditoTradeIn ? `${fmtBRL(r.creditoTradeIn)} em trade-in` : 'nenhum trade-in'}
          carregando={carregando}
        />
      </div>

      <MetaTracking />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Evolução no período</CardTitle>
              <CardDescription>
                {metrica === 'faturamento'
                  ? 'Receita bruta por dia'
                  : 'Receita menos custo da mercadoria e taxas de pagamento'}
              </CardDescription>
            </div>
            <Tabs value={metrica} onValueChange={(v) => setMetrica(v as typeof metrica)}>
              <TabsList>
                <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
                <TabsTrigger value="lucro">Lucro</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="px-2">
            {serie.isLoading
              ? <Skeleton className="mx-3 h-[260px]" />
              : <GraficoReceita dados={serie.data ?? []} metrica={metrica} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Vendas por categoria</CardTitle>
              <CardDescription>Participação no faturamento</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {categorias.isLoading ? <Skeleton className="h-[220px]" /> : (
              <>
                <GraficoCategorias dados={categorias.data ?? []} />
                <div className="mt-3 space-y-1.5">
                  {(categorias.data ?? []).map((c) => {
                    const total = (categorias.data ?? []).reduce((s, x) => s + x.faturamento, 0);
                    return (
                      <div key={c.categoria} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-ink-2">
                          <span className="h-2 w-2 rounded-sm" style={{ background: coresCat[c.categoria] }} />
                          {c.label}
                        </span>
                        <span className="tabular-nums text-muted">
                          {fmtPct(total ? (c.faturamento / total) * 100 : 0, 0)}
                          <span className="ml-2 font-medium text-ink">{fmtBRL(c.faturamento)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Top vendedores</CardTitle>
            <CardDescription>Ordenado por faturamento no período</CardDescription>
          </div>
          <Link
            to="/painel/vendedores"
            className="flex items-center gap-1 text-xs font-medium text-navy-300 transition-colors hover:text-navy-100"
          >
            Ver detalhe <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {desempenho.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)
            : (desempenho.data ?? []).slice(0, 5).map((d) => (
              <div key={d.vendedor.id} className="flex items-center gap-3">
                <span className="w-4 text-2xs font-semibold text-faint">{d.posicao}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-600/20 text-[10px] font-semibold text-navy-200">
                  {d.vendedor.iniciais}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body font-medium text-ink">{d.vendedor.nome}</span>
                    <span className="tabular-nums text-body font-semibold text-ink">{fmtBRL(d.faturamento)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elev">
                    <div
                      className={`h-full rounded-full ${d.progressoMeta >= 100 ? 'bg-positive' : 'bg-navy-600/200'}`}
                      style={{ width: `${Math.min(d.progressoMeta, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-12 text-right text-2xs tabular-nums text-muted">
                  {fmtPct(d.progressoMeta, 0)}
                </span>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
