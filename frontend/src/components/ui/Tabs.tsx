import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  badge?: number | string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex flex-wrap items-center gap-1 p-1 rounded-ctl bg-surface-2 border border-line',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'px-3.5 py-1.5 text-sm font-semibold rounded-ctl transition-colors inline-flex items-center gap-2 cursor-pointer',
              isActive
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-ctl text-xs font-mono',
                  isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-surface text-ink',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
