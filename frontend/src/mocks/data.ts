import type {
  AuditEvent,
  AuditLayer,
  Case,
  DataSourceStatus,
  DistrictSummary,
  Farmer,
  FieldObservation,
  FieldStressSummary,
  FieldSupportTask,
  FollowUp,
  Language,
  OutboundMessage,
  Provenance,
  ReasoningStep,
  RiskLevel,
  Role,
  SoilCard,
  WeatherAlert,
} from '@/api/contract';
import { centroid, makeRectangle, pixelCount10m, sizeClass } from '@/lib/geo';
import { computeSmsMeta } from '@/lib/sms';
import { computeFertilizerRec, evaluateSoilParam } from '@/lib/soil';

export function computeHash(prevHash: string, summary: string): string {
  const input = `${prevHash}::${summary}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

const RAW_DISTRICTS: {
  id: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
  crop: string;
  acreageLakh: number;
  kvk: string;
  language: Language;
  ndvi: number;
  baseline: number;
  risk: number;
}[] = [
  { id: 'yavatmal', district: 'Yavatmal', state: 'Maharashtra', lat: 20.3899, lon: 78.1307, crop: 'Cotton', acreageLakh: 4.2, kvk: '07232-242216', language: 'Marathi', ndvi: 0.49, baseline: 0.68, risk: 87 },
  { id: 'akola', district: 'Akola', state: 'Maharashtra', lat: 20.7002, lon: 77.0082, crop: 'Cotton', acreageLakh: 3.4, kvk: '0724-2258372', language: 'Marathi', ndvi: 0.54, baseline: 0.68, risk: 72 },
  { id: 'nashik', district: 'Nashik', state: 'Maharashtra', lat: 19.9975, lon: 73.7898, crop: 'Soybean', acreageLakh: 2.1, kvk: '0253-2305231', language: 'Marathi', ndvi: 0.64, baseline: 0.65, risk: 38 },
  { id: 'nagpur', district: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lon: 79.0882, crop: 'Soybean', acreageLakh: 2.3, kvk: '0712-2689485', language: 'Marathi', ndvi: 0.63, baseline: 0.65, risk: 42 },
  { id: 'amravati', district: 'Amravati', state: 'Maharashtra', lat: 20.9374, lon: 77.7796, crop: 'Cotton', acreageLakh: 3.0, kvk: '0721-2661835', language: 'Marathi', ndvi: 0.58, baseline: 0.68, risk: 59 },
  { id: 'ludhiana', district: 'Ludhiana', state: 'Punjab', lat: 30.9009, lon: 75.8573, crop: 'Wheat', acreageLakh: 3.6, kvk: '0161-2401960', language: 'Punjabi', ndvi: 0.62, baseline: 0.65, risk: 52 },
  { id: 'bathinda', district: 'Bathinda', state: 'Punjab', lat: 30.207, lon: 74.9455, crop: 'Cotton', acreageLakh: 2.4, kvk: '0164-2215619', language: 'Punjabi', ndvi: 0.55, baseline: 0.68, risk: 70 },
  { id: 'moga', district: 'Moga', state: 'Punjab', lat: 30.8165, lon: 75.1717, crop: 'Wheat', acreageLakh: 2.1, kvk: '01636-233119', language: 'Punjabi', ndvi: 0.64, baseline: 0.65, risk: 40 },
  { id: 'patiala', district: 'Patiala', state: 'Punjab', lat: 30.3398, lon: 76.3869, crop: 'Wheat', acreageLakh: 2.8, kvk: '0175-2212974', language: 'Punjabi', ndvi: 0.65, baseline: 0.65, risk: 35 },
  { id: 'sangrur', district: 'Sangrur', state: 'Punjab', lat: 30.2458, lon: 75.8421, crop: 'Rice', acreageLakh: 2.2, kvk: '01672-278129', language: 'Punjabi', ndvi: 0.69, baseline: 0.70, risk: 37 },
  { id: 'meerut', district: 'Meerut', state: 'UP', lat: 28.9845, lon: 77.7064, crop: 'Sugarcane', acreageLakh: 3.9, kvk: '0121-2880521', language: 'Hindi', ndvi: 0.71, baseline: 0.74, risk: 44 },
  { id: 'agra', district: 'Agra', state: 'UP', lat: 27.1767, lon: 78.0081, crop: 'Wheat', acreageLakh: 2.5, kvk: '0562-2960223', language: 'Hindi', ndvi: 0.60, baseline: 0.65, risk: 57 },
  { id: 'jhansi', district: 'Jhansi', state: 'UP', lat: 25.4484, lon: 78.5685, crop: 'Wheat', acreageLakh: 1.9, kvk: '0510-2730466', language: 'Hindi', ndvi: 0.59, baseline: 0.65, risk: 61 },
  { id: 'varanasi', district: 'Varanasi', state: 'UP', lat: 25.3176, lon: 82.9739, crop: 'Rice', acreageLakh: 2.0, kvk: '0542-2621182', language: 'Hindi', ndvi: 0.68, baseline: 0.70, risk: 39 },
  { id: 'bareilly', district: 'Bareilly', state: 'UP', lat: 28.367, lon: 79.4304, crop: 'Sugarcane', acreageLakh: 2.4, kvk: '0581-2520360', language: 'Hindi', ndvi: 0.70, baseline: 0.74, risk: 46 },
  { id: 'indore', district: 'Indore', state: 'MP', lat: 22.7196, lon: 75.8577, crop: 'Soybean', acreageLakh: 3.7, kvk: '0731-2470501', language: 'Hindi', ndvi: 0.61, baseline: 0.65, risk: 55 },
  { id: 'ujjain', district: 'Ujjain', state: 'MP', lat: 23.1765, lon: 75.7885, crop: 'Soybean', acreageLakh: 2.6, kvk: '0734-2522359', language: 'Hindi', ndvi: 0.64, baseline: 0.65, risk: 41 },
  { id: 'sehore', district: 'Sehore', state: 'MP', lat: 23.2032, lon: 77.0851, crop: 'Soybean', acreageLakh: 2.8, kvk: '07562-224561', language: 'Hindi', ndvi: 0.62, baseline: 0.65, risk: 49 },
  { id: 'vidisha', district: 'Vidisha', state: 'MP', lat: 23.5251, lon: 77.8081, crop: 'Wheat', acreageLakh: 2.0, kvk: '07592-252145', language: 'Hindi', ndvi: 0.63, baseline: 0.65, risk: 43 },
  { id: 'gwalior', district: 'Gwalior', state: 'MP', lat: 26.2183, lon: 78.1828, crop: 'Wheat', acreageLakh: 1.8, kvk: '0751-2467292', language: 'Hindi', ndvi: 0.58, baseline: 0.65, risk: 62 },
  { id: 'jaipur', district: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873, crop: 'Mustard', acreageLakh: 2.4, kvk: '0141-2552909', language: 'Hindi', ndvi: 0.56, baseline: 0.62, risk: 67 },
  { id: 'kota', district: 'Kota', state: 'Rajasthan', lat: 25.2138, lon: 75.8648, crop: 'Soybean', acreageLakh: 2.3, kvk: '0744-2471936', language: 'Hindi', ndvi: 0.60, baseline: 0.65, risk: 58 },
  { id: 'sriganganagar', district: 'Sri Ganganagar', state: 'Rajasthan', lat: 29.9038, lon: 73.8772, crop: 'Cotton', acreageLakh: 2.2, kvk: '0154-2470190', language: 'Hindi', ndvi: 0.53, baseline: 0.68, risk: 76 },
  { id: 'ajmer', district: 'Ajmer', state: 'Rajasthan', lat: 26.4499, lon: 74.6399, crop: 'Wheat', acreageLakh: 1.7, kvk: '0145-2671800', language: 'Hindi', ndvi: 0.61, baseline: 0.65, risk: 51 },
  { id: 'bikaner', district: 'Bikaner', state: 'Rajasthan', lat: 28.0229, lon: 73.3119, crop: 'Wheat', acreageLakh: 1.9, kvk: '0151-2250017', language: 'Hindi', ndvi: 0.57, baseline: 0.65, risk: 64 },
];

const NOW_ISO = '2026-10-17T14:30:00Z';

function makeModisProvenance(freshnessDays = 2): Provenance {
  return {
    source: 'NASA GIBS · MODIS Terra MOD13Q1 (250 m, 8-day composite)',
    status: 'SIMULATED',
    scale: 'DISTRICT_MODIS_250M',
    observedAt: '2026-10-15T06:00:00Z',
    fetchedAt: NOW_ISO,
    freshnessDays,
    note: 'District-wide vegetation composite over cropland mask',
  };
}

function makeSentinelProvenance(freshnessDays = 3): Provenance {
  return {
    source: 'Copernicus Sentinel-2 L2A (10 m)',
    status: 'SIMULATED',
    scale: 'FIELD_SENTINEL2_10M',
    observedAt: '2026-10-14T05:30:00Z',
    fetchedAt: NOW_ISO,
    freshnessDays,
    note: 'Field-level 10 m multispectral reflectance within verified parcel boundary',
  };
}

function makeWeatherProvenance(): Provenance {
  return {
    source: 'Open-Meteo + NASA POWER Agroclimatology',
    status: 'SIMULATED',
    scale: null,
    observedAt: '2026-10-17T12:00:00Z',
    fetchedAt: NOW_ISO,
    freshnessDays: 0,
    note: 'Gridded surface meteorology & 5-day synoptic forecast',
  };
}

export const INITIAL_WEATHER_ALERTS: WeatherAlert[] = [
  {
    id: 'WA-001',
    districtId: 'yavatmal',
    type: 'HEATWAVE',
    severity: 'WARNING',
    title: 'Heatwave Warning (41.8 °C)',
    message: 'Daytime maximum temperatures reaching 41.8 °C (+4.6 °C above normal), accelerating cotton boll evapotranspiration.',
    validFrom: '2026-10-17T06:00:00Z',
    validTo: '2026-10-20T18:00:00Z',
    provenance: makeWeatherProvenance(),
  },
  {
    id: 'WA-002',
    districtId: 'yavatmal',
    type: 'DRY_SPELL',
    severity: 'WATCH',
    title: 'Prolonged Dry Spell Watch',
    message: '14 consecutive days with <2 mm rainfall across eastern talukas; soil moisture deficit widening.',
    validFrom: '2026-10-10T00:00:00Z',
    validTo: '2026-10-22T00:00:00Z',
    provenance: makeWeatherProvenance(),
  },
  {
    id: 'WA-003',
    districtId: 'sriganganagar',
    type: 'HEATWAVE',
    severity: 'SEVERE',
    title: 'Severe Heatwave Alert (45.2 °C)',
    message: 'Extreme daytime heat of 45.2 °C with low relative humidity (18%) causing acute canopy thermal stress.',
    validFrom: '2026-10-17T06:00:00Z',
    validTo: '2026-10-19T18:00:00Z',
    provenance: makeWeatherProvenance(),
  },
  {
    id: 'WA-004',
    districtId: 'ludhiana',
    type: 'HIGH_WIND',
    severity: 'WATCH',
    title: 'High Wind Watch (46 km/h)',
    message: 'Gusty north-westerly winds up to 46 km/h expected; avoid foliar spraying during afternoon hours.',
    validFrom: '2026-10-17T12:00:00Z',
    validTo: '2026-10-18T18:00:00Z',
    provenance: makeWeatherProvenance(),
  },
  {
    id: 'WA-005',
    districtId: 'nashik',
    type: 'HEAVY_RAIN',
    severity: 'WARNING',
    title: 'Heavy Rain Warning (72 mm)',
    message: '24-hour cumulative rainfall of 72 mm forecast; ensure field drainage channels are cleared to prevent waterlogging.',
    validFrom: '2026-10-17T09:00:00Z',
    validTo: '2026-10-19T09:00:00Z',
    provenance: makeWeatherProvenance(),
  },
];

// Build observations for each farmer scenario (every 5 days for last 60 days = 13 points)
const OBS_DATES = [
  '2026-08-18',
  '2026-08-23',
  '2026-08-28',
  '2026-09-02',
  '2026-09-07',
  '2026-09-12',
  '2026-09-17',
  '2026-09-22',
  '2026-09-27',
  '2026-10-02',
  '2026-10-07',
  '2026-10-12',
  '2026-10-17',
];

export type ObsPattern =
  | 'STRESSED_NUTRIENT'
  | 'DETERIORATING_WATER'
  | 'HEALTHY_SMALL'
  | 'RECOVERING'
  | 'HEALTHY'
  | 'NOT_RECOVERING'
  | 'CLOSED_RECOVERED'
  | 'TOO_SMALL_NOISY'
  | 'NEW_STRESS'
  | 'CLOUDY';

export function buildObservationsForPattern(pattern: ObsPattern): FieldObservation[] {
  return OBS_DATES.map((date, idx) => {
    if (pattern === 'CLOUDY' && idx >= 8) {
      return {
        date,
        ndvi: null,
        ndwi: null,
        cloudPct: 75 + ((idx * 7) % 20),
        validPixelPct: 12,
        usable: false,
        status: 'SIMULATED',
      };
    }
    // Single cloudy pass in the middle for realism on non-cloudy series
    if (idx === 4 && pattern !== 'CLOUDY') {
      return {
        date,
        ndvi: null,
        ndwi: null,
        cloudPct: 82,
        validPixelPct: 18,
        usable: false,
        status: 'SIMULATED',
      };
    }

    let ndvi = 0.65;
    let ndwiOffset = 0.35;

    switch (pattern) {
      case 'STRESSED_NUTRIENT': {
        // Drops from 0.67 down to ~0.48 around idx 10, then slight stabilization 0.49, 0.50
        const curve = [0.67, 0.66, 0.64, 0.61, 0.58, 0.55, 0.52, 0.50, 0.48, 0.47, 0.48, 0.49, 0.50];
        ndvi = curve[idx] ?? 0.50;
        ndwiOffset = 0.34;
        break;
      }
      case 'DETERIORATING_WATER': {
        const curve = [0.68, 0.66, 0.63, 0.59, 0.55, 0.51, 0.48, 0.45, 0.43, 0.41, 0.39, 0.37, 0.35];
        ndvi = curve[idx] ?? 0.35;
        ndwiOffset = 0.50;
        break;
      }
      case 'RECOVERING': {
        // Stressed up to idx 8 (0.45), then rises after advisory to 0.54
        const curve = [0.67, 0.65, 0.62, 0.58, 0.54, 0.50, 0.47, 0.45, 0.45, 0.47, 0.50, 0.52, 0.54];
        ndvi = curve[idx] ?? 0.54;
        ndwiOffset = 0.35;
        break;
      }
      case 'NOT_RECOVERING': {
        // Stressed at 0.46 and stays flat around 0.46-0.47
        const curve = [0.66, 0.64, 0.60, 0.56, 0.52, 0.49, 0.47, 0.46, 0.46, 0.46, 0.47, 0.46, 0.47];
        ndvi = curve[idx] ?? 0.47;
        ndwiOffset = 0.45;
        break;
      }
      case 'CLOSED_RECOVERED': {
        const curve = [0.71, 0.68, 0.62, 0.56, 0.52, 0.50, 0.53, 0.57, 0.61, 0.65, 0.68, 0.70, 0.71];
        ndvi = curve[idx] ?? 0.71;
        ndwiOffset = 0.35;
        break;
      }
      case 'NEW_STRESS': {
        const curve = [0.65, 0.65, 0.64, 0.63, 0.61, 0.59, 0.56, 0.53, 0.50, 0.48, 0.46, 0.45, 0.44];
        ndvi = curve[idx] ?? 0.44;
        ndwiOffset = 0.42;
        break;
      }
      case 'CLOUDY': {
        const curve = [0.66, 0.64, 0.61, 0.57, 0.53, 0.50, 0.48, 0.46, 0.46, 0.46, 0.46, 0.46, 0.46];
        ndvi = curve[idx] ?? 0.46;
        ndwiOffset = 0.44;
        break;
      }
      case 'HEALTHY_SMALL':
      case 'TOO_SMALL_NOISY':
      case 'HEALTHY':
      default: {
        const curve = [0.63, 0.64, 0.65, 0.66, 0.66, 0.67, 0.66, 0.67, 0.68, 0.67, 0.68, 0.67, 0.68];
        ndvi = curve[idx] ?? 0.67;
        ndwiOffset = 0.35;
        break;
      }
    }

    const ndwi = Math.round((ndvi - ndwiOffset) * 100) / 100;
    return {
      date,
      ndvi,
      ndwi,
      cloudPct: 5 + ((idx * 3) % 15),
      validPixelPct: pattern === 'TOO_SMALL_NOISY' ? 40 : 94,
      usable: true,
      status: 'SIMULATED',
    };
  });
}

interface SeedFarmerSpec {
  id: string;
  num: string;
  name: string;
  districtId: string;
  village: string;
  crop: string;
  areaHa: number;
  language: Language;
  boundaryStatus: Farmer['field']['boundaryStatus'];
  consentSms: boolean;
  sowingDate: string;
  stressLevel: RiskLevel;
  stressType: FieldStressSummary['stressType'];
  reliability: FieldStressSummary['reliability'];
  reliabilityReasons: string[];
  ndviLatest: number | null;
  ndviBaseline: number;
  ndwiLatest: number | null;
  ndwiBaseline: number;
  soilCardId: string | null;
  openCaseId: string | null;
  pattern: ObsPattern;
}

const SEED_FARMER_SPECS: SeedFarmerSpec[] = [
  {
    id: 'FRM-0001',
    num: '01',
    name: 'Ramesh Pawar',
    districtId: 'yavatmal',
    village: 'Ner',
    crop: 'Cotton',
    areaHa: 1.20,
    language: 'Marathi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-15',
    stressLevel: 'HIGH',
    stressType: 'POSSIBLE_NUTRIENT',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Field covers ~120 Sentinel-2 pixels (1.20 ha ≥ 0.50 ha threshold)',
      'Worker-verified parcel boundary on ground',
      '12 of 13 satellite passes cloud-free (<20% cloud cover)',
    ],
    ndviLatest: 0.50,
    ndviBaseline: 0.68,
    ndwiLatest: 0.16,
    ndwiBaseline: 0.28,
    soilCardId: 'SHC-0001',
    openCaseId: 'CASE-0001',
    pattern: 'STRESSED_NUTRIENT',
  },
  {
    id: 'FRM-0002',
    num: '02',
    name: 'Sunita Jadhav',
    districtId: 'yavatmal',
    village: 'Darwha',
    crop: 'Cotton',
    areaHa: 0.80,
    language: 'Marathi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-18',
    stressLevel: 'CRITICAL',
    stressType: 'WATER',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Field covers ~80 Sentinel-2 pixels (0.80 ha ≥ 0.50 ha threshold)',
      'Worker-verified parcel boundary',
      'Clear multi-pass NDWI drop (−0.43) corroborates acute moisture deficit',
    ],
    ndviLatest: 0.35,
    ndviBaseline: 0.68,
    ndwiLatest: -0.15,
    ndwiBaseline: 0.28,
    soilCardId: null,
    openCaseId: 'CASE-0002',
    pattern: 'DETERIORATING_WATER',
  },
  {
    id: 'FRM-0003',
    num: '03',
    name: 'Vithal Kale',
    districtId: 'yavatmal',
    village: 'Pusad',
    crop: 'Cotton',
    areaHa: 0.30,
    language: 'Marathi',
    boundaryStatus: 'UNVERIFIED',
    consentSms: true,
    sowingDate: '2026-06-22',
    stressLevel: 'LOW',
    stressType: 'NONE',
    reliability: 'LOW',
    reliabilityReasons: [
      'Small parcel (0.30 ha, ~30 pixels) — edge pixels mix with adjacent bunds/trees',
      'Parcel boundary has not yet been verified by an extension worker',
    ],
    ndviLatest: 0.66,
    ndviBaseline: 0.68,
    ndwiLatest: 0.31,
    ndwiBaseline: 0.30,
    soilCardId: null,
    openCaseId: null,
    pattern: 'HEALTHY_SMALL',
  },
  {
    id: 'FRM-0004',
    num: '04',
    name: 'Anjali Thakre',
    districtId: 'akola',
    village: 'Telhara',
    crop: 'Cotton',
    areaHa: 1.60,
    language: 'Marathi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-14',
    stressLevel: 'MEDIUM',
    stressType: 'WATER',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Adequate parcel size (1.60 ha, ~160 Sentinel-2 pixels)',
      'Worker-verified boundary and consistent post-advisory observations',
    ],
    ndviLatest: 0.54,
    ndviBaseline: 0.68,
    ndwiLatest: 0.19,
    ndwiBaseline: 0.29,
    soilCardId: null,
    openCaseId: 'CASE-0003',
    pattern: 'RECOVERING',
  },
  {
    id: 'FRM-0005',
    num: '05',
    name: 'Gurpreet Singh',
    districtId: 'ludhiana',
    village: 'Jagraon',
    crop: 'Wheat',
    areaHa: 2.40,
    language: 'Punjabi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-07-02',
    stressLevel: 'LOW',
    stressType: 'NONE',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Large homogeneous parcel (2.40 ha, ~240 Sentinel-2 pixels)',
      'Worker-verified boundary',
    ],
    ndviLatest: 0.67,
    ndviBaseline: 0.65,
    ndwiLatest: 0.32,
    ndwiBaseline: 0.30,
    soilCardId: 'SHC-0002',
    openCaseId: null,
    pattern: 'HEALTHY',
  },
  {
    id: 'FRM-0006',
    num: '06',
    name: 'Harjit Kaur',
    districtId: 'bathinda',
    village: 'Rampura Phul',
    crop: 'Cotton',
    areaHa: 1.10,
    language: 'Punjabi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-19',
    stressLevel: 'HIGH',
    stressType: 'WATER',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Adequate field size (1.10 ha, ~110 Sentinel-2 pixels)',
      'Worker-verified parcel boundary',
    ],
    ndviLatest: 0.47,
    ndviBaseline: 0.68,
    ndwiLatest: 0.02,
    ndwiBaseline: 0.27,
    soilCardId: null,
    openCaseId: 'CASE-0004',
    pattern: 'NOT_RECOVERING',
  },
  {
    id: 'FRM-0007',
    num: '07',
    name: 'Rajesh Yadav',
    districtId: 'meerut',
    village: 'Sardhana',
    crop: 'Sugarcane',
    areaHa: 0.90,
    language: 'Hindi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-05-10',
    stressLevel: 'LOW',
    stressType: 'NONE',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Adequate parcel size (0.90 ha, ~90 Sentinel-2 pixels)',
      'Human-verified recovery following irrigation advisory',
    ],
    ndviLatest: 0.71,
    ndviBaseline: 0.74,
    ndwiLatest: 0.36,
    ndwiBaseline: 0.37,
    soilCardId: null,
    openCaseId: null,
    pattern: 'CLOSED_RECOVERED',
  },
  {
    id: 'FRM-0008',
    num: '08',
    name: 'Kamla Devi',
    districtId: 'jhansi',
    village: 'Mauranipur',
    crop: 'Wheat',
    areaHa: 0.08,
    language: 'Hindi',
    boundaryStatus: 'UNVERIFIED',
    consentSms: true,
    sowingDate: '2026-07-10',
    stressLevel: 'LOW',
    stressType: 'UNKNOWN',
    reliability: 'INSUFFICIENT',
    reliabilityReasons: [
      'Parcel is 0.08 ha (~8 pixels at 10 m) — below the 0.10 ha minimum for satellite monitoring',
      'Mixed border reflectance prevents reliable NDVI extraction; use ground inspection only',
    ],
    ndviLatest: null,
    ndviBaseline: 0.65,
    ndwiLatest: null,
    ndwiBaseline: 0.28,
    soilCardId: null,
    openCaseId: null,
    pattern: 'TOO_SMALL_NOISY',
  },
  {
    id: 'FRM-0009',
    num: '09',
    name: 'Mohan Patidar',
    districtId: 'indore',
    village: 'Depalpur',
    crop: 'Soybean',
    areaHa: 1.80,
    language: 'Hindi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-25',
    stressLevel: 'HIGH',
    stressType: 'UNKNOWN',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Adequate parcel size (1.80 ha, ~180 Sentinel-2 pixels)',
      'Worker-verified boundary; no Soil Health Card linked yet to separate nutrient vs pest/water cause',
    ],
    ndviLatest: 0.44,
    ndviBaseline: 0.65,
    ndwiLatest: 0.02,
    ndwiBaseline: 0.26,
    soilCardId: null,
    openCaseId: 'CASE-0006',
    pattern: 'NEW_STRESS',
  },
  {
    id: 'FRM-0010',
    num: '10',
    name: 'Lakshmi Meena',
    districtId: 'sriganganagar',
    village: 'Suratgarh',
    crop: 'Cotton',
    areaHa: 1.40,
    language: 'Hindi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-11',
    stressLevel: 'HIGH',
    stressType: 'WATER',
    reliability: 'LOW',
    reliabilityReasons: [
      'Last 5 Sentinel-2 passes obscured by >75% cloud & dust cover',
      'Fewer than 2 usable post-advisory satellite observations available',
    ],
    ndviLatest: 0.46,
    ndviBaseline: 0.68,
    ndwiLatest: 0.02,
    ndwiBaseline: 0.27,
    soilCardId: null,
    openCaseId: 'CASE-0007',
    pattern: 'CLOUDY',
  },
  {
    id: 'FRM-0011',
    num: '11',
    name: 'Suresh Choudhary',
    districtId: 'jaipur',
    village: 'Chomu',
    crop: 'Mustard',
    areaHa: 0.45,
    language: 'Hindi',
    boundaryStatus: 'DISPUTED',
    consentSms: false,
    sowingDate: '2026-07-05',
    stressLevel: 'MEDIUM',
    stressType: 'MIXED',
    reliability: 'LOW',
    reliabilityReasons: [
      'Small field (0.45 ha, ~45 pixels < 0.50 ha threshold) — partial boundary mixing',
      'Parcel boundary marked DISPUTED during extension verification',
    ],
    ndviLatest: 0.54,
    ndviBaseline: 0.62,
    ndwiLatest: 0.14,
    ndwiBaseline: 0.24,
    soilCardId: null,
    openCaseId: null,
    pattern: 'HEALTHY_SMALL',
  },
  {
    id: 'FRM-0012',
    num: '12',
    name: 'Priya Deshmukh',
    districtId: 'nashik',
    village: 'Niphad',
    crop: 'Soybean',
    areaHa: 2.10,
    language: 'Marathi',
    boundaryStatus: 'WORKER_VERIFIED',
    consentSms: true,
    sowingDate: '2026-06-20',
    stressLevel: 'LOW',
    stressType: 'NONE',
    reliability: 'HIGH',
    reliabilityReasons: [
      'Adequate parcel size (2.10 ha, ~210 Sentinel-2 pixels)',
      'Worker-verified parcel boundary and clear satellite passes',
    ],
    ndviLatest: 0.66,
    ndviBaseline: 0.65,
    ndwiLatest: 0.31,
    ndwiBaseline: 0.29,
    soilCardId: 'SHC-0003',
    openCaseId: null,
    pattern: 'HEALTHY',
  },
];

export const FARMER_OBSERVATIONS_MAP: Record<string, FieldObservation[]> = {};

export const INITIAL_FARMERS: Farmer[] = SEED_FARMER_SPECS.map((spec, index) => {
  const dist = RAW_DISTRICTS.find((d) => d.id === spec.districtId) ?? RAW_DISTRICTS[0];
  const latJitter = ((index % 4) - 1.5) * 0.008;
  const lonJitter = ((index % 3) - 1) * 0.009;
  const centerLat = Math.round((dist.lat + 0.012 + latJitter) * 100000) / 100000;
  const centerLon = Math.round((dist.lon + 0.015 + lonJitter) * 100000) / 100000;
  const poly = makeRectangle(centerLat, centerLon, spec.areaHa, 1.5, (index * 11) % 35);
  const c = centroid(poly);

  FARMER_OBSERVATIONS_MAP[spec.id] = buildObservationsForPattern(spec.pattern);

  const ndviAnomalyPct =
    spec.ndviLatest !== null
      ? Math.round(((spec.ndviLatest - spec.ndviBaseline) / spec.ndviBaseline) * 1000) / 10
      : null;

  const ndwiChange =
    spec.ndwiLatest !== null
      ? Math.round((spec.ndwiLatest - spec.ndwiBaseline) * 100) / 100
      : null;

  const latestStress: FieldStressSummary = {
    asOf: '2026-10-17T06:00:00Z',
    ndviLatest: spec.ndviLatest,
    ndviBaseline: spec.ndviBaseline,
    baselineMethod: 'PREVIOUS_YEAR',
    ndviAnomalyPct,
    ndwiLatest: spec.ndwiLatest,
    ndwiBaseline: spec.ndwiBaseline,
    ndwiChange,
    stressLevel: spec.stressLevel,
    stressType: spec.stressType,
    reliability: spec.reliability,
    reliabilityReasons: spec.reliabilityReasons,
    provenance: makeSentinelProvenance(spec.pattern === 'CLOUDY' ? 18 : 2),
  };

  return {
    id: spec.id,
    name: spec.name,
    phoneMasked: `+91 90xxxx00${spec.num}`,
    language: spec.language,
    village: spec.village,
    districtId: spec.districtId,
    crop: spec.crop,
    sowingDate: spec.sowingDate,
    consentSms: spec.consentSms,
    consentAt: spec.consentSms ? '2026-06-10T09:00:00Z' : null,
    registeredBy: 'Vikas More',
    createdAt: '2026-06-10T09:00:00Z',
    field: {
      polygon: poly,
      centroid: c,
      areaHa: spec.areaHa,
      pixelCount10m: pixelCount10m(spec.areaHa),
      sizeClass: sizeClass(spec.areaHa),
      boundaryStatus: spec.boundaryStatus,
      boundaryNote:
        spec.boundaryStatus === 'WORKER_VERIFIED'
          ? 'Walked bund perimeter with GPS receiver'
          : spec.boundaryStatus === 'DISPUTED'
            ? 'East bund overlaps neighbouring fallow plot; awaiting patwari sketch'
            : null,
      boundaryVerifiedBy: spec.boundaryStatus === 'UNVERIFIED' ? null : 'Vikas More',
      boundaryVerifiedAt: spec.boundaryStatus === 'UNVERIFIED' ? null : '2026-06-12T11:20:00Z',
    },
    latestStress,
    soilCardId: spec.soilCardId,
    openCaseId: spec.openCaseId,
    isDemo: true,
  };
});

// Build initial soil cards per §9.1
export const INITIAL_SOIL_CARDS: SoilCard[] = [
  // SHC-0001 (FRM-0001, CONFIRMED, sample 2025-06-12, card MH-YVT-2025-04417, 1.20 ha)
  {
    id: 'SHC-0001',
    farmerId: 'FRM-0001',
    cardNumber: 'MH-YVT-2025-04417',
    sampleDate: '2025-06-12',
    labName: 'District Soil Testing Laboratory, Yavatmal',
    imageUrl: null,
    status: 'CONFIRMED',
    params: [
      evaluateSoilParam('pH', 8.1, '–', '8.1', 0.96, true),
      evaluateSoilParam('EC', 0.38, 'dS/m', '0.38', 0.95, true),
      evaluateSoilParam('OC', 0.42, '%', '0.42', 0.94, true),
      evaluateSoilParam('N', 196, 'kg/ha', '196', 0.97, true),
      evaluateSoilParam('P', 14.2, 'kg/ha', '14.2', 0.95, true),
      evaluateSoilParam('K', 312, 'kg/ha', '312', 0.96, true),
      evaluateSoilParam('S', 8.5, 'ppm', '8.5', 0.93, true),
      evaluateSoilParam('Zn', 0.48, 'ppm', '0.48', 0.92, true),
      evaluateSoilParam('Fe', 6.1, 'ppm', '6.1', 0.94, true),
      evaluateSoilParam('Cu', 0.9, 'ppm', '0.9', 0.95, true),
      evaluateSoilParam('Mn', 4.2, 'ppm', '4.2', 0.93, true),
      evaluateSoilParam('B', 0.62, 'ppm', '0.62', 0.91, true),
    ],
    recommendations: [
      computeFertilizerRec(
        {
          product: 'Urea',
          productLabel: 'Urea',
          cardDose: 260,
          cardDoseUnit: 'kg/ha',
          timing: 'Split in 3 applications (basal, 30 DAS, 60 DAS)',
          sourceText: 'Urea @ 260 kg/ha (split application)',
        },
        1.20,
      ),
      computeFertilizerRec(
        {
          product: 'DAP',
          productLabel: 'DAP',
          cardDose: 108,
          cardDoseUnit: 'kg/ha',
          timing: 'Basal application at sowing',
          sourceText: 'DAP @ 108 kg/ha basal',
        },
        1.20,
      ),
      computeFertilizerRec(
        {
          product: 'Zinc_Sulphate',
          productLabel: 'Zinc Sulphate',
          cardDose: 25,
          cardDoseUnit: 'kg/ha',
          timing: 'Basal soil application once every 3 years',
          sourceText: 'ZnSO4 @ 25 kg/ha',
        },
        1.20,
      ),
    ],
    cardAgeYears: 1.3,
    ageFlag: false,
    extractionMethod: 'GEMINI_OCR',
    createdBy: 'Vikas More',
    confirmedBy: 'Vikas More',
    messageId: null,
    createdAt: '2026-09-20T10:15:00Z',
  },
  // SHC-0002 (FRM-0005, NEEDS_REVIEW, sample 2023-11-02, card PB-LDH-2023-11873, GEMINI_OCR, 2.40 ha)
  {
    id: 'SHC-0002',
    farmerId: 'FRM-0005',
    cardNumber: 'PB-LDH-2023-11873',
    sampleDate: '2023-11-02',
    labName: 'PAU Soil Testing Lab, Ludhiana',
    imageUrl: null,
    status: 'NEEDS_REVIEW',
    params: [
      evaluateSoilParam('pH', 72, '–', '72', 0.88, false),
      evaluateSoilParam('EC', 0.52, 'dS/m', '0.52', 0.94, true),
      evaluateSoilParam('OC', 0.61, '%', '0.61', 0.92, true),
      evaluateSoilParam('N', 248, 'kg/ha', '248', 0.95, true),
      evaluateSoilParam('P', 38, 'kg/ha P2O5', '38 (P2O5)', 0.89, false),
      evaluateSoilParam('K', 265, 'kg/ha', '265', 0.94, true),
      evaluateSoilParam('S', 12.4, 'ppm', '12.4', 0.91, true),
      evaluateSoilParam('Zn', 0.7, 'ppm', '0.7?', 0.62, false),
      evaluateSoilParam('Fe', 5.2, 'ppm', '5.2', 0.93, true),
      evaluateSoilParam('Cu', 0.6, 'ppm', '0.6', 0.92, true),
      evaluateSoilParam('Mn', 3.8, 'ppm', '3.8', 0.90, true),
      evaluateSoilParam('B', null, 'ppm', null, null, false),
    ],
    recommendations: [
      computeFertilizerRec(
        {
          product: 'Urea',
          productLabel: 'Urea',
          cardDose: 220,
          cardDoseUnit: 'kg/ha',
          timing: 'Half at sowing, half after first irrigation',
          sourceText: 'Urea @ 220 kg/ha',
        },
        2.40,
      ),
      computeFertilizerRec(
        {
          product: 'DAP',
          productLabel: 'DAP',
          cardDose: 100,
          cardDoseUnit: 'kg/ha',
          timing: 'Drill at sowing',
          sourceText: 'DAP @ 100 kg/ha',
        },
        2.40,
      ),
      computeFertilizerRec(
        {
          product: 'MOP',
          productLabel: 'MOP',
          cardDose: 50,
          cardDoseUnit: 'kg/ha',
          timing: 'Basal application',
          sourceText: 'MOP @ 50 kg/ha',
        },
        2.40,
      ),
    ],
    cardAgeYears: 2.9,
    ageFlag: true,
    extractionMethod: 'GEMINI_OCR',
    createdBy: 'Vikas More',
    confirmedBy: null,
    messageId: null,
    createdAt: '2026-10-14T08:40:00Z',
  },
  // SHC-0003 (FRM-0012, SMS_PENDING_APPROVAL, sample 2026-03-20, card MH-NSK-2026-00981, 2.10 ha)
  {
    id: 'SHC-0003',
    farmerId: 'FRM-0012',
    cardNumber: 'MH-NSK-2026-00981',
    sampleDate: '2026-03-20',
    labName: 'Krishi Vigyan Kendra Soil Lab, Nashik',
    imageUrl: null,
    status: 'SMS_PENDING_APPROVAL',
    params: [
      evaluateSoilParam('pH', 6.9, '–', '6.9', 0.97, true),
      evaluateSoilParam('EC', 0.21, 'dS/m', '0.21', 0.96, true),
      evaluateSoilParam('OC', 0.81, '%', '0.81', 0.95, true),
      evaluateSoilParam('N', 302, 'kg/ha', '302', 0.96, true),
      evaluateSoilParam('P', 9.1, 'kg/ha', '9.1', 0.95, true),
      evaluateSoilParam('K', 140, 'kg/ha', '140', 0.94, true),
      evaluateSoilParam('S', 15, 'ppm', '15.0', 0.93, true),
      evaluateSoilParam('Zn', 0.9, 'ppm', '0.90', 0.94, true),
      evaluateSoilParam('Fe', 7.8, 'ppm', '7.8', 0.95, true),
      evaluateSoilParam('Cu', 1.1, 'ppm', '1.1', 0.96, true),
      evaluateSoilParam('Mn', 5.6, 'ppm', '5.6', 0.94, true),
      evaluateSoilParam('B', 0.71, 'ppm', '0.71', 0.92, true),
    ],
    recommendations: [
      computeFertilizerRec(
        {
          product: 'SSP',
          productLabel: 'SSP',
          cardDose: 250,
          cardDoseUnit: 'kg/ha',
          timing: 'Basal application before sowing',
          sourceText: 'Single Super Phosphate @ 250 kg/ha',
        },
        2.10,
      ),
      computeFertilizerRec(
        {
          product: 'MOP',
          productLabel: 'MOP',
          cardDose: 60,
          cardDoseUnit: 'kg/ha',
          timing: 'Basal application',
          sourceText: 'Muriate of Potash @ 60 kg/ha',
        },
        2.10,
      ),
    ],
    cardAgeYears: 0.6,
    ageFlag: false,
    extractionMethod: 'GEMINI_OCR',
    createdBy: 'Vikas More',
    confirmedBy: 'Vikas More',
    messageId: 'MSG-0003',
    createdAt: '2026-10-12T11:00:00Z',
  },
];

function makeMsg(
  id: string,
  kind: OutboundMessage['kind'],
  districtId: string,
  farmerId: string | null,
  caseId: string | null,
  soilCardId: string | null,
  language: Language,
  textEnglish: string,
  textLocal: string,
  status: OutboundMessage['status'],
  generatedBy: string,
  approvedBy: string | null,
  createdAt: string,
  statusHistory: OutboundMessage['statusHistory'],
  recipientCount = 1,
  deliveryStats: OutboundMessage['deliveryStats'] = null,
): OutboundMessage {
  const meta = computeSmsMeta(textEnglish, textLocal);
  return {
    id,
    kind,
    parentId: null,
    caseId,
    farmerId,
    soilCardId,
    districtId,
    language,
    textEnglish,
    textLocal,
    charCount: meta.charCount,
    segments: meta.segments,
    encoding: meta.encoding,
    translation: {
      method: language === 'English' ? 'NONE' : 'TEMPLATE',
      numbersPreserved: meta.numbersPreserved,
      warning: meta.warning,
    },
    status,
    statusHistory,
    recipientCount,
    deliveryStats,
    generatedBy,
    approvedBy,
    rejectedReason: null,
    provider: 'MOCK',
    providerMessageId: status === 'SENT' || status === 'DELIVERED' || status === 'ACKNOWLEDGED' ? `mock-tw-${id.toLowerCase()}` : null,
    createdAt,
  };
}

export const INITIAL_MESSAGES: OutboundMessage[] = [
  makeMsg(
    'MSG-0001',
    'FARMER_ADVISORY',
    'yavatmal',
    'FRM-0001',
    'CASE-0001',
    'SHC-0001',
    'Marathi',
    'Ramesh Pawar, satellite shows weak growth in your Cotton field. Your Soil Health Card shows low Organic carbon, Nitrogen, Sulphur, Zinc. Card advice per acre: Urea 2.5 bags (45kg), DAP 1 bag (50kg), Zinc Sulphate 10.1 kg. Confirm with KVK 07232-242216 before applying. -Agri Dept Yavatmal',
    'रमेश पवार, उपग्रहाद्वारे तुमच्या कापूस शेतात कमकुवत वाढ दिसत आहे. मृदा आरोग्य कार्डनुसार सेंद्रिय कर्ब, नत्र, गंधक, जस्त कमी आहे. प्रति एकर शिफारस: युरिया 2.5 गोणी (45kg), डीएपी 1 गोणी (50kg), झिंक सल्फेट 10.1 kg. वापरण्यापूर्वी KVK 07232-242216 शी संपर्क करा. -कृषी विभाग यवतमाळ',
    'DELIVERED',
    'Vikas More',
    'R. K. Sharma',
    '2026-10-09T09:00:00Z',
    [
      { status: 'GENERATED', at: '2026-10-09T09:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-09T09:10:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: 'Verified against SHC-0001' },
      { status: 'APPROVED', at: '2026-10-09T10:05:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: 'Doses match confirmed Soil Health Card' },
      { status: 'SENT', at: '2026-10-09T10:06:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
      { status: 'DELIVERED', at: '2026-10-09T10:06:12Z', actor: 'SYSTEM', role: 'SYSTEM', note: 'Handset delivery receipt received' },
    ],
    1,
    { sent: 1, delivered: 1, failed: 0, acknowledged: 0 },
  ),
  makeMsg(
    'MSG-0002',
    'FARMER_ADVISORY',
    'yavatmal',
    'FRM-0002',
    'CASE-0002',
    null,
    'Marathi',
    'Sunita Jadhav, satellite shows possible water stress in your Cotton field at Darwha. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: 07232-242216. -Agri Dept Yavatmal',
    'सुनीता जाधव, दारव्हा येथील तुमच्या कापूस शेतात पाण्याचा ताण दिसत आहे. जमीन कोरडी असल्यास वीज किंवा कालव्याचे पाणी उपलब्ध होताच सिंचन करा. KVK सल्ल्याशिवाय फवारणी करू नका. KVK: 07232-242216. -कृषी विभाग यवतमाळ',
    'ACKNOWLEDGED',
    'Vikas More',
    'Asha Kulkarni',
    '2026-09-28T08:30:00Z',
    [
      { status: 'GENERATED', at: '2026-09-28T08:30:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-09-28T08:45:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-09-28T09:15:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: 'Approved for urgent water stress alert' },
      { status: 'SENT', at: '2026-09-28T09:16:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: null },
      { status: 'DELIVERED', at: '2026-09-28T09:16:09Z', actor: 'SYSTEM', role: 'SYSTEM', note: null },
      { status: 'ACKNOWLEDGED', at: '2026-09-29T11:20:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: 'PHONE_CALL: Farmer confirmed reading SMS; well water level is very low' },
    ],
    1,
    { sent: 1, delivered: 1, failed: 0, acknowledged: 1 },
  ),
  makeMsg(
    'MSG-0003',
    'SOIL_CARD',
    'nashik',
    'FRM-0012',
    null,
    'SHC-0003',
    'Marathi',
    'Soil Health Card MH-NSK-2026-00981 (2026-03-20): Phosphorus LOW. Card advice per acre: SSP 2 bags (50kg), MOP 0.5 bags (50kg). Ask KVK 0253-2305231 before applying. -Agri Dept Nashik',
    'मृदा आरोग्य कार्ड MH-NSK-2026-00981 (2026-03-20): स्फुरद (Phosphorus) कमी आहे. प्रति एकर शिफारस: एसएसपी 2 गोणी (50kg), एमओपी 0.5 गोणी (50kg). वापरण्यापूर्वी KVK 0253-2305231 चा सल्ला घ्या. -कृषी विभाग नाशिक',
    'PENDING_APPROVAL',
    'Vikas More',
    null,
    '2026-10-16T14:20:00Z',
    [
      { status: 'GENERATED', at: '2026-10-16T14:20:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-16T14:25:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: 'Submitted Soil Health Card SMS for department officer approval' },
    ],
  ),
  makeMsg(
    'MSG-0004',
    'FOLLOWUP_REMINDER',
    'bathinda',
    'FRM-0006',
    'CASE-0004',
    null,
    'Punjabi',
    'Reminder: your Cotton field still shows stress since our message on 2026-10-03. Please inspect it and call KVK 0164-2215619. Reply 1 if you have taken action. -Agri Dept',
    'ਯਾਦ دہਾਨੀ: ਸਾਡੇ 2026-10-03 ਦੇ ਸੁਨੇਹੇ ਤੋਂ ਬਾਅਦ ਤੁਹਾਡੇ ਕਪਾਹ ਦੇ ਖੇਤ ਵਿੱਚ ਅਜੇ ਵੀ ਤਣਾਅ ਦਿਖਾਈ ਦੇ ਰਿਹਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਖੇਤ ਦੀ ਜਾਂਚ ਕਰੋ ਅਤੇ KVK 0164-2215619 ਤੇ ਕਾਲ ਕਰੋ। ਜੇਕਰ ਤੁਸੀਂ ਕਾਰਵਾਈ ਕੀਤੀ ਹੈ ਤਾਂ 1 ਭੇਜੋ। -ਖੇਤੀਬਾੜੀ ਵਿਭਾਗ',
    'PENDING_APPROVAL',
    'Asha Kulkarni',
    null,
    '2026-10-16T16:10:00Z',
    [
      { status: 'GENERATED', at: '2026-10-16T16:10:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: 'Day 14 follow-up reminder drafted' },
      { status: 'PENDING_APPROVAL', at: '2026-10-16T16:12:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: 'Awaiting co-officer approval (separation of duties)' },
    ],
  ),
  makeMsg(
    'MSG-0005',
    'FARMER_ADVISORY',
    'indore',
    'FRM-0009',
    'CASE-0006',
    null,
    'Hindi',
    'Mohan Patidar, satellite shows stress in your Soybean field at Depalpur. An extension worker will contact you. Do not spray chemicals without KVK advice. KVK: 0731-2470501. -Agri Dept Indore',
    'मोहन पाटीदार, देपालपुर में आपके सोयाबीन खेत में उपग्रह से तनाव दिख रहा है। कृषि विस्तार कार्यकर्ता आपसे संपर्क करेंगे। KVK की सलाह के बिना रसायन का छिड़काव न करें। KVK: 0731-2470501. -कृषि विभाग इंदौर',
    'GENERATED',
    'Vikas More',
    null,
    '2026-10-17T08:00:00Z',
    [
      { status: 'GENERATED', at: '2026-10-17T08:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: 'Initial draft generated from field stress detection' },
    ],
  ),
  makeMsg(
    'MSG-0006',
    'DISTRICT_ADVISORY',
    'yavatmal',
    null,
    null,
    null,
    'Marathi',
    'Yavatmal: Cotton crop stress risk is CRITICAL. Inspect your field today; irrigate if soil is dry; do not spray without KVK advice. Weather: Heatwave Warning (41.8 °C). KVK: 07232-242216. -Agri Dept',
    'यवतमाळ: कापूस पिकाचा ताण धोका CRITICAL आहे. आजच शेताची पाहणी करा; जमीन कोरडी असल्यास पाणी द्या; KVK सल्ल्याशिवाय फवारणी करू नका. हवामान: उष्णतेची लाट (41.8 °C). KVK: 07232-242216. -कृषी विभाग',
    'SENT',
    'Vikas More',
    'R. K. Sharma',
    '2026-10-15T07:30:00Z',
    [
      { status: 'GENERATED', at: '2026-10-15T07:30:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-15T07:40:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-10-15T08:00:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: 'Approved district broadcast for 3 consenting farmers in Yavatmal' },
      { status: 'SENT', at: '2026-10-15T08:02:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
    ],
    3,
    { sent: 3, delivered: 2, failed: 0, acknowledged: 1 },
  ),
  makeMsg(
    'MSG-0007',
    'FARMER_ADVISORY',
    'sriganganagar',
    'FRM-0010',
    'CASE-0007',
    null,
    'Hindi',
    'Lakshmi Meena, satellite shows possible water stress in your Cotton field at Suratgarh. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: 0154-2470190. -Agri Dept Sri Ganganagar',
    'लक्ष्मी मीणा, सूरतगढ़ में आपके कपास खेत में पानी की कमी के संकेत हैं। मिट्टी सूखी होने पर नहर या बिजली उपलब्ध होते ही सिंचाई करें। KVK सलाह के बिना छिड़काव न करें। KVK: 0154-2470190. -कृषि विभाग श्रीगंगानगर',
    'FAILED',
    'Vikas More',
    'Asha Kulkarni',
    '2026-10-05T10:00:00Z',
    [
      { status: 'GENERATED', at: '2026-10-05T10:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-05T10:15:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-10-05T11:00:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: null },
      { status: 'SENT', at: '2026-10-05T11:02:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: null },
      { status: 'FAILED', at: '2026-10-05T11:05:00Z', actor: 'SYSTEM', role: 'SYSTEM', note: 'Carrier error 30003: Unreachable destination handset (out of coverage)' },
    ],
    1,
    { sent: 1, delivered: 0, failed: 1, acknowledged: 0 },
  ),
  makeMsg(
    'MSG-0008',
    'FARMER_ADVISORY',
    'akola',
    'FRM-0004',
    'CASE-0003',
    null,
    'Marathi',
    'Anjali Thakre, satellite shows possible water stress in your Cotton field at Telhara. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: 0724-2258372. -Agri Dept Akola',
    'अंजली ठाकरे, तेल्हारा येथील तुमच्या कापूस शेतात पाण्याचा ताण दिसत आहे. जमीन कोरडी असल्यास पाणी उपलब्ध होताच सिंचन करा. KVK सल्ल्याशिवाय फवारणी करू नका. KVK: 0724-2258372. -कृषी विभाग अकोला',
    'ACKNOWLEDGED',
    'Vikas More',
    'R. K. Sharma',
    '2026-10-01T09:00:00Z',
    [
      { status: 'GENERATED', at: '2026-10-01T09:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-01T09:10:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-10-01T09:40:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
      { status: 'SENT', at: '2026-10-01T09:42:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
      { status: 'DELIVERED', at: '2026-10-01T09:42:15Z', actor: 'SYSTEM', role: 'SYSTEM', note: null },
      { status: 'ACKNOWLEDGED', at: '2026-10-02T07:50:00Z', actor: 'Anjali Thakre', role: 'EXTENSION_WORKER', note: 'FARMER_REPLY: Replied 1 — protective furrow irrigation completed' },
    ],
    1,
    { sent: 1, delivered: 1, failed: 0, acknowledged: 1 },
  ),
  makeMsg(
    'MSG-0009',
    'FARMER_ADVISORY',
    'meerut',
    'FRM-0007',
    'CASE-0005',
    null,
    'Hindi',
    'Rajesh Yadav, satellite shows possible water stress in your Sugarcane field at Sardhana. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: 0121-2880521. -Agri Dept Meerut',
    'राजेश यादव, सरधना में आपके गन्ने के खेत में पानी की कमी दिख रही है। मिट्टी सूखी होने पर नहर या बिजली उपलब्ध होते ही सिंचाई करें। KVK सलाह के बिना छिड़काव न करें। KVK: 0121-2880521. -कृषि विभाग मेरठ',
    'ACKNOWLEDGED',
    'Vikas More',
    'Asha Kulkarni',
    '2026-09-15T10:00:00Z',
    [
      { status: 'GENERATED', at: '2026-09-15T10:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-09-15T10:15:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-09-15T10:45:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: null },
      { status: 'SENT', at: '2026-09-15T10:46:00Z', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', note: null },
      { status: 'DELIVERED', at: '2026-09-15T10:46:10Z', actor: 'SYSTEM', role: 'SYSTEM', note: null },
      { status: 'ACKNOWLEDGED', at: '2026-09-16T09:00:00Z', actor: 'Sanjay Patil', role: 'LOCAL_REP', note: 'IN_PERSON: Confirmed canal water released to plot' },
    ],
    1,
    { sent: 1, delivered: 1, failed: 0, acknowledged: 1 },
  ),
  makeMsg(
    'MSG-0010',
    'FARMER_ADVISORY',
    'bathinda',
    'FRM-0006',
    'CASE-0004',
    null,
    'Punjabi',
    'Harjit Kaur, satellite shows possible water stress in your Cotton field at Rampura Phul. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: 0164-2215619. -Agri Dept Bathinda',
    'ਹਰਜੀਤ ਕੌਰ, ਰਾਮਪੁਰਾ ਫੂਲ ਵਿੱਚ ਤੁਹਾਡੇ ਕਪਾਹ ਦੇ ਖੇਤ ਵਿੱਚ ਪਾਣੀ ਦੀ ਘਾਟ ਦਿਖਾਈ ਦੇ ਰਹੀ ਹੈ। ਜੇਕਰ ਮਿੱਟੀ ਸੁੱਕੀ ਹੈ ਤਾਂ ਨਹਿਰੀ ਪਾਣੀ ਜਾਂ ਬਿਜਲੀ ਮਿਲਣ ਤੇ ਸਿੰਚਾਈ ਕਰੋ। KVK: 0164-2215619. -ਖੇਤੀਬਾੜੀ ਵਿਭਾਗ ਬਠਿੰਡਾ',
    'DELIVERED',
    'Vikas More',
    'R. K. Sharma',
    '2026-10-03T09:00:00Z',
    [
      { status: 'GENERATED', at: '2026-10-03T09:00:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'PENDING_APPROVAL', at: '2026-10-03T09:20:00Z', actor: 'Vikas More', role: 'EXTENSION_WORKER', note: null },
      { status: 'APPROVED', at: '2026-10-03T10:00:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
      { status: 'SENT', at: '2026-10-03T10:01:00Z', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', note: null },
      { status: 'DELIVERED', at: '2026-10-03T10:01:14Z', actor: 'SYSTEM', role: 'SYSTEM', note: null },
    ],
    1,
    { sent: 1, delivered: 1, failed: 0, acknowledged: 0 },
  ),
];

// Initial Cases & Follow-ups per §9.1
function getFarmerStress(farmerId: string): FieldStressSummary {
  const f = INITIAL_FARMERS.find((x) => x.id === farmerId);
  if (!f || !f.latestStress) throw new Error(`Missing farmer stress for ${farmerId}`);
  return f.latestStress;
}

export const INITIAL_CASES: Case[] = [
  {
    id: 'CASE-0001',
    farmerId: 'FRM-0001',
    farmerName: 'Ramesh Pawar',
    districtId: 'yavatmal',
    status: 'MONITORING',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-10-09T08:45:00Z',
    stressAtOpen: getFarmerStress('FRM-0001'),
    reminderCount: 0,
    lastMessageId: 'MSG-0001',
    verifications: [],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  {
    id: 'CASE-0002',
    farmerId: 'FRM-0002',
    farmerName: 'Sunita Jadhav',
    districtId: 'yavatmal',
    status: 'NEEDS_FIELD_SUPPORT',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-09-28T08:00:00Z',
    stressAtOpen: getFarmerStress('FRM-0002'),
    reminderCount: 1,
    lastMessageId: 'MSG-0002',
    verifications: [
      {
        method: 'PHONE_CALL',
        outcome: 'NOT_RECOVERED',
        observation: 'Farmer reported borewell yield dropped; cotton leaves showing severe wilting on southern half.',
        verifiedBy: 'Vikas More',
        role: 'EXTENSION_WORKER',
        at: '2026-10-12T15:00:00Z',
      },
    ],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  {
    id: 'CASE-0003',
    farmerId: 'FRM-0004',
    farmerName: 'Anjali Thakre',
    districtId: 'akola',
    status: 'RECOVERING_PENDING_VERIFICATION',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-10-01T08:30:00Z',
    stressAtOpen: getFarmerStress('FRM-0004'),
    reminderCount: 0,
    lastMessageId: 'MSG-0008',
    verifications: [
      {
        method: 'PHONE_CALL',
        outcome: 'CONFIRMED_RECOVERED',
        observation: 'Spoke with Anjali Thakre and inspected canal turnout record; new vegetative flush visible across plot.',
        verifiedBy: 'Dr. Neha Rao',
        role: 'KVK_EXPERT',
        at: '2026-10-16T11:30:00Z',
      },
    ],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  {
    id: 'CASE-0004',
    farmerId: 'FRM-0006',
    farmerName: 'Harjit Kaur',
    districtId: 'bathinda',
    status: 'NOT_RECOVERING',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-10-03T08:30:00Z',
    stressAtOpen: getFarmerStress('FRM-0006'),
    reminderCount: 1,
    lastMessageId: 'MSG-0004',
    verifications: [],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  {
    id: 'CASE-0005',
    farmerId: 'FRM-0007',
    farmerName: 'Rajesh Yadav',
    districtId: 'meerut',
    status: 'CLOSED',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-09-15T09:30:00Z',
    stressAtOpen: getFarmerStress('FRM-0007'),
    reminderCount: 0,
    lastMessageId: 'MSG-0009',
    verifications: [
      {
        method: 'FIELD_VISIT',
        outcome: 'CONFIRMED_RECOVERED',
        observation: 'Visited Sardhana plot; sugarcane canopy vigor restored after two canal irrigations.',
        verifiedBy: 'Dr. Neha Rao',
        role: 'KVK_EXPERT',
        at: '2026-10-05T14:00:00Z',
      },
    ],
    closedAt: '2026-10-06T10:00:00Z',
    closedBy: 'R. K. Sharma',
    closeReason: 'Satellite ΔNDVI +0.21 corroborated by KVK agronomist field visit.',
  },
  {
    id: 'CASE-0006',
    farmerId: 'FRM-0009',
    farmerName: 'Mohan Patidar',
    districtId: 'indore',
    status: 'DETECTED',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-10-17T07:45:00Z',
    stressAtOpen: getFarmerStress('FRM-0009'),
    reminderCount: 0,
    lastMessageId: 'MSG-0005',
    verifications: [],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
  {
    id: 'CASE-0007',
    farmerId: 'FRM-0010',
    farmerName: 'Lakshmi Meena',
    districtId: 'sriganganagar',
    status: 'INSUFFICIENT_DATA',
    trigger: 'FIELD_STRESS',
    openedAt: '2026-09-25T09:00:00Z',
    stressAtOpen: getFarmerStress('FRM-0010'),
    reminderCount: 1,
    lastMessageId: 'MSG-0007',
    verifications: [],
    closedAt: null,
    closedBy: null,
    closeReason: null,
  },
];

export const INITIAL_FOLLOW_UPS: FollowUp[] = [
  {
    caseId: 'CASE-0001',
    farmerId: 'FRM-0001',
    startedAt: '2026-10-09T10:06:00Z',
    windowDays: 21,
    extendedOnce: false,
    dayNumber: 8,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.48,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0001'].slice(-5),
    latestNdvi: 0.50,
    deltaNdvi: 0.02,
    slopePerDay: 0.0025,
    outcome: 'PENDING',
    outcomeReason: 'Day 8 of 21: ΔNDVI is +0.020 (+0.0025/day). Below +0.050 recovery threshold; continuing 21-day satellite watch.',
    requiresHumanVerification: true,
    lastCheckedAt: '2026-10-17T06:00:00Z',
    nextCheckAt: '2026-10-22T06:00:00Z',
  },
  {
    caseId: 'CASE-0002',
    farmerId: 'FRM-0002',
    startedAt: '2026-09-28T09:16:00Z',
    windowDays: 21,
    extendedOnce: false,
    dayNumber: 19,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.43,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0002'].slice(-6),
    latestNdvi: 0.35,
    deltaNdvi: -0.08,
    slopePerDay: -0.0042,
    outcome: 'DETERIORATING',
    outcomeReason: 'ΔNDVI dropped −0.080 (slope −0.0042/day ≤ −0.003/day threshold). Escalated to P1 Needs Field Support queue.',
    requiresHumanVerification: true,
    lastCheckedAt: '2026-10-17T06:00:00Z',
    nextCheckAt: '2026-10-19T06:00:00Z',
  },
  {
    caseId: 'CASE-0003',
    farmerId: 'FRM-0004',
    startedAt: '2026-10-01T09:42:00Z',
    windowDays: 21,
    extendedOnce: false,
    dayNumber: 16,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.45,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0004'].slice(-6),
    latestNdvi: 0.54,
    deltaNdvi: 0.09,
    slopePerDay: 0.0056,
    outcome: 'RECOVERING',
    outcomeReason: 'ΔNDVI rose +0.090 (≥ +0.050 threshold) with slope +0.0056/day across 3 cloud-free Sentinel-2 passes. Human verification required before closure.',
    requiresHumanVerification: true,
    lastCheckedAt: '2026-10-17T06:00:00Z',
    nextCheckAt: '2026-10-22T06:00:00Z',
  },
  {
    caseId: 'CASE-0004',
    farmerId: 'FRM-0006',
    startedAt: '2026-10-03T10:01:00Z',
    windowDays: 21,
    extendedOnce: false,
    dayNumber: 14,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.46,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0006'].slice(-5),
    latestNdvi: 0.47,
    deltaNdvi: 0.01,
    slopePerDay: 0.0007,
    outcome: 'NOT_RECOVERING',
    outcomeReason: 'Day 14: ΔNDVI is +0.010 (flat trajectory between −0.05 and +0.05). Follow-up reminder #1 drafted for approval.',
    requiresHumanVerification: true,
    lastCheckedAt: '2026-10-17T06:00:00Z',
    nextCheckAt: '2026-10-21T06:00:00Z',
  },
  {
    caseId: 'CASE-0005',
    farmerId: 'FRM-0007',
    startedAt: '2026-09-15T10:46:00Z',
    windowDays: 21,
    extendedOnce: false,
    dayNumber: 21,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.50,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0007'].slice(-7),
    latestNdvi: 0.71,
    deltaNdvi: 0.21,
    slopePerDay: 0.010,
    outcome: 'RECOVERING',
    outcomeReason: 'Full 21-day window completed with ΔNDVI +0.210 and field verification by KVK agronomist.',
    requiresHumanVerification: false,
    lastCheckedAt: '2026-10-06T06:00:00Z',
    nextCheckAt: null,
  },
  {
    caseId: 'CASE-0007',
    farmerId: 'FRM-0010',
    startedAt: '2026-09-25T11:02:00Z',
    windowDays: 28,
    extendedOnce: true,
    dayNumber: 22,
    monitoringScale: 'FIELD_SENTINEL2_10M',
    baselineNdvi: 0.46,
    observations: FARMER_OBSERVATIONS_MAP['FRM-0010'].slice(-6),
    latestNdvi: null,
    deltaNdvi: null,
    slopePerDay: null,
    outcome: 'INSUFFICIENT_DATA',
    outcomeReason: '0 usable Sentinel-2 observations since advisory (all 5 passes >75% cloud/dust). Window extended once (+7d) and P3 ground verification task assigned.',
    requiresHumanVerification: true,
    lastCheckedAt: '2026-10-17T06:00:00Z',
    nextCheckAt: '2026-10-20T06:00:00Z',
  },
];

export const INITIAL_FIELD_SUPPORT_TASKS: FieldSupportTask[] = [
  {
    id: 'FST-0001',
    caseId: 'CASE-0002',
    farmerId: 'FRM-0002',
    farmerName: 'Sunita Jadhav',
    districtId: 'yavatmal',
    village: 'Darwha',
    reason: 'DETERIORATING satellite NDVI (−0.08 over 19 days) + critical water stress on 0.80 ha Cotton plot.',
    priority: 'P1',
    createdAt: '2026-10-14T09:00:00Z',
    dueBy: '2026-10-16T18:00:00Z',
    overdue: true,
    status: 'OPEN',
    assignedTo: null,
    assignedRole: null,
    visit: null,
  },
  {
    id: 'FST-0002',
    caseId: 'CASE-0007',
    farmerId: 'FRM-0010',
    farmerName: 'Lakshmi Meena',
    districtId: 'sriganganagar',
    village: 'Suratgarh',
    reason: 'INSUFFICIENT_DATA after 21-day window + 7-day extension (persistent cloud/dust cover) and failed SMS delivery.',
    priority: 'P3',
    createdAt: '2026-10-15T11:00:00Z',
    dueBy: '2026-10-20T18:00:00Z',
    overdue: false,
    status: 'ASSIGNED',
    assignedTo: 'Sanjay Patil',
    assignedRole: 'LOCAL_REP',
    visit: null,
  },
  {
    id: 'FST-0003',
    caseId: 'CASE-0003',
    farmerId: 'FRM-0004',
    farmerName: 'Anjali Thakre',
    districtId: 'akola',
    village: 'Telhara',
    reason: 'Pre-closure agronomic spot-check for recovering Cotton plot.',
    priority: 'P2',
    createdAt: '2026-10-10T10:00:00Z',
    dueBy: '2026-10-17T18:00:00Z',
    overdue: false,
    status: 'VISITED',
    assignedTo: 'Dr. Neha Rao',
    assignedRole: 'KVK_EXPERT',
    visit: {
      visitedAt: '2026-10-16T11:00:00Z',
      visitedBy: 'Dr. Neha Rao',
      findings: 'Soil moisture restored to 65% field capacity; new sympodial branches healthy with <3% bollworm incidence.',
      actionTaken: 'Advised against unnecessary pyrethroid spray; installed pheromone trap.',
      recommendClose: true,
    },
  },
  {
    id: 'FST-0004',
    caseId: 'CASE-0005',
    farmerId: 'FRM-0007',
    farmerName: 'Rajesh Yadav',
    districtId: 'meerut',
    village: 'Sardhana',
    reason: 'Verify sugarcane irrigation recovery before closing CASE-0005.',
    priority: 'P2',
    createdAt: '2026-09-29T09:00:00Z',
    dueBy: '2026-10-06T18:00:00Z',
    overdue: false,
    status: 'RESOLVED',
    assignedTo: 'Dr. Neha Rao',
    assignedRole: 'KVK_EXPERT',
    visit: {
      visitedAt: '2026-10-05T14:00:00Z',
      visitedBy: 'Dr. Neha Rao',
      findings: 'Canopy vigour fully recovered; bricks and canal bund intact.',
      actionTaken: 'Confirmed recovery with farmer and recommended ratoon management schedule.',
      recommendClose: true,
    },
  },
];

// BuildDistrictSummary list sorted by risk desc
export function buildDistrictSummaries(
  farmers: Farmer[],
  cases: Case[],
  alerts: WeatherAlert[],
): DistrictSummary[] {
  const sortedRaw = [...RAW_DISTRICTS].sort((a, b) => b.risk - a.risk);
  return sortedRaw.map((r, idx) => {
    const anomalyPct = Math.round(((r.ndvi - r.baseline) / r.baseline) * 1000) / 10;
    const distAlerts = alerts.filter((a) => a.districtId === r.id).length;
    const distFarmers = farmers.filter((f) => f.districtId === r.id).length;
    const distOpenCases = cases.filter((c) => c.districtId === r.id && c.status !== 'CLOSED').length;
    return {
      id: r.id,
      district: r.district,
      state: r.state,
      lat: r.lat,
      lon: r.lon,
      primaryCrop: r.crop,
      acreageLakh: r.acreageLakh,
      language: r.language,
      kvkContact: r.kvk,
      ndvi: r.ndvi,
      ndviBaseline: r.baseline,
      ndviAnomalyPct: anomalyPct,
      riskScore: r.risk,
      riskLevel: riskLevelFromScore(r.risk),
      priorityRank: idx + 1,
      weatherAlertCount: distAlerts,
      registeredFarmers: distFarmers,
      openCases: distOpenCases,
      provenance: makeModisProvenance(idx % 4 === 0 ? 1 : 2),
    };
  });
}

// Build ~40 hash-chained audit events across all 7 layers
interface RawAuditSeed {
  at: string;
  layer: AuditLayer;
  action: string;
  actor: string;
  role: Role | 'SYSTEM';
  caseId: string | null;
  farmerId: string | null;
  districtId: string | null;
  entityType: string;
  entityId: string;
  summary: string;
  isSimulated: boolean;
}

const RAW_AUDIT_SEEDS: RawAuditSeed[] = [
  { at: '2026-09-15T09:15:00Z', layer: 'DATA_PROVENANCE', action: 'SATELLITE_INGEST', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'Farmer', entityId: 'FRM-0007', summary: 'Ingested Sentinel-2 L2A 10m pass for FRM-0007 (NDVI 0.50 vs 0.74 baseline)', isSimulated: true },
  { at: '2026-09-15T09:30:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'Case', entityId: 'CASE-0005', summary: 'Opened CASE-0005 for Rajesh Yadav (Sugarcane water stress detected)', isSimulated: false },
  { at: '2026-09-15T10:00:00Z', layer: 'OUTREACH', action: 'MESSAGE_GENERATED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'OutboundMessage', entityId: 'MSG-0009', summary: 'Generated Hindi SMS advisory MSG-0009 for FRM-0007 (numbers preserved ✓)', isSimulated: false },
  { at: '2026-09-15T10:45:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'OutboundMessage', entityId: 'MSG-0009', summary: 'Approved MSG-0009 after verifying separation of duties (drafted by Vikas More)', isSimulated: false },
  { at: '2026-09-15T10:46:10Z', layer: 'OUTREACH', action: 'MESSAGE_DELIVERED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'OutboundMessage', entityId: 'MSG-0009', summary: 'SMS MSG-0009 delivered to handset (+91 90xxxx0007)', isSimulated: true },
  { at: '2026-09-16T09:00:00Z', layer: 'HUMAN_VERIFICATION', action: 'MESSAGE_ACKNOWLEDGED', actor: 'Sanjay Patil', role: 'LOCAL_REP', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'OutboundMessage', entityId: 'MSG-0009', summary: 'Recorded IN_PERSON acknowledgement for MSG-0009: canal water released to plot', isSimulated: false },
  { at: '2026-09-20T10:15:00Z', layer: 'DATA_PROVENANCE', action: 'SOIL_OCR_EXTRACTED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: 'FRM-0001', districtId: 'yavatmal', entityType: 'SoilCard', entityId: 'SHC-0001', summary: 'Extracted 12 soil parameters from card MH-YVT-2025-04417 via Gemini OCR', isSimulated: true },
  { at: '2026-09-20T10:25:00Z', layer: 'HUMAN_VERIFICATION', action: 'SOIL_CARD_CONFIRMED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: 'FRM-0001', districtId: 'yavatmal', entityType: 'SoilCard', entityId: 'SHC-0001', summary: 'Confirmed all 12 parameters and bag/acre conversions on SHC-0001', isSimulated: false },
  { at: '2026-09-25T09:00:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0007', farmerId: 'FRM-0010', districtId: 'sriganganagar', entityType: 'Case', entityId: 'CASE-0007', summary: 'Opened CASE-0007 for Lakshmi Meena (Cotton water stress in Sri Ganganagar)', isSimulated: false },
  { at: '2026-09-28T07:50:00Z', layer: 'DATA_PROVENANCE', action: 'SATELLITE_INGEST', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'Farmer', entityId: 'FRM-0002', summary: 'Sentinel-2 pass for FRM-0002 (Darwha): NDVI 0.43, NDWI -0.07 (94% valid pixels)', isSimulated: true },
  { at: '2026-09-28T08:00:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'Case', entityId: 'CASE-0002', summary: 'Opened CASE-0002 for Sunita Jadhav (CRITICAL water stress on 0.80 ha Cotton plot)', isSimulated: false },
  { at: '2026-09-28T08:30:00Z', layer: 'OUTREACH', action: 'MESSAGE_GENERATED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0002', summary: 'Drafted Marathi water stress advisory MSG-0002 for Sunita Jadhav', isSimulated: false },
  { at: '2026-09-28T09:15:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0002', summary: 'Approved MSG-0002 for dispatch (urgent water stress)', isSimulated: false },
  { at: '2026-09-28T09:16:09Z', layer: 'OUTREACH', action: 'MESSAGE_DELIVERED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0002', summary: 'Delivered MSG-0002 to +91 90xxxx0002; started 21-day Sentinel-2 follow-up watch', isSimulated: true },
  { at: '2026-09-29T11:20:00Z', layer: 'HUMAN_VERIFICATION', action: 'MESSAGE_ACKNOWLEDGED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0002', summary: 'Confirmed MSG-0002 acknowledgement via PHONE_CALL with Sunita Jadhav', isSimulated: false },
  { at: '2026-10-01T08:30:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0003', farmerId: 'FRM-0004', districtId: 'akola', entityType: 'Case', entityId: 'CASE-0003', summary: 'Opened CASE-0003 for Anjali Thakre (Akola Cotton water stress)', isSimulated: false },
  { at: '2026-10-01T09:40:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: 'CASE-0003', farmerId: 'FRM-0004', districtId: 'akola', entityType: 'OutboundMessage', entityId: 'MSG-0008', summary: 'Approved Marathi advisory MSG-0008 for Anjali Thakre', isSimulated: false },
  { at: '2026-10-02T07:50:00Z', layer: 'HUMAN_VERIFICATION', action: 'MESSAGE_ACKNOWLEDGED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: 'CASE-0003', farmerId: 'FRM-0004', districtId: 'akola', entityType: 'OutboundMessage', entityId: 'MSG-0008', summary: 'Farmer reply 1 logged for MSG-0008 (protective furrow irrigation started)', isSimulated: false },
  { at: '2026-10-03T08:30:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0004', farmerId: 'FRM-0006', districtId: 'bathinda', entityType: 'Case', entityId: 'CASE-0004', summary: 'Opened CASE-0004 for Harjit Kaur (Bathinda Cotton stress)', isSimulated: false },
  { at: '2026-10-03T10:00:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: 'CASE-0004', farmerId: 'FRM-0006', districtId: 'bathinda', entityType: 'OutboundMessage', entityId: 'MSG-0010', summary: 'Approved Punjabi advisory MSG-0010 for Harjit Kaur', isSimulated: false },
  { at: '2026-10-05T11:05:00Z', layer: 'OUTREACH', action: 'MESSAGE_FAILED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0007', farmerId: 'FRM-0010', districtId: 'sriganganagar', entityType: 'OutboundMessage', entityId: 'MSG-0007', summary: 'SMS MSG-0007 delivery failed (carrier error 30003: handset unreachable)', isSimulated: true },
  { at: '2026-10-05T14:00:00Z', layer: 'FIELD_ACTION', action: 'TASK_VISITED', actor: 'Dr. Neha Rao', role: 'KVK_EXPERT', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'FieldSupportTask', entityId: 'FST-0004', summary: 'KVK agronomist visited FRM-0007 plot; confirmed sugarcane canopy recovery', isSimulated: false },
  { at: '2026-10-06T10:00:00Z', layer: 'OUTCOME', action: 'CASE_CLOSED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: 'CASE-0005', farmerId: 'FRM-0007', districtId: 'meerut', entityType: 'Case', entityId: 'CASE-0005', summary: 'Closed CASE-0005 after ΔNDVI +0.21 and independent verification by Dr. Neha Rao', isSimulated: false },
  { at: '2026-10-09T08:45:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0001', farmerId: 'FRM-0001', districtId: 'yavatmal', entityType: 'Case', entityId: 'CASE-0001', summary: 'Opened CASE-0001 for Ramesh Pawar (POSSIBLE_NUTRIENT stress linked with SHC-0001)', isSimulated: false },
  { at: '2026-10-09T10:05:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: 'CASE-0001', farmerId: 'FRM-0001', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0001', summary: 'Approved MSG-0001 with SHC-0001 per-acre bag recommendations', isSimulated: false },
  { at: '2026-10-09T10:06:12Z', layer: 'OUTREACH', action: 'MESSAGE_DELIVERED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0001', farmerId: 'FRM-0001', districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0001', summary: 'Delivered MSG-0001 to Ramesh Pawar (+91 90xxxx0001)', isSimulated: true },
  { at: '2026-10-12T11:00:00Z', layer: 'DATA_PROVENANCE', action: 'SOIL_OCR_EXTRACTED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: 'FRM-0012', districtId: 'nashik', entityType: 'SoilCard', entityId: 'SHC-0003', summary: 'Extracted and confirmed SHC-0003 (MH-NSK-2026-00981) for Priya Deshmukh', isSimulated: true },
  { at: '2026-10-12T15:00:00Z', layer: 'HUMAN_VERIFICATION', action: 'CASE_VERIFIED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'Case', entityId: 'CASE-0002', summary: 'Phone verification on CASE-0002: NOT_RECOVERED (borewell yield depleted)', isSimulated: false },
  { at: '2026-10-14T08:40:00Z', layer: 'DATA_PROVENANCE', action: 'SOIL_OCR_FLAGGED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: 'FRM-0005', districtId: 'ludhiana', entityType: 'SoilCard', entityId: 'SHC-0002', summary: 'OCR flagged 4 issues on SHC-0002 (pH 72 decimal shift, P2O5 unit mismatch, Zn low conf, B missing)', isSimulated: true },
  { at: '2026-10-14T09:00:00Z', layer: 'OUTCOME', action: 'FOLLOWUP_DETERIORATING', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'FollowUp', entityId: 'CASE-0002', summary: 'Day 19 check on CASE-0002: ΔNDVI −0.080 (DETERIORATING); escalated to P1 field support FST-0001', isSimulated: true },
  { at: '2026-10-14T09:01:00Z', layer: 'FIELD_ACTION', action: 'TASK_CREATED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0002', farmerId: 'FRM-0002', districtId: 'yavatmal', entityType: 'FieldSupportTask', entityId: 'FST-0001', summary: 'Created P1 Field Support Task FST-0001 for Sunita Jadhav (Darwha, Yavatmal)', isSimulated: false },
  { at: '2026-10-15T07:30:00Z', layer: 'OUTREACH', action: 'MESSAGE_GENERATED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: null, districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0006', summary: 'Generated Yavatmal district heatwave & cotton stress advisory MSG-0006', isSimulated: false },
  { at: '2026-10-15T08:00:00Z', layer: 'APPROVAL', action: 'MESSAGE_APPROVED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: null, farmerId: null, districtId: 'yavatmal', entityType: 'OutboundMessage', entityId: 'MSG-0006', summary: 'Approved district broadcast MSG-0006 for 3 consenting farmers in Yavatmal', isSimulated: false },
  { at: '2026-10-15T11:00:00Z', layer: 'OUTCOME', action: 'FOLLOWUP_INSUFFICIENT_DATA', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0007', farmerId: 'FRM-0010', districtId: 'sriganganagar', entityType: 'FollowUp', entityId: 'CASE-0007', summary: 'Extended CASE-0007 follow-up window to 28 days due to persistent cloud cover; created P3 task FST-0002', isSimulated: true },
  { at: '2026-10-15T11:15:00Z', layer: 'FIELD_ACTION', action: 'TASK_ASSIGNED', actor: 'R. K. Sharma', role: 'DEPT_OFFICER', caseId: 'CASE-0007', farmerId: 'FRM-0010', districtId: 'sriganganagar', entityType: 'FieldSupportTask', entityId: 'FST-0002', summary: 'Assigned FST-0002 ground verification to Sanjay Patil (LOCAL_REP)', isSimulated: false },
  { at: '2026-10-16T11:00:00Z', layer: 'FIELD_ACTION', action: 'TASK_VISITED', actor: 'Dr. Neha Rao', role: 'KVK_EXPERT', caseId: 'CASE-0003', farmerId: 'FRM-0004', districtId: 'akola', entityType: 'FieldSupportTask', entityId: 'FST-0003', summary: 'Recorded field visit on FST-0003 (Telhara, Akola): recommendClose = true', isSimulated: false },
  { at: '2026-10-16T11:30:00Z', layer: 'HUMAN_VERIFICATION', action: 'CASE_VERIFIED', actor: 'Dr. Neha Rao', role: 'KVK_EXPERT', caseId: 'CASE-0003', farmerId: 'FRM-0004', districtId: 'akola', entityType: 'Case', entityId: 'CASE-0003', summary: 'Recorded CONFIRMED_RECOVERED verification on CASE-0003; ready for Dept Officer closure', isSimulated: false },
  { at: '2026-10-16T14:25:00Z', layer: 'OUTREACH', action: 'MESSAGE_SUBMITTED', actor: 'Vikas More', role: 'EXTENSION_WORKER', caseId: null, farmerId: 'FRM-0012', districtId: 'nashik', entityType: 'OutboundMessage', entityId: 'MSG-0003', summary: 'Submitted Soil Card SMS MSG-0003 (SHC-0003) for department approval', isSimulated: false },
  { at: '2026-10-16T16:12:00Z', layer: 'OUTREACH', action: 'MESSAGE_SUBMITTED', actor: 'Asha Kulkarni', role: 'DEPT_OFFICER', caseId: 'CASE-0004', farmerId: 'FRM-0006', districtId: 'bathinda', entityType: 'OutboundMessage', entityId: 'MSG-0004', summary: 'Submitted Day-14 follow-up reminder MSG-0004 for co-officer approval', isSimulated: false },
  { at: '2026-10-17T07:45:00Z', layer: 'ANALYSIS', action: 'CASE_OPENED', actor: 'SYSTEM', role: 'SYSTEM', caseId: 'CASE-0006', farmerId: 'FRM-0009', districtId: 'indore', entityType: 'Case', entityId: 'CASE-0006', summary: 'Detected HIGH stress on FRM-0009 (Indore Soybean); opened CASE-0006 and drafted MSG-0005', isSimulated: true },
];

export function buildInitialAuditEvents(): AuditEvent[] {
  let prevHash = '0000000000000000';
  return RAW_AUDIT_SEEDS.map((seed, idx) => {
    const hash = computeHash(prevHash, seed.summary);
    const ev: AuditEvent = {
      id: idx + 1,
      at: seed.at,
      layer: seed.layer,
      action: seed.action,
      actor: seed.actor,
      role: seed.role,
      caseId: seed.caseId,
      farmerId: seed.farmerId,
      districtId: seed.districtId,
      entityType: seed.entityType,
      entityId: seed.entityId,
      summary: seed.summary,
      details: { entityId: seed.entityId, action: seed.action },
      isSimulated: seed.isSimulated,
      prevHash,
      hash,
    };
    prevHash = hash;
    return ev;
  });
}

export const INITIAL_DATA_SOURCES: DataSourceStatus[] = [
  {
    key: 'NASA_GIBS_MODIS',
    name: 'NASA GIBS · MODIS Terra MOD13Q1',
    purpose: 'District-level 250 m 8-day NDVI composite & anomaly leaderboard',
    mode: 'SIMULATED',
    lastSuccessAt: '2026-10-17T06:00:00Z',
    lastError: null,
  },
  {
    key: 'CDSE_SENTINEL2',
    name: 'Copernicus Sentinel-2 L2A (10 m)',
    purpose: 'Field-level 10 m NDVI/NDWI time series & 21-day follow-up monitoring',
    mode: 'SIMULATED',
    lastSuccessAt: '2026-10-17T05:30:00Z',
    lastError: null,
  },
  {
    key: 'OPEN_METEO',
    name: 'Open-Meteo High-Resolution Forecast',
    purpose: '5-day district synoptic weather forecast & alert thresholds',
    mode: 'SIMULATED',
    lastSuccessAt: '2026-10-17T12:00:00Z',
    lastError: null,
  },
  {
    key: 'NASA_POWER',
    name: 'NASA POWER Agroclimatology',
    purpose: '7-day cumulative rainfall, temperature anomaly & reference ET₀',
    mode: 'SIMULATED',
    lastSuccessAt: '2026-10-17T11:45:00Z',
    lastError: null,
  },
  {
    key: 'GEMINI',
    name: 'Google Gemini 2.5 Flash (OCR & Translation)',
    purpose: 'Soil Health Card parameter OCR extraction & regional SMS translation',
    mode: 'MOCK',
    lastSuccessAt: '2026-10-16T14:20:00Z',
    lastError: null,
  },
  {
    key: 'SMS',
    name: 'Outbound SMS Gateway (Twilio / Mock)',
    purpose: 'Approved farmer advisory dispatch & delivery status receipts',
    mode: 'MOCK',
    lastSuccessAt: '2026-10-15T08:02:00Z',
    lastError: null,
  },
];

export function buildDistrictReasoningChain(district: DistrictSummary, alerts: WeatherAlert[]): ReasoningStep[] {
  const hasAlerts = alerts.length > 0;
  return [
    {
      step: 1,
      agent: 'Satellite Scout',
      title: `MODIS 250 m NDVI composite analyzed (${district.ndvi.toFixed(2)} vs ${district.ndviBaseline.toFixed(2)} baseline)`,
      detail: `Observed ${district.ndviAnomalyPct > 0 ? '+' : ''}${district.ndviAnomalyPct.toFixed(1)}% canopy greenness anomaly across ${district.acreageLakh} lakh ha of ${district.primaryCrop} cropland.`,
      status: district.ndviAnomalyPct <= -15 ? 'WARN' : 'OK',
      evidence: [district.provenance],
    },
    {
      step: 2,
      agent: 'Weather Watch',
      title: hasAlerts
        ? `${alerts.length} active weather alert(s): ${alerts.map((a) => a.title).join(', ')}`
        : '7-day rainfall & temperature within seasonal bounds',
      detail: hasAlerts
        ? alerts[0].message
        : 'Surface temperature anomaly +0.8 °C and evapotranspiration demand tracking 5-year mean.',
      status: hasAlerts ? 'WARN' : 'OK',
      evidence: [makeWeatherProvenance()],
    },
    {
      step: 3,
      agent: 'Crop Risk Analyst',
      title: `Composite district risk score ${district.riskScore}/100 (${district.riskLevel})`,
      detail:
        district.riskScore >= 70
          ? `Multi-signal convergence: severe MODIS NDVI drop combined with thermal/moisture stress during boll/grain filling stage.`
          : `Moderate to low canopy deviation; routine extension monitoring advised.`,
      status: district.riskScore >= 70 ? 'WARN' : 'OK',
      evidence: [district.provenance, makeWeatherProvenance()],
    },
    {
      step: 4,
      agent: 'Field Monitor',
      title: `${district.registeredFarmers} registered farmer parcel(s), ${district.openCases} open follow-up case(s)`,
      detail:
        district.registeredFarmers > 0
          ? `Cross-checked 10 m Sentinel-2 observations on registered parcels to separate localized irrigation/nutrient gaps from district-wide weather.`
          : `No registered farmer polygons in this district yet; relying on 250 m district composite.`,
      status: district.registeredFarmers > 0 ? 'OK' : 'ABSTAIN',
      evidence: [makeSentinelProvenance()],
    },
  ];
}

export function buildFarmerReasoningChain(farmer: Farmer, soilCard: SoilCard | null): ReasoningStep[] {
  const stress = farmer.latestStress;
  const isTooSmall = farmer.field.sizeClass === 'TOO_SMALL';
  const isCloudy = farmer.id === 'FRM-0010';

  return [
    {
      step: 1,
      agent: 'Satellite Scout',
      title: isTooSmall
        ? `Parcel too small for 10 m satellite monitoring (${farmer.field.areaHa} ha, ~${farmer.field.pixelCount10m} pixels)`
        : isCloudy
          ? `Recent Sentinel-2 passes obscured by >75% cloud cover`
          : `Sentinel-2 10 m parcel analysis: NDVI ${stress?.ndviLatest?.toFixed(2) ?? '—'} (baseline ${stress?.ndviBaseline?.toFixed(2) ?? '—'})`,
      detail: isTooSmall
        ? `Fields under 0.10 ha (<10 pixels) mix heavily with surrounding bunds and trees. Satellite stress scoring abstains.`
        : isCloudy
          ? `Last 5 overpasses had >75% cloud/dust cover; fewer than 2 usable post-advisory observations.`
          : `Parcel covers ~${farmer.field.pixelCount10m} pixels (${farmer.field.boundaryStatus}). NDVI anomaly ${stress?.ndviAnomalyPct ?? 0}%, NDWI change ${stress?.ndwiChange ?? 0}.`,
      status: isTooSmall || isCloudy ? 'ABSTAIN' : stress && stress.stressLevel !== 'LOW' ? 'WARN' : 'OK',
      evidence: stress ? [stress.provenance] : [makeSentinelProvenance()],
    },
    {
      step: 2,
      agent: 'Weather Watch',
      title: `Local agrometeorological context (${farmer.village}, ${farmer.districtId})`,
      detail: `Checked 7-day cumulative rainfall, vapour pressure deficit, and reference evapotranspiration (ET₀) for ${farmer.crop} sown on ${farmer.sowingDate}.`,
      status: stress && (stress.stressLevel === 'CRITICAL' || stress.stressLevel === 'HIGH') ? 'WARN' : 'OK',
      evidence: [makeWeatherProvenance()],
    },
    {
      step: 3,
      agent: 'Crop Risk Analyst',
      title: soilCard
        ? `Cross-referenced Soil Health Card ${soilCard.cardNumber ?? soilCard.id} (${soilCard.status})`
        : `No confirmed Soil Health Card linked — nutrient status unverified`,
      detail: soilCard
        ? `Card parameters integrated into diagnostic reasoning (${soilCard.params.filter((p) => p.rating === 'LOW' || p.rating === 'DEFICIENT').map((p) => p.param).join(', ') || 'all adequate'}).`
        : `Without a linked Soil Health Card, diagnostic cannot attribute canopy drop to specific nutrient deficiency.`,
      status: soilCard ? 'OK' : 'ABSTAIN',
      evidence: [
        {
          source: soilCard ? `Soil Health Card ${soilCard.cardNumber}` : 'Soil Health Card Registry',
          status: soilCard?.extractionMethod === 'MANUAL' ? 'MANUAL' : 'SIMULATED',
          scale: null,
          observedAt: soilCard?.sampleDate ?? null,
          fetchedAt: NOW_ISO,
          freshnessDays: null,
          note: null,
        },
      ],
    },
    {
      step: 4,
      agent: 'Field Monitor',
      title: `Reliability assessment: ${stress?.reliability ?? 'LOW'} · Stress classification: ${
        stress?.stressType === 'NONE' ? 'NONE' : `Possible ${stress?.stressType ?? 'UNKNOWN'}`
      }`,
      detail: (stress?.reliabilityReasons ?? []).join(' · '),
      status: stress?.reliability === 'INSUFFICIENT' ? 'ABSTAIN' : stress?.reliability === 'LOW' ? 'WARN' : 'OK',
      evidence: stress ? [stress.provenance] : [makeSentinelProvenance()],
    },
  ];
}
