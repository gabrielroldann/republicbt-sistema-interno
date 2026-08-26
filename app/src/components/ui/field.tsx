import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * CAMPOS. Altura, padding e borda idênticos em qualquer formulário do app —
 * a inconsistência de altura entre campos é o que mais denuncia interface
 * montada às pressas.
 *
 * Estado em repouso e estado com foco são deliberadamente distintos: o campo
 * focado ganha borda dourada e anel, não só um tom de azul a mais.
 */
const base =
  'h-9 w-full border border-line bg-elev px-2.5 text-body text-ink ' +
  'transition-colors duration-150 ease-padrao placeholder:text-faint ' +
  'hover:border-line-strong ' +
  'focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400/40 ' +
  'disabled:cursor-not-allowed disabled:bg-app disabled:text-faint';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, 'cursor-pointer appearance-none pr-7', className)} {...props} />
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-label uppercase text-faint', className)} {...props} />;
}

export function Campo({
  label, children, hint, className,
}: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-caption text-faint">{hint}</p>}
    </div>
  );
}

/**
 * CONTROLE SEGMENTADO. Um único tratamento de estado ativo para todo par
 * Sim/Não, Entregue/Pendente e afins — o app inteiro usa ouro sobre navy para
 * dizer "esta é a opção escolhida". Antes cada toggle inventava a própria cor.
 */
export function Segmentado<T extends string | boolean>({
  opcoes, valor, aoMudar, className,
}: {
  opcoes: { valor: T; label: string }[];
  valor: T | undefined;
  aoMudar: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex border border-line', className)}>
      {opcoes.map((o, i) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar(o.valor)}
            className={cn(
              'h-9 flex-1 px-3 text-caption font-semibold transition-colors duration-150 ease-padrao',
              i > 0 && 'border-l border-line',
              ativo
                ? 'bg-gold-400 text-ongold'
                : 'bg-elev text-muted hover:bg-elev-2 hover:text-ink-2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
