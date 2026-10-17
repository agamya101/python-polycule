import type {
  AcknowledgeBody,
  AdvisoryGenerate,
  AssignBody,
  AuditEvent,
  AuditLayer,
  BoundaryVerifyBody,
  Case,
  CaseDetail,
  CaseStatus,
  ChainVerifyResponse,
  ConsolidatedReport,
  DataSourceStatus,
  DistrictReport,
  DistrictsResponse,
  Farmer,
  FarmerCreate,
  FarmerDetail,
  FastForwardBody,
  FieldSupportTask,
  FollowUp,
  Language,
  MessageKind,
  MessagePatch,
  MessageStatus,
  OutboundMessage,
  OverviewResponse,
  ReasonBody,
  Role,
  SoilCard,
  SoilCardManualCreate,
  SoilCardPatch,
  StateSummary,
  TaskStatus,
  VerifyBody,
  VisitBody,
  WeatherAlert,
} from '@/api/contract';
import { checkPermission, type ActionKey } from '@/auth/permissions';
import { maskPhone } from '@/lib/format';
import { areaHa, centroid, pixelCount10m, sizeClass } from '@/lib/geo';
import { computeSmsMeta } from '@/lib/sms';
import {
  buildSoilCardSmsEnglish,
  computeFertilizerRec,
  evaluateSoilParam,
  SOIL_PARAM_SPECS,
} from '@/lib/soil';
import { buildObservationsForPattern, computeHash } from './data';
import {
  appendAuditEvent,
  buildConsolidatedReport,
  buildDistrictReportFromStore,
  buildFarmerDetailFromStore,
  getDistrictSummariesFromStore,
  store,
  translateEnglishToLocal,
} from './store';

export class MockApiError extends Error {
  code: string;
  detail: string;
  status: number;
  constructor(code: string, detail: string, status = 400) {
    super(detail);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export interface ActorHeaders {
  actor: string;
  role: Role;
}

const LATENCY_MS = 300;
function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requirePerm(
  headers: ActorHeaders,
  action: ActionKey,
  opts?: { generatedBy?: string | null; latestVerifiedBy?: string | null },
) {
  const res = checkPermission(headers.role, action, {
    actor: headers.actor,
    generatedBy: opts?.generatedBy,
    latestVerifiedBy: opts?.latestVerifiedBy,
  });
  if (!res.allowed) {
    throw new MockApiError('FORBIDDEN', res.reason ?? 'Permission denied', 403);
  }
}

export async function mockGetHealth(): Promise<{ status: 'ok' }> {
  await delay(50);
  return { status: 'ok' };
}

export async function mockGetDataSources(): Promise<DataSourceStatus[]> {
  await delay();
  return [...store.dataSources];
}

export async function mockGetDistricts(): Promise<DistrictsResponse> {
  await delay();
  const districts = getDistrictSummariesFromStore();
  const stateMap = new Map<string, { risks: number[]; critical: number; high: number }>();
  for (const d of districts) {
    const entry = stateMap.get(d.state) ?? { risks: [], critical: 0, high: 0 };
    entry.risks.push(d.riskScore);
    if (d.riskLevel === 'CRITICAL') entry.critical += 1;
    if (d.riskLevel === 'HIGH') entry.high += 1;
    stateMap.set(d.state, entry);
  }
  const states: StateSummary[] = [...stateMap.entries()].map(([state, info]) => ({
    state,
    avgRisk: Math.round((info.risks.reduce((a, b) => a + b, 0) / info.risks.length) * 10) / 10,
    districtCount: info.risks.length,
    criticalDistricts: info.critical,
    highDistricts: info.high,
  }));

  const pendingApprovals = store.messages.filter((m) => m.status === 'PENDING_APPROVAL').length;
  const needsFieldSupport = store.fieldSupportTasks.filter(
    (t) => t.status === 'OPEN' || t.status === 'ASSIGNED',
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      districtsMonitored: districts.length,
      activeAlerts: store.weatherAlerts.length,
      criticalDistricts: districts.filter((d) => d.riskLevel === 'CRITICAL').length,
      registeredFarmers: store.farmers.length,
      needsFieldSupport,
      pendingApprovals,
    },
    states,
    districts,
  };
}

export async function mockGetOverview(): Promise<OverviewResponse> {
  await delay();
  const districts = getDistrictSummariesFromStore();
  const pendingApprovals = store.messages.filter((m) => m.status === 'PENDING_APPROVAL').length;
  const needsFieldSupport = store.fieldSupportTasks.filter(
    (t) => t.status === 'OPEN' || t.status === 'ASSIGNED',
  ).length;
  const monitoringCases = store.cases.filter((c) => c.status !== 'CLOSED').length;

  const sentOrBeyond = store.messages.filter(
    (m) => m.status === 'SENT' || m.status === 'DELIVERED' || m.status === 'ACKNOWLEDGED',
  ).length;
  const ackCount = store.messages.filter((m) => m.status === 'ACKNOWLEDGED').length;
  const acknowledgedRatePct =
    sentOrBeyond > 0 ? Math.round((ackCount / sentOrBeyond) * 1000) / 10 : null;

  const funnel = {
    generated: store.messages.length,
    pendingApproval: store.messages.filter((m) => m.status === 'PENDING_APPROVAL').length,
    approved: store.messages.filter(
      (m) =>
        m.status === 'APPROVED' ||
        m.status === 'QUEUED' ||
        m.status === 'SENT' ||
        m.status === 'DELIVERED' ||
        m.status === 'ACKNOWLEDGED',
    ).length,
    sent: sentOrBeyond,
    delivered: store.messages.filter(
      (m) => m.status === 'DELIVERED' || m.status === 'ACKNOWLEDGED',
    ).length,
    acknowledged: ackCount,
    failed: store.messages.filter((m) => m.status === 'FAILED').length,
    rejected: store.messages.filter((m) => m.status === 'REJECTED').length,
  };

  const outcomes = {
    pending: store.followUps.filter((f) => f.outcome === 'PENDING').length,
    recovering: store.followUps.filter((f) => f.outcome === 'RECOVERING').length,
    notRecovering: store.followUps.filter((f) => f.outcome === 'NOT_RECOVERING').length,
    deteriorating: store.followUps.filter((f) => f.outcome === 'DETERIORATING').length,
    insufficientData: store.followUps.filter((f) => f.outcome === 'INSUFFICIENT_DATA').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      districtsMonitored: districts.length,
      activeAlerts: store.weatherAlerts.length,
      criticalDistricts: districts.filter((d) => d.riskLevel === 'CRITICAL').length,
      registeredFarmers: store.farmers.length,
      pendingApprovals,
      needsFieldSupport,
      monitoringCases,
      acknowledgedRatePct,
    },
    outreachFunnel: funnel,
    followUpOutcomes: outcomes,
    topDistricts: districts.slice(0, 5),
    weatherAlerts: [...store.weatherAlerts],
    recentEvents: [...store.auditEvents].slice(-10).reverse(),
  };
}

export async function mockGetDistrictReport(
  id: string,
  refresh = false,
  headers?: ActorHeaders,
): Promise<DistrictReport> {
  await delay();
  const report = buildDistrictReportFromStore(id);
  if (refresh && headers) {
    appendAuditEvent({
      layer: 'ANALYSIS',
      action: 'DISTRICT_REPORT_REFRESHED',
      actor: headers.actor,
      role: headers.role,
      districtId: id,
      entityType: 'DistrictReport',
      entityId: id,
      summary: `Refreshed district early-warning report for ${report.district.district}`,
      isSimulated: true,
    });
  }
  return report;
}

export async function mockRunPriorityScan(headers: ActorHeaders): Promise<{ runId: string }> {
  await delay(150);
  requirePerm(headers, 'scan.run');
  const runId = `scan-${Date.now()}`;
  appendAuditEvent({
    layer: 'ANALYSIS',
    action: 'PRIORITY_SCAN_STARTED',
    actor: headers.actor,
    role: headers.role,
    entityType: 'ScanRun',
    entityId: runId,
    summary: `Initiated multi-agent priority scan across 25 districts (${runId})`,
    isSimulated: true,
  });
  return { runId };
}

export async function mockGetWeatherAlerts(districtId?: string): Promise<WeatherAlert[]> {
  await delay();
  if (districtId) {
    return store.weatherAlerts.filter((a) => a.districtId === districtId);
  }
  return [...store.weatherAlerts];
}

