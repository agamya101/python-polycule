import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, className, id, ...rest }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-ink-muted">
            {label}
          </label>
        )}
        <input ref={ref} id={id} className={cn('fp-input text-sm', className)} {...rest} />
        {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
