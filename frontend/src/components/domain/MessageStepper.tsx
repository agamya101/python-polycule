import { AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import type { MessageStatus, StatusEvent } from '@/api/contract';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const MAIN_STEPS: MessageStatus[] = [
  'GENERATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'DELIVERED',
  'ACKNOWLEDGED',
];

export interface MessageStepperProps {
  status: MessageStatus;
  history: StatusEvent[];
  rejectedReason?: string | null;
}

export function MessageStepper({ status, history, rejectedReason }: MessageStepperProps) {
  const currentIdx = MAIN_STEPS.indexOf(status === 'QUEUED' ? 'SENT' : status);
  const isRejected = status === 'REJECTED';
  const isFailed = status === 'FAILED';

  const findEvent = (st: MessageStatus): StatusEvent | undefined => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].status === st) return history[i];
    }
    return undefined;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {MAIN_STEPS.map((step, idx) => {
          const ev = findEvent(step);
          const reached = Boolean(ev) || (currentIdx >= idx && !isRejected);
          const isCurrent = status === step;
          return (
            <div
              key={step}
              className={cn(
                'p-2.5 rounded-ctl border text-xs flex flex-col justify-between gap-1',
                reached
                  ? 'bg-success/10 border-success/40 text-ink'
                  : 'bg-surface-2 border-line text-ink-muted opacity-70',
                isCurrent && 'ring-2 ring-primary',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] font-bold uppercase truncate">
                  {step.replace('_', ' ')}
                </span>
                {reached ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                )}
              </div>
              {ev ? (
                <div className="text-[10px] font-mono text-ink-muted leading-tight">
                  <div className="truncate font-medium text-ink">{ev.actor}</div>
                  <div>{formatDateTime(ev.at)}</div>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-ink-muted">—</div>
              )}
            </div>
          );
        })}
      </div>

      {(isRejected || isFailed) && (
        <div className="p-3 rounded-ctl bg-danger/15 border border-danger/40 text-danger text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <div>
            <strong>{status} Branch:</strong>{' '}
            {rejectedReason ||
              findEvent(status)?.note ||
              'Message stopped on exception branch.'}
          </div>
        </div>
      )}

      <p className="text-[11px] font-mono text-ink-muted italic">
        Sent ≠ delivered ≠ acknowledged. Only farmer acknowledgement counts as reached.
      </p>
    </div>
  );
}
