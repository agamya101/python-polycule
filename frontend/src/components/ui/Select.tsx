import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, children, id, ...rest }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-ink-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn('fp-input text-sm cursor-pointer', className)}
          {...rest}
        >
          {children}
        </select>
      </div>
    );
  },
);
Select.displayName = 'Select';
