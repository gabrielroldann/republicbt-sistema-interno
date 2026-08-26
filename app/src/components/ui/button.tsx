import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold ' +
  'transition-colors duration-150 ease-padrao ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-400 focus-visible:ring-offset-1 focus-visible:ring-offset-app ' +
  'disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        // Ação primária em ouro: é o mesmo tratamento da aba ativa e do número
        // que decide. Ouro sempre significa "aqui".
        default: 'bg-gold-400 text-ongold hover:bg-gold-300',
        outline: 'border border-line bg-elev text-ink-2 hover:border-line-strong hover:text-ink',
        ghost: 'text-muted hover:bg-elev hover:text-ink',
        subtle: 'bg-elev text-ink-2 hover:bg-elev-2',
        destructive: 'bg-negative-soft border border-negative-line text-negative hover:bg-negative/20',
        link: 'text-gold-300 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 text-body',
        sm: 'h-8 px-3 text-caption',
        xs: 'h-7 px-2 text-caption',
        icon: 'h-9 w-9',
        iconSm: 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
