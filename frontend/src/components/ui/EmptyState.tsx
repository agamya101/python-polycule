import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'fp-card p-8 text-center flex flex-col items-center justify-center gap-3',
        className,
      )}
    >
      <div className="w-11 h-11 rounded-full bg-surface-2 border border-line flex items-center justify-center text-primary">
        {icon ?? <Inbox className="w-5 h-5" />}
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {hint && <p className="text-xs text-ink-muted leading-relaxed">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
