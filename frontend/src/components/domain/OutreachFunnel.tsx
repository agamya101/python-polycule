import type { OverviewResponse } from '@/api/contract';

export interface OutreachFunnelProps {
  funnel: OverviewResponse['outreachFunnel'];
}

export function OutreachFunnel({ funnel }: OutreachFunnelProps) {
  const base = Math.max(1, funnel.generated);
  const stages = [
    { label: 'Generated', count: funnel.generated, cls: 'bg-primary' },
    { label: 'Pending Approval', count: funnel.pendingApproval, cls: 'bg-warning' },
    { label: 'Approved', count: funnel.approved, cls: 'bg-accent' },
    { label: 'Sent', count: funnel.sent, cls: 'bg-info' },
    { label: 'Delivered', count: funnel.delivered, cls: 'bg-success/80' },
    { label: 'Acknowledged (Reached)', count: funnel.acknowledged, cls: 'bg-success' },
  ];

  return (
    <div className="space-y-3">
      {stages.map((st) => {
        const pct = Math.round((st.count / base) * 100);
        return (
          <div key={st.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-medium text-ink">{st.label}</span>
              <span className="text-ink-muted">
                <strong className="text-ink">{st.count}</strong> ({pct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-surface-2 border border-line overflow-hidden">
              <div
                className={`h-full ${st.cls} transition-all duration-300`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-line flex items-center justify-between text-xs font-mono text-ink-muted">
        <span>Failed: {funnel.failed}</span>
        <span>Rejected: {funnel.rejected}</span>
      </div>
    </div>
  );
}
