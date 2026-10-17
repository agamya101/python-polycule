import {
  Brain,
  Database,
  Flag,
  Send,
  Stamp,
  Tractor,
  UserCheck,
} from 'lucide-react';
import type { AuditEvent, AuditLayer } from '@/api/contract';
import { DataBadge } from '@/components/ui/DataBadge';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const LAYER_META: Record<
  AuditLayer,
  { label: string; icon: typeof Database; colorCls: string }
> = {
  DATA_PROVENANCE: {
    label: 'Data Provenance',
    icon: Database,
    colorCls: 'text-info bg-info/15 border-info/30',
  },
  ANALYSIS: {
    label: 'Analysis',
    icon: Brain,
    colorCls: 'text-primary bg-primary/15 border-primary/30',
  },
  HUMAN_VERIFICATION: {
    label: 'Human Verification',
    icon: UserCheck,
    colorCls: 'text-success bg-success/15 border-success/30',
  },
  APPROVAL: {
    label: 'Approval',
    icon: Stamp,
    colorCls: 'text-ink bg-accent/25 border-accent/40',
  },
  OUTREACH: {
    label: 'Outreach',
    icon: Send,
    colorCls: 'text-warning bg-warning/15 border-warning/30',
  },
  FIELD_ACTION: {
    label: 'Field Action',
    icon: Tractor,
    colorCls: 'text-risk-high bg-risk-high/15 border-risk-high/30',
  },
  OUTCOME: {
    label: 'Outcome',
    icon: Flag,
    colorCls: 'text-ink bg-surface-2 border-line',
  },
};

export interface AuditTimelineProps {
  events: AuditEvent[];
  compact?: boolean;
}

export function AuditTimeline({ events, compact = false }: AuditTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="p-4 rounded-card bg-surface-2 border border-line text-xs text-ink-muted">
        No audit events match the current filter.
      </div>
    );
  }

  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface">
      {events.map((ev) => {
        const meta = LAYER_META[ev.layer];
        const Icon = meta.icon;
        return (
          <div
            key={ev.id}
            className={cn(
              'p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/50',
              compact && 'py-2.5 px-3',
            )}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={cn(
                  'w-8 h-8 rounded-ctl border flex items-center justify-center shrink-0 mt-0.5',
                  meta.colorCls,
                )}
                title={meta.label}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-ink">#{ev.id}</span>
                  <span className="font-mono text-ink-muted">{formatDateTime(ev.at)}</span>
                  <span className="font-semibold text-ink">{ev.actor}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-ctl bg-surface-2 border border-line text-ink-muted">
                    {ev.role}
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-ctl bg-surface-2 border border-line text-primary">
                    {ev.layer}
                  </span>
                  {ev.isSimulated && <DataBadge status="SIMULATED" source={ev.action} />}
                </div>
                <p className="text-xs sm:text-sm text-ink leading-snug">{ev.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center font-mono text-[11px] text-ink-muted">
              <span
                title={`prev: ${ev.prevHash} → hash: ${ev.hash}`}
                className="px-2 py-0.5 rounded-ctl bg-surface-2 border border-line"
              >
                #{ev.hash.slice(0, 10)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
