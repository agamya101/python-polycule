import { Plus, Trash2 } from 'lucide-react';
import type {
  FertilizerProduct,
  FertilizerRecommendation,
  RecommendationInput,
} from '@/api/contract';
import { formatBagsDisplay } from '@/lib/soil';

const PRODUCTS: { value: FertilizerProduct; label: string }[] = [
  { value: 'Urea', label: 'Urea' },
  { value: 'DAP', label: 'DAP' },
  { value: 'MOP', label: 'MOP' },
  { value: 'SSP', label: 'SSP' },
  { value: 'NPK_10_26_26', label: 'NPK 10:26:26' },
  { value: 'Zinc_Sulphate', label: 'Zinc Sulphate' },
  { value: 'Other', label: 'Other' },
];

export interface FertilizerTableProps {
  recommendations: FertilizerRecommendation[];
  editable?: boolean;
  onChangeRecommendations?: (recs: RecommendationInput[]) => void;
}

export function FertilizerTable({
  recommendations,
  editable = false,
  onChangeRecommendations,
}: FertilizerTableProps) {
  const toInputs = (): RecommendationInput[] =>
    recommendations.map((r) => ({
      product: r.product,
      productLabel: r.productLabel,
      cardDose: r.cardDose,
      cardDoseUnit: r.cardDoseUnit,
      timing: r.timing,
      sourceText: r.sourceText,
    }));

  const updateRow = (idx: number, patch: Partial<RecommendationInput>) => {
    const next = toInputs();
    next[idx] = { ...next[idx], ...patch };
    onChangeRecommendations?.(next);
  };

  const addRow = () => {
    const next = toInputs();
    next.push({
      product: 'Urea',
      productLabel: 'Urea',
      cardDose: 100,
      cardDoseUnit: 'kg/ha',
      timing: 'Basal / split',
      sourceText: 'Urea @ 100 kg/ha',
    });
    onChangeRecommendations?.(next);
  };

  const removeRow = (idx: number) => {
    const next = toInputs().filter((_, i) => i !== idx);
    onChangeRecommendations?.(next);
  };

  return (
    <div className="space-y-2.5">
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-surface-2 border-b border-line font-mono text-ink-muted uppercase">
            <tr>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3">Card Dose</th>
              <th className="py-2.5 px-3">kg/ha</th>
              <th className="py-2.5 px-3">kg/acre</th>
              <th className="py-2.5 px-3">Bag Size</th>
              <th className="py-2.5 px-3">Bags / Acre</th>
              <th className="py-2.5 px-3">Bags for Farm</th>
              <th className="py-2.5 px-3">Timing & Card Source Text</th>
              {editable && <th className="py-2.5 px-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recommendations.map((rec, idx) => (
              <tr key={idx} className="hover:bg-surface-2/60">
                <td className="py-2.5 px-3 font-semibold text-ink">
                  {editable ? (
                    <div className="flex flex-col gap-1">
                      <select
                        value={rec.product}
                        onChange={(e) => {
                          const prod = e.target.value as FertilizerProduct;
                          const label =
                            PRODUCTS.find((p) => p.value === prod)?.label ?? prod;
                          updateRow(idx, { product: prod, productLabel: label });
                        }}
                        className="fp-input py-1 px-2 text-xs"
                      >
                        {PRODUCTS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={rec.productLabel}
                        onChange={(e) => updateRow(idx, { productLabel: e.target.value })}
                        className="fp-input py-1 px-2 text-xs"
                        placeholder="Label"
                      />
                    </div>
                  ) : (
                    rec.productLabel
                  )}
                </td>
                <td className="py-2.5 px-3 fp-num">
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        value={rec.cardDose}
                        onChange={(e) =>
                          updateRow(idx, { cardDose: Number(e.target.value) || 0 })
                        }
                        className="fp-input fp-num w-20 py-1 px-2 text-xs"
                      />
                      <select
                        value={rec.cardDoseUnit}
                        onChange={(e) =>
                          updateRow(idx, {
                            cardDoseUnit: e.target.value as 'kg/ha' | 'kg/acre',
                          })
                        }
                        className="fp-input py-1 px-1.5 text-xs font-mono"
                      >
                        <option value="kg/ha">kg/ha</option>
                        <option value="kg/acre">kg/acre</option>
                      </select>
                    </div>
                  ) : (
                    <span>
                      {rec.cardDose} {rec.cardDoseUnit}
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 fp-num">{rec.kgPerHa.toFixed(1)} kg</td>
                <td className="py-2.5 px-3 fp-num font-semibold text-ink">
                  {rec.kgPerAcre.toFixed(1)} kg
                </td>
                <td className="py-2.5 px-3 fp-num text-ink-muted">
                  {rec.bagSizeKg !== null ? `${rec.bagSizeKg} kg` : '—'}
                </td>
                <td className="py-2.5 px-3 fp-num font-bold text-primary">
                  {formatBagsDisplay(rec.bagsPerAcre, rec.kgPerAcre)}
                </td>
                <td className="py-2.5 px-3 fp-num font-semibold">
                  {rec.bagsForFarm !== null
                    ? `${rec.bagsForFarm} bags (${rec.kgForFarm} kg)`
                    : `${rec.kgForFarm} kg`}
                </td>
                <td className="py-2.5 px-3">
                  {editable ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        value={rec.timing ?? ''}
                        onChange={(e) => updateRow(idx, { timing: e.target.value })}
                        placeholder="Application timing"
                        className="fp-input py-1 px-2 text-xs"
                      />
                      <input
                        type="text"
                        value={rec.sourceText}
                        onChange={(e) => updateRow(idx, { sourceText: e.target.value })}
                        placeholder="Card source text"
                        className="fp-input py-1 px-2 text-xs italic"
                      />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {rec.timing && <div className="text-ink">{rec.timing}</div>}
                      <div className="italic text-ink-muted">"{rec.sourceText}"</div>
                    </div>
                  )}
                </td>
                {editable && (
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="fp-btn fp-btn-ghost p-1.5 text-danger"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-mono text-ink-muted italic">
          Converted from the card's own recommendation. No new doses are created.
        </p>
        {editable && (
          <button
            type="button"
            onClick={addRow}
            className="fp-btn fp-btn-ghost py-1 px-2.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Recommendation Row
          </button>
        )}
      </div>
    </div>
  );
}
