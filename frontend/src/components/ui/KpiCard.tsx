import type { ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/theme/useTheme';
import { useThemeColors } from '@/theme/useThemeColors';
import { cn } from '@/lib/cn';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  footnote?: ReactNode;
  icon?: ReactNode;
  trend?: number[];
  badge?: ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  footnote,
  icon,
  trend,
  badge,
  className,
}: KpiCardProps) {
  const { concept } = useTheme();
  const colors = useThemeColors();
  const chartData = trend?.map((v, idx) => ({ i: idx, v }));

  return (
    <div className={cn('fp-card p-4 flex flex-col justify-between gap-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="fp-eyebrow">{label}</span>
        {icon && <div className="text-primary shrink-0">{icon}</div>}
      </div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="fp-kpi-value fp-num">{value}</div>
        {concept === 'haryali' && chartData && chartData.length > 1 && (
          <div className="w-[80px] h-[28px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {(footnote || badge) && (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-ink-muted">
          <div className="truncate">{footnote}</div>
          {badge}
        </div>
      )}
    </div>
  );
}
