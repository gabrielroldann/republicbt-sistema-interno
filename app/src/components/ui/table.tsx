import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * TABELA ÚNICA. Todas as tabelas do app usam estes primitivos.
 *
 * Regras fixas:
 *  - cabeçalho fixo, na cor mais discreta da hierarquia
 *  - altura de linha confortável (py-3), não apertada
 *  - número à direita, texto à esquerda, sempre
 *  - hover na linha inteira
 *  - listas longas ganham degradê de rolagem em vez de corte seco
 */

export const TableWrap = ({
  className, fade = true, ...props
}: React.HTMLAttributes<HTMLDivElement> & { fade?: boolean }) => (
  <div className={cn('relative overflow-auto', fade && 'scroll-fade', className)} {...props} />
);

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <table className={cn('w-full border-collapse text-cell', className)} {...props} />
);

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('sticky top-0 z-10 bg-card/95 backdrop-blur-sm', className)} {...props} />
);

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('divide-y divide-line-soft', className)} {...props} />
);

export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn('transition-colors duration-150 ease-padrao hover:bg-elev/60', className)}
    {...props}
  />
);

export const TH = ({
  className, num, ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) => (
  <th
    className={cn(
      'border-b border-line px-4 py-2.5 text-label uppercase text-faint',
      num ? 'text-right' : 'text-left',
      className,
    )}
    {...props}
  />
);

export const TD = ({
  className, num, ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) => (
  <td
    className={cn('px-4 py-3 align-middle', num && 'text-right tabular-nums', className)}
    {...props}
  />
);

/** Estado vazio padrão — toda view precisa de um. */
export const EstadoVazio = ({
  titulo = 'Nada por aqui',
  children,
}: { titulo?: string; children?: React.ReactNode }) => (
  <div className="px-5 py-16 text-center">
    <div className="mx-auto mb-3 h-8 w-8 rounded-md border border-line bg-elev" aria-hidden />
    <p className="text-body font-semibold text-ink-2">{titulo}</p>
    {children && <p className="mx-auto mt-1 max-w-sm text-caption text-faint">{children}</p>}
  </div>
);
