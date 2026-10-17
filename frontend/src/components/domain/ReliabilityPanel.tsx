import { Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Reliability } from '@/api/contract';
import { Badge } from '@/components/ui/Badge';

export interface ReliabilityPanelProps {
  reliability: Reliability;
  reasons: string[];
  pixelCount: number;
  areaHa?: number;
}

export function ReliabilityPanel({
  reliability,
  reasons,
  pixelCount,
}: ReliabilityPanelProps) {
  const tone =
    reliability === 'HIGH'
      ? 'success'
      : reliability === 'MEDIUM'
        ? 'info'
        : reliability === 'LOW'
          ? 'warning'
          : 'danger';

  return (
    <div className="fp-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="fp-eyebrow">Satellite Signal Reliability</span>
        <Badge tone={tone} className="text-xs px-3 py-1 font-bold">
          {reliability === 'HIGH' ? (
            <ShieldCheck className="w-3.5 h-3.5" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5" />
          )}
          {reliability}
        </Badge>
      </div>

      <ul className="space-y-1.5 text-xs text-ink list-disc pl-4">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <div className="p-3 rounded-ctl bg-surface-2 border border-line text-xs text-ink-muted flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>
          Sentinel-2 pixels are 10 m × 10 m. This field covers ~{pixelCount} pixels; fields
          under 0.5 ha (&lt;50 pixels) mix with neighbouring land, and under 0.1 ha cannot be
          monitored by satellite.
        </p>
      </div>
    </div>
  );
}