export async function mockGetFarmers(districtId?: string, q?: string): Promise<Farmer[]> {
  await delay();
  let list = [...store.farmers];
  if (districtId) {
    list = list.filter((f) => f.districtId === districtId);
  }
  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    list = list.filter(
      (f) =>
        f.name.toLowerCase().includes(query) ||
        f.id.toLowerCase().includes(query) ||
        f.village.toLowerCase().includes(query) ||
        f.crop.toLowerCase().includes(query),
    );
  }
  return list;
}

export async function mockCreateFarmer(
  body: FarmerCreate,
  headers: ActorHeaders,
): Promise<Farmer> {
  await delay();
  requirePerm(headers, 'farmer.register');
  if (!body.name.trim() || !body.village.trim()) {
    throw new MockApiError('VALIDATION_ERROR', 'Name and village are required', 422);
  }
  const ring = body.polygon.coordinates[0] ?? [];
  if (ring.length < 4) {
    throw new MockApiError('INVALID_POLYGON', 'Field polygon requires at least 3 vertices', 422);
  }

  const nextNum = store.farmers.length + 1;
  const id = `FRM-${String(nextNum).padStart(4, '0')}`;
  const ha = areaHa(body.polygon);
  const sc = sizeClass(ha);
  const px = pixelCount10m(ha);
  const c = centroid(body.polygon);
  const now = new Date().toISOString();

  const reliability =
    sc === 'TOO_SMALL' ? 'INSUFFICIENT' : sc === 'SMALL' ? 'LOW' : 'MEDIUM';
  const reliabilityReasons =
    sc === 'TOO_SMALL'
      ? [`Parcel is ${ha} ha (~${px} pixels) — under 0.10 ha minimum for satellite monitoring`]
      : sc === 'SMALL'
        ? [`Small parcel (${ha} ha, ~${px} pixels < 0.50 ha) — mixed border pixels; boundary unverified`]
        : [`Adequate parcel size (${ha} ha, ~${px} pixels); awaiting worker boundary verification`];

  const farmer: Farmer = {
    id,
    name: body.name.trim(),
    phoneMasked: maskPhone(body.phone),
    language: body.language,
    village: body.village.trim(),
    districtId: body.districtId,
    crop: body.crop,
    sowingDate: body.sowingDate,
    consentSms: body.consentSms,
    consentAt: body.consentSms ? now : null,
    registeredBy: headers.actor,
    createdAt: now,
    field: {
      polygon: body.polygon,
      centroid: c,
      areaHa: ha,
      pixelCount10m: px,
      sizeClass: sc,
      boundaryStatus: 'UNVERIFIED',
      boundaryNote: null,
      boundaryVerifiedBy: null,
      boundaryVerifiedAt: null,
    },
    latestStress: {
      asOf: now,
      ndviLatest: sc === 'TOO_SMALL' ? null : 0.64,
      ndviBaseline: 0.66,
      baselineMethod: 'CROP_DEFAULT',
      ndviAnomalyPct: sc === 'TOO_SMALL' ? null : -3.0,
      ndwiLatest: sc === 'TOO_SMALL' ? null : 0.28,
      ndwiBaseline: 0.29,
      ndwiChange: sc === 'TOO_SMALL' ? null : -0.01,
      stressLevel: 'LOW',
      stressType: sc === 'TOO_SMALL' ? 'UNKNOWN' : 'NONE',
      reliability,
      reliabilityReasons,
      provenance: {
        source: 'Copernicus Sentinel-2 L2A (10 m)',
        status: 'SIMULATED',
        scale: 'FIELD_SENTINEL2_10M',
        observedAt: now,
        fetchedAt: now,
        freshnessDays: 1,
        note: 'Initial parcel pass on registration',
      },
    },
    soilCardId: null,
    openCaseId: null,
    isDemo: true,
  };

  store.farmers.push(farmer);
  store.observationsByFarmer[id] = buildObservationsForPattern(
    sc === 'TOO_SMALL' ? 'TOO_SMALL_NOISY' : 'HEALTHY',
  );

  appendAuditEvent({
    layer: 'DATA_PROVENANCE',
    action: 'FARMER_REGISTERED',
    actor: headers.actor,
    role: headers.role,
    farmerId: id,
    districtId: body.districtId,
    entityType: 'Farmer',
    entityId: id,
    summary: `Registered farmer ${farmer.name} (${id}) in ${farmer.village} (${ha} ha ${farmer.crop}, ${sc})`,
    isSimulated: false,
  });

  return farmer;
}

export async function mockGetFarmerDetail(id: string): Promise<FarmerDetail> {
  await delay();
  return buildFarmerDetailFromStore(id);
}

export async function mockAnalyzeFarmer(
  id: string,
  headers: ActorHeaders,
): Promise<FarmerDetail> {
  await delay();
  requirePerm(headers, 'farmer.analyze');
  const farmer = store.farmers.find((f) => f.id === id);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${id} not found`, 404);
  if (farmer.latestStress) {
    farmer.latestStress.asOf = new Date().toISOString();
    farmer.latestStress.provenance.fetchedAt = new Date().toISOString();
  }
  appendAuditEvent({
    layer: 'ANALYSIS',
    action: 'FARMER_FIELD_ANALYZED',
    actor: headers.actor,
    role: headers.role,
    farmerId: id,
    districtId: farmer.districtId,
    caseId: farmer.openCaseId,
    entityType: 'Farmer',
    entityId: id,
    summary: `Re-ran Sentinel-2 10 m field stress & Soil Health Card reasoning for ${farmer.name} (${id})`,
    isSimulated: true,
  });
  return buildFarmerDetailFromStore(id);
}

export async function mockVerifyBoundary(
  id: string,
  body: BoundaryVerifyBody,
  headers: ActorHeaders,
): Promise<Farmer> {
  await delay();
  requirePerm(headers, 'boundary.verify');
  const farmer = store.farmers.find((f) => f.id === id);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${id} not found`, 404);
  if (!body.note.trim()) {
    throw new MockApiError('NOTE_REQUIRED', 'Verification note is required', 422);
  }

  const poly = body.polygon ?? farmer.field.polygon;
  const ha = areaHa(poly);
  const sc = sizeClass(ha);
  const px = pixelCount10m(ha);
  const c = centroid(poly);
  const now = new Date().toISOString();

  farmer.field = {
    polygon: poly,
    centroid: c,
    areaHa: ha,
    pixelCount10m: px,
    sizeClass: sc,
    boundaryStatus: body.status,
    boundaryNote: body.note.trim(),
    boundaryVerifiedBy: headers.actor,
    boundaryVerifiedAt: now,
  };

  if (farmer.latestStress) {
    if (sc === 'TOO_SMALL') {
      farmer.latestStress.reliability = 'INSUFFICIENT';
      farmer.latestStress.reliabilityReasons = [
        `Parcel is ${ha} ha (~${px} pixels) — below 0.10 ha minimum for satellite monitoring`,
      ];
    } else if (body.status === 'DISPUTED' || sc === 'SMALL') {
      farmer.latestStress.reliability = 'LOW';
      farmer.latestStress.reliabilityReasons = [
        body.status === 'DISPUTED'
          ? `Boundary marked DISPUTED (${body.note.trim()})`
          : `Small parcel (${ha} ha, ~${px} pixels < 0.50 ha)`,
      ];
    } else {
      farmer.latestStress.reliability = 'HIGH';
      farmer.latestStress.reliabilityReasons = [
        `Adequate parcel (${ha} ha, ~${px} Sentinel-2 pixels)`,
        `Worker-verified boundary (${headers.actor})`,
      ];
    }
  }

  appendAuditEvent({
    layer: 'HUMAN_VERIFICATION',
    action: 'BOUNDARY_VERIFIED',
    actor: headers.actor,
    role: headers.role,
    farmerId: id,
    districtId: farmer.districtId,
    caseId: farmer.openCaseId,
    entityType: 'Farmer',
    entityId: id,
    summary: `Marked parcel boundary for ${farmer.name} (${id}) as ${body.status} (${ha} ha): "${body.note.trim()}"`,
    isSimulated: false,
  });

  return farmer;
}

export async function mockGetSoilCards(farmerId?: string): Promise<SoilCard[]> {
  await delay();
  if (farmerId) {
    return store.soilCards.filter((s) => s.farmerId === farmerId);
  }
  return [...store.soilCards];
}

