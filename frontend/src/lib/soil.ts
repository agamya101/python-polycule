import type {
  FertilizerProduct,
  FertilizerRecommendation,
  OcrFlag,
  RecommendationInput,
  SoilParam,
  SoilParamValue,
  SoilRating,
} from '@/api/contract';

export interface SoilParamMeta {
  param: SoilParam;
  label: string;
  defaultUnit: string;
  allowedUnits: string[];
  min: number;
  max: number;
  group: 'REACTION' | 'ORGANIC' | 'PRIMARY' | 'SECONDARY' | 'MICRO';
}

export const SOIL_PARAM_SPECS: readonly SoilParamMeta[] = [
  { param: 'pH', label: 'Soil pH', defaultUnit: '–', allowedUnits: ['–'], min: 3.5, max: 10.5, group: 'REACTION' },
  { param: 'EC', label: 'Electrical conductivity', defaultUnit: 'dS/m', allowedUnits: ['dS/m', 'µS/cm'], min: 0, max: 20, group: 'REACTION' },
  { param: 'OC', label: 'Organic carbon', defaultUnit: '%', allowedUnits: ['%'], min: 0.05, max: 5, group: 'ORGANIC' },
  { param: 'N', label: 'Available nitrogen', defaultUnit: 'kg/ha', allowedUnits: ['kg/ha', 'kg/acre'], min: 50, max: 1200, group: 'PRIMARY' },
  { param: 'P', label: 'Available phosphorus', defaultUnit: 'kg/ha', allowedUnits: ['kg/ha', 'kg/ha P2O5', 'kg/acre'], min: 1, max: 200, group: 'PRIMARY' },
  { param: 'K', label: 'Available potassium', defaultUnit: 'kg/ha', allowedUnits: ['kg/ha', 'kg/ha K2O', 'kg/acre'], min: 20, max: 1500, group: 'PRIMARY' },
  { param: 'S', label: 'Sulphur', defaultUnit: 'ppm', allowedUnits: ['ppm', 'kg/ha'], min: 0.5, max: 200, group: 'SECONDARY' },
  { param: 'Zn', label: 'Zinc', defaultUnit: 'ppm', allowedUnits: ['ppm'], min: 0.05, max: 50, group: 'MICRO' },
  { param: 'Fe', label: 'Iron', defaultUnit: 'ppm', allowedUnits: ['ppm'], min: 0.5, max: 200, group: 'MICRO' },
  { param: 'Cu', label: 'Copper', defaultUnit: 'ppm', allowedUnits: ['ppm'], min: 0.05, max: 50, group: 'MICRO' },
  { param: 'Mn', label: 'Manganese', defaultUnit: 'ppm', allowedUnits: ['ppm'], min: 0.2, max: 200, group: 'MICRO' },
  { param: 'B', label: 'Boron', defaultUnit: 'ppm', allowedUnits: ['ppm'], min: 0.05, max: 10, group: 'MICRO' },
] as const;

export function getParamSpec(param: SoilParam): SoilParamMeta {
  const found = SOIL_PARAM_SPECS.find((s) => s.param === param);
  if (!found) throw new Error(`Unknown soil param: ${param}`);
  return found;
}

export function rateSoilParam(param: SoilParam, value: number | null): SoilRating | null {
  if (value === null || Number.isNaN(value)) return null;
  switch (param) {
    case 'pH':
      if (value < 5.5) return 'STRONGLY_ACIDIC';
      if (value <= 6.5) return 'MODERATELY_ACIDIC';
      if (value <= 7.5) return 'NEUTRAL';
      if (value <= 8.5) return 'MODERATELY_ALKALINE';
      return 'STRONGLY_ALKALINE';
    case 'EC':
      if (value < 1) return 'NORMAL';
      if (value <= 3) return 'CRITICAL';
      return 'INJURIOUS';
    case 'OC':
      if (value < 0.5) return 'LOW';
      if (value <= 0.75) return 'MEDIUM';
      return 'HIGH';
    case 'N':
      if (value < 280) return 'LOW';
      if (value <= 560) return 'MEDIUM';
      return 'HIGH';
    case 'P':
      if (value < 10) return 'LOW';
      if (value <= 25) return 'MEDIUM';
      return 'HIGH';
    case 'K':
      if (value < 108) return 'LOW';
      if (value <= 280) return 'MEDIUM';
      return 'HIGH';
    case 'S':
      return value < 10 ? 'DEFICIENT' : 'SUFFICIENT';
    case 'Zn':
      return value < 0.6 ? 'DEFICIENT' : 'SUFFICIENT';
    case 'Fe':
      return value < 4.5 ? 'DEFICIENT' : 'SUFFICIENT';
    case 'Cu':
      return value < 0.2 ? 'DEFICIENT' : 'SUFFICIENT';
    case 'Mn':
      return value < 2 ? 'DEFICIENT' : 'SUFFICIENT';
    case 'B':
      return value < 0.5 ? 'DEFICIENT' : 'SUFFICIENT';
  }
}

