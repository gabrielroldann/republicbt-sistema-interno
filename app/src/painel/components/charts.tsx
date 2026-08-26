/**
 * Configuração compartilhada dos gráficos — mesma linguagem visual em toda parte.
 *
 * A cor vem do tema ativo, não de constantes deste arquivo: o Recharts grava a
 * cor como atributo de apresentação do SVG, onde `var(--x)` não é confiável.
 * Por isso cada componente lê a paleta já resolvida via `useCoresGrafico()`.
 */

import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useCoresGrafico } from '@/tema/useTema';
import type { Tema } from '@/tema/temas';
import { fmtBRL, fmtBRLCompacto, fmtDataCurta, fmtMesAno } from '@/lib/utils';

type Paleta = Tema['grafico'];

/** Paleta das categorias — estável entre telas, para o olho aprender a cor. */
export function coresCategoria(c: Paleta): Record<string, string> {
  return {
    raquetes: c.serie,
    roupas: c.destaque,
    raqueteiras: c.serieClara,
    acessorios: c.neutro,
  };
}

// Tipografia de eixo igual à do app: mesma família, tamanho de legenda,
// algarismos tabulares. Sem isso o gráfico parece de outra aplicação.
function eixoDe(c: Paleta) {
  return {
    stroke: c.eixo,
    fontSize: 11,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontVariantNumeric: 'tabular-nums',
  } as const;
}

function Caixa({
  ativo, itens, rotulo,
}: { ativo?: boolean; itens?: { name?: string; value?: number; color?: string }[]; rotulo?: string }) {
  if (!ativo || !itens?.length) return null;
  return (
    <div className="rounded border border-line-strong bg-card px-3 py-2 shadow-flutuante">
      {rotulo && <div className="mb-1 text-label uppercase text-faint">{rotulo}</div>}
      {itens.map((i, k) => (
        <div key={k} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} />
            {i.name}
          </span>
          <span className="font-bold tabular-nums text-ink">{fmtBRL(i.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const tooltipDia = (props: any) => (
  <Caixa
    ativo={props.active}
    rotulo={props.label ? fmtDataCurta(props.label) : undefined}
    itens={props.payload?.map((p: any) => ({ name: p.name, value: p.value, color: p.color ?? p.fill }))}
  />
);
const tooltipMes = (props: any) => (
  <Caixa
    ativo={props.active}
    rotulo={props.label ? fmtMesAno(props.label) : undefined}
    itens={props.payload?.map((p: any) => ({ name: p.name, value: p.value, color: p.color ?? p.fill }))}
  />
);
const tooltipSimples = (props: any) => (
  <Caixa
    ativo={props.active}
    itens={props.payload?.map((p: any) => ({ name: p.name, value: p.value, color: p.payload?.fill ?? p.color }))}
  />
);

export function GraficoReceita({
  dados, metrica,
}: { dados: { data: string; faturamento: number; lucro: number }[]; metrica: 'faturamento' | 'lucro' }) {
  const c = useCoresGrafico();
  const eixo = eixoDe(c);
  const cor = metrica === 'faturamento' ? c.serie : c.positivo;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          {/* o id inclui a cor para o gradiente ser recriado ao trocar de tema */}
          <linearGradient id={`g-${metrica}-${cor.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={cor} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grade} vertical={false} />
        <XAxis dataKey="data" tickFormatter={fmtDataCurta} tickLine={false} axisLine={false} tick={eixo} minTickGap={28} />
        <YAxis tickFormatter={fmtBRLCompacto} tickLine={false} axisLine={false} tick={eixo} width={58} />
        <Tooltip content={tooltipDia} />
        <Area
          type="monotone" dataKey={metrica}
          name={metrica === 'faturamento' ? 'Faturamento' : 'Lucro bruto'}
          stroke={cor} strokeWidth={2} fill={`url(#g-${metrica}-${cor.slice(1)})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GraficoCategorias({
  dados,
}: { dados: { categoria: string; label: string; faturamento: number }[] }) {
  const c = useCoresGrafico();
  const cores = useMemo(() => coresCategoria(c), [c]);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={dados} dataKey="faturamento" nameKey="label"
          innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}
        >
          {dados.map((d) => <Cell key={d.categoria} fill={cores[d.categoria] ?? c.neutro} />)}
        </Pie>
        <Tooltip content={tooltipSimples} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GraficoFluxo({
  dados,
}: { dados: { data: string; entradas: number; saidas: number; saldo: number }[] }) {
  const c = useCoresGrafico();
  const eixo = eixoDe(c);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={dados} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={c.grade} vertical={false} />
        <XAxis dataKey="data" tickFormatter={fmtDataCurta} tickLine={false} axisLine={false} tick={eixo} minTickGap={28} />
        <YAxis tickFormatter={fmtBRLCompacto} tickLine={false} axisLine={false} tick={eixo} width={62} />
        <Tooltip content={tooltipDia} />
        <Line type="monotone" dataKey="saldo" name="Saldo em caixa" stroke={c.serie} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="entradas" name="Entradas" stroke={c.positivo} strokeWidth={1.2} dot={false} strokeOpacity={0.65} />
        <Line type="monotone" dataKey="saidas" name="Saídas" stroke={c.negativo} strokeWidth={1.2} dot={false} strokeOpacity={0.65} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GraficoMensal({
  dados, limiteFaixa,
}: { dados: { mes: string; faturamento: number }[]; limiteFaixa?: number }) {
  const c = useCoresGrafico();
  const eixo = eixoDe(c);
  const mediaLimite = limiteFaixa ? limiteFaixa / 12 : undefined;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={c.grade} vertical={false} />
        <XAxis dataKey="mes" tickFormatter={fmtMesAno} tickLine={false} axisLine={false} tick={eixo} />
        <YAxis tickFormatter={fmtBRLCompacto} tickLine={false} axisLine={false} tick={eixo} width={58} />
        <Tooltip content={tooltipMes} cursor={{ fill: c.cursor }} />
        <Bar dataKey="faturamento" name="Faturamento" radius={[3, 3, 0, 0]}>
          {dados.map((d, i) => (
            <Cell
              key={d.mes}
              fill={
                mediaLimite && d.faturamento > mediaLimite
                  ? c.destaque
                  : i === dados.length - 1 ? c.serieClara : c.serie
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoBarrasHorizontal({
  dados,
}: { dados: { label: string; valor: number }[] }) {
  const c = useCoresGrafico();
  const eixo = eixoDe(c);
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, dados.length * 38)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={c.grade} horizontal={false} />
        <XAxis type="number" tickFormatter={fmtBRLCompacto} tickLine={false} axisLine={false} tick={eixo} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={eixo} width={110} />
        <Tooltip content={tooltipSimples} cursor={{ fill: c.cursor }} />
        <Bar dataKey="valor" name="Faturamento" fill={c.serie} radius={[0, 3, 3, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