export async function mockGetSoilCard(id: string): Promise<SoilCard> {
  await delay();
  const card = store.soilCards.find((s) => s.id === id);
  if (!card) throw new MockApiError('NOT_FOUND', `Soil card ${id} not found`, 404);
  return card;
}

function computeCardAge(sampleDate: string | null): { years: number | null; ageFlag: boolean } {
  if (!sampleDate) return { years: null, ageFlag: false };
  const sampleMs = Date.parse(sampleDate);
  if (Number.isNaN(sampleMs)) return { years: null, ageFlag: false };
  const diffYears = Math.round(((Date.now() - sampleMs) / (365.25 * 86400 * 1000)) * 10) / 10;
  return { years: Math.max(0, diffYears), ageFlag: diffYears > 2.0 };
}

export async function mockCreateSoilCardOcr(
  farmerId: string,
  imageName: string,
  headers: ActorHeaders,
): Promise<SoilCard> {
  await delay(500);
  requirePerm(headers, 'soil.create');
  const farmer = store.farmers.find((f) => f.id === farmerId);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${farmerId} not found`, 404);

  const id = `SHC-${String(store.soilCards.length + 1).padStart(4, '0')}`;
  const sampleDate = '2024-04-15';
  const { years, ageFlag } = computeCardAge(sampleDate);

  const params = [
    evaluateSoilParam('pH', 74, '–', '74', 0.86, false), // intentional decimal shift for OCR review safeguard demo
    evaluateSoilParam('EC', 0.44, 'dS/m', '0.44', 0.94, true),
    evaluateSoilParam('OC', 0.46, '%', '0.46', 0.92, true),
    evaluateSoilParam('N', 210, 'kg/ha', '210', 0.95, true),
    evaluateSoilParam('P', 32, 'kg/ha P2O5', '32 P2O5', 0.89, false),
    evaluateSoilParam('K', 285, 'kg/ha', '285', 0.94, true),
    evaluateSoilParam('S', 9.2, 'ppm', '9.2', 0.91, true),
    evaluateSoilParam('Zn', 0.52, 'ppm', '0.52', 0.72, false),
    evaluateSoilParam('Fe', 5.8, 'ppm', '5.8', 0.93, true),
    evaluateSoilParam('Cu', 0.8, 'ppm', '0.8', 0.92, true),
    evaluateSoilParam('Mn', 4.0, 'ppm', '4.0', 0.91, true),
    evaluateSoilParam('B', 0.58, 'ppm', '0.58', 0.90, true),
  ];

  const recs = [
    computeFertilizerRec(
      {
        product: 'Urea',
        productLabel: 'Urea',
        cardDose: 240,
        cardDoseUnit: 'kg/ha',
        timing: 'Split in 3 equal doses',
        sourceText: 'Urea @ 240 kg/ha',
      },
      farmer.field.areaHa,
    ),
    computeFertilizerRec(
      {
        product: 'DAP',
        productLabel: 'DAP',
        cardDose: 100,
        cardDoseUnit: 'kg/ha',
        timing: 'Basal at sowing',
        sourceText: 'DAP @ 100 kg/ha',
      },
      farmer.field.areaHa,
    ),
  ];

  const card: SoilCard = {
    id,
    farmerId,
    cardNumber: `${farmer.districtId.slice(0, 3).toUpperCase()}-2024-${1000 + store.soilCards.length}`,
    sampleDate,
    labName: `District Soil Testing Lab (${imageName || 'Scanned Card'})`,
    imageUrl: null,
    status: 'NEEDS_REVIEW',
    params,
    recommendations: recs,
    cardAgeYears: years,
    ageFlag,
    extractionMethod: 'GEMINI_OCR',
    createdBy: headers.actor,
    confirmedBy: null,
    messageId: null,
    createdAt: new Date().toISOString(),
  };

  store.soilCards.push(card);
  farmer.soilCardId = id;

  appendAuditEvent({
    layer: 'DATA_PROVENANCE',
    action: 'SOIL_OCR_EXTRACTED',
    actor: headers.actor,
    role: headers.role,
    farmerId,
    districtId: farmer.districtId,
    entityType: 'SoilCard',
    entityId: id,
    summary: `Extracted Soil Health Card ${id} via Gemini OCR for ${farmer.name} (NEEDS_REVIEW safeguards triggered)`,
    isSimulated: true,
  });

  return card;
}

export async function mockCreateSoilCardManual(
  body: SoilCardManualCreate,
  headers: ActorHeaders,
): Promise<SoilCard> {
  await delay();
  requirePerm(headers, 'soil.create');
  const farmer = store.farmers.find((f) => f.id === body.farmerId);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${body.farmerId} not found`, 404);

  const id = `SHC-${String(store.soilCards.length + 1).padStart(4, '0')}`;
  const { years, ageFlag } = computeCardAge(body.sampleDate);

  const params = SOIL_PARAM_SPECS.map((spec) => {
    const found = body.params.find((p) => p.param === spec.param);
    const val = found ? found.value : null;
    const unit = found ? found.unit : spec.defaultUnit;
    return evaluateSoilParam(spec.param, val, unit, null, null, val !== null);
  });

  const recs = body.recommendations.map((r) => computeFertilizerRec(r, farmer.field.areaHa));

  const card: SoilCard = {
    id,
    farmerId: body.farmerId,
    cardNumber: body.cardNumber || `MAN-2026-${100 + store.soilCards.length}`,
    sampleDate: body.sampleDate,
    labName: body.labName || 'Manual Extension Entry',
    imageUrl: null,
    status: 'NEEDS_REVIEW',
    params,
    recommendations: recs,
    cardAgeYears: years,
    ageFlag,
    extractionMethod: 'MANUAL',
    createdBy: headers.actor,
    confirmedBy: null,
    messageId: null,
    createdAt: new Date().toISOString(),
  };

  store.soilCards.push(card);
  farmer.soilCardId = id;

  appendAuditEvent({
    layer: 'DATA_PROVENANCE',
    action: 'SOIL_MANUAL_CREATED',
    actor: headers.actor,
    role: headers.role,
    farmerId: body.farmerId,
    districtId: farmer.districtId,
    entityType: 'SoilCard',
    entityId: id,
    summary: `Created manual Soil Health Card ${id} for ${farmer.name}`,
    isSimulated: false,
  });

  return card;
}

export async function mockPatchSoilCard(
  id: string,
  body: SoilCardPatch,
  headers: ActorHeaders,
): Promise<SoilCard> {
  await delay();
  requirePerm(headers, 'soil.edit');
  const card = store.soilCards.find((s) => s.id === id);
  if (!card) throw new MockApiError('NOT_FOUND', `Soil card ${id} not found`, 404);
  const farmer = store.farmers.find((f) => f.id === card.farmerId);
  const area = farmer ? farmer.field.areaHa : 1.0;

  if (body.cardNumber !== undefined) card.cardNumber = body.cardNumber;
  if (body.sampleDate !== undefined) {
    card.sampleDate = body.sampleDate;
    const { years, ageFlag } = computeCardAge(body.sampleDate);
    card.cardAgeYears = years;
    card.ageFlag = ageFlag;
  }
  if (body.labName !== undefined) card.labName = body.labName;

  if (body.params) {
    card.params = card.params.map((existing) => {
      const patchItem = body.params?.find((p) => p.param === existing.param);
      if (!patchItem) return existing;
      return evaluateSoilParam(
        existing.param,
        patchItem.value,
        patchItem.unit,
        existing.ocrRaw,
        existing.ocrConfidence,
        patchItem.confirmed,
      );
    });
  }

  if (body.recommendations) {
    card.recommendations = body.recommendations.map((r) => computeFertilizerRec(r, area));
  }

  appendAuditEvent({
    layer: 'HUMAN_VERIFICATION',
    action: 'SOIL_CARD_EDITED',
    actor: headers.actor,
    role: headers.role,
    farmerId: card.farmerId,
    districtId: farmer?.districtId ?? null,
    entityType: 'SoilCard',
    entityId: id,
    summary: `Updated parameters/recommendations on Soil Health Card ${card.cardNumber ?? id}`,
    isSimulated: false,
  });

  return card;
}

