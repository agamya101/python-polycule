import { CloudRain, Droplets, Sun, Wind } from 'lucide-react';
import type { ForecastDay } from '@/api/contract';
import { formatShortDate } from '@/lib/format';

export interface WeatherStripProps {
  forecast: ForecastDay[];
}

export function WeatherStrip({ forecast }: WeatherStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {forecast.map((day) => {
        const isRainy = day.rainMm >= 10 || day.rainProbPct >= 50;
        return (
          <div
            key={day.date}
            className="p-3 rounded-card bg-surface-2 border border-line flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-ink">
                {formatShortDate(day.date)}
              </span>
              {isRainy ? (
                <CloudRain className="w-4 h-4 text-info" />
              ) : (
                <Sun className="w-4 h-4 text-warning" />
              )}
            </div>
            <div>
              <div className="text-base font-bold fp-num text-ink">
                {day.tMaxC.toFixed(1)}°{' '}
                <span className="text-xs font-normal text-ink-muted">
                  / {day.tMinC.toFixed(1)}°C
                </span>
              </div>
            </div>
            <div className="space-y-1 text-[11px] font-mono text-ink-muted border-t border-line pt-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <Droplets className="w-3 h-3" /> Rain
                </span>
                <span className="text-ink">
                  {day.rainMm} mm ({day.rainProbPct}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <Wind className="w-3 h-3" /> Wind
                </span>
                <span className="text-ink">{day.windKmh} km/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ET₀</span>
                <span className="text-ink">{day.et0Mm.toFixed(1)} mm</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
