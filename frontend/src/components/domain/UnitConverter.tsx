import { useState } from 'react';
import { Calculator } from 'lucide-react';
import {
  convertUnitValue,
  UNIT_CONVERSIONS,
  type UnitConversionKey,
} from '@/lib/soil';

export function UnitConverter() {
  const [open, setOpen] = useState(false);
  const [convKey, setConvKey] = useState<UnitConversionKey>('P2O5_TO_P');
  const [inputVal, setInputVal] = useState<string>('38');

  const selected = UNIT_CONVERSIONS.find((u) => u.key === convKey) ?? UNIT_CONVERSIONS[0];
  const numericVal = Number(inputVal);
  const result = !Number.isNaN(numericVal) ? convertUnitValue(numericVal, convKey) : 0;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fp-btn fp-btn-ghost text-xs py-1.5 px-3"
      >
        <Calculator className="w-3.5 h-3.5 text-primary" />
        Unit Converter
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 fp-card p-4 z-40 bg-surface space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="fp-eyebrow">Soil & Dose Unit Converter</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-mono text-ink-muted hover:text-ink"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <label className="block text-ink-muted font-medium">Conversion Type</label>
            <select
              value={convKey}
              onChange={(e) => setConvKey(e.target.value as UnitConversionKey)}
              className="fp-input w-full text-xs font-mono"
            >
              {UNIT_CONVERSIONS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.fromLabel} → {u.toLabel} ({u.formulaText})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-ink-muted text-[11px] mb-1">
                  {selected.fromLabel}
                </label>
                <input
                  type="number"
                  step="any"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  className="fp-input fp-num w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-ink-muted text-[11px] mb-1">
                  {selected.toLabel}
                </label>
                <div className="fp-input fp-num w-full text-xs font-bold bg-primary/10 text-primary border-primary/30">
                  {result}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