export async function mockConfirmSoilCard(
  id: string,
  headers: ActorHeaders,
): Promise<SoilCard> {
  await delay();
  requirePerm(headers, 'soil.confirm');
  const card = store.soilCards.find((s) => s.id === id);
  if (!card) throw new MockApiError('NOT_FOUND', `Soil card ${id} not found`, 404);

  const hasBlockingFlag = card.params.some((p) => p.flags.some((f) => f.blocking));
  const hasUnconfirmed = card.params.some((p) => !p.confirmed);

  if (hasBlockingFlag || hasUnconfirmed) {
    throw new MockApiError(
      'BLOCKING_FLAGS',
      'Cannot confirm Soil Health Card while blocking flags remain or parameters are unconfirmed.',
      409,
    );
  }

  card.status = 'CONFIRMED';
  card.confirmedBy = headers.actor;
  const farmer = store.farmers.find((f) => f.id === card.farmerId);

  appendAuditEvent({
    layer: 'HUMAN_VERIFICATION',
    action: 'SOIL_CARD_CONFIRMED',
    actor: headers.actor,
    role: headers.role,
    farmerId: card.farmerId,
    districtId: farmer?.districtId ?? null,
    entityType: 'SoilCard',
    entityId: id,
    summary: `Confirmed all 12 soil parameters and unit conversions on ${card.cardNumber ?? id}`,
    isSimulated: false,
  });

  return card;
}

export async function mockGenerateSoilCardSms(
  id: string,
  language: Language,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'soil.generateSms');
  const card = store.soilCards.find((s) => s.id === id);
  if (!card) throw new MockApiError('NOT_FOUND', `Soil card ${id} not found`, 404);
  if (card.status === 'NEEDS_REVIEW') {
    throw new MockApiError('CARD_NOT_CONFIRMED', 'Confirm the Soil Health Card before generating SMS.', 409);
  }

  const farmer = store.farmers.find((f) => f.id === card.farmerId);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${card.farmerId} not found`, 404);
  const dist = getDistrictSummariesFromStore().find((d) => d.id === farmer.districtId);

  const textEnglish = buildSoilCardSmsEnglish(
    card.cardNumber,
    card.sampleDate,
    card.params,
    card.recommendations,
    dist?.kvkContact ?? '1800-180-1551',
    dist?.district ?? farmer.districtId,
  );
  const textLocal = translateEnglishToLocal(textEnglish, language);
  const meta = computeSmsMeta(textEnglish, textLocal);
  const msgId = `MSG-${String(store.messages.length + 1).padStart(4, '0')}`;
  const now = new Date().toISOString();

  const msg: OutboundMessage = {
    id: msgId,
    kind: 'SOIL_CARD',
    parentId: null,
    caseId: farmer.openCaseId,
    farmerId: farmer.id,
    soilCardId: card.id,
    districtId: farmer.districtId,
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
    status: 'GENERATED',
    statusHistory: [
      { status: 'GENERATED', at: now, actor: headers.actor, role: headers.role, note: `Generated from Soil Health Card ${card.cardNumber ?? card.id}` },
    ],
    recipientCount: 1,
    deliveryStats: null,
    generatedBy: headers.actor,
    approvedBy: null,
    rejectedReason: null,
    provider: 'MOCK',
    providerMessageId: null,
    createdAt: now,
  };

  store.messages.push(msg);
  card.messageId = msgId;

  appendAuditEvent({
    layer: 'OUTREACH',
    action: 'SOIL_SMS_GENERATED',
    actor: headers.actor,
    role: headers.role,
    farmerId: farmer.id,
    districtId: farmer.districtId,
    entityType: 'OutboundMessage',
    entityId: msgId,
    summary: `Generated ${language} Soil Health Card SMS ${msgId} for ${farmer.name} (${card.cardNumber ?? card.id})`,
    isSimulated: false,
  });

  return msg;
}

export async function mockGenerateAdvisory(
  body: AdvisoryGenerate,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'message.generate');
  const districts = getDistrictSummariesFromStore();
  const now = new Date().toISOString();
  const msgId = `MSG-${String(store.messages.length + 1).padStart(4, '0')}`;

  if (body.kind === 'DISTRICT_ADVISORY') {
    const dist = districts.find((d) => d.id === body.districtId) ?? districts[0];
    const alerts = store.weatherAlerts.filter((a) => a.districtId === dist.id);
    const topAlert = alerts.length > 0 ? alerts[0].title : 'None';
    const smsAction =
      dist.riskLevel === 'CRITICAL' || dist.riskLevel === 'HIGH'
        ? 'Inspect your field today; irrigate if soil is dry; do not spray without KVK advice.'
        : dist.riskLevel === 'MEDIUM'
          ? 'Check your crop closely this week.'
          : 'No action needed now.';

    const textEnglish = `${dist.district}: ${dist.primaryCrop} crop stress risk is ${dist.riskLevel}. ${smsAction} Weather: ${topAlert}. KVK: ${dist.kvkContact}. -Agri Dept`;
    const textLocal = translateEnglishToLocal(textEnglish, body.language);
    const meta = computeSmsMeta(textEnglish, textLocal);
    const consentingCount = Math.max(
      1,
      store.farmers.filter((f) => f.districtId === dist.id && f.consentSms).length,
    );

    const msg: OutboundMessage = {
      id: msgId,
      kind: 'DISTRICT_ADVISORY',
      parentId: null,
      caseId: null,
      farmerId: null,
      soilCardId: null,
      districtId: dist.id,
      language: body.language,
      textEnglish,
      textLocal,
      charCount: meta.charCount,
      segments: meta.segments,
      encoding: meta.encoding,
      translation: {
        method: body.language === 'English' ? 'NONE' : 'TEMPLATE',
        numbersPreserved: meta.numbersPreserved,
        warning: meta.warning,
      },
      status: 'GENERATED',
      statusHistory: [
        { status: 'GENERATED', at: now, actor: headers.actor, role: headers.role, note: `District broadcast drafted for ${dist.district}` },
      ],
      recipientCount: consentingCount,
      deliveryStats: null,
      generatedBy: headers.actor,
      approvedBy: null,
      rejectedReason: null,
      provider: 'MOCK',
      providerMessageId: null,
      createdAt: now,
    };

    store.messages.push(msg);
    appendAuditEvent({
      layer: 'OUTREACH',
      action: 'ADVISORY_GENERATED',
      actor: headers.actor,
      role: headers.role,
      districtId: dist.id,
      entityType: 'OutboundMessage',
      entityId: msgId,
      summary: `Generated ${body.language} district advisory ${msgId} for ${dist.district} (${consentingCount} consenting farmers)`,
      isSimulated: false,
    });
    return msg;
  }

  if (body.kind === 'FOLLOWUP_REMINDER') {
    const c =
      store.cases.find((x) => x.id === body.caseId) ??
      store.cases.find((x) => x.farmerId === body.farmerId) ??
      store.cases[0];
    const farmer = store.farmers.find((f) => f.id === c.farmerId) ?? store.farmers[0];
    const dist = districts.find((d) => d.id === farmer.districtId) ?? districts[0];
    const prevDate = c.openedAt.slice(0, 10);

    const textEnglish = `Reminder: your ${farmer.crop} field still shows stress since our message on ${prevDate}. Please inspect it and call KVK ${dist.kvkContact}. Reply 1 if you have taken action. -Agri Dept`;
    const textLocal = translateEnglishToLocal(textEnglish, body.language);
    const meta = computeSmsMeta(textEnglish, textLocal);

    const msg: OutboundMessage = {
      id: msgId,
      kind: 'FOLLOWUP_REMINDER',
      parentId: c.lastMessageId,
      caseId: c.id,
      farmerId: farmer.id,
      soilCardId: null,
      districtId: farmer.districtId,
      language: body.language,
      textEnglish,
      textLocal,
      charCount: meta.charCount,
      segments: meta.segments,
      encoding: meta.encoding,
      translation: {
        method: body.language === 'English' ? 'NONE' : 'TEMPLATE',
        numbersPreserved: meta.numbersPreserved,
        warning: meta.warning,
      },
      status: 'GENERATED',
      statusHistory: [
        { status: 'GENERATED', at: now, actor: headers.actor, role: headers.role, note: `Follow-up reminder drafted for ${c.id}` },
      ],
      recipientCount: 1,
      deliveryStats: null,
      generatedBy: headers.actor,
      approvedBy: null,
      rejectedReason: null,
      provider: 'MOCK',
      providerMessageId: null,
      createdAt: now,
    };

    store.messages.push(msg);
    c.lastMessageId = msgId;

    appendAuditEvent({
      layer: 'OUTREACH',
      action: 'REMINDER_GENERATED',
      actor: headers.actor,
      role: headers.role,
      caseId: c.id,
      farmerId: farmer.id,
      districtId: farmer.districtId,
      entityType: 'OutboundMessage',
      entityId: msgId,
      summary: `Generated follow-up reminder ${msgId} for ${farmer.name} (${c.id})`,
      isSimulated: false,
    });
    return msg;
  }

  // FARMER_ADVISORY
  const farmer = store.farmers.find((f) => f.id === body.farmerId) ?? store.farmers[0];
  const dist = districts.find((d) => d.id === farmer.districtId) ?? districts[0];
  const shc = store.soilCards.find((s) => s.farmerId === farmer.id) ?? null;
  const stressType = farmer.latestStress?.stressType ?? 'UNKNOWN';

  let textEnglish: string;
  if (stressType === 'WATER') {
    textEnglish = `${farmer.name}, satellite shows possible water stress in your ${farmer.crop} field at ${farmer.village}. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: ${dist.kvkContact}. -Agri Dept ${dist.district}`;
  } else if (stressType === 'POSSIBLE_NUTRIENT' && shc) {
    const lowParams = shc.params
      .filter((p) => p.rating === 'LOW' || p.rating === 'DEFICIENT')
      .map((p) => p.label.replace('Available ', ''))
      .join(', ');
    const recList = shc.recommendations
      .map((r) =>
        r.bagSizeKg !== null && r.bagsPerAcre !== null
          ? `${r.productLabel} ${r.bagsPerAcre} ${r.bagsPerAcre === 1 ? 'bag' : 'bags'} (${r.bagSizeKg}kg)`
          : `${r.productLabel} ${r.kgPerAcre} kg`,
      )
      .join(', ');
    textEnglish = `${farmer.name}, satellite shows weak growth in your ${farmer.crop} field. Your Soil Health Card shows low ${lowParams || 'nutrients'}. Card advice per acre: ${recList || 'as per card'}. Confirm with KVK ${dist.kvkContact} before applying. -Agri Dept ${dist.district}`;
  } else {
    textEnglish = `${farmer.name}, satellite shows stress in your ${farmer.crop} field at ${farmer.village}. An extension worker will contact you. Do not spray chemicals without KVK advice. KVK: ${dist.kvkContact}. -Agri Dept ${dist.district}`;
  }

  const textLocal = translateEnglishToLocal(textEnglish, body.language);
  const meta = computeSmsMeta(textEnglish, textLocal);

  const msg: OutboundMessage = {
    id: msgId,
    kind: 'FARMER_ADVISORY',
    parentId: null,
    caseId: farmer.openCaseId,
    farmerId: farmer.id,
    soilCardId: shc?.id ?? null,
    districtId: farmer.districtId,
    language: body.language,
    textEnglish,
    textLocal,
    charCount: meta.charCount,
    segments: meta.segments,
    encoding: meta.encoding,
    translation: {
      method: body.language === 'English' ? 'NONE' : 'TEMPLATE',
      numbersPreserved: meta.numbersPreserved,
      warning: meta.warning,
    },
    status: 'GENERATED',
    statusHistory: [
      { status: 'GENERATED', at: now, actor: headers.actor, role: headers.role, note: null },
    ],
    recipientCount: 1,
    deliveryStats: null,
    generatedBy: headers.actor,
    approvedBy: null,
    rejectedReason: null,
    provider: 'MOCK',
    providerMessageId: null,
    createdAt: now,
  };

  store.messages.push(msg);

  appendAuditEvent({
    layer: 'OUTREACH',
    action: 'ADVISORY_GENERATED',
    actor: headers.actor,
    role: headers.role,
    caseId: farmer.openCaseId,
    farmerId: farmer.id,
    districtId: farmer.districtId,
    entityType: 'OutboundMessage',
    entityId: msgId,
    summary: `Generated ${body.language} farmer advisory ${msgId} for ${farmer.name}`,
    isSimulated: false,
  });

  return msg;
}

export async function mockGetMessages(filters?: {
  status?: MessageStatus;
  kind?: MessageKind;
  farmerId?: string;
  districtId?: string;
}): Promise<OutboundMessage[]> {
  await delay();
  let list = [...store.messages];
  if (filters?.status) list = list.filter((m) => m.status === filters.status);
  if (filters?.kind) list = list.filter((m) => m.kind === filters.kind);
  if (filters?.farmerId) list = list.filter((m) => m.farmerId === filters.farmerId);
  if (filters?.districtId) list = list.filter((m) => m.districtId === filters.districtId);
  return list.reverse();
}

export async function mockGetMessage(id: string): Promise<OutboundMessage> {
  await delay();
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  return msg;
}

export async function mockPatchMessage(
  id: string,
  body: MessagePatch,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'message.edit');
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  if (msg.status !== 'GENERATED' && msg.status !== 'REJECTED') {
    throw new MockApiError(
      'INVALID_STATE',
      `Message can only be edited in GENERATED or REJECTED status (current: ${msg.status})`,
      409,
    );
  }

  const meta = computeSmsMeta(body.textEnglish, body.textLocal);
  msg.textEnglish = body.textEnglish;
  msg.textLocal = body.textLocal;
  msg.charCount = meta.charCount;
  msg.segments = meta.segments;
  msg.encoding = meta.encoding;
  msg.translation.numbersPreserved = meta.numbersPreserved;
  msg.translation.warning = meta.warning;

  if (msg.status === 'REJECTED') {
    msg.status = 'GENERATED';
    msg.rejectedReason = null;
    msg.generatedBy = headers.actor;
    msg.statusHistory.push({
      status: 'GENERATED',
      at: new Date().toISOString(),
      actor: headers.actor,
      role: headers.role,
      note: 'Edited after rejection; returned to GENERATED',
    });
  }

  appendAuditEvent({
    layer: 'OUTREACH',
    action: 'MESSAGE_EDITED',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Edited SMS text on ${id} (numbersPreserved: ${meta.numbersPreserved})`,
    isSimulated: false,
  });

  return msg;
}

