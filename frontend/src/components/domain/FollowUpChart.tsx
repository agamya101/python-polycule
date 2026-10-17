import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FieldObservation } from '@/api/contract';
import { DataBadge } from '@/components/ui/DataBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { useThemeColors } from '@/theme/useThemeColors';

export interface FollowUpChartProps {
  observations: FieldObservation[];
  baselineNdvi: number | null;
  windowDays?: number;
}

export function FollowUpChart({
  observations,
  baselineNdvi,
  windowDays = 21,
}: FollowUpChartProps) {
  const colors = useThemeColors();
  const base = baselineNdvi ?? 0.46;

  const stepDays = Math.max(1, Math.round(windowDays / Math.max(1, observations.length - 1)));
  const data = observations.map((obs, idx) => ({
    dayLabel: `Day ${Math.min(windowDays, idx * stepDays)}`,
    date: obs.date,
    ndvi: obs.usable ? obs.ndvi : null,
    ndwi: obs.usable ? obs.ndwi : null,
    unusableMarker: !obs.usable ? 0.1 : null,
    cloudPct: obs.cloudPct,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScaleBadge scale="FIELD_SENTINEL2_10M" />
          <DataBadge status="SIMULATED" source="Sentinel-2 21-Day Follow-up Watch" />
        </div>
        <span className="text-xs font-mono text-ink-muted">
          Shaded band: Baseline ± 0.05 ({(base - 0.05).toFixed(2)} – {(base + 0.05).toFixed(2)})
        </span>
      </div>

      <div className="w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.5} />
            <XAxis
              dataKey="dayLabel"
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 0.9]}
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.ink,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceArea
              yAxisId="left"
              y1={Math.max(0, base - 0.05)}
              y2={Math.min(0.9, base + 0.05)}
              fill={colors.accent}
              fillOpacity={0.14}
            />
            <ReferenceLine
              yAxisId="left"
              y={base}
              stroke={colors.inkMuted}
              strokeDasharray="4 4"
              label={{
                value: `Baseline ${base.toFixed(2)}`,
                fill: colors.inkMuted,
                fontSize: 10,
              }}
            />
            <Bar
              yAxisId="right"
              dataKey="cloudPct"
              name="Cloud %"
              fill={colors.inkMuted}
              opacity={0.18}
              barSize={14}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ndvi"
              name="Post-Advisory NDVI"
              stroke={colors.primary}
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 4, fill: colors.primary }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="unusableMarker"
              name="Cloud Obscured"
              stroke="none"
              dot={{
                r: 5,
                stroke: colors.danger,
                strokeWidth: 2,
                fill: colors.surface,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
