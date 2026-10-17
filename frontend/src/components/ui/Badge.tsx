import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = 'neutral', children, className, title }: BadgeProps) {
  const toneCls: Record<BadgeTone, string> = {
    neutral: 'bg-surface-2 text-ink-muted border-line',
    primary: 'bg-primary/15 text-primary border-primary/30',
    accent: 'bg-accent/25 text-ink border-accent/40',
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    danger: 'bg-danger/15 text-danger border-danger/30',
    info: 'bg-info/15 text-info border-info/30',
  };

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-mono font-medium rounded-full border',
        toneCls[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