export async function mockSubmitMessage(
  id: string,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'message.submit');
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  if (msg.status !== 'GENERATED') {
    throw new MockApiError('INVALID_STATE', `Only GENERATED messages can be submitted (current: ${msg.status})`, 409);
  }
  if (!msg.translation.numbersPreserved) {
    throw new MockApiError('NUMBERS_MISMATCH', 'Numbers changed in translation — blocked from submission.', 422);
  }

  const now = new Date().toISOString();
  msg.status = 'PENDING_APPROVAL';
  msg.statusHistory.push({
    status: 'PENDING_APPROVAL',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: 'Submitted for mandatory Agriculture Department approval',
  });

  if (msg.soilCardId) {
    const shc = store.soilCards.find((s) => s.id === msg.soilCardId);
    if (shc) shc.status = 'SMS_PENDING_APPROVAL';
  }
  if (msg.caseId) {
    const c = store.cases.find((x) => x.id === msg.caseId);
    if (c && c.status === 'DETECTED') c.status = 'ADVISORY_PENDING_APPROVAL';
  }

  appendAuditEvent({
    layer: 'OUTREACH',
    action: 'MESSAGE_SUBMITTED',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Submitted ${msg.id} (${msg.kind}) for department approval`,
    isSimulated: false,
  });

  return msg;
}

export async function mockApproveMessage(
  id: string,
  note: string,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  requirePerm(headers, 'message.approve', { generatedBy: msg.generatedBy });

  if (msg.status !== 'PENDING_APPROVAL') {
    throw new MockApiError('INVALID_STATE', `Message must be PENDING_APPROVAL to approve (current: ${msg.status})`, 409);
  }

  const now = new Date().toISOString();
  msg.status = 'APPROVED';
  msg.approvedBy = headers.actor;
  msg.statusHistory.push({
    status: 'APPROVED',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: note.trim() || 'Approved by Agriculture Department Officer',
  });

  if (msg.soilCardId) {
    const shc = store.soilCards.find((s) => s.id === msg.soilCardId);
    if (shc) shc.status = 'SMS_APPROVED';
  }

  appendAuditEvent({
    layer: 'APPROVAL',
    action: 'MESSAGE_APPROVED',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Approved ${msg.id} (drafted by ${msg.generatedBy})${note.trim() ? `: "${note.trim()}"` : ''}`,
    isSimulated: false,
  });

  return msg;
}

