import type { DataStatus, Provenance } from '@/api/contract';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

export interface DataBadgeProps {
  status: DataStatus;
  provenance?: Provenance | null;
  source?: string;
  observedAt?: string | null;
  className?: string;
}

export function DataBadge({ status, provenance, source, observedAt, className }: DataBadgeProps) {
  if (status === 'SIMULATED' || status === 'MANUAL') {
    return null;
  }

  const srcText = provenance?.source ?? source ?? status;
  const obsText = provenance?.observedAt ?? observedAt;
  const tooltip = `${status} · ${srcText}${obsText ? ` · Observed: ${formatDateTime(obsText)}` : ''}${
    provenance?.note ? ` (${provenance.note})` : ''
  }`;

  const toneCls: Record<'LIVE' | 'CACHED', string> = {
    LIVE: 'bg-success/15 text-success border-success/35',
    CACHED: 'bg-info/15 text-info border-info/35',
  };

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-semibold rounded-ctl border select-none',
        toneCls[status],
        className,
      )}
    >
      {status === 'LIVE' && <span className="fp-live-dot" />}
      <span>{status}</span>
    </span>
  );
}
