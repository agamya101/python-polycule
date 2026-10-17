import { cn } from '@/lib/cn';

export interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  variant?: 'badge' | 'bare';
}

/**
 * Minimalist KrishiMitra emblem:
 * Combines a sprouting crop leaf ("Krishi" / soil & crop health)
 * with satellite & outreach signal arcs ("Mitra" / early warning & farmer guidance)
 * inside a warm circular seal.
 */
export function BrandLogo({
  className,
  iconClassName,
  variant = 'badge',
}: BrandLogoProps) {
  const svgIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-5 h-5', iconClassName)}
      aria-hidden="true"
    >
      {/* Satellite / outreach signal arcs above the crop */}
      <path
        d="M8.5 5.25C10.55 3.6 13.45 3.6 15.5 5.25"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <circle cx="12" cy="6.6" r="1.15" fill="currentColor" />

      {/* Minimalist twin-leaf crop sprout rising from soil */}
      <path
        d="M12 20V10.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 15.5C8.2 15.5 5.75 13.1 5.75 9.6C9.25 9.6 11.7 12 12 15.5Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      <path
        d="M12 13.5C15.8 13.5 18.25 11.1 18.25 7.6C14.75 7.6 12.3 10 12 13.5Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />

      {/* Ground / soil horizon line */}
      <path
        d="M7.5 20H16.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );

  if (variant === 'bare') {
    return svgIcon;
  }

  return (
    <span
      className={cn(
        'w-9 h-9 rounded-full bg-accent text-on-accent flex items-center justify-center shadow-sm shrink-0',
        className,
      )}
    >
      {svgIcon}
    </span>
  );
}
