import type { RiskLevel } from '@/api/contract';
import { cn } from '@/lib/cn';

export interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  className?: string;
}

export function RiskBadge({ level, score, className }: RiskBadgeProps) {
  const styles: Record<RiskLevel, { badge: string; dot: string }> = {
    LOW: {
      badge: 'bg-risk-low/15 text-risk-low border-risk-low/30',
      dot: 'bg-risk-low',
    },
    MEDIUM: {
      badge: 'bg-risk-medium/15 text-risk-medium border-risk-medium/30',
      dot: 'bg-risk-medium',
    },
    HIGH: {
      badge: 'bg-risk-high/15 text-risk-high border-risk-high/30',
      dot: 'bg-risk-high',
    },
    CRITICAL: {
      badge: 'bg-risk-critical/15 text-risk-critical border-risk-critical/30',
      dot: 'bg-risk-critical',
    },
  };

  const s = styles[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-mono font-semibold rounded-ctl border',
        s.badge,
        className,
      )}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
      <span>{level}</span>
      {score !== undefined && <span className="opacity-80">({score})</span>}
    </span>
  );
}
