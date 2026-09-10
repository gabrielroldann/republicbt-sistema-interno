import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Campo } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAcompanhamentoMeta, useFaturamentoDiario } from '@/painel/data/hooks';
import { definirMeta } from '@/painel/data/queries';
import { useEhAdmin } from '@/painel/store/filtros';
import { useCoresGrafico, useCorToken } from '@/tema/useTema';
import { cn, fmtBRL, fmtMesAno, fmtNum, fmtPct, mesRef } from '@/lib/utils';
import type { NivelRisco } from '@/painel/types';

// A cor do anel vem do tema (atributo de SVG não aceita `var()` com segurança).
const risco: Record<NivelRisco, { label: string; badge: 'positive' | 'attention' | 'negative' }> = {
  no_ritmo: { label: 'No ritmo', badge: 'positive' },
  atencao: { label: 'Atenção', badge: 'attention' },
  alto: { label: 'Risco alto', badge: 'negative' },
};

function mesVizinho(ym: string, delta: number) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function MetaTracking() {
  const admin = useEhAdmin();
  const cores = useCoresGrafico();
  const trilha = useCorToken('--c-line-strong');
  const [mes, setMes] = useState(mesRef());
  const { data: m, isLoading } = useAcompanhamentoMeta(mes);
  const { data: dias } = useFaturamentoDiario(mes);

  if (isLoading || !m) {
    return (
      <Card>
        <CardHeader><div><CardTitle>Acompanhamento da meta</CardTitle></div></CardHeader>
        <CardContent><Skeleton className="h-52" /></CardContent>
      </Card>
    );
  }

  const r = risco[m.risco];
  const corAnel = { no_ritmo: cores.positivo, atencao: cores.destaque, alto: cores.negativo }[m.risco];
  const anelDados = [
    { nome: 'atingido', valor: Math.min(m.atingimento, 100) },
    { nome: 'restante', valor: Math.max(100 - m.atingimento, 0) },
  ];
  const atrasado = m.gap < 0;
  const maiorDia = (dias ?? []).reduce(
    (a, b) => (b.faturamento > (a?.faturamento ?? 0) ? b : a),
    undefined as { data: string; faturamento: number } | undefined,
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Acompanhamento da meta</CardTitle>
          <CardDescription>
            Competência {fmtMesAno(m.mes)} · dia {m.diasDecorridos} de {m.diasNoMes} ·
            independente do filtro de período acima
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={r.badge}>{r.label}</Badge>
          {admin && <EditarMeta mes={m.mes} atual={m.meta} />}
          <div className="flex items-center rounded-md border border-line">
            <button
              onClick={() => setMes(mesVizinho(mes, -1))}
              className="px-1.5 py-1 text-muted transition-colors hover:bg-elev hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMes(mesVizinho(mes, 1))}
              disabled={mes >= mesRef()}
              className="px-1.5 py-1 text-muted transition-colors hover:bg-elev hover:text-ink disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          {/* anel de atingimento */}
          <div className="relative flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={168}>
              <PieChart>
                <Pie
                  data={anelDados} dataKey="valor" innerRadius={58} outerRadius={78}
                  startAngle={90} endAngle={-270} strokeWidth={0}
                >
                  <Cell fill={corAnel} />
                  <Cell fill={trilha} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-kpi text-ink tabular-nums">
                {fmtPct(m.atingimento, 0)}
              </span>
              <span className="text-label uppercase text-faint">atingido</span>
            </div>
          </div>

          {/* números que decidem */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 self-center lg:grid-cols-3">
            <Item rotulo="Meta do mês" valor={fmtBRL(m.meta)} />
            <Item rotulo="Faturado até agora" valor={fmtBRL(m.acumulado)} />
            <Item rotulo="Falta" valor={fmtBRL(m.restante)} />

            <Item
              rotulo="Ritmo atual por dia"
              valor={fmtBRL(m.ritmoAtual)}
              nota={`${m.diasComVenda} dias com venda`}
            />
            <Item
              rotulo="Ritmo necessário por dia"
              valor={fmtBRL(m.ritmoNecessario)}
              nota={m.diasRestantes > 0 ? `em ${m.diasRestantes} dias restantes` : 'mês encerrado'}
              tom={m.ritmoNecessario > m.ritmoAtual * 1.15 ? 'ruim' : 'bom'}
            />
            <Item
              rotulo="Vendas por dia necessárias"
              valor={fmtNum(m.vendasPorDiaNecessarias, 1)}
              nota={`ticket ${fmtBRL(m.ticketMedio)}`}
            />

            <Item
              rotulo={atrasado ? 'Atraso contra o esperado' : 'Adiantado sobre o esperado'}
              valor={`${atrasado ? '−' : '+'} ${fmtBRL(Math.abs(m.gap))}`}
              nota={`esperado hoje ${fmtBRL(m.esperadoHoje)}`}
              tom={atrasado ? 'ruim' : 'bom'}
              icone
            />
            <Item
              rotulo="Projeção de fechamento"
              valor={fmtBRL(m.projecao)}
              nota={`cobertura ${fmtPct(m.cobertura * 100, 0)}`}
              tom={m.cobertura >= 1 ? 'bom' : 'ruim'}
              destaque
            />
            {maiorDia && (
              <Item
                rotulo="Melhor dia do mês"
                valor={fmtBRL(maiorDia.faturamento)}
                nota={new Date(maiorDia.data).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit',
                })}
              />
            )}
          </div>
        </div>

        {/* barra: onde está vs onde deveria estar */}
        <div className="mt-6 border-t border-line-soft pt-4">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-elev">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(m.atingimento, 100)}%`, background: corAnel }}
            />
            {/* marcador do ritmo ideal — a régua honesta */}
            <div
              className="absolute top-0 h-full w-0.5 bg-ink"
              style={{ left: `${Math.min((m.esperadoHoje / (m.meta || 1)) * 100, 100)}%` }}
              title="Onde deveria estar hoje"
            />
          </div>
          <div className="mt-2 flex justify-between text-2xs text-faint">
            <span>Realizado {fmtBRL(m.acumulado)}</span>
            <span className="text-ink-2">
              A marca preta é onde o mês deveria estar hoje: {fmtBRL(m.esperadoHoje)}
            </span>
            <span>{fmtBRL(m.meta)}</span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {m.diasRestantes === 0 ? (
            <>Competência encerrada com {fmtPct(m.atingimento, 0)} da meta.</>
          ) : m.cobertura >= 1 ? (
            <>
              Mantendo o ritmo atual de <strong className="text-ink-2">{fmtBRL(m.ritmoAtual)}</strong> por
              dia, o mês fecha em <strong className="text-ink-2">{fmtBRL(m.projecao)}</strong> — acima da meta.
            </>
          ) : (
            <>
              O ritmo atual fecha o mês em <strong className="text-ink-2">{fmtBRL(m.projecao)}</strong>,
              {' '}<strong className="text-negative">{fmtBRL(m.meta - m.projecao)}</strong> abaixo da meta.
              Para virar, os {m.diasRestantes} dias restantes precisam render{' '}
              <strong className="text-ink-2">{fmtBRL(m.ritmoNecessario)}</strong> por dia — cerca de{' '}
              {fmtNum(m.vendasPorDiaNecessarias, 1)} vendas diárias no ticket atual.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function Item({
  rotulo, valor, nota, tom, destaque, icone,
}: {
  rotulo: string; valor: string; nota?: string;
  tom?: 'bom' | 'ruim'; destaque?: boolean; icone?: boolean;
}) {
  return (
    <div>
      <div className="label-caps">{rotulo}</div>
      <div
        className={cn(
          'mt-1 flex items-center gap-1 text-num tabular-nums',
          tom === 'bom' && 'text-positive',
          tom === 'ruim' && 'text-negative',
          !tom && 'text-ink',
          destaque && 'text-title',
        )}
      >
        {icone && (tom === 'ruim'
          ? <TrendingDown className="h-3.5 w-3.5" />
          : <TrendingUp className="h-3.5 w-3.5" />)}
        {valor}
      </div>
      {nota && <div className="mt-0.5 text-2xs text-faint">{nota}</div>}
    </div>
  );
}

/* ---------- editar meta da competência ---------- */

const schema = z.object({ receita: z.coerce.number().min(0, 'Informe um valor válido') });
type Form = z.infer<typeof schema>;

function EditarMeta({ mes, atual }: { mes: string; atual: number }) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { receita: atual },
  });

  async function salvar(v: Form) {
    await definirMeta(mes, v.receita);
    await qc.invalidateQueries();
    setAberto(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="iconSm"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Meta de receita</DialogTitle>
        <DialogDescription>Competência {fmtMesAno(mes)}</DialogDescription>
        <form onSubmit={handleSubmit(salvar)} className="mt-4 space-y-3">
          <Campo label="Meta do mês (R$)" hint="Vale só para esta competência.">
            <Input type="number" step="500" {...register('receita')} />
            {errors.receita && <p className="mt-1 text-2xs text-negative">{errors.receita.message}</p>}
          </Campo>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
