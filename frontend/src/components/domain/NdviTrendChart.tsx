import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FieldObservation } from '@/api/contract';
import { DataBadge } from '@/components/ui/DataBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { formatShortDate } from '@/lib/format';
import { useThemeColors } from '@/theme/useThemeColors';

export interface NdviTrendChartProps {
  observations: FieldObservation[];
  baselineNdvi?: number | null;
  advisoryDate?: string | null;
}

export function NdviTrendChart({
  observations,
  baselineNdvi = 0.65,
  advisoryDate,
}: NdviTrendChartProps) {
  const colors = useThemeColors();

  const data = observations.map((obs) => ({
    date: obs.date,
    dateLabel: formatShortDate(obs.date),
    ndvi: obs.usable ? obs.ndvi : null,
    ndwi: obs.usable ? obs.ndwi : null,
    unusableMarker: !obs.usable ? 0.1 : null,
    cloudPct: obs.cloudPct,
    usable: obs.usable,
  }));

  const advLabel = advisoryDate ? formatShortDate(advisoryDate) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScaleBadge scale="FIELD_SENTINEL2_10M" />
          <DataBadge status="SIMULATED" source="Copernicus Sentinel-2 L2A (10 m)" />
        </div>
        <div className="text-xs font-mono text-ink-muted">
          Hollow dot @ y=0.10 = Cloud-obscured pass (unusable)
        </div>
      </div>

      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.5} />
            <XAxis
              dataKey="dateLabel"
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
            />
            <YAxis
              yAxisId="left"
              domain={[-0.2, 1.0]}
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
              label={{
                value: 'NDVI / NDWI',
                angle: -90,
                position: 'insideLeft',
                fill: colors.inkMuted,
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              stroke={colors.inkMuted}
              tick={{ fontSize: 11, fill: colors.inkMuted }}
              label={{
                value: 'Cloud %',
                angle: 90,
                position: 'insideRight',
                fill: colors.inkMuted,
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.ink,
                fontSize: 12,
              }}
              formatter={(value: unknown, name: string) => {
                if (name === 'unusableMarker') {
                  return ['Cloud-obscured (unusable)', 'Pass Status'];
                }
                if (typeof value === 'number') {
                  return [name === 'Cloud %' ? `${value}%` : value.toFixed(2), name];
                }
                return ['—', name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="right"
              dataKey="cloudPct"
              name="Cloud %"
              fill={colors.inkMuted}
              opacity={0.18}
              barSize={16}
            />
            {baselineNdvi !== null && baselineNdvi !== undefined && (
              <ReferenceLine
                yAxisId="left"
                y={baselineNdvi}
                stroke={colors.inkMuted}
                strokeDasharray="5 5"
                label={{
                  value: `Baseline (${baselineNdvi.toFixed(2)})`,
                  fill: colors.inkMuted,
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
            )}
            {advLabel && (
              <ReferenceLine
                yAxisId="left"
                x={advLabel}
                stroke={colors.accent}
                strokeWidth={2}
                label={{
                  value: 'Advisory sent',
                  fill: colors.ink,
                  fontSize: 11,
                  position: 'top',
                }}
              />
            )}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ndvi"
              name="NDVI (10 m)"
              stroke={colors.primary}
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 4, fill: colors.primary }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ndwi"
              name="NDWI (Moisture)"
              stroke={colors.info}
              strokeWidth={2}
              connectNulls
              dot={{ r: 3, fill: colors.info }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="unusableMarker"
              name="unusableMarker"
              legendType="none"
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
