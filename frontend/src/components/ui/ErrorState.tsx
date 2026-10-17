import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="fp-card p-6 border-danger/40 bg-danger/10 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-ink">Unable to load data</h3>
          <p className="text-xs text-ink-muted mt-0.5">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