export function interpretSoilParam(param: SoilParam, rating: SoilRating | null): string {
  if (!rating) return 'Value missing — cannot interpret.';
  switch (param) {
    case 'pH':
      if (rating === 'STRONGLY_ACIDIC' || rating === 'MODERATELY_ACIDIC')
        return 'Acidic soil reaction; phosphorus and micronutrient availability may be altered.';
      if (rating === 'NEUTRAL') return 'Optimal neutral soil reaction for most field crops.';
      return 'Alkaline soil reaction; zinc and iron availability may be reduced.';
    case 'EC':
      if (rating === 'NORMAL') return 'Salinity within normal safe limits for crop growth.';
      if (rating === 'CRITICAL') return 'Elevated salinity; sensitive crops may experience stress.';
      return 'Injurious salinity level; drainage and soil reclamation needed.';
    case 'OC':
      if (rating === 'LOW') return 'Low organic matter; soil water holding and nitrogen supply are limited.';
      if (rating === 'MEDIUM') return 'Moderate organic carbon content.';
      return 'Good organic matter status supporting healthy soil structure.';
    case 'N':
    case 'P':
    case 'K': {
      const name = param === 'N' ? 'nitrogen' : param === 'P' ? 'phosphorus' : 'potassium';
      if (rating === 'LOW') return `Available ${name} is low; follow card fertilizer dose.`;
      if (rating === 'MEDIUM') return `Available ${name} is moderate; maintenance dose applies.`;
      return `Available ${name} is adequate to high.`;
    }
    default:
      return rating === 'DEFICIENT'
        ? `${getParamSpec(param).label} is below critical threshold; foliar or basal supplementation advised on card.`
        : `${getParamSpec(param).label} is above sufficiency threshold.`;
  }
}

export function evaluateSoilParam(
  param: SoilParam,
  value: number | null,
  unit: string,
  ocrRaw: string | null = null,
  ocrConfidence: number | null = null,
  confirmed = false,
): SoilParamValue {
  const spec = getParamSpec(param);
  const flags: OcrFlag[] = [];

  if (value === null || Number.isNaN(value)) {
    flags.push({
      code: 'MISSING',
      message: `${spec.label} is missing on card`,
      suggestion: null,
      blocking: !confirmed,
    });
  } else {
    // Check unit mismatch
    if (unit !== spec.defaultUnit) {
      let suggestion: number | null = null;
      if (param === 'P' && unit === 'kg/ha P2O5') {
        suggestion = Math.round((value / 2.2914) * 10) / 10;
      } else if (param === 'K' && unit === 'kg/ha K2O') {
        suggestion = Math.round((value / 1.2046) * 10) / 10;
      } else if (unit === 'kg/acre' && spec.defaultUnit === 'kg/ha') {
        suggestion = Math.round(value * 2.4711 * 10) / 10;
      } else if (unit === 'µS/cm' && spec.defaultUnit === 'dS/m') {
        suggestion = Math.round((value / 1000) * 100) / 100;
      }
      flags.push({
        code: 'UNIT_MISMATCH',
        message: `Unit "${unit}" differs from standard "${spec.defaultUnit}"`,
        suggestion,
        blocking: true,
      });
    }

    // Check decimal shift or out of range
    if (value < spec.min || value > spec.max) {
      const div10 = Math.round((value / 10) * 100) / 100;
      if (div10 >= spec.min && div10 <= spec.max) {
        flags.push({
          code: 'DECIMAL_SHIFT_SUSPECTED',
          message: `Value ${value} is out of range (${spec.min}–${spec.max}); decimal point may have been missed`,
          suggestion: div10,
          blocking: true,
        });
      } else {
        flags.push({
          code: 'OUT_OF_RANGE',
          message: `Value ${value} is outside plausible range (${spec.min}–${spec.max} ${spec.defaultUnit})`,
          suggestion: null,
          blocking: true,
        });
      }
    }

    if (ocrConfidence !== null && ocrConfidence < 0.8) {
      flags.push({
        code: 'LOW_CONFIDENCE',
        message: `Low OCR confidence (${Math.round(ocrConfidence * 100)}%) — verify against card image`,
        suggestion: null,
        blocking: !confirmed,
      });
    }
  }

  const rating = flags.some((f) => f.code === 'DECIMAL_SHIFT_SUSPECTED' || f.code === 'OUT_OF_RANGE' || f.code === 'UNIT_MISMATCH')
    ? null
    : rateSoilParam(param, value);

  return {
    param,
    label: spec.label,
    value,
    unit,
    ocrRaw,
    ocrConfidence,
    rating,
    interpretation: interpretSoilParam(param, rating),
    flags,
    confirmed,
  };
}

