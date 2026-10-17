import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, className, id, ...rest }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-ink-muted">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn('fp-input text-sm min-h-[88px]', className)}
          {...rest}
        />
        {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
