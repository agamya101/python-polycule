import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Smartphone } from 'lucide-react';
import type { Language } from '@/api/contract';
import { computeSmsMeta } from '@/lib/sms';

export interface SmsPreviewProps {
  language: Language;
  textEnglish: string;
  textLocal: string;
  phoneMasked?: string;
}

export function SmsPreview({
  language,
  textEnglish,
  textLocal,
  phoneMasked = '+91 90xxxx0001',
}: SmsPreviewProps) {
  const [showEnglish, setShowEnglish] = useState(false);
  const meta = computeSmsMeta(textEnglish, textLocal);

  return (
    <div className="p-4 rounded-card bg-surface-2 border border-line space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-muted font-mono">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <Smartphone className="w-4 h-4 text-primary" />
          SMS Preview · To: {phoneMasked}
        </span>
        <button
          type="button"
          onClick={() => setShowEnglish((v) => !v)}
          className="fp-btn fp-btn-ghost py-1 px-2.5 text-xs"
        >
          {showEnglish ? `Show ${language}` : 'Show English'}
        </button>
      </div>

      {/* Phone-style bubble */}
      <div className="p-4 rounded-card bg-surface border border-line shadow-sm space-y-2">
        <p
          className={
            showEnglish
              ? 'text-sm text-ink leading-relaxed'
              : 'font-regional text-base text-ink leading-relaxed'
          }
        >
          {showEnglish ? textEnglish : textLocal}
        </p>
        {showEnglish && language !== 'English' && (
          <div className="pt-2 border-t border-line text-xs text-ink-muted font-regional">
            {textLocal}
          </div>
        )}
      </div>

      {/* Footer stats & numeric safeguard */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3 text-ink-muted">
          <span>Lang: {language}</span>
          <span>Chars: {meta.charCount}</span>
          <span>Segments: {meta.segments}</span>
          <span>Encoding: {meta.encoding}</span>
        </div>
        {meta.numbersPreserved ? (
          <span className="inline-flex items-center gap-1 text-success font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            ✓ Numbers preserved
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-danger font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            ✗ Numbers changed in translation — blocked
          </span>
        )}
      </div>
    </div>
  );
}
