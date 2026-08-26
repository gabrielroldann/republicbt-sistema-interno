import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { cn, fmtPct } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  label: string;
  valor: string;
  icone?: LucideIcon;
  /** Variação percentual contra o período anterior. */
  variacao?: number;
  /** Em despesa/custo, subir é ruim — inverte a cor sem inverter a seta. */
  inverterCor?: boolean;
  hint?: string;
  /** Ouro = "olhe para este número". Reservado aos dois ou três que decidem. */
  destaque?: boolean;
  carregando?: boolean;
}

/**
 * Bloco de número. Barra de acento à esquerda em vez de borda completa — é a
 * assinatura visual do painel e o que mais o afasta da grade de cartões
 * arredondados que todo dashboard usa.
 *
 * Contêiner de ícone, padding interno e escala de texto são idênticos em todos
 * os blocos do app.
 */
export function KpiCard({
  label, valor, icone: Icone, variacao, inverterCor, hint, destaque, carregando,
}: Props) {
  if (carregando) {
    return (
      <div className="rounded-md border-l-[3px] border-line bg-elev px-4 py-3.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-3.5 h-6 w-32" />
        <Skeleton className="mt-3 h-2.5 w-20" />
      </div>
    );
  }

  const temVariacao = variacao !== undefined && Number.isFinite(variacao);
  const subiu = (variacao ?? 0) > 0.05;
  const caiu = (variacao ?? 0) < -0.05;
  const bom = inverterCor ? caiu : subiu;
  const ruim = inverterCor ? subiu : caiu;

  return (
    <div
      // Âncoras para o teste conferir número por número contra o banco. Sem
      // elas o teste depende da estrutura das <div>, e qualquer ajuste de
      // layout quebra a verificação — o que faz a equipe passar a ignorá-la.
      data-kpi={label}
      data-valor={valor}
      className={cn(
        'group rounded-md border-l-[3px] bg-elev px-4 py-3.5 transition-colors duration-200 ease-padrao hover:bg-elev-2',
        destaque ? 'border-gold-400' : 'border-navy-500',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-label uppercase text-muted">{label}</span>
        {Icone && (
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
              destaque ? 'border-gold-400/40 text-gold-300' : 'border-line text-faint',
            )}
          >
            <Icone className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {/* Em coluna estreita (2 por linha no celular) 33px estoura em valores como
          "R$ 41.698,00" — por isso o degrau menor até sm. */}
      <div
        className={cn(
          'mt-2.5 text-kpi-sm tabular-nums sm:text-kpi',
          destaque ? 'text-gold-300' : 'text-ink',
        )}
      >
        {valor}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-caption">
        {temVariacao && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-bold',
              bom && 'text-positive',
              ruim && 'text-negative',
              !bom && !ruim && 'text-faint',
            )}
          >
            {subiu ? <ArrowUpRight className="h-3 w-3" strokeWidth={3} />
              : caiu ? <ArrowDownRight className="h-3 w-3" strokeWidth={3} />
              : <Minus className="h-3 w-3" strokeWidth={3} />}
            {fmtPct(Math.abs(variacao!))}
          </span>
        )}
        {hint && <span className="text-faint">{hint}</span>}
      </div>
    </div>
  );
}
