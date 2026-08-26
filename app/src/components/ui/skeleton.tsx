import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('animate-pulse rounded bg-elev', className)} style={style} />;
}

/** Esqueleto de tabela — o que faz o painel parecer pronto e não meio construído. */
export function SkeletonTabela({ linhas = 8, colunas = 6 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="divide-y divide-line-soft">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3">
          {Array.from({ length: colunas }).map((_, j) => (
            <Skeleton key={j} className={cn('h-3.5', j === 0 ? 'w-48' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrafico({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-end gap-1.5 px-5 pb-5', className)}>
      {[42, 68, 55, 79, 61, 88, 72, 95, 66, 83, 74, 91, 58, 77].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function SkeletonKpi() {
  return (
    <div className="card p-4">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-7 w-32 mt-3" />
      <Skeleton className="h-2.5 w-20 mt-3" />
    </div>
  );
}
