import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { AgentEvent } from '@/api/contract';
import { Badge } from '@/components/ui/Badge';

const AGENTS: AgentEvent['agent'][] = [
  'Satellite Scout',
  'Weather Watch',
  'Crop Risk Analyst',
  'Field Monitor',
];

export interface AgentStatusPanelProps {
  events: AgentEvent[];
  running: boolean;
}

export function AgentStatusPanel({ events, running }: AgentStatusPanelProps) {
  const getAgentStatus = (
    agent: AgentEvent['agent'],
  ): 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR' => {
    const agentEvs = events.filter((e) => e.agent === agent);
    if (agentEvs.length === 0) return running ? 'IDLE' : 'IDLE';
    const last = agentEvs[agentEvs.length - 1];
    return last.status;
  };

  return (
    <div className="fp-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="fp-eyebrow">Multi-Agent Priority Scan Pipeline (SSE)</span>
        <Badge tone={running ? 'warning' : 'success'}>
          {running ? 'SCAN RUNNING' : 'SCAN READY'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {AGENTS.map((agent) => {
          const st = getAgentStatus(agent);
          const lastEv = [...events].reverse().find((e) => e.agent === agent);
          return (
            <div
              key={agent}
              className="p-3 rounded-card bg-surface-2 border border-line space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink">{agent}</span>
                {st === 'IDLE' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-muted">
                    <Circle className="w-3 h-3" /> IDLE
                  </span>
                )}
                {st === 'RUNNING' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-warning font-semibold">
                    <Loader2 className="w-3 h-3 animate-spin" /> RUNNING
                  </span>
                )}
                {st === 'COMPLETE' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> COMPLETE
                  </span>
                )}
                {st === 'ERROR' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-danger font-semibold">
                    <AlertCircle className="w-3 h-3" /> ERROR
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-muted line-clamp-2 min-h-[2rem]">
                {lastEv ? lastEv.message : 'Waiting for scan trigger…'}
              </p>
            </div>
          );
        })}
      </div>

      {events.length > 0 && (
        <div className="p-3 rounded-ctl bg-surface-2 border border-line max-h-40 overflow-y-auto font-mono text-[12px] space-y-1">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-ink-muted shrink-0">
                [{ev.at.slice(11, 19)}]
              </span>
              <span className="text-primary font-semibold shrink-0">{ev.agent}:</span>
              <span className="text-ink">{ev.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
