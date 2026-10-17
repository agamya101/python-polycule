import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: string | null | undefined;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <span className={cn('relative inline-flex group', className)} title={content}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 px-2.5 py-1 rounded-ctl bg-surface border border-line text-ink text-[11px] font-mono whitespace-nowrap shadow-lg"
      >
        {content}
      </span>
    </span>
  );
}
