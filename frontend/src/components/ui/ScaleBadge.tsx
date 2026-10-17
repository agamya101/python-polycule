import { Crosshair, Globe } from 'lucide-react';
import type { Scale } from '@/api/contract';
import { cn } from '@/lib/cn';

export interface ScaleBadgeProps {
  scale: Scale;
  className?: string;
}

export function ScaleBadge({ scale, className }: ScaleBadgeProps) {
  const isDistrict = scale === 'DISTRICT_MODIS_250M';
  return (
    <span
      title={
        isDistrict
          ? 'District-scale satellite composite (MODIS 250 m resolution, 8-day)'
          : 'Field-scale parcel reflectance (Sentinel-2 10 m resolution, ~5-day)'
      }
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-ctl border bg-surface-2 text-ink border-line',
        className,
      )}
    >
      {isDistrict ? (
        <>
          <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>District · MODIS 250 m</span>
        </>
      ) : (
        <>
          <Crosshair className="w-3.5 h-3.5 text-info shrink-0" />
          <span>Field · Sentinel-2 10 m</span>
        </>
      )}
    </span>
  );
}
