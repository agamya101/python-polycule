import { cn } from '@/lib/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2.5 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'w-10 h-5 rounded-full transition-colors relative border',
          checked ? 'bg-primary border-primary' : 'bg-surface-2 border-line',
        )}
      >
        <span
          className={cn(
            'block w-3.5 h-3.5 rounded-full transition-transform absolute top-0.5',
            checked
              ? 'translate-x-5 bg-on-primary'
              : 'translate-x-0.5 bg-ink-muted',
          )}
        />
      </button>
      {label && <span className="text-xs font-medium text-ink">{label}</span>}
    </label>
  );
}