export const BAG_SIZES_KG: Record<FertilizerProduct, number | null> = {
  Urea: 45,
  DAP: 50,
  MOP: 50,
  SSP: 50,
  NPK_10_26_26: 50,
  Zinc_Sulphate: null,
  Other: null,
};

export function resolveBagSize(product?: string, label?: string): number | null {
  const combined = `${product ?? ''} ${label ?? ''}`.toLowerCase();
  if (combined.includes('urea')) return 45;
  if (combined.includes('dap')) return 50;
  if (combined.includes('mop')) return 50;
  if (combined.includes('ssp')) return 50;
  if (combined.includes('npk')) return 50;
  if (product && product in BAG_SIZES_KG) {
    return BAG_SIZES_KG[product as FertilizerProduct];
  }
  return null;
}

export function isCompleteFertilizerRec(r: FertilizerRecommendation | null | undefined): boolean {
  if (!r) return false;
  const hasDose = r.cardDose !== null && r.cardDose !== undefined && Number(r.cardDose) > 0;
  const hasKgHa = r.kgPerHa !== null && r.kgPerHa !== undefined && Number(r.kgPerHa) > 0;
  const hasKgAcre = r.kgPerAcre !== null && r.kgPerAcre !== undefined && Number(r.kgPerAcre) > 0;
  const hasBagSize = r.bagSizeKg !== null && r.bagSizeKg !== undefined && Number(r.bagSizeKg) > 0;
  const hasBagsAcre = r.bagsPerAcre !== null && r.bagsPerAcre !== undefined && Number(r.bagsPerAcre) > 0;
  const hasBagsFarm = r.bagsForFarm !== null && r.bagsForFarm !== undefined && Number(r.bagsForFarm) > 0;
  const hasProduct = Boolean((r.productLabel && r.productLabel.trim()) || (r.product && r.product.trim()));
  return hasDose && hasKgHa && hasKgAcre && hasBagSize && hasBagsAcre && hasBagsFarm && hasProduct;
}

export function computeFertilizerRec(
  input: RecommendationInput,
  farmAreaHa: number,
): FertilizerRecommendation {
  const rawDose = Number(input.cardDose);
  const unit = (input.cardDoseUnit || 'kg/ha').toLowerCase().trim();

  let kgPerHa: number | null = null;
  let kgPerAcre: number | null = null;

  if (!Number.isNaN(rawDose) && rawDose > 0) {
    if (unit === 'kg/ha') {
      kgPerHa = Math.round(rawDose * 10) / 10;
      kgPerAcre = Math.round((kgPerHa / 2.4711) * 10) / 10;
    } else if (unit === 'kg/acre') {
      kgPerAcre = Math.round(rawDose * 10) / 10;
      kgPerHa = Math.round(kgPerAcre * 2.4711 * 10) / 10;
    } else if (unit.includes('bigha')) {
      // Standard regional conversion (1 ha ≈ 7.475 bigha, 1 acre ≈ 3.025 bigha)
      kgPerAcre = Math.round(rawDose * 3.025 * 10) / 10;
      kgPerHa = Math.round(rawDose * 7.475 * 10) / 10;
    } else {
      kgPerHa = Math.round(rawDose * 10) / 10;
      kgPerAcre = Math.round((kgPerHa / 2.4711) * 10) / 10;
    }
  }

  const bagSizeKg = resolveBagSize(input.product, input.productLabel);
  const bagsPerAcre =
    bagSizeKg !== null && kgPerAcre !== null && kgPerAcre > 0
      ? Math.round((kgPerAcre / bagSizeKg) * 2) / 2
      : null;

  const farmAcres = (farmAreaHa || 1.0) * 2.4711;
  const kgForFarm = kgPerAcre !== null ? Math.round(kgPerAcre * farmAcres) : null;
  const bagsForFarm =
    bagSizeKg !== null && kgForFarm !== null && kgForFarm > 0
      ? Math.round((kgForFarm / bagSizeKg) * 2) / 2
      : null;

  return {
    product: input.product,
    productLabel: input.productLabel,
    cardDose: input.cardDose,
    cardDoseUnit: input.cardDoseUnit,
    kgPerHa: kgPerHa as any,
    kgPerAcre: kgPerAcre as any,
    bagSizeKg,
    bagsPerAcre,
    bagsForFarm,
    kgForFarm: kgForFarm as any,
    timing: input.timing,
    sourceText: input.sourceText,
  };
}

export function formatBagsDisplay(bags: number | null, kg: number): string {
  if (bags === null || bags === undefined) return '—';
  if (bags === 0 && kg > 0) return `less than ½ bag (${kg} kg)`;
  return `${bags} ${bags === 1 ? 'bag' : 'bags'}`;
}