export async function mockRejectMessage(
  id: string,
  body: ReasonBody,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  requirePerm(headers, 'message.reject', { generatedBy: msg.generatedBy });

  if (msg.status !== 'PENDING_APPROVAL') {
    throw new MockApiError('INVALID_STATE', `Message must be PENDING_APPROVAL to reject (current: ${msg.status})`, 409);
  }
  if (!body.reason.trim()) {
    throw new MockApiError('REASON_REQUIRED', 'Rejection reason is required', 422);
  }

  const now = new Date().toISOString();
  msg.status = 'REJECTED';
  msg.rejectedReason = body.reason.trim();
  msg.statusHistory.push({
    status: 'REJECTED',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: body.reason.trim(),
  });

  if (msg.soilCardId) {
    const shc = store.soilCards.find((s) => s.id === msg.soilCardId);
    if (shc) shc.status = 'SMS_REJECTED';
  }

  appendAuditEvent({
    layer: 'APPROVAL',
    action: 'MESSAGE_REJECTED',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Rejected ${msg.id}: "${body.reason.trim()}"`,
    isSimulated: false,
  });

  return msg;
}

export async function mockSendMessage(
  id: string,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'message.send');
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  if (msg.status !== 'APPROVED') {
    throw new MockApiError('INVALID_STATE', `Only APPROVED messages can be sent (current: ${msg.status})`, 409);
  }

  if (msg.farmerId) {
    const farmer = store.farmers.find((f) => f.id === msg.farmerId);
    if (farmer && !farmer.consentSms) {
      throw new MockApiError(
        'CONSENT_MISSING',
        `Farmer ${farmer.name} (${farmer.id}) has not granted SMS consent. Dispatch blocked.`,
        409,
      );
    }
  }

  const now = new Date().toISOString();
  msg.statusHistory.push({
    status: 'QUEUED',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: 'Queued on SMS gateway',
  });
  msg.status = 'SENT';
  msg.providerMessageId = `mock-tw-${id.toLowerCase()}-${Date.now()}`;
  msg.deliveryStats = {
    sent: msg.recipientCount,
    delivered: 0,
    failed: 0,
    acknowledged: 0,
  };
  msg.statusHistory.push({
    status: 'SENT',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: `Dispatched via ${msg.provider} gateway`,
  });
  store.sentTimestampByMsg[msg.id] = Date.now();

  if (msg.soilCardId) {
    const shc = store.soilCards.find((s) => s.id === msg.soilCardId);
    if (shc) shc.status = 'SMS_SENT';
  }

  if (msg.caseId) {
    const c = store.cases.find((x) => x.id === msg.caseId);
    if (c) {
      if (c.status === 'DETECTED' || c.status === 'ADVISORY_PENDING_APPROVAL') {
        c.status = 'MONITORING';
      }
      if (msg.kind === 'FOLLOWUP_REMINDER') {
        c.reminderCount += 1;
      }
      // Ensure a FollowUp record exists when case enters MONITORING
      const existingFu = store.followUps.find((fu) => fu.caseId === c.id);
      if (!existingFu) {
        const farmer = store.farmers.find((f) => f.id === c.farmerId);
        const obs = store.observationsByFarmer[c.farmerId] ?? [];
        const baseNdvi = farmer?.latestStress?.ndviLatest ?? 0.46;
        store.followUps.push({
          caseId: c.id,
          farmerId: c.farmerId,
          startedAt: now,
          windowDays: 21,
          extendedOnce: false,
          dayNumber: 1,
          monitoringScale: 'FIELD_SENTINEL2_10M',
          baselineNdvi: baseNdvi,
          observations: obs.slice(-3),
          latestNdvi: baseNdvi,
          deltaNdvi: 0,
          slopePerDay: 0,
          outcome: 'PENDING',
          outcomeReason: '21-day Sentinel-2 follow-up initiated after SMS dispatch; awaiting next 5-day satellite overpass.',
          requiresHumanVerification: true,
          lastCheckedAt: now,
          nextCheckAt: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
        });
      }
    }
  }

  appendAuditEvent({
    layer: 'OUTREACH',
    action: 'MESSAGE_SENT',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Dispatched SMS ${msg.id} (${msg.kind}) to ${msg.recipientCount} recipient(s)`,
    isSimulated: true,
  });

  return msg;
}

export async function mockRefreshMessageStatus(
  id: string,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay(200);
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);

  if (msg.status === 'SENT') {
    const sentAt = store.sentTimestampByMsg[msg.id] ?? 0;
    // Per §9.3: refresh-status on SENT → DELIVERED if ≥5 s since SENT (or immediately if user clicks refresh in demo after 5s, we also allow immediate if sentAt was >5s ago or if user triggers refresh)
    const elapsedMs = Date.now() - sentAt;
    if (elapsedMs >= 5000 || sentAt === 0) {
      const now = new Date().toISOString();
      msg.status = 'DELIVERED';
      msg.deliveryStats = {
        sent: msg.recipientCount,
        delivered: msg.recipientCount,
        failed: 0,
        acknowledged: 0,
      };
      msg.statusHistory.push({
        status: 'DELIVERED',
        at: now,
        actor: 'SYSTEM',
        role: 'SYSTEM',
        note: 'Gateway delivery receipt confirmed',
      });
      appendAuditEvent({
        layer: 'OUTREACH',
        action: 'MESSAGE_DELIVERED',
        actor: headers.actor,
        role: headers.role,
        caseId: msg.caseId,
        farmerId: msg.farmerId,
        districtId: msg.districtId,
        entityType: 'OutboundMessage',
        entityId: id,
        summary: `Refreshed delivery receipt for ${msg.id}: DELIVERED`,
        isSimulated: true,
      });
    }
  }

  return msg;
}

export async function mockAcknowledgeMessage(
  id: string,
  body: AcknowledgeBody,
  headers: ActorHeaders,
): Promise<OutboundMessage> {
  await delay();
  requirePerm(headers, 'message.acknowledge');
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) throw new MockApiError('NOT_FOUND', `Message ${id} not found`, 404);
  if (msg.status !== 'SENT' && msg.status !== 'DELIVERED') {
    throw new MockApiError(
      'INVALID_STATE',
      `Acknowledgement requires SENT or DELIVERED status (current: ${msg.status})`,
      409,
    );
  }

  const now = new Date().toISOString();
  if (msg.status === 'SENT') {
    msg.statusHistory.push({
      status: 'DELIVERED',
      at: now,
      actor: 'SYSTEM',
      role: 'SYSTEM',
      note: 'Implicitly delivered prior to acknowledgement',
    });
  }
  msg.status = 'ACKNOWLEDGED';
  msg.deliveryStats = {
    sent: msg.recipientCount,
    delivered: msg.recipientCount,
    failed: 0,
    acknowledged: msg.recipientCount,
  };
  msg.statusHistory.push({
    status: 'ACKNOWLEDGED',
    at: now,
    actor: headers.actor,
    role: headers.role,
    note: `${body.method}: ${body.note.trim() || 'Farmer confirmed receipt'}`,
  });

  appendAuditEvent({
    layer: 'HUMAN_VERIFICATION',
    action: 'MESSAGE_ACKNOWLEDGED',
    actor: headers.actor,
    role: headers.role,
    caseId: msg.caseId,
    farmerId: msg.farmerId,
    districtId: msg.districtId,
    entityType: 'OutboundMessage',
    entityId: id,
    summary: `Recorded ${body.method} acknowledgement on ${msg.id}: "${body.note.trim()}"`,
    isSimulated: false,
  });

  return msg;
}

