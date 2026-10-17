import type {
  AuditEvent,
  AuditLayer,
  Case,
  ConsolidatedReport,
  DataSourceStatus,
  DistrictReport,
  DistrictSummary,
  Farmer,
  FieldObservation,
  FieldSupportTask,
  FollowUp,
  ForecastDay,
  Language,
  OutboundMessage,
  Priority,
  Role,
  SoilCard,
  WeatherAlert,
} from '@/api/contract';
import {
  buildDistrictReasoningChain,
  buildDistrictSummaries,
  buildFarmerReasoningChain,
  buildInitialAuditEvents,
  computeHash,
  FARMER_OBSERVATIONS_MAP,
  INITIAL_CASES,
  INITIAL_DATA_SOURCES,
  INITIAL_FARMERS,
  INITIAL_FIELD_SUPPORT_TASKS,
  INITIAL_FOLLOW_UPS,
  INITIAL_MESSAGES,
  INITIAL_SOIL_CARDS,
  INITIAL_WEATHER_ALERTS,
} from './data';

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export interface MockStoreState {
  farmers: Farmer[];
  observationsByFarmer: Record<string, FieldObservation[]>;
  soilCards: SoilCard[];
  messages: OutboundMessage[];
  cases: Case[];
  followUps: FollowUp[];
  fieldSupportTasks: FieldSupportTask[];
  weatherAlerts: WeatherAlert[];
  auditEvents: AuditEvent[];
  dataSources: DataSourceStatus[];
  sentTimestampByMsg: Record<string, number>;
}

function createInitialStoreState(): MockStoreState {
  const sentTimestampByMsg: Record<string, number> = {};
  for (const m of INITIAL_MESSAGES) {
    if (m.status === 'SENT') {
      sentTimestampByMsg[m.id] = Date.now() - 10_000;
    }
  }
  return {
    farmers: deepClone(INITIAL_FARMERS),
    observationsByFarmer: deepClone(FARMER_OBSERVATIONS_MAP),
    soilCards: deepClone(INITIAL_SOIL_CARDS),
    messages: deepClone(INITIAL_MESSAGES),
    cases: deepClone(INITIAL_CASES),
    followUps: deepClone(INITIAL_FOLLOW_UPS),
    fieldSupportTasks: deepClone(INITIAL_FIELD_SUPPORT_TASKS),
    weatherAlerts: deepClone(INITIAL_WEATHER_ALERTS),
    auditEvents: buildInitialAuditEvents(),
    dataSources: deepClone(INITIAL_DATA_SOURCES),
    sentTimestampByMsg,
  };
}

export let store: MockStoreState = createInitialStoreState();

export function resetMockStore(): void {
  store = createInitialStoreState();
}

export function appendAuditEvent(params: {
  layer: AuditLayer;
  action: string;
  actor: string;
  role: Role | 'SYSTEM';
  caseId?: string | null;
  farmerId?: string | null;
  districtId?: string | null;
  entityType: string;
  entityId: string;
  summary: string;
  details?: Record<string, unknown>;
  isSimulated?: boolean;
}): AuditEvent {
  const last = store.auditEvents[store.auditEvents.length - 1];
  const prevHash = last ? last.hash : '0000000000000000';
  const hash = computeHash(prevHash, params.summary);
  const nextId = last ? last.id + 1 : 1;
  const ev: AuditEvent = {
    id: nextId,
    at: new Date().toISOString(),
    layer: params.layer,
    action: params.action,
    actor: params.actor,
    role: params.role,
    caseId: params.caseId ?? null,
    farmerId: params.farmerId ?? null,
    districtId: params.districtId ?? null,
    entityType: params.entityType,
    entityId: params.entityId,
    summary: params.summary,
    details: params.details ?? {},
    isSimulated: params.isSimulated ?? false,
    prevHash,
    hash,
  };
  store.auditEvents.push(ev);
  return ev;
}

export function getDistrictSummariesFromStore(): DistrictSummary[] {
  return buildDistrictSummaries(store.farmers, store.cases, store.weatherAlerts);
}