export type UnitConversionKey =
  | 'P_TO_P2O5'
  | 'P2O5_TO_P'
  | 'K_TO_K2O'
  | 'K2O_TO_K'
  | 'PPM_TO_KGHA'
  | 'KGHA_TO_PPM'
  | 'KGACRE_TO_KGHA'
  | 'KGHA_TO_KGACRE'
  | 'USCM_TO_DSM'
  | 'DSM_TO_USCM';

export interface UnitConversionOption {
  key: UnitConversionKey;
  fromLabel: string;
  toLabel: string;
  factor: number;
  formulaText: string;
}

export const UNIT_CONVERSIONS: readonly UnitConversionOption[] = [
  { key: 'P2O5_TO_P', fromLabel: 'P₂O₅ (kg/ha)', toLabel: 'Elemental P (kg/ha)', factor: 1 / 2.2914, formulaText: '÷ 2.2914' },
  { key: 'P_TO_P2O5', fromLabel: 'Elemental P (kg/ha)', toLabel: 'P₂O₅ (kg/ha)', factor: 2.2914, formulaText: '× 2.2914' },
  { key: 'K2O_TO_K', fromLabel: 'K₂O (kg/ha)', toLabel: 'Elemental K (kg/ha)', factor: 1 / 1.2046, formulaText: '÷ 1.2046' },
  { key: 'K_TO_K2O', fromLabel: 'Elemental K (kg/ha)', toLabel: 'K₂O (kg/ha)', factor: 1.2046, formulaText: '× 1.2046' },
  { key: 'PPM_TO_KGHA', fromLabel: 'ppm (mg/kg)', toLabel: 'kg/ha (0–15 cm)', factor: 2.24, formulaText: '× 2.24' },
  { key: 'KGHA_TO_PPM', fromLabel: 'kg/ha (0–15 cm)', toLabel: 'ppm (mg/kg)', factor: 1 / 2.24, formulaText: '÷ 2.24' },
  { key: 'KGACRE_TO_KGHA', fromLabel: 'kg/acre', toLabel: 'kg/ha', factor: 2.4711, formulaText: '× 2.4711' },
  { key: 'KGHA_TO_KGACRE', fromLabel: 'kg/ha', toLabel: 'kg/acre', factor: 1 / 2.4711, formulaText: '÷ 2.4711' },
  { key: 'USCM_TO_DSM', fromLabel: 'µS/cm', toLabel: 'dS/m', factor: 0.001, formulaText: '÷ 1000' },
  { key: 'DSM_TO_USCM', fromLabel: 'dS/m', toLabel: 'µS/cm', factor: 1000, formulaText: '× 1000' },
] as const;

export function convertUnitValue(val: number, key: UnitConversionKey): number {
  const opt = UNIT_CONVERSIONS.find((u) => u.key === key);
  if (!opt) return val;
  return Math.round(val * opt.factor * 100) / 100;
}

export function buildSoilCardSmsEnglish(
  cardNumber: string | null,
  sampleDate: string | null,
  params: SoilParamValue[],
  recs: FertilizerRecommendation[],
  kvk: string,
  districtName: string,
): string {
  const notableRatings = new Set<SoilRating>([
    'LOW',
    'DEFICIENT',
    'STRONGLY_ACIDIC',
    'MODERATELY_ACIDIC',
    'MODERATELY_ALKALINE',
    'STRONGLY_ALKALINE',
    'CRITICAL',
    'INJURIOUS',
  ]);
  const flaggedParams = params.filter((p) => p.rating && notableRatings.has(p.rating));
  const ratingList =
    flaggedParams.length > 0
      ? flaggedParams
          .map((p) => {
            const shortName = p.label.replace('Available ', '').replace('Soil ', '');
            return `${shortName} ${p.rating}`;
          })
          .join(', ')
      : 'All parameters within normal range';

  const completeRecs = recs.filter(isCompleteFertilizerRec);
  const recList =
    completeRecs.length > 0
      ? completeRecs
          .map((r) => {
            if (r.bagSizeKg !== null && r.bagsPerAcre !== null) {
              if (r.bagsPerAcre === 0 && r.kgPerAcre > 0) {
                return `${r.productLabel} less than 0.5 bag (${r.kgPerAcre} kg)`;
              }
              return `${r.productLabel} ${r.bagsPerAcre} ${r.bagsPerAcre === 1 ? 'bag' : 'bags'} (${r.bagSizeKg}kg)`;
            }
            return `${r.productLabel} ${r.kgPerAcre} kg`;
          })
          .join(', ')
      : 'No additional fertilizer needed';

  return `Soil Health Card ${cardNumber ?? 'N/A'} (${sampleDate ?? 'N/A'}): ${ratingList}. Card advice per acre: ${recList}. Ask KVK ${kvk} before applying. -Agri Dept ${districtName}`;
}