export async function mockGetApprovals(): Promise<OutboundMessage[]> {
  await delay();
  return store.messages
    .filter((m) => m.status === 'PENDING_APPROVAL')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function mockGetCases(filters?: {
  status?: CaseStatus;
  districtId?: string;
}): Promise<Case[]> {
  await delay();
  let list = [...store.cases];
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  if (filters?.districtId) list = list.filter((c) => c.districtId === filters.districtId);
  return list;
}

export async function mockGetCaseDetail(id: string): Promise<CaseDetail> {
  await delay();
  const c = store.cases.find((x) => x.id === id);
  if (!c) throw new MockApiError('NOT_FOUND', `Case ${id} not found`, 404);
  const farmer = store.farmers.find((f) => f.id === c.farmerId);
  if (!farmer) throw new MockApiError('NOT_FOUND', `Farmer ${c.farmerId} not found`, 404);
  const followUp = store.followUps.find((fu) => fu.caseId === id) ?? null;
  const messages = store.messages.filter((m) => m.caseId === id || m.farmerId === c.farmerId);
  const fieldSupportTasks = store.fieldSupportTasks.filter((t) => t.caseId === id);
  const auditEvents = store.auditEvents
    .filter((e) => e.caseId === id || e.farmerId === c.farmerId)
    .reverse();

  return {
    case: c,
    farmer,
    followUp,
    messages,
    fieldSupportTasks,
    auditEvents,
  };
}

export async function mockCheckFollowUp(
  caseId: string,
  headers: ActorHeaders,
): Promise<FollowUp> {
  await delay();
  requirePerm(headers, 'followup.check');
  const fu = store.followUps.find((x) => x.caseId === caseId);
  if (!fu) throw new MockApiError('NOT_FOUND', `Follow-up for ${caseId} not found`, 404);
  fu.lastCheckedAt = new Date().toISOString();

  appendAuditEvent({
    layer: 'ANALYSIS',
    action: 'FOLLOWUP_CHECKED',
    actor: headers.actor,
    role: headers.role,
    caseId,
    farmerId: fu.farmerId,
    entityType: 'FollowUp',
    entityId: caseId,
    summary: `Ran manual Sentinel-2 follow-up check on ${caseId} (Day ${fu.dayNumber}/${fu.windowDays}: ${fu.outcome})`,
    isSimulated: true,
  });

  return fu;
}

export async function mockVerifyCase(
  caseId: string,
  body: VerifyBody,
  headers: ActorHeaders,
): Promise<Case> {
  await delay();
  requirePerm(headers, 'case.verify');
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) throw new MockApiError('NOT_FOUND', `Case ${caseId} not found`, 404);
  if (!body.observation.trim()) {
    throw new MockApiError('OBSERVATION_REQUIRED', 'Verification observation note is required', 422);
  }

  const now = new Date().toISOString();
  c.verifications.push({
    method: body.method,
    outcome: body.outcome,
    observation: body.observation.trim(),
    verifiedBy: headers.actor,
    role: headers.role,
    at: now,
  });

  if (body.outcome === 'NOT_RECOVERED' || body.outcome === 'DISAGREES_WITH_ASSESSMENT') {
    c.status = 'NEEDS_FIELD_SUPPORT';
  }

  appendAuditEvent({
    layer: 'HUMAN_VERIFICATION',
    action: 'CASE_VERIFIED',
    actor: headers.actor,
    role: headers.role,
    caseId: c.id,
    farmerId: c.farmerId,
    districtId: c.districtId,
    entityType: 'Case',
    entityId: c.id,
    summary: `Recorded ${body.method} verification on ${c.id}: ${body.outcome} — "${body.observation.trim()}"`,
    isSimulated: false,
  });

  return c;
}

export async function mockCloseCase(
  caseId: string,
  body: ReasonBody,
  headers: ActorHeaders,
): Promise<Case> {
  await delay();
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) throw new MockApiError('NOT_FOUND', `Case ${caseId} not found`, 404);

  const latestVerification = c.verifications[c.verifications.length - 1] ?? null;
  requirePerm(headers, 'case.close', {
    latestVerifiedBy: latestVerification?.verifiedBy ?? null,
  });

  const hasConfirmedVerif = latestVerification?.outcome === 'CONFIRMED_RECOVERED';
  const hasRecommendCloseVisit = store.fieldSupportTasks.some(
    (t) => t.caseId === caseId && t.visit?.recommendClose === true,
  );

  if (!hasConfirmedVerif && !hasRecommendCloseVisit) {
    throw new MockApiError(
      'VERIFICATION_REQUIRED',
      'Case can only be closed when latest human verification is CONFIRMED_RECOVERED or a field visit recommends closure.',
      409,
    );
  }

  if (!body.reason.trim()) {
    throw new MockApiError('REASON_REQUIRED', 'Closure reason is required', 422);
  }

  const now = new Date().toISOString();
  c.status = 'CLOSED';
  c.closedAt = now;
  c.closedBy = headers.actor;
  c.closeReason = body.reason.trim();

  const fu = store.followUps.find((x) => x.caseId === caseId);
  if (fu) fu.requiresHumanVerification = false;

  appendAuditEvent({
    layer: 'OUTCOME',
    action: 'CASE_CLOSED',
    actor: headers.actor,
    role: headers.role,
    caseId: c.id,
    farmerId: c.farmerId,
    districtId: c.districtId,
    entityType: 'Case',
    entityId: c.id,
    summary: `Closed ${c.id} after human verification: "${body.reason.trim()}"`,
    isSimulated: false,
  });

  return c;
}

export async function mockReopenCase(
  caseId: string,
  body: ReasonBody,
  headers: ActorHeaders,
): Promise<Case> {
  await delay();
  requirePerm(headers, 'case.reopen');
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) throw new MockApiError('NOT_FOUND', `Case ${caseId} not found`, 404);
  if (c.status !== 'CLOSED') {
    throw new MockApiError('INVALID_STATE', 'Only CLOSED cases can be reopened', 409);
  }

  c.status = 'REOPENED';
  c.closedAt = null;
  c.closedBy = null;
  c.closeReason = null;

  appendAuditEvent({
    layer: 'OUTCOME',
    action: 'CASE_REOPENED',
    actor: headers.actor,
    role: headers.role,
    caseId: c.id,
    farmerId: c.farmerId,
    districtId: c.districtId,
    entityType: 'Case',
    entityId: c.id,
    summary: `Reopened ${c.id}: "${body.reason.trim() || 'Further monitoring required'}"`,
    isSimulated: false,
  });

  return c;
}

