import type { RiskLevel } from '@/api/contract';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { useThemeColors } from '@/theme/useThemeColors';

export interface RiskGaugeProps {
  score: number;
  level: RiskLevel;
  size?: 'sm' | 'md';
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startPct: number, endPct: number) {
  const startAngle = (startPct / 100) * 180;
  const endAngle = (endPct / 100) * 180;
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

export function RiskGauge({ score, level, size = 'md' }: RiskGaugeProps) {
  const colors = useThemeColors();
  const clamped = Math.min(100, Math.max(0, score));
  const needleAngle = (clamped / 100) * 180;
  const cx = 100;
  const cy = 95;
  const r = 74;
  const needleTip = polarToCartesian(cx, cy, r - 10, needleAngle);

  const width = size === 'sm' ? 160 : 210;

  return (
    <div className="flex flex-col items-center">
      <svg width={width} viewBox="0 0 200 115" className="overflow-visible">
        {/* 4 colored arcs: LOW 0..45, MEDIUM 45..70, HIGH 70..85, CRITICAL 85..100 */}
        <path
          d={describeArc(cx, cy, r, 0, 44)}
          fill="none"
          stroke={colors.risk.LOW}
          strokeWidth={14}
          strokeLinecap="butt"
        />
        <path
          d={describeArc(cx, cy, r, 45, 69)}
          fill="none"
          stroke={colors.risk.MEDIUM}
          strokeWidth={14}
          strokeLinecap="butt"
        />
        <path
          d={describeArc(cx, cy, r, 70, 84)}
          fill="none"
          stroke={colors.risk.HIGH}
          strokeWidth={14}
          strokeLinecap="butt"
        />
        <path
          d={describeArc(cx, cy, r, 85, 100)}
          fill="none"
          stroke={colors.risk.CRITICAL}
          strokeWidth={14}
          strokeLinecap="butt"
        />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={colors.ink}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill={colors.ink} />
      </svg>
      <div className="text-center -mt-3 space-y-1">
        <div className="fp-kpi-value fp-num">{clamped}</div>
        <RiskBadge level={level} />
      </div>
    </div>
  );
}