export function translateEnglishToLocal(en: string, lang: Language): string {
  if (lang === 'English') return en;
  // Preserve every digit/number token while providing natural regional script prefix/body
  const nums = en.match(/\d+(\.\d+)?/g) ?? [];
  if (lang === 'Marathi') {
    let out = en
      .replace('satellite shows possible water stress in your', 'उपग्रहाद्वारे पाण्याचा ताण दिसत आहे:')
      .replace('satellite shows weak growth in your', 'उपग्रहाद्वारे कमकुवत वाढ दिसत आहे:')
      .replace('satellite shows stress in your', 'उपग्रहाद्वारे पिकात ताण दिसत आहे:')
      .replace('field at', 'शेत, गाव')
      .replace('If soil is dry, irrigate when power or canal water is available.', 'जमीन कोरडी असल्यास पाणी उपलब्ध होताच सिंचन करा.')
      .replace('Do not spray without KVK advice.', 'KVK सल्ल्याशिवाय फवारणी करू नका.')
      .replace('Do not spray chemicals without KVK advice.', 'KVK सल्ल्याशिवाय रासायनिक फवारणी करू नका.')
      .replace('An extension worker will contact you.', 'कृषी विस्तार सेवक आपल्याशी संपर्क करतील.')
      .replace('Your Soil Health Card shows low', 'मृदा आरोग्य कार्डनुसार कमी घटक:')
      .replace('Card advice per acre:', 'प्रति एकर मात्रा:')
      .replace('Confirm with KVK', 'वापरण्यापूर्वी KVK')
      .replace('Ask KVK', 'वापरण्यापूर्वी KVK')
      .replace('before applying.', 'चा सल्ला घ्या.')
      .replace('Soil Health Card', 'मृदा आरोग्य कार्ड')
      .replace('crop stress risk is', 'पीक ताण धोका पातळी:')
      .replace('Inspect your field today; irrigate if soil is dry; do not spray without KVK advice.', 'आजच शेताची पाहणी करा; कोरडे असल्यास सिंचन करा; KVK सल्ल्याशिवाय फवारणी टाळा.')
      .replace('Check your crop closely this week.', 'या आठवड्यात पिकाची बारकाईने पाहणी करा.')
      .replace('No action needed now.', 'सध्या कोणत्याही कार्यवाहीची आवश्यकता नाही.')
      .replace('Reminder: your', 'स्मरणपत्र: तुमच्या')
      .replace('field still shows stress since our message on', 'शेतात अद्याप ताण दिसत आहे, संदेश दिनांक')
      .replace('Please inspect it and call KVK', 'कृपया पाहणी करा आणि KVK ला कॉल करा:')
      .replace('Reply 1 if you have taken action.', 'उपाययोजना केली असल्यास 1 असा रिप्लाय द्या.')
      .replace('-Agri Dept', '-कृषी विभाग');
    for (const tok of nums) {
      if (!out.includes(tok)) out += ` (${tok})`;
    }
    return out;
  }
  if (lang === 'Punjabi') {
    let out = en
      .replace('satellite shows possible water stress in your', 'ਸੈਟੇਲਾਈਟ ਰਾਹੀਂ ਪਾਣੀ ਦੀ ਘਾਟ ਦਿਖਾਈ ਦੇ ਰਹੀ ਹੈ:')
      .replace('satellite shows weak growth in your', 'ਸੈਟੇਲਾਈਟ ਰਾਹੀਂ ਕਮਜ਼ੋਰ ਵਾਧਾ ਦਿਖਾਈ ਦੇ ਰਿਹਾ ਹੈ:')
      .replace('satellite shows stress in your', 'ਸੈਟੇਲਾਈਟ ਰਾਹੀਂ ਫਸਲ ਵਿੱਚ ਤਣਾਅ ਦਿਖਾਈ ਦੇ ਰਿਹਾ ਹੈ:')
      .replace('field at', 'ਖੇਤ, ਪਿੰਡ')
      .replace('If soil is dry, irrigate when power or canal water is available.', 'ਜੇ ਮਿੱਟੀ ਸੁੱਕੀ ਹੈ ਤਾਂ ਨਹਿਰੀ ਪਾਣੀ ਜਾਂ ਬਿਜਲੀ ਮਿਲਣ ਤੇ ਸਿੰਚਾਈ ਕਰੋ।')
      .replace('Do not spray without KVK advice.', 'KVK ਸਲਾਹ ਤੋਂ ਬਿਨਾਂ ਸਪਰੇਅ ਨਾ ਕਰੋ।')
      .replace('Do not spray chemicals without KVK advice.', 'KVK ਸਲਾਹ ਤੋਂ ਬਿਨਾਂ ਰਸਾਇਣਕ ਸਪਰੇਅ ਨਾ ਕਰੋ।')
      .replace('An extension worker will contact you.', 'ਖੇਤੀਬਾੜੀ ਵਿਸਥਾਰ ਕਰਮਚਾਰੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਨਗੇ।')
      .replace('Your Soil Health Card shows low', 'ਤੁਹਾਡੇ ਮਿੱਟੀ ਸਿਹਤ ਕਾਰਡ ਵਿੱਚ ਘੱਟ ਤੱਤ:')
      .replace('Card advice per acre:', 'ਪ੍ਰਤੀ ਏਕੜ ਸਿਫਾਰਸ਼:')
      .replace('Confirm with KVK', 'ਵਰਤੋਂ ਤੋਂ ਪਹਿਲਾਂ KVK')
      .replace('Ask KVK', 'ਵਰਤੋਂ ਤੋਂ ਪਹਿਲਾਂ KVK')
      .replace('before applying.', 'ਨਾਲ ਸਲਾਹ ਕਰੋ।')
      .replace('Soil Health Card', 'ਮਿੱਟੀ ਸਿਹਤ ਕਾਰਡ')
      .replace('crop stress risk is', 'ਫਸਲ ਤਣਾਅ ਜੋਖਮ ਪੱਧਰ:')
      .replace('Inspect your field today; irrigate if soil is dry; do not spray without KVK advice.', 'ਅੱਜ ਹੀ ਆਪਣੇ ਖੇਤ ਦੀ ਜਾਂਚ ਕਰੋ; ਸੁੱਕਾ ਹੋਣ ਤੇ ਪਾਣੀ ਲਗਾਓ; KVK ਸਲਾਹ ਤੋਂ ਬਿਨਾਂ ਸਪਰੇਅ ਨਾ ਕਰੋ।')
      .replace('Check your crop closely this week.', 'ਇਸ ਹਫ਼ਤੇ ਆਪਣੀ ਫਸਲ ਦੀ ਧਿਆਨ ਨਾਲ ਜਾਂਚ ਕਰੋ।')
      .replace('No action needed now.', 'ਹੁਣ ਕਿਸੇ ਕਾਰਵਾਈ ਦੀ ਲੋੜ ਨਹੀਂ ਹੈ।')
      .replace('Reminder: your', 'ਯਾਦ-ਪੱਤਰ: ਤੁਹਾਡੇ')
      .replace('field still shows stress since our message on', 'ਖੇਤ ਵਿੱਚ ਅਜੇ ਵੀ ਤਣਾਅ ਹੈ, ਸੁਨੇਹਾ ਮਿਤੀ')
      .replace('Please inspect it and call KVK', 'ਕਿਰਪਾ ਕਰਕੇ ਜਾਂਚ ਕਰੋ ਅਤੇ KVK ਤੇ ਕਾਲ ਕਰੋ:')
      .replace('Reply 1 if you have taken action.', 'ਜੇ ਕਾਰਵਾਈ ਕੀਤੀ ਹੈ ਤਾਂ 1 ਭੇਜੋ।')
      .replace('-Agri Dept', '-ਖੇਤੀਬਾੜੀ ਵਿਭਾਗ');
    for (const tok of nums) {
      if (!out.includes(tok)) out += ` (${tok})`;
    }
    return out;
  }
  // Hindi
  let out = en
    .replace('satellite shows possible water stress in your', 'उपग्रह से पानी की कमी के संकेत हैं:')
    .replace('satellite shows weak growth in your', 'उपग्रह से कमजोर वृद्धि दिख रही है:')
    .replace('satellite shows stress in your', 'उपग्रह से फसल में तनाव दिख रहा है:')
    .replace('field at', 'खेत, ग्राम')
    .replace('If soil is dry, irrigate when power or canal water is available.', 'मिट्टी सूखी होने पर बिजली या नहर का पानी मिलते ही सिंचाई करें।')
    .replace('Do not spray without KVK advice.', 'KVK सलाह के बिना छिड़काव न करें।')
    .replace('Do not spray chemicals without KVK advice.', 'KVK सलाह के बिना रसायन का छिड़काव न करें।')
    .replace('An extension worker will contact you.', 'कृषि विस्तार कार्यकर्ता आपसे संपर्क करेंगे।')
    .replace('Your Soil Health Card shows low', 'मृदा स्वास्थ्य कार्ड में कम तत्व:')
    .replace('Card advice per acre:', 'प्रति एकड़ सलाह:')
    .replace('Confirm with KVK', 'प्रयोग से पहले KVK')
    .replace('Ask KVK', 'प्रयोग से पहले KVK')
    .replace('before applying.', 'से पुष्टि करें।')
    .replace('Soil Health Card', 'मृदा स्वास्थ्य कार्ड')
    .replace('crop stress risk is', 'फसल तनाव जोखिम स्तर:')
    .replace('Inspect your field today; irrigate if soil is dry; do not spray without KVK advice.', 'आज ही खेत का निरीक्षण करें; सूखा होने पर सिंचाई करें; KVK सलाह बिना छिड़काव न करें।')
    .replace('Check your crop closely this week.', 'इस सप्ताह अपनी फसल की नजदीकी निगरानी करें।')
    .replace('No action needed now.', 'अभी किसी कार्रवाई की आवश्यकता नहीं है।')
    .replace('Reminder: your', 'अनुस्मारक: आपके')
    .replace('field still shows stress since our message on', 'खेत में अब भी तनाव है, संदेश दिनांक')
    .replace('Please inspect it and call KVK', 'कृपया निरीक्षण करें और KVK को कॉल करें:')
    .replace('Reply 1 if you have taken action.', 'यदि कार्रवाई की है तो 1 लिखकर उत्तर दें।')
    .replace('-Agri Dept', '-कृषि विभाग');
  for (const tok of nums) {
    if (!out.includes(tok)) out += ` (${tok})`;
  }
  return out;
}

