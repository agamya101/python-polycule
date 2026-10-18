import { AlertTriangle, Check, Wand2 } from 'lucide-react';
import type { SoilParam, SoilParamValue } from '@/api/contract';
import { Badge } from '@/components/ui/Badge';
import { getParamSpec } from '@/lib/soil';
import { cn } from '@/lib/cn';

export interface SoilParamTableProps {
  params: SoilParamValue[];
  readOnly?: boolean;
  onChangeParam?: (
    param: SoilParam,
    updates: { value?: number | null; unit?: string; confirmed?: boolean },
  ) => void;
}

export function SoilParamTable({
  params,
  readOnly = false,
  onChangeParam,
}: SoilParamTableProps) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-surface-2 border-b border-line font-mono text-ink-muted uppercase">
          <tr>
            <th className="py-2.5 px-3">Parameter</th>
            <th className="py-2.5 px-3">Value</th>
            <th className="py-2.5 px-3">Unit</th>
            <th className="py-2.5 px-3">Rating</th>
            <th className="py-2.5 px-3">OCR Confidence</th>
            <th className="py-2.5 px-3">Safeguard Flags</th>
            <th className="py-2.5 px-3 text-right">Confirm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {params.map((row) => {
            const spec = getParamSpec(row.param);
            const flags = row.flags ?? [];
            const hasBlocking = flags.some((f) => f.blocking);
            const isMissing = row.value === null;
            const confPct =
              row.ocrConfidence !== null ? Math.round(row.ocrConfidence * 100) : null;
            const lowConf = row.ocrConfidence !== null && row.ocrConfidence < 0.8;

            const ratingTone =
              row.rating === 'LOW' ||
              row.rating === 'DEFICIENT' ||
              row.rating === 'CRITICAL' ||
              row.rating === 'INJURIOUS' ||
              row.rating === 'STRONGLY_ACIDIC' ||
              row.rating === 'STRONGLY_ALKALINE'
                ? 'warning'
                : row.rating === 'NEUTRAL' ||
                    row.rating === 'NORMAL' ||
                    row.rating === 'SUFFICIENT' ||
                    row.rating === 'HIGH'
                  ? 'success'
                  : 'neutral';

            return (
              <tr
                key={row.param}
                className={cn(
                  'hover:bg-surface-2/60',
                  hasBlocking && 'bg-danger/5',
                )}
              >
                <td className="py-2.5 px-3 font-medium text-ink">
                  <div>{row.label}</div>
                  <div className="text-[10px] font-mono text-ink-muted">
                    Plausible: {spec.min}–{spec.max} {spec.defaultUnit}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  {readOnly ? (
                    <span className="fp-num font-bold text-sm">
                      {row.value !== null ? row.value : '—'}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={row.value ?? ''}
                      placeholder="Missing"
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = raw === '' ? null : Number(raw);
                        onChangeParam?.(row.param, {
                          value: num,
                          unit: row.unit,
                          confirmed: false,
                        });
                      }}
                      className="fp-input fp-num w-24 py-1 px-2 text-xs"
                    />
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {readOnly ? (
                    <span className="font-mono">{row.unit}</span>
                  ) : (
                    <select
                      value={row.unit}
                      onChange={(e) =>
                        onChangeParam?.(row.param, {
                          value: row.value,
                          unit: e.target.value,
                          confirmed: false,
                        })
                      }
                      className="fp-input py-1 px-2 text-xs font-mono"
                    >
                      {spec.allowedUnits.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {row.rating ? (
                    <Badge tone={ratingTone}>{row.rating}</Badge>
                  ) : (
                    <span className="text-ink-muted font-mono">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {confPct !== null ? (
                    <div className="w-24 space-y-1">
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className={lowConf ? 'text-danger font-bold' : 'text-ink-muted'}>
                          {confPct}%
                        </span>
                        {row.ocrRaw && (
                          <span className="text-ink-muted truncate max-w-[48px]">
                            "{row.ocrRaw}"
                          </span>
                        )}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={cn(
                            'h-full',
                            lowConf ? 'bg-danger' : 'bg-success',
                          )}
                          style={{ width: `${confPct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="font-mono text-ink-muted">Verified</span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {(row.flags ?? []).length === 0 ? (
                    <span className="text-success font-mono inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Clean
                    </span>
                  ) : (
                    <div className="space-y-1.5">
                      {(row.flags ?? []).map((f, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-ctl font-mono text-[10px] border',
                              f.blocking
                                ? 'bg-danger/15 text-danger border-danger/40 font-semibold'
                                : 'bg-warning/15 text-warning border-warning/40',
                            )}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {f.code}: {f.message}
                          </span>
                          {!readOnly &&
                            f.suggestion !== null &&
                            (f.code === 'DECIMAL_SHIFT_SUSPECTED' ||
                              f.code === 'UNIT_MISMATCH') && (
                              <button
                                type="button"
                                onClick={() =>
                                  onChangeParam?.(row.param, {
                                    value: f.suggestion,
                                    unit: spec.defaultUnit,
                                    confirmed: true,
                                  })
                                }
                                className="fp-btn fp-btn-accent py-0.5 px-2 text-[11px] font-mono cursor-pointer"
                              >
                                <Wand2 className="w-3 h-3" />
                                Apply {f.suggestion} {spec.defaultUnit !== '–' ? spec.defaultUnit : ''}
                              </button>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {readOnly ? (
                    <Badge tone={row.confirmed ? 'success' : 'warning'}>
                      {row.confirmed ? 'Confirmed' : 'Unconfirmed'}
                    </Badge>
                  ) : (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none justify-end">
                      <input
                        type="checkbox"
                        checked={row.confirmed}
                        onChange={(e) =>
                          onChangeParam?.(row.param, {
                            value: row.value,
                            unit: row.unit,
                            confirmed: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                      <span className="font-mono text-[11px]">
                        {isMissing ? 'Acknowledge missing' : 'Confirm'}
                      </span>
                    </label>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
