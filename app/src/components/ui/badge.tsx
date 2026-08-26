import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * PILL ÚNICO. Todo status da aplicação passa por aqui — pago, pendente,
 * entregue, vencida, conectado, cache. Padding, tamanho e peso idênticos em
 * qualquer tela.
 *
 * Mapeamento fixo de significado, para que "verde" queira dizer a mesma coisa
 * em qualquer lugar que a pessoa olhe:
 *
 *   positive  concluído, pago, entregue, no ritmo
 *   negative  perdido, vencido, falhou, sem estoque
 *   attention pendente, parcial, precisa de ação
 *   info      informativo, estado neutro ativo
 *   neutral   contagem, rótulo sem carga
 *   destaque  ouro — número que decide. NUNCA status.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap leading-tight',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-elev text-muted',
        positive: 'border-positive-line bg-positive-soft text-positive',
        negative: 'border-negative-line bg-negative-soft text-negative',
        attention: 'border-attention-line bg-attention-soft text-attention',
        info: 'border-info-line bg-info-soft text-info',
        destaque: 'border-gold-400/40 bg-gold-400/15 text-gold-300',
        navy: 'border-navy-500/50 bg-navy-600/40 text-navy-100',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Ponto de cor antes do texto — ajuda a ler o status sem depender só do matiz. */
  ponto?: boolean;
}

export function Badge({ className, variant, ponto, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {ponto && <span className="h-1 w-1 bg-current" aria-hidden />}
      {children}
    </span>
  );
}
