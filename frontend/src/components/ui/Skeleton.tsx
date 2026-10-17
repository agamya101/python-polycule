import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-card bg-surface-2 border border-line/50',
        className,
      )}
    />
  );
}
