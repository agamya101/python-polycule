import { AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react';
import type { ReasoningStep } from '@/api/contract';
import { DataBadge } from '@/components/ui/DataBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';

export interface ReasoningChainProps {
  steps: ReasoningStep[];
}

export function ReasoningChain({ steps }: ReasoningChainProps) {
  return (
    <div className="space-y-4">
      {steps.map((s, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={s.step} className="flex gap-3.5 relative">
            {!isLast && (
              <div
                className="w-0.5 bg-line absolute left-[15px] top-8 bottom-[-16px]"
                aria-hidden
              />
            )}
            <div className="w-8 h-8 rounded-full bg-surface-2 border border-line flex items-center justify-center shrink-0 z-10">
              {s.status === 'OK' && <CheckCircle2 className="w-4 h-4 text-success" />}
              {s.status === 'WARN' && <AlertTriangle className="w-4 h-4 text-warning" />}
              {s.status === 'ABSTAIN' && <CircleSlash className="w-4 h-4 text-ink-muted" />}
            </div>
            <div className="flex-1 pb-2 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary uppercase">
                    Step {s.step} · {s.agent}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.evidence.map((ev, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {ev.scale && <ScaleBadge scale={ev.scale} />}
                      <DataBadge status={ev.status} provenance={ev} />
                    </span>
                  ))}
                </div>
              </div>
              <h4 className="text-sm font-bold text-ink">{s.title}</h4>
              <p className="text-xs text-ink-muted leading-relaxed">{s.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
