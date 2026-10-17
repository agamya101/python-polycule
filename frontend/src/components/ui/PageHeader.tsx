import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  badges,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-line',
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="fp-eyebrow">{eyebrow}</span>
            {badges}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-ink">{title}</h1>
          {description && (
            <span className="relative group inline-flex items-center">
              <button
                type="button"
                aria-label="Page information"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-ink-muted hover:text-primary hover:bg-surface-2 transition-colors focus:outline-none"
              >
                <Info className="w-4 h-4" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 top-full mt-2 z-50 w-72 sm:w-96 p-3 rounded-ctl bg-surface border border-line shadow-card text-xs font-normal text-ink leading-relaxed"
              >
                {description}
              </span>
            </span>
          )}
          {!eyebrow && badges}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