export async function mockFastForwardFollowUp(
  caseId: string,
  body: FastForwardBody,
  headers: ActorHeaders,
): Promise<FollowUp> {
  await delay(350);
  requirePerm(headers, 'demo.fastForward');
  const fu = store.followUps.find((x) => x.caseId === caseId);
  if (!fu) throw new MockApiError('NOT_FOUND', `Follow-up for ${caseId} not found`, 404);
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) throw new MockApiError('NOT_FOUND', `Case ${caseId} not found`, 404);
  const farmer = store.farmers.find((f) => f.id === c.farmerId);

  const base = fu.baselineNdvi ?? 0.46;
  const newDay = Math.min(fu.windowDays, fu.dayNumber + body.days);
  fu.dayNumber = newDay;
  const now = new Date().toISOString();
  const simDate = new Date(Date.now() + body.days * 86400 * 1000).toISOString().slice(0, 10);

  if (body.scenario === 'RECOVERING') {
    const latest = Math.round((base + 0.08) * 100) / 100;
    const delta = Math.round((latest - base) * 100) / 100;
    const slope = Math.round((delta / Math.max(1, newDay)) * 10000) / 10000;
    fu.observations.push({
      date: simDate,
      ndvi: latest,
      ndwi: Math.round((latest - 0.34) * 100) / 100,
      cloudPct: 8,
      validPixelPct: 96,
      usable: true,
      status: 'SIMULATED',
    });
    fu.latestNdvi = latest;
    fu.deltaNdvi = delta;
    fu.slopePerDay = slope;
    fu.outcome = 'RECOVERING';
    fu.outcomeReason = `SIMULATED +${body.days}d: ΔNDVI rose +${delta.toFixed(2)} (≥ +0.05 threshold, slope +${slope.toFixed(4)}/day). Requires human verification before closing.`;
    fu.requiresHumanVerification = true;
    c.status = 'RECOVERING_PENDING_VERIFICATION';
  } else if (body.scenario === 'DETERIORATING') {
    const latest = Math.round((base - 0.07) * 100) / 100;
    const delta = Math.round((latest - base) * 100) / 100;
    const slope = Math.round((delta / Math.max(1, newDay)) * 10000) / 10000;
    fu.observations.push({
      date: simDate,
      ndvi: latest,
      ndwi: Math.round((latest - 0.48) * 100) / 100,
      cloudPct: 10,
      validPixelPct: 95,
      usable: true,
      status: 'SIMULATED',
    });
    fu.latestNdvi = latest;
    fu.deltaNdvi = delta;
    fu.slopePerDay = slope;
    fu.outcome = 'DETERIORATING';
    fu.outcomeReason = `SIMULATED +${body.days}d: ΔNDVI dropped ${delta.toFixed(2)} (≤ −0.05 threshold, slope ${slope.toFixed(4)}/day). Escalated to P1 Needs Field Support.`;
    fu.requiresHumanVerification = true;
    c.status = 'NEEDS_FIELD_SUPPORT';

    // Ensure a P1 FieldSupportTask exists for this case (Required by Phase F9!)
    const existingOpenTask = store.fieldSupportTasks.find(
      (t) => t.caseId === c.id && (t.status === 'OPEN' || t.status === 'ASSIGNED'),
    );
    if (!existingOpenTask) {
      const taskId = `FST-${String(store.fieldSupportTasks.length + 1).padStart(4, '0')}`;
      store.fieldSupportTasks.unshift({
        id: taskId,
        caseId: c.id,
        farmerId: c.farmerId,
        farmerName: c.farmerName,
        districtId: c.districtId,
        village: farmer?.village ?? 'Village',
        reason: `DETERIORATING satellite NDVI (${delta.toFixed(2)} over ${newDay} days) following fast-forward check.`,
        priority: 'P1',
        createdAt: now,
        dueBy: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
        overdue: false,
        status: 'OPEN',
        assignedTo: null,
        assignedRole: null,
        visit: null,
      });
    } else {
      existingOpenTask.priority = 'P1';
    }
  } else if (body.scenario === 'NOT_RECOVERING') {
    const latest = Math.round((base + 0.01) * 100) / 100;
    const delta = Math.round((latest - base) * 100) / 100;
    const slope = Math.round((delta / Math.max(1, newDay)) * 10000) / 10000;
    fu.observations.push({
      date: simDate,
      ndvi: latest,
      ndwi: Math.round((latest - 0.42) * 100) / 100,
      cloudPct: 12,
      validPixelPct: 92,
      usable: true,
      status: 'SIMULATED',
    });
    fu.latestNdvi = latest;
    fu.deltaNdvi = delta;
    fu.slopePerDay = slope;
    fu.outcome = 'NOT_RECOVERING';
    if (c.reminderCount >= 1) {
      c.status = 'NEEDS_FIELD_SUPPORT';
      fu.outcomeReason = `SIMULATED +${body.days}d: Still flat (ΔNDVI +${delta.toFixed(2)}) after reminder #${c.reminderCount}. Escalated to Needs Field Support.`;
    } else {
      c.status = 'NOT_RECOVERING';
      fu.outcomeReason = `SIMULATED +${body.days}d: Flat trajectory (ΔNDVI +${delta.toFixed(2)}). Follow-up reminder #1 drafted.`;
    }
    fu.requiresHumanVerification = true;
  } else {
    // CLOUDY
    fu.observations.push({
      date: simDate,
      ndvi: null,
      ndwi: null,
      cloudPct: 89,
      validPixelPct: 9,
      usable: false,
      status: 'SIMULATED',
    });
    fu.outcome = 'INSUFFICIENT_DATA';
    if (!fu.extendedOnce) {
      fu.extendedOnce = true;
      fu.windowDays = 28;
    }
    fu.outcomeReason = `SIMULATED +${body.days}d: Pass obscured by 89% cloud cover (<2 usable post-advisory observations). Window extended to ${fu.windowDays} days.`;
    c.status = 'INSUFFICIENT_DATA';
  }

  fu.lastCheckedAt = now;

  appendAuditEvent({
    layer: 'OUTCOME',
    action: 'DEMO_FAST_FORWARD',
    actor: headers.actor,
    role: headers.role,
    caseId: c.id,
    farmerId: c.farmerId,
    districtId: c.districtId,
    entityType: 'FollowUp',
    entityId: c.id,
    summary: `Demo fast-forward +${body.days}d (${body.scenario}) on ${c.id} → ${fu.outcome}`,
    isSimulated: true,
  });

  return fu;
}

export async function mockGetFollowUps(): Promise<FollowUp[]> {
  await delay();
  return [...store.followUps];
}

export async function mockGetFieldSupportTasks(status?: TaskStatus): Promise<FieldSupportTask[]> {
  await delay();
  if (status) {
    return store.fieldSupportTasks.filter((t) => t.status === status);
  }
  return [...store.fieldSupportTasks];
}

export async function mockAssignFieldSupportTask(
  id: string,
  body: AssignBody,
  headers: ActorHeaders,
): Promise<FieldSupportTask> {
  await delay();
  requirePerm(headers, 'task.assign');
  const task = store.fieldSupportTasks.find((t) => t.id === id);
  if (!task) throw new MockApiError('NOT_FOUND', `Field support task ${id} not found`, 404);

  task.assignedTo = body.assignedTo;
  task.assignedRole = body.assignedRole;
  task.status = 'ASSIGNED';

  appendAuditEvent({
    layer: 'FIELD_ACTION',
    action: 'TASK_ASSIGNED',
    actor: headers.actor,
    role: headers.role,
    caseId: task.caseId,
    farmerId: task.farmerId,
    districtId: task.districtId,
    entityType: 'FieldSupportTask',
    entityId: task.id,
    summary: `Assigned ${task.id} (${task.priority}) for ${task.farmerName} to ${body.assignedTo} (${body.assignedRole})`,
    isSimulated: false,
  });

  return task;
}

export async function mockVisitFieldSupportTask(
  id: string,
  body: VisitBody,
  headers: ActorHeaders,
): Promise<FieldSupportTask> {
  await delay();
  requirePerm(headers, 'task.visit');
  const task = store.fieldSupportTasks.find((t) => t.id === id);
  if (!task) throw new MockApiError('NOT_FOUND', `Field support task ${id} not found`, 404);
  if (!body.findings.trim() || !body.actionTaken.trim()) {
    throw new MockApiError('VALIDATION_ERROR', 'Findings and action taken are required', 422);
  }

  const now = new Date().toISOString();
  task.status = body.recommendClose ? 'RESOLVED' : 'VISITED';
  task.overdue = false;
  task.visit = {
    visitedAt: now,
    visitedBy: headers.actor,
    findings: body.findings.trim(),
    actionTaken: body.actionTaken.trim(),
    recommendClose: body.recommendClose,
  };

  const c = store.cases.find((x) => x.id === task.caseId);
  if (c && c.status !== 'CLOSED') {
    c.status = 'FIELD_VISITED';
  }

  appendAuditEvent({
    layer: 'FIELD_ACTION',
    action: 'TASK_VISITED',
    actor: headers.actor,
    role: headers.role,
    caseId: task.caseId,
    farmerId: task.farmerId,
    districtId: task.districtId,
    entityType: 'FieldSupportTask',
    entityId: task.id,
    summary: `Logged field visit on ${task.id} (${task.farmerName}): "${body.findings.trim()}" (recommendClose: ${body.recommendClose})`,
    isSimulated: false,
  });

  return task;
}

export async function mockGetAuditEvents(filters?: {
  layer?: AuditLayer;
  caseId?: string;
  farmerId?: string;
  districtId?: string;
  limit?: number;
}): Promise<AuditEvent[]> {
  await delay();
  let list = [...store.auditEvents];
  if (filters?.layer) list = list.filter((e) => e.layer === filters.layer);
  if (filters?.caseId) list = list.filter((e) => e.caseId === filters.caseId);
  if (filters?.farmerId) list = list.filter((e) => e.farmerId === filters.farmerId);
  if (filters?.districtId) list = list.filter((e) => e.districtId === filters.districtId);
  const limit = filters?.limit ?? 200;
  return list.slice(-limit).reverse();
}

export async function mockVerifyAuditChain(): Promise<ChainVerifyResponse> {
  await delay(200);
  let prev = '0000000000000000';
  for (const ev of store.auditEvents) {
    const expected = computeHash(prev, ev.summary);
    if (ev.prevHash !== prev || ev.hash !== expected) {
      return {
        valid: false,
        eventCount: store.auditEvents.length,
        brokenAtId: ev.id,
      };
    }
    prev = ev.hash;
  }
  return {
    valid: true,
    eventCount: store.auditEvents.length,
    brokenAtId: null,
  };
}

export async function mockGetConsolidatedReport(caseId: string): Promise<ConsolidatedReport> {
  await delay();
  return buildConsolidatedReport(caseId);
}
