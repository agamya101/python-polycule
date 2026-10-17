import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  label?: string;
  showPct?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  label,
  showPct = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  const fillCls = {
    primary: 'bg-primary',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }[tone];

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showPct) && (
        <div className="flex items-center justify-between text-xs font-mono">
          {label && <span className="text-ink-muted">{label}</span>}
          {showPct && <span className="text-ink font-semibold">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="w-full h-2 rounded-full bg-surface-2 border border-line overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', fillCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