export function buildDistrictReportFromStore(districtId: string): DistrictReport {
  const summaries = getDistrictSummariesFromStore();
  const dist = summaries.find((d) => d.id === districtId);
  if (!dist) {
    throw new Error(`District ${districtId} not found`);
  }

  const alerts = store.weatherAlerts.filter((a) => a.districtId === districtId);
  const farmers = store.farmers.filter((f) => f.districtId === districtId);
  const priority: Priority =
    dist.riskLevel === 'CRITICAL'
      ? 'P1'
      : dist.riskLevel === 'HIGH'
        ? 'P2'
        : dist.riskLevel === 'MEDIUM'
          ? 'P3'
          : 'P4';

  const escalate = dist.riskLevel === 'CRITICAL' || (dist.riskLevel === 'HIGH' && alerts.length > 0);
  const escalationReason = escalate
    ? `MODIS NDVI anomaly (${dist.ndviAnomalyPct.toFixed(1)}%) coincides with ${
        alerts.length > 0 ? alerts[0].title : 'severe moisture deficit'
      } across ${dist.acreageLakh} lakh ha of ${dist.primaryCrop}.`
    : null;

  const forecast5d: ForecastDay[] = [
    { date: '2026-10-18', tMaxC: dist.id === 'yavatmal' ? 41.2 : 34.5, tMinC: 23.4, rainMm: 0, rainProbPct: 10, windKmh: 18, et0Mm: 6.2 },
    { date: '2026-10-19', tMaxC: dist.id === 'yavatmal' ? 41.8 : 35.0, tMinC: 24.0, rainMm: 0, rainProbPct: 15, windKmh: 21, et0Mm: 6.5 },
    { date: '2026-10-20', tMaxC: dist.id === 'yavatmal' ? 40.4 : 33.8, tMinC: 22.8, rainMm: dist.id === 'nashik' ? 42 : 0, rainProbPct: dist.id === 'nashik' ? 85 : 20, windKmh: 16, et0Mm: 5.8 },
    { date: '2026-10-21', tMaxC: 36.2, tMinC: 21.5, rainMm: dist.id === 'nashik' ? 30 : 2.4, rainProbPct: 40, windKmh: 14, et0Mm: 4.9 },
    { date: '2026-10-22', tMaxC: 35.1, tMinC: 20.9, rainMm: 0, rainProbPct: 10, windKmh: 12, et0Mm: 4.7 },
  ];

  const recommendedAction =
    dist.riskLevel === 'CRITICAL' || dist.riskLevel === 'HIGH'
      ? `Issue district-wide protective irrigation & anti-transpirant advisory via KVK ${dist.kvkContact}; prioritize field visits for P1 deteriorating parcels.`
      : dist.riskLevel === 'MEDIUM'
        ? `Monitor registered Sentinel-2 parcels every 5 days and verify pending Soil Health Cards before top-dressing.`
        : `Routine 8-day satellite watch; no emergency intervention required.`;

  const rootCause =
    dist.riskLevel === 'CRITICAL' || dist.riskLevel === 'HIGH'
      ? `Cumulative 14-day soil moisture deficit (-64% rainfall anomaly) compounded by high daytime evaporative demand (+3.8 °C temperature anomaly) during reproductive stage.`
      : `Minor localized canopy variability within normal seasonal envelope.`;

  return {
    runId: `run-${dist.id}-20261017`,
    generatedAt: new Date().toISOString(),
    district: dist,
    crop: dist.primaryCrop,
    cropStage: dist.primaryCrop === 'Cotton' ? 'Boll Formation & Peak Flowering' : 'Vegetative / Tillering',
    daysToHarvest: dist.primaryCrop === 'Cotton' ? 42 : 65,
    riskScore: dist.riskScore,
    riskLevel: dist.riskLevel,
    confidence: dist.registeredFarmers > 0 ? 88 : 74,
    priority,
    escalate,
    escalationReason,
    recommendedAction,
    rootCause,
    freshness: {
      overall: (dist.provenance.freshnessDays ?? 2) <= 3 ? 'FRESH' : 'AGING',
      ndviAgeDays: dist.provenance.freshnessDays ?? 2,
      weatherAgeDays: 0,
    },
    weather: {
      rainfall7dMm: dist.id === 'nashik' ? 84.0 : dist.riskScore >= 70 ? 1.8 : 16.4,
      rainfallAnomalyPct: dist.id === 'nashik' ? 115 : dist.riskScore >= 70 ? -68 : -12,
      avgTempC: dist.id === 'yavatmal' ? 39.4 : dist.id === 'sriganganagar' ? 42.1 : 32.6,
      tempAnomalyC: dist.riskScore >= 70 ? 3.8 : 0.9,
      humidityPct: dist.riskScore >= 70 ? 26 : 54,
      provenance: {
        source: 'NASA POWER + Open-Meteo',
        status: 'SIMULATED',
        scale: null,
        observedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        freshnessDays: 0,
        note: null,
      },
    },
    forecast5d,
    weatherAlerts: alerts,
    pest: {
      name: dist.primaryCrop === 'Cotton' ? 'Pink Bollworm / Thrips complex' : 'Stem Borer / Aphids',
      probability: dist.riskScore >= 70 ? 64 : 22,
    },
    reasoningChain: buildDistrictReasoningChain(dist, alerts),
    institutionalBriefing: {
      headline: `${dist.district} (${dist.state}) — ${dist.primaryCrop} Risk ${dist.riskScore}/100 (${dist.riskLevel})`,
      summary: `MODIS 250 m composite indicates a ${dist.ndviAnomalyPct.toFixed(1)}% NDVI anomaly across ${dist.acreageLakh} lakh ha of ${dist.primaryCrop}. ${farmers.length} registered farmer parcels are being tracked at 10 m Sentinel-2 resolution.`,
      actions: [
        `Approve & dispatch regional ${dist.language} SMS advisory to consenting farmers in ${dist.district}.`,
        `Coordinate with KVK (${dist.kvkContact}) to verify nutrient vs moisture stress on flagged parcels.`,
        `Assign field visits for any cases in the Needs Field Support queue within 48 hours.`,
      ],
      insuranceSignal: {
        claimProbability: Math.min(95, Math.max(5, Math.round(dist.riskScore * 0.85))),
        affectedAcreagePct: Math.min(80, Math.max(4, Math.round(Math.abs(dist.ndviAnomalyPct) * 1.8))),
        note: 'Indicative signal only — not a claim decision',
      },
    },
    roles: [
      {
        role: 'AGRICULTURE_DEPARTMENT',
        title: 'Agriculture Department Officer',
        responsibilities: [
          'Review district priority ranking and approve outbound SMS advisories (enforcing separation of duties).',
          'Assign P1/P2 field support tasks and authorize case closure only after human verification.',
        ],
        contact: 'District Superintending Agriculture Officer',
      },
      {
        role: 'EXTENSION_WORKER',
        title: 'Extension Worker (Taluka / Circle)',
        responsibilities: [
          'Register farmer field polygons, walk bund boundaries for verification, and scan Soil Health Cards.',
          'Draft local-language SMS advisories and follow up by phone when delivery or recovery lags.',
        ],
        contact: 'Vikas More (Extension Circle)',
      },
      {
        role: 'KVK',
        title: 'Krishi Vigyan Kendra (KVK) Expert',
        responsibilities: [
          'Validate nutrient deficiency vs pest/water stress diagnostics using Soil Health Card records.',
          'Conduct on-field agronomic visits for P1/P2 escalations and verify crop recovery.',
        ],
        contact: `KVK Helpline: ${dist.kvkContact}`,
      },
      {
        role: 'LOCAL_REPRESENTATIVE',
        title: 'Local Village Representative (Gram Sevak / Sarpanch)',
        responsibilities: [
          'Confirm in-person message reach when SMS delivery fails or farmer handset is unreachable.',
          'Provide ground truth when persistent cloud cover blocks Sentinel-2 follow-up passes.',
        ],
        contact: 'Sanjay Patil (Gram Panchayat)',
      },
    ],
    registeredFarmers: farmers,
    warnings:
      farmers.some((f) => f.field.sizeClass !== 'ADEQUATE')
        ? ['One or more registered parcels in this district are < 0.50 ha; satellite stress readings on small plots have reduced reliability.']
        : [],
    dataSources: [
      dist.provenance,
      {
        source: 'Copernicus Sentinel-2 L2A (10 m)',
        status: 'SIMULATED',
        scale: 'FIELD_SENTINEL2_10M',
        observedAt: '2026-10-17T05:30:00Z',
        fetchedAt: new Date().toISOString(),
        freshnessDays: 1,
        note: 'Registered parcel time series',
      },
      {
        source: 'Open-Meteo + NASA POWER',
        status: 'SIMULATED',
        scale: null,
        observedAt: '2026-10-17T12:00:00Z',
        fetchedAt: new Date().toISOString(),
        freshnessDays: 0,
        note: 'Weather observations & 5-day forecast',
      },
    ],
  };
}

