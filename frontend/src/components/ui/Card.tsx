import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps {
  children: ReactNode;
  eyebrow?: string;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, eyebrow, title, actions, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'fp-card p-5',
        onClick && 'cursor-pointer transition-transform',
        className,
      )}
    >
      {(eyebrow || title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="space-y-1">
            {eyebrow && <div className="fp-eyebrow">{eyebrow}</div>}
            {title && <h2 className="text-lg font-bold leading-snug text-ink">{title}</h2>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
