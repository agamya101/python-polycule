import { CloudRain, Snowflake, Sun, ThermometerSun, Wind } from 'lucide-react';
import type { WeatherAlert, WeatherAlertType } from '@/api/contract';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { formatShortDate } from '@/lib/format';

export interface WeatherAlertListProps {
  alerts: WeatherAlert[];
}

export function WeatherAlertIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: WeatherAlertType;
  className?: string;
}) {
  switch (type) {
    case 'HEAVY_RAIN':
      return <CloudRain className={className} />;
    case 'HEATWAVE':
      return <ThermometerSun className={className} />;
    case 'COLD_WAVE':
      return <Snowflake className={className} />;
    case 'HIGH_WIND':
      return <Wind className={className} />;
    case 'DRY_SPELL':
      return <Sun className={className} />;
  }
}

export function WeatherAlertList({ alerts }: WeatherAlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="p-4 rounded-card bg-surface-2 border border-line text-xs text-ink-muted">
        No active weather alerts for this selection.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {alerts.map((a) => {
        const tone =
          a.severity === 'SEVERE'
            ? 'danger'
            : a.severity === 'WARNING'
              ? 'warning'
              : 'accent';
        return (
          <div
            key={a.id}
            className="p-3.5 rounded-card bg-surface-2 border border-line flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-ctl bg-surface border border-line text-primary mt-0.5">
                <WeatherAlertIcon type={a.type} className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink">{a.title}</span>
                  <Badge tone={tone}>{a.severity}</Badge>
                  <span className="text-xs font-mono text-ink-muted uppercase">
                    {a.districtId}
                  </span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{a.message}</p>
                <div className="text-[11px] font-mono text-ink-muted">
                  Valid: {formatShortDate(a.validFrom)} – {formatShortDate(a.validTo)}
                </div>
              </div>
            </div>
            <DataBadge status={a.provenance.status} provenance={a.provenance} />
          </div>
        );
      })}
    </div>
  );
}