export function buildConsolidatedReport(caseId: string): ConsolidatedReport {
  const isIllustrative = caseId === 'illustrative';
  const targetCaseId = isIllustrative ? 'CASE-0002' : caseId;
  const c = store.cases.find((x) => x.id === targetCaseId) ?? store.cases[0];
  const farmer = store.farmers.find((f) => f.id === c.farmerId) ?? store.farmers[0];
  const dist = getDistrictSummariesFromStore().find((d) => d.id === c.districtId);
  const shc = store.soilCards.find((s) => s.farmerId === farmer.id) ?? null;
  const fu = store.followUps.find((x) => x.caseId === c.id) ?? null;
  const msgs = store.messages.filter((m) => m.caseId === c.id || m.farmerId === farmer.id);
  const tasks = store.fieldSupportTasks.filter((t) => t.caseId === c.id);
  const lastEvent = store.auditEvents[store.auditEvents.length - 1];

  const primaryMsg = msgs[0] ?? null;
  const latestVerification = c.verifications[c.verifications.length - 1] ?? null;
  const primaryTask = tasks[0] ?? null;

  return {
    caseId: isIllustrative ? 'ILLUSTRATIVE-CASE-0002' : c.id,
    generatedAt: new Date().toISOString(),
    isIllustrative,
    sections: [
      {
        key: 'farmer_parcel',
        title: '1. Farmer & Parcel Registration',
        accountableRole: 'Extension Worker',
        rows: [
          { label: 'Farmer Name & ID', value: `${farmer.name} (${farmer.id})`, status: 'MANUAL' },
          { label: 'Village & District', value: `${farmer.village}, ${dist?.district ?? farmer.districtId} (${dist?.state ?? ''})`, status: 'MANUAL' },
          { label: 'Crop & Sowing Date', value: `${farmer.crop} · Sown ${farmer.sowingDate}`, status: 'MANUAL' },
          { label: 'Parcel Area & Resolution', value: `${farmer.field.areaHa} ha (${farmer.field.pixelCount10m} pixels @ 10 m · ${farmer.field.sizeClass})`, status: 'SIMULATED' },
          { label: 'Boundary Verification', value: `${farmer.field.boundaryStatus}${farmer.field.boundaryVerifiedBy ? ` by ${farmer.field.boundaryVerifiedBy}` : ''}`, status: 'MANUAL' },
          { label: 'SMS Consent', value: farmer.consentSms ? `Granted (${farmer.consentAt ?? 'on registration'})` : 'Not granted', status: 'MANUAL' },
        ],
      },
      {
        key: 'district_context',
        title: '2. District Early-Warning Context (250 m MODIS)',
        accountableRole: 'Agriculture Department Officer',
        rows: [
          { label: 'District Risk Score', value: `${dist?.riskScore ?? 87}/100 (${dist?.riskLevel ?? 'CRITICAL'}) · Priority #${dist?.priorityRank ?? 1}`, status: 'SIMULATED' },
          { label: 'MODIS 250 m NDVI Anomaly', value: `${dist?.ndvi ?? 0.49} vs ${dist?.ndviBaseline ?? 0.68} baseline (${dist?.ndviAnomalyPct ?? -27.9}%)`, status: 'SIMULATED' },
          { label: 'Active Weather Alerts', value: `${dist?.weatherAlertCount ?? 2} alert(s) active in district`, status: 'SIMULATED' },
        ],
      },
      {
        key: 'field_detection',
        title: '3. Field-Level Stress Detection (10 m Sentinel-2)',
        accountableRole: 'Crop Risk Analyst (System + KVK)',
        rows: [
          { label: 'Case Opened At', value: `${c.openedAt} (Trigger: ${c.trigger})`, status: 'SIMULATED' },
          { label: 'Field NDVI at Open', value: `${c.stressAtOpen.ndviLatest ?? '—'} vs ${c.stressAtOpen.ndviBaseline ?? '—'} (${c.stressAtOpen.ndviAnomalyPct ?? 0}%)`, status: 'SIMULATED' },
          { label: 'Field NDWI Change', value: `${c.stressAtOpen.ndwiLatest ?? '—'} (Δ ${c.stressAtOpen.ndwiChange ?? 0})`, status: 'SIMULATED' },
          { label: 'Diagnostic Classification', value: `${c.stressAtOpen.stressLevel} · Possible ${c.stressAtOpen.stressType}`, status: 'SIMULATED' },
          { label: 'Signal Reliability', value: `${c.stressAtOpen.reliability} — ${c.stressAtOpen.reliabilityReasons.join('; ')}`, status: 'SIMULATED' },
        ],
      },
      {
        key: 'soil_card',
        title: '4. Soil Health Card Evidence & Safeguards',
        accountableRole: 'Extension Worker & KVK Expert',
        rows: shc
          ? [
              { label: 'Card Number & Status', value: `${shc.cardNumber ?? shc.id} (${shc.status})`, status: shc.extractionMethod === 'MANUAL' ? 'MANUAL' : 'SIMULATED' },
              { label: 'Sample Date & Age', value: `${shc.sampleDate ?? '—'} (${shc.cardAgeYears ?? 0} yrs${shc.ageFlag ? ' · Re-test flagged' : ''})`, status: 'MANUAL' },
              { label: 'Confirmed By', value: shc.confirmedBy ?? 'Pending confirmation', status: 'MANUAL' },
              { label: 'Converted Recommendations', value: shc.recommendations.map((r) => `${r.productLabel}: ${r.bagsPerAcre !== null ? `${r.bagsPerAcre} bags/acre` : `${r.kgPerAcre} kg/acre`}`).join(', '), status: 'MANUAL' },
            ]
          : [
              { label: 'Soil Health Card', value: 'No Soil Health Card linked to this farmer record at time of report', status: null },
            ],
      },
      {
        key: 'approval_gate',
        title: '5. Mandatory Department Approval & Separation of Duties',
        accountableRole: 'Agriculture Department Officer',
        rows: primaryMsg
          ? [
              { label: 'Advisory ID & Kind', value: `${primaryMsg.id} (${primaryMsg.kind})`, status: 'MANUAL' },
              { label: 'Drafted By', value: primaryMsg.generatedBy, status: 'MANUAL' },
              { label: 'Approved By', value: primaryMsg.approvedBy ?? 'Pending approval', status: 'MANUAL' },
              { label: 'Numeric Integrity Check', value: primaryMsg.translation.numbersPreserved ? 'PASSED (all numeric doses preserved in regional script)' : 'BLOCKED', status: 'MANUAL' },
            ]
          : [{ label: 'Approval Gate', value: 'No outbound message drafted yet', status: null }],
      },
      {
        key: 'outreach_lifecycle',
        title: '6. Multilingual SMS Outreach & Reach Verification',
        accountableRole: 'Extension Worker / Local Representative',
        rows: primaryMsg
          ? [
              { label: 'Language & Encoding', value: `${primaryMsg.language} (${primaryMsg.encoding}, ${primaryMsg.charCount} chars, ${primaryMsg.segments} segment)`, status: 'MANUAL' },
              { label: 'English Text', value: primaryMsg.textEnglish, status: 'MANUAL' },
              { label: 'Regional SMS Text', value: primaryMsg.textLocal, status: 'MANUAL' },
              { label: 'Lifecycle Status', value: `${primaryMsg.status} (Sent ≠ Delivered ≠ Acknowledged)`, status: 'SIMULATED' },
            ]
          : [{ label: 'Outreach Status', value: 'No SMS sent', status: null }],
      },
      {
        key: 'satellite_followup',
        title: '7. 21-Day Satellite Follow-Up Trajectory (Sentinel-2 10 m)',
        accountableRole: 'Field Monitor Agent',
        rows: fu
          ? [
              { label: 'Monitoring Window', value: `Day ${fu.dayNumber} of ${fu.windowDays}${fu.extendedOnce ? ' (extended +7d for cloud cover)' : ''}`, status: 'SIMULATED' },
              { label: 'NDVI Change (ΔNDVI)', value: `Baseline ${fu.baselineNdvi ?? '—'} → Latest ${fu.latestNdvi ?? '—'} (Δ ${fu.deltaNdvi ?? '—'}, slope ${fu.slopePerDay ?? '—'}/day)`, status: 'SIMULATED' },
              { label: 'Follow-Up Outcome', value: `${fu.outcome} — ${fu.outcomeReason}`, status: 'SIMULATED' },
            ]
          : [{ label: 'Follow-Up Status', value: '21-day follow-up not yet started', status: null }],
      },
      {
        key: 'field_support',
        title: '8. Ground Field Support & Human Verification',
        accountableRole: 'KVK Agronomist / Local Representative',
        rows: [
          {
            label: 'Field Support Queue',
            value: primaryTask
              ? `${primaryTask.id} (${primaryTask.priority} · ${primaryTask.status}) — Assigned to ${primaryTask.assignedTo ?? 'Unassigned'}`
              : 'No field support escalation required',
            status: primaryTask ? 'MANUAL' : null,
          },
          {
            label: 'Field Visit Findings',
            value: primaryTask?.visit
              ? `${primaryTask.visit.visitedBy} (${primaryTask.visit.visitedAt}): ${primaryTask.visit.findings} — Action: ${primaryTask.visit.actionTaken}`
              : 'No physical visit logged yet',
            status: primaryTask?.visit ? 'MANUAL' : null,
          },
          {
            label: 'Human Verification Record',
            value: latestVerification
              ? `${latestVerification.method} by ${latestVerification.verifiedBy} (${latestVerification.role}): ${latestVerification.outcome} — "${latestVerification.observation}"`
              : 'Awaiting human verification before case can be closed',
            status: latestVerification ? 'MANUAL' : null,
          },
        ],
      },
      {
        key: 'case_resolution',
        title: '9. Case Resolution & Accountability Sign-Off',
        accountableRole: 'Agriculture Department Officer',
        rows: [
          { label: 'Current Case Status', value: c.status, status: 'MANUAL' },
          { label: 'Closed By & Timestamp', value: c.closedBy ? `${c.closedBy} at ${c.closedAt}` : 'Open — follow-up never auto-closes without human verification', status: 'MANUAL' },
          { label: 'Closure Rationale', value: c.closeReason ?? 'Pending verified recovery or field resolution', status: 'MANUAL' },
        ],
      },
    ],
    integrity: {
      eventCount: store.auditEvents.length,
      chainValid: true,
      lastHash: lastEvent ? lastEvent.hash : '0000000000000000',
    },
  };
}

export function buildFarmerDetailFromStore(farmerId: string) {
  const farmer = store.farmers.find((f) => f.id === farmerId);
  if (!farmer) throw new Error(`Farmer ${farmerId} not found`);
  const observations = store.observationsByFarmer[farmer.id] ?? [];
  const soilCard = store.soilCards.find((s) => s.farmerId === farmer.id) ?? null;
  const messages = store.messages.filter((m) => m.farmerId === farmer.id);
  const openCase = store.cases.find((c) => c.id === farmer.openCaseId) ?? store.cases.find((c) => c.farmerId === farmer.id) ?? null;
  const followUp = openCase ? store.followUps.find((fu) => fu.caseId === openCase.id) ?? null : null;
  const auditEvents = store.auditEvents.filter((e) => e.farmerId === farmer.id || (openCase && e.caseId === openCase.id));
  return {
    ...farmer,
    observations,
    reasoningChain: buildFarmerReasoningChain(farmer, soilCard),
    soilCard,
    messages,
    openCase,
    followUp,
    auditEvents: [...auditEvents].reverse(),
  };
}
