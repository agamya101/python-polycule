import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      children,
      className,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const variantCls = {
      primary: 'fp-btn-primary',
      accent: 'fp-btn-accent',
      ghost: 'fp-btn-ghost',
      danger: 'fp-btn-danger',
    }[variant];

    const sizeCls = size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-sm px-4 py-2';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn('fp-btn cursor-pointer', variantCls, sizeCls, className)}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
