# KrishiMitra — Backend PRD, Frontend Feature Map & API Integration Guide (`apps/api`)

> **Purpose of this document:** Hand this file directly to the backend developer (and their Claude coding assistant). The React + TypeScript frontend (`farmpulse360/apps/web`) is already 100% built. This document tells you **(1) every screen and feature that exists in the frontend**, **(2) how to adapt/bridge your already-built backend without rewriting your existing code**, and **(3) the exact API schemas, routes, and domain formulas**.

---

## 0. Already Built Most of the Backend Independently? Start Here!

If you have already written your FastAPI backend (Copernicus Sentinel-2 fetching, Gemini OCR/translation, weather fetching, database models, etc.) with your own route names or JSON shapes, **DO NOT rewrite your backend from scratch!**

### How to Integrate in 15 Minutes (The Adapter Pattern)
1. **Incremental / Hybrid Live Mode is Enabled in the Frontend:**
   - The frontend API client (`src/api/client.ts`) has **Per-Endpoint Hybrid Fallback** built in.
   - When `VITE_USE_MOCKS=false` is set, the frontend calls your FastAPI server at `http://127.0.0.1:8000`.
   - For every endpoint you **have** implemented, the frontend uses your **live backend response**.
   - For any endpoint your backend hasn't implemented yet (returns FastAPI's default `404 Not Found` or `501 Not Implemented`), the frontend **automatically falls back to its built-in stateful store** for that specific call so **zero screens crash during your demo**!
2. **Tell Claude to Build an `adapter_router.py` Wrapper:**
   - Give this file to Claude along with your existing backend files and use this prompt:
     > *"Read `docs/BACKEND_INSTRUCTIONS.md`. Inspect my existing backend services (Sentinel-2, Gemini, weather, database). Do NOT delete my working logic — instead, create a FastAPI router (`adapter_router.py`) that exposes the `/api/...` routes from Section 3 and transforms my existing function outputs into the exact `camelCase` Pydantic schemas in Section 2. Prioritize Tier 1 endpoints (Section 9) first."*
3. **See Section 8 for What Exists in the Frontend:**
   - Jump to **[Section 8: Complete Frontend Feature & Screen-by-Screen Map](#8-complete-frontend-feature--screen-by-screen-integration-map)** to see all 18 screens in the UI, every button/chart/map widget on each screen, and which API calls they trigger.

---

## 1. Quick-Start Architecture & Stack

- **Location:** `farmpulse360/apps/api`
- **Framework:** Python 3.11+ · **FastAPI** · **Pydantic v2** · **Uvicorn** (port `8000`)
- **Database:** SQLite (`farmpulse360.db`) via SQLAlchemy / SQLModel (auto-created and seeded on startup if empty)
- **HTTP Client:** `httpx` (async, with SQLite/in-memory TTL caching so live satellite & weather calls never block or rate-limit during the demo)
- **AI / Vision:** `google-genai` (`gemini-2.5-flash`) for Soil Health Card photo OCR & English $\rightarrow$ Hindi/Marathi/Punjabi SMS translation
- **Satellite & Weather Upstream Integrations (Hybrid Real + Fallback):**
  1. **Copernicus Data Space Ecosystem (`CDSE_SENTINEL2`):** Uses `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` (OAuth2 Client Credentials) to query 10 m Sentinel-2 L2A surface reflectance (`B04`, `B08`, `B11`, `SCL` cloud mask) over farmer GeoJSON polygons.
  2. **NASA POWER Agroclimatology API (`NASA_POWER`):** Key-free REST API (`https://power.larc.nasa.gov/api/temporal/daily/point`) for observed 7-day rainfall, temperature anomalies, relative humidity (`RH2M`), and root-zone soil wetness (`GWETROOT`).
  3. **NASA GIBS / ORNL DAAC MODIS (`NASA_GIBS_MODIS`):** Key-free REST API (`https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset`) for 250 m 8/16-day district NDVI composites.
  4. **Open-Meteo Agricultural Weather API (`OPEN_METEO`):** Key-free REST API (`https://api.open-meteo.com/v1/forecast`) for 5-day daily forecasts (`tMaxC`, `tMinC`, `rainMm`, `rainProbPct`, `windKmh`, FAO $\text{ET}_0$) and synoptic weather alert detection.
  5. **Twilio SMS (`SMS`):** Optional (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`). Defaults to `provider="MOCK"` if not configured.

### 1.1 Environment Variables (`farmpulse360/apps/api/.env`)
```env
# Provided API Keys
CDSE_CLIENT_ID=your_cdse_client_id
CDSE_CLIENT_SECRET=your_cdse_client_secret
GEMINI_API_KEY=your_gemini_api_key

# Optional SMS Gateway (leave blank to use built-in MOCK provider)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Database & Server
DATABASE_URL=sqlite:///./farmpulse360.db
PORT=8000
```

### 1.2 Required CORS & JSON Serialization Rules (CRITICAL)
1. **CORS Middleware:** The frontend runs on `http://localhost:5173` (or Vercel) and sends custom headers `X-Actor` and `X-Role` on every request:
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["*"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*", "X-Actor", "X-Role", "Content-Type"],
   )
   ```
2. **Exact `camelCase` Field Names:** Every JSON response property and request body property **MUST** use the exact `camelCase` names in Section 2 (`districtId`, `ndviAnomalyPct`, `riskLevel`, `textEnglish`, `textLocal`, `numbersPreserved`, etc.).
3. **Standard Error Shape (`ApiError`):** On any `400`, `403`, `404`, `409`, or `422` response, return:
   ```json
   {
     "detail": "Human-readable explanation shown in frontend toast",
     "code": "MACHINE_READABLE_CODE"
   }
   ```
   *(Note: FastAPI's default `HTTPException` returns `{"detail": "..."}`. Use a custom exception handler so top-level `{"detail": str, "code": str}` is always returned.)*

---

## 2. Complete API Contract v1 (`src/api/contract.ts`)

Below is the **exact TypeScript contract** compiled into the frontend. Every Pydantic response model must serialize to match these interfaces 1-to-1:

```ts
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type DataStatus = 'LIVE' | 'CACHED' | 'SIMULATED' | 'MANUAL';
export type Language = 'English' | 'Hindi' | 'Marathi' | 'Punjabi';
export type Role = 'DEPT_OFFICER' | 'EXTENSION_WORKER' | 'KVK_EXPERT' | 'LOCAL_REP';
export type Scale = 'DISTRICT_MODIS_250M' | 'FIELD_SENTINEL2_10M';

export interface Provenance {
  source: string;
  status: DataStatus;
  scale: Scale | null;
  observedAt: string | null;
  fetchedAt: string;
  freshnessDays: number | null;
  note: string | null;
}

export interface DistrictSummary {
  id: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
  primaryCrop: string;
  acreageLakh: number;
  language: Language;
  kvkContact: string;
  ndvi: number;
  ndviBaseline: number;
  ndviAnomalyPct: number;
  riskScore: number;
  riskLevel: RiskLevel;
  priorityRank: number;
  weatherAlertCount: number;
  registeredFarmers: number;
  openCases: number;
  provenance: Provenance;
}

export interface StateSummary {
  state: string;
  avgRisk: number;
  districtCount: number;
  criticalDistricts: number;
  highDistricts: number;
}

export interface DistrictsResponse {
  generatedAt: string;
  summary: {
    districtsMonitored: number;
    activeAlerts: number;
    criticalDistricts: number;
    registeredFarmers: number;
    needsFieldSupport: number;
    pendingApprovals: number;
  };
  states: StateSummary[];
  districts: DistrictSummary[];
}

export type ReasoningStatus = 'OK' | 'WARN' | 'ABSTAIN';
export interface ReasoningStep {
  step: number;
  agent: string;
  title: string;
  detail: string;
  status: ReasoningStatus;
  evidence: Provenance[];
}

export interface WeatherObs {
  rainfall7dMm: number;
  rainfallAnomalyPct: number;
  avgTempC: number;
  tempAnomalyC: number;
  humidityPct: number;
  provenance: Provenance;
}

export interface ForecastDay {
  date: string;
  tMaxC: number;
  tMinC: number;
  rainMm: number;
  rainProbPct: number;
  windKmh: number;
  et0Mm: number;
}

export type WeatherAlertType = 'HEAVY_RAIN' | 'HEATWAVE' | 'COLD_WAVE' | 'HIGH_WIND' | 'DRY_SPELL';
export type AlertSeverity = 'WATCH' | 'WARNING' | 'SEVERE';
export interface WeatherAlert {
  id: string;
  districtId: string;
  type: WeatherAlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  validFrom: string;
  validTo: string;
  provenance: Provenance;
}

export interface RoleResponsibility {
  role: 'AGRICULTURE_DEPARTMENT' | 'EXTENSION_WORKER' | 'KVK' | 'LOCAL_REPRESENTATIVE';
  title: string;
  responsibilities: string[];
  contact: string;
}

export interface InstitutionalBriefing {
  headline: string;
  summary: string;
  actions: string[];
  insuranceSignal: {
    claimProbability: number;
    affectedAcreagePct: number;
    note: string; // Always "Indicative signal only — not a claim decision"
  };
}

export interface DistrictReport {
  runId: string;
  generatedAt: string;
  district: DistrictSummary;
  crop: string;
  cropStage: string;
  daysToHarvest: number;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  priority: Priority;
  escalate: boolean;
  escalationReason: string | null;
  recommendedAction: string;
  rootCause: string;
  freshness: {
    overall: 'FRESH' | 'AGING' | 'STALE';
    ndviAgeDays: number | null;
    weatherAgeDays: number | null;
  };
  weather: WeatherObs;
  forecast5d: ForecastDay[];
  weatherAlerts: WeatherAlert[];
  pest: { name: string; probability: number };
  reasoningChain: ReasoningStep[];
  institutionalBriefing: InstitutionalBriefing;
  roles: RoleResponsibility[];
  registeredFarmers: Farmer[];
  warnings: string[];
  dataSources: Provenance[];
}

export type BoundaryStatus = 'UNVERIFIED' | 'WORKER_VERIFIED' | 'DISPUTED';
export type SizeClass = 'TOO_SMALL' | 'SMALL' | 'ADEQUATE';
export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // GeoJSON order [lon, lat]; ring closed
}
export interface FieldParcel {
  polygon: GeoPolygon;
  centroid: [number, number]; // [lat, lon]
  areaHa: number;
  pixelCount10m: number;
  sizeClass: SizeClass;
  boundaryStatus: BoundaryStatus;
  boundaryNote: string | null;
  boundaryVerifiedBy: string | null;
  boundaryVerifiedAt: string | null;
}
export interface FieldObservation {
  date: string;
  ndvi: number | null;
  ndwi: number | null;
  cloudPct: number;
  validPixelPct: number;
  usable: boolean;
  status: DataStatus;
}
export type StressType = 'NONE' | 'WATER' | 'POSSIBLE_NUTRIENT' | 'MIXED' | 'UNKNOWN';
export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export interface FieldStressSummary {
  asOf: string;
  ndviLatest: number | null;
  ndviBaseline: number | null;
  baselineMethod: 'PREVIOUS_YEAR' | 'CROP_DEFAULT';
  ndviAnomalyPct: number | null;
  ndwiLatest: number | null;
  ndwiBaseline: number | null;
  ndwiChange: number | null;
  stressLevel: RiskLevel;
  stressType: StressType;
  reliability: Reliability;
  reliabilityReasons: string[];
  provenance: Provenance;
}
export interface Farmer {
  id: string;
  name: string;
  phoneMasked: string;
  language: Language;
  village: string;
  districtId: string;
  crop: string;
  sowingDate: string;
  consentSms: boolean;
  consentAt: string | null;
  registeredBy: string;
  createdAt: string;
  field: FieldParcel;
  latestStress: FieldStressSummary | null;
  soilCardId: string | null;
  openCaseId: string | null;
  isDemo: boolean;
}
export interface FarmerDetail extends Farmer {
  observations: FieldObservation[];
  reasoningChain: ReasoningStep[];
  soilCard: SoilCard | null;
  messages: OutboundMessage[];
  openCase: Case | null;
  followUp: FollowUp | null;
  auditEvents: AuditEvent[];
}
export interface FarmerCreate {
  name: string;
  phone: string;
  language: Language;
  village: string;
  districtId: string;
  crop: string;
  sowingDate: string;
  consentSms: boolean;
  polygon: GeoPolygon;
}
export interface BoundaryVerifyBody {
  status: 'WORKER_VERIFIED' | 'DISPUTED';
  note: string;
  polygon: GeoPolygon | null;
}

export type SoilParam = 'pH' | 'EC' | 'OC' | 'N' | 'P' | 'K' | 'S' | 'Zn' | 'Fe' | 'Cu' | 'Mn' | 'B';
export type SoilRating =
  | 'STRONGLY_ACIDIC' | 'MODERATELY_ACIDIC' | 'NEUTRAL' | 'MODERATELY_ALKALINE' | 'STRONGLY_ALKALINE'
  | 'NORMAL' | 'CRITICAL' | 'INJURIOUS'
  | 'LOW' | 'MEDIUM' | 'HIGH'
  | 'DEFICIENT' | 'SUFFICIENT';
export type OcrFlagCode = 'OUT_OF_RANGE' | 'DECIMAL_SHIFT_SUSPECTED' | 'UNIT_MISMATCH' | 'LOW_CONFIDENCE' | 'MISSING';
export interface OcrFlag {
  code: OcrFlagCode;
  message: string;
  suggestion: number | null;
  blocking: boolean;
}
export interface SoilParamValue {
  param: SoilParam;
  label: string;
  value: number | null;
  unit: string;
  ocrRaw: string | null;
  ocrConfidence: number | null;
  rating: SoilRating | null;
  interpretation: string;
  flags: OcrFlag[];
  confirmed: boolean;
}
export type FertilizerProduct = 'Urea' | 'DAP' | 'MOP' | 'SSP' | 'NPK_10_26_26' | 'Zinc_Sulphate' | 'Other';
export interface FertilizerRecommendation {
  product: FertilizerProduct;
  productLabel: string;
  cardDose: number;
  cardDoseUnit: 'kg/ha' | 'kg/acre';
  kgPerHa: number;
  kgPerAcre: number;
  bagSizeKg: number | null;
  bagsPerAcre: number | null;
  bagsForFarm: number | null;
  kgForFarm: number;
  timing: string | null;
  sourceText: string;
}
export type SoilCardStatus = 'NEEDS_REVIEW' | 'CONFIRMED' | 'SMS_PENDING_APPROVAL' | 'SMS_APPROVED' | 'SMS_SENT' | 'SMS_REJECTED';
export interface SoilCard {
  id: string;
  farmerId: string;
  cardNumber: string | null;
  sampleDate: string | null;
  labName: string | null;
  imageUrl: string | null;
  status: SoilCardStatus;
  params: SoilParamValue[];
  recommendations: FertilizerRecommendation[];
  cardAgeYears: number | null;
  ageFlag: boolean;
  extractionMethod: 'GEMINI_OCR' | 'MANUAL';
  createdBy: string;
  confirmedBy: string | null;
  messageId: string | null;
  createdAt: string;
}
export interface RecommendationInput {
  product: FertilizerProduct;
  productLabel: string;
  cardDose: number;
  cardDoseUnit: 'kg/ha' | 'kg/acre';
  timing: string | null;
  sourceText: string;
}
export interface SoilCardManualCreate {
  farmerId: string;
  cardNumber: string | null;
  sampleDate: string | null;
  labName: string | null;
  params: { param: SoilParam; value: number | null; unit: string }[];
  recommendations: RecommendationInput[];
}
export interface SoilCardPatch {
  cardNumber?: string | null;
  sampleDate?: string | null;
  labName?: string | null;
  params?: { param: SoilParam; value: number | null; unit: string; confirmed: boolean }[];
  recommendations?: RecommendationInput[];
}

export type MessageKind = 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'SOIL_CARD' | 'FOLLOWUP_REMINDER';
export type MessageStatus = 'GENERATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';
export interface StatusEvent {
  status: MessageStatus;
  at: string;
  actor: string;
  role: Role | 'SYSTEM';
  note: string | null;
}
export interface OutboundMessage {
  id: string;
  kind: MessageKind;
  parentId: string | null;
  caseId: string | null;
  farmerId: string | null;
  soilCardId: string | null;
  districtId: string;
  language: Language;
  textEnglish: string;
  textLocal: string;
  charCount: number;
  segments: number;
  encoding: 'GSM7' | 'UCS2';
  translation: {
    method: 'GEMINI' | 'TEMPLATE' | 'NONE';
    numbersPreserved: boolean;
    warning: string | null;
  };
  status: MessageStatus;
  statusHistory: StatusEvent[];
  recipientCount: number;
  deliveryStats: { sent: number; delivered: number; failed: number; acknowledged: number } | null;
  generatedBy: string;
  approvedBy: string | null;
  rejectedReason: string | null;
  provider: 'MOCK' | 'TWILIO';
  providerMessageId: string | null;
  createdAt: string;
}
export interface AdvisoryGenerate {
  kind: 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'FOLLOWUP_REMINDER';
  districtId?: string;
  farmerId?: string;
  caseId?: string;
  language: Language;
}
export interface MessagePatch {
  textEnglish: string;
  textLocal: string;
}
export interface AcknowledgeBody {
  method: 'FARMER_REPLY' | 'PHONE_CALL' | 'IN_PERSON';
  note: string;
}

export type CaseStatus =
  | 'DETECTED' | 'ADVISORY_PENDING_APPROVAL' | 'MONITORING'
  | 'RECOVERING_PENDING_VERIFICATION' | 'NOT_RECOVERING' | 'NEEDS_FIELD_SUPPORT'
  | 'INSUFFICIENT_DATA' | 'FIELD_VISITED' | 'CLOSED' | 'REOPENED';
export type FollowUpOutcome = 'PENDING' | 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'INSUFFICIENT_DATA';
export interface HumanVerification {
  method: 'PHONE_CALL' | 'FIELD_VISIT' | 'FARMER_REPLY';
  outcome: 'CONFIRMED_RECOVERED' | 'NOT_RECOVERED' | 'COULD_NOT_REACH' | 'DISAGREES_WITH_ASSESSMENT';
  observation: string;
  verifiedBy: string;
  role: Role;
  at: string;
}
export interface Case {
  id: string;
  farmerId: string;
  farmerName: string;
  districtId: string;
  status: CaseStatus;
  trigger: 'FIELD_STRESS' | 'DISTRICT_ALERT' | 'SOIL_CARD' | 'MANUAL';
  openedAt: string;
  stressAtOpen: FieldStressSummary;
  reminderCount: number;
  lastMessageId: string | null;
  verifications: HumanVerification[];
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
}
export interface FollowUp {
  caseId: string;
  farmerId: string;
  startedAt: string;
  windowDays: number;
  extendedOnce: boolean;
  dayNumber: number;
  monitoringScale: Scale;
  baselineNdvi: number | null;
  observations: FieldObservation[];
  latestNdvi: number | null;
  deltaNdvi: number | null;
  slopePerDay: number | null;
  outcome: FollowUpOutcome;
  outcomeReason: string;
  requiresHumanVerification: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
}
export interface CaseDetail {
  case: Case;
  farmer: Farmer;
  followUp: FollowUp | null;
  messages: OutboundMessage[];
  fieldSupportTasks: FieldSupportTask[];
  auditEvents: AuditEvent[];
}
export interface VerifyBody {
  method: HumanVerification['method'];
  outcome: HumanVerification['outcome'];
  observation: string;
}
export interface ReasonBody {
  reason: string;
}
export interface FastForwardBody {
  days: number;
  scenario: 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'CLOUDY';
}

export type TaskStatus = 'OPEN' | 'ASSIGNED' | 'VISITED' | 'RESOLVED' | 'CANCELLED';
export interface FieldSupportTask {
  id: string;
  caseId: string;
  farmerId: string;
  farmerName: string;
  districtId: string;
  village: string;
  reason: string;
  priority: 'P1' | 'P2' | 'P3';
  createdAt: string;
  dueBy: string;
  overdue: boolean;
  status: TaskStatus;
  assignedTo: string | null;
  assignedRole: 'KVK_EXPERT' | 'LOCAL_REP' | null;
  visit: {
    visitedAt: string;
    visitedBy: string;
    findings: string;
    actionTaken: string;
    recommendClose: boolean;
  } | null;
}
export interface AssignBody {
  assignedTo: string;
  assignedRole: 'KVK_EXPERT' | 'LOCAL_REP';
}
export interface VisitBody {
  findings: string;
  actionTaken: string;
  recommendClose: boolean;
}

export type AuditLayer =
  | 'DATA_PROVENANCE' | 'ANALYSIS' | 'HUMAN_VERIFICATION'
  | 'APPROVAL' | 'OUTREACH' | 'FIELD_ACTION' | 'OUTCOME';
export interface AuditEvent {
  id: number;
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
  details: Record<string, unknown>;
  isSimulated: boolean;
  prevHash: string;
  hash: string;
}
export interface ReportRow {
  label: string;
  value: string;
  status: DataStatus | null;
}
export interface ReportSection {
  key: string;
  title: string;
  accountableRole: string;
  rows: ReportRow[];
}
export interface ConsolidatedReport {
  caseId: string;
  generatedAt: string;
  isIllustrative: boolean;
  sections: ReportSection[];
  integrity: {
    eventCount: number;
    chainValid: boolean;
    lastHash: string;
  };
}
export interface ChainVerifyResponse {
  valid: boolean;
  eventCount: number;
  brokenAtId: number | null;
}

export interface AgentEvent {
  runId: string;
  agent: 'Satellite Scout' | 'Weather Watch' | 'Crop Risk Analyst' | 'Field Monitor';
  step: string;
  status: 'RUNNING' | 'COMPLETE' | 'ERROR';
  message: string;
  at: string;
}
export interface OverviewResponse {
  generatedAt: string;
  kpis: {
    districtsMonitored: number;
    activeAlerts: number;
    criticalDistricts: number;
    registeredFarmers: number;
    pendingApprovals: number;
    needsFieldSupport: number;
    monitoringCases: number;
    acknowledgedRatePct: number | null;
  };
  outreachFunnel: {
    generated: number;
    pendingApproval: number;
    approved: number;
    sent: number;
    delivered: number;
    acknowledged: number;
    failed: number;
    rejected: number;
  };
  followUpOutcomes: {
    pending: number;
    recovering: number;
    notRecovering: number;
    deteriorating: number;
    insufficientData: number;
  };
  topDistricts: DistrictSummary[];
  weatherAlerts: WeatherAlert[];
  recentEvents: AuditEvent[];
}
export interface DataSourceStatus {
  key: 'NASA_POWER' | 'NASA_GIBS_MODIS' | 'OPEN_METEO' | 'CDSE_SENTINEL2' | 'GEMINI' | 'SMS';
  name: string;
  purpose: string;
  mode: 'LIVE' | 'SIMULATED' | 'MOCK' | 'NOT_CONFIGURED';
  lastSuccessAt: string | null;
  lastError: string | null;
}
export interface ApiError {
  detail: string;
  code: string;
}
```

---

## 3. All 36 Endpoints Expected by `src/api/client.ts` & `src/api/sse.ts`

Every request from the frontend includes headers:
- `X-Actor`: e.g. `"R. K. Sharma"`, `"Asha Kulkarni"`, `"Vikas More"`, `"Dr. Neha Rao"`, `"Sanjay Patil"`
- `X-Role`: `'DEPT_OFFICER' | 'EXTENSION_WORKER' | 'KVK_EXPERT' | 'LOCAL_REP'`

| Method | Path | Request Body / Query | Response Type | Required Permission |
|---|---|---|---|---|
| `GET` | `/health` | – | `{"status": "ok"}` | Public |
| `GET` | `/api/meta/data-sources` | – | `DataSourceStatus[]` | Public |
| `GET` | `/api/overview` | – | `OverviewResponse` | All |
| `GET` | `/api/districts` | – | `DistrictsResponse` | All |
| `GET` | `/api/districts/{id}/report` | `?refresh=false` (`bool`) | `DistrictReport` | All |
| `POST` | `/api/districts/scan` | – | `{"runId": string}` | `scan.run` (`DEPT_OFFICER`) |
| `GET` | `/api/stream/{runId}` | Server-Sent Events (SSE) | `data: <AgentEvent JSON>\n\n`, final `event: end\ndata: {}\n\n` | Public |
| `GET` | `/api/weather/alerts` | `?districtId=` (optional) | `WeatherAlert[]` | All |
| `GET` | `/api/farmers` | `?districtId=&q=` (optional) | `Farmer[]` | All |
| `POST` | `/api/farmers` | `FarmerCreate` | `Farmer` | `farmer.register` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `GET` | `/api/farmers/{id}` | – | `FarmerDetail` | All |
| `POST` | `/api/farmers/{id}/analyze` | – | `FarmerDetail` | `farmer.analyze` (All) |
| `POST` | `/api/farmers/{id}/boundary/verify` | `BoundaryVerifyBody` | `Farmer` | `boundary.verify` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `GET` | `/api/soil-cards` | `?farmerId=` (optional) | `SoilCard[]` | All |
| `POST` | `/api/soil-cards/ocr` | `multipart/form-data`: `farmerId` (str), `image` (UploadFile) | `SoilCard` | `soil.create` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/soil-cards/manual` | `SoilCardManualCreate` | `SoilCard` | `soil.create` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `GET` | `/api/soil-cards/{id}` | – | `SoilCard` | All |
| `PATCH` | `/api/soil-cards/{id}` | `SoilCardPatch` | `SoilCard` | `soil.edit` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/soil-cards/{id}/confirm` | – | `SoilCard` | `soil.confirm` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/soil-cards/{id}/generate-sms` | `{"language": Language}` | `OutboundMessage` | `soil.generateSms` (`EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/advisories/generate` | `AdvisoryGenerate` | `OutboundMessage` | `message.generate` (`DEPT_OFFICER`, `EXTENSION_WORKER`, `KVK_EXPERT`) |
| `GET` | `/api/messages` | `?status=&kind=&farmerId=&districtId=` | `OutboundMessage[]` | All |
| `GET` | `/api/messages/{id}` | – | `OutboundMessage` | All |
| `PATCH` | `/api/messages/{id}` | `MessagePatch` | `OutboundMessage` | `message.edit` (`DEPT_OFFICER`, `EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/messages/{id}/submit` | – | `OutboundMessage` | `message.submit` (`DEPT_OFFICER`, `EXTENSION_WORKER`, `KVK_EXPERT`) |
| `POST` | `/api/messages/{id}/approve` | `{"note": string}` | `OutboundMessage` | `message.approve` (`DEPT_OFFICER` + `actor != generatedBy`) |
| `POST` | `/api/messages/{id}/reject` | `ReasonBody` | `OutboundMessage` | `message.reject` (`DEPT_OFFICER` + `actor != generatedBy`) |
| `POST` | `/api/messages/{id}/send` | – | `OutboundMessage` | `message.send` (`DEPT_OFFICER`) |
| `POST` | `/api/messages/{id}/refresh-status` | – | `OutboundMessage` | `message.send` (`DEPT_OFFICER`) |
| `POST` | `/api/messages/{id}/acknowledge` | `AcknowledgeBody` | `OutboundMessage` | `message.acknowledge` (All) |
| `GET` | `/api/approvals` | – | `OutboundMessage[]` (`status == 'PENDING_APPROVAL'`, oldest first) | All |
| `GET` | `/api/cases` | `?status=&districtId=` | `Case[]` | All |
| `GET` | `/api/cases/{id}` | – | `CaseDetail` | All |
| `POST` | `/api/cases/{id}/followup/check` | – | `FollowUp` | `followup.check` (All) |
| `POST` | `/api/cases/{id}/verify` | `VerifyBody` | `Case` | `case.verify` (All) |
| `POST` | `/api/cases/{id}/close` | `ReasonBody` | `Case` | `case.close` (`DEPT_OFFICER` + `actor != latestVerifiedBy`) |
| `POST` | `/api/cases/{id}/reopen` | `ReasonBody` | `Case` | `case.reopen` (`DEPT_OFFICER`) |
| `POST` | `/api/demo/cases/{id}/fast-forward` | `FastForwardBody` | `FollowUp` | `demo.fastForward` (All) |
| `GET` | `/api/follow-ups` | – | `FollowUp[]` | All |
| `GET` | `/api/field-support` | `?status=` (optional) | `FieldSupportTask[]` | All |
| `POST` | `/api/field-support/{id}/assign` | `AssignBody` | `FieldSupportTask` | `task.assign` (`DEPT_OFFICER`) |
| `POST` | `/api/field-support/{id}/visit` | `VisitBody` | `FieldSupportTask` | `task.visit` (`KVK_EXPERT`, `LOCAL_REP`) |
| `GET` | `/api/audit` | `?layer=&caseId=&farmerId=&districtId=&limit=200` | `AuditEvent[]` | All |
| `GET` | `/api/audit/export.csv` | – | `text/csv` download | All |
| `GET` | `/api/audit/verify-chain` | – | `ChainVerifyResponse` | All |
| `GET` | `/api/reports/case/{caseId}` | – | `ConsolidatedReport` | All |
| `GET` | `/api/reports/illustrative` | – | `ConsolidatedReport` (`isIllustrative: true`) | All |

---

## 4. Upstream Satellite, Weather & AI Integration Specs

### 4.1 Copernicus Data Space Ecosystem (CDSE Sentinel-2 10 m)
- **Token Endpoint:**
  ```http
  POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
  Content-Type: application/x-www-form-urlencoded

  grant_type=client_credentials&client_id=${CDSE_CLIENT_ID}&client_secret=${CDSE_CLIENT_SECRET}
  ```
- **Statistical API Endpoint:** `POST https://sh.dataspace.copernicus.eu/api/v1/statistics`
  - Pass the farmer's `field.polygon` (`GeoPolygon`), time range (last 60 days, 5-day aggregation), and an Evalscript computing `NDVI = (B08 - B04) / (B08 + B04)`, `NDWI = (B08 - B11) / (B08 + B11)`, and cloud fraction from `SCL` (Scene Classification classes `8, 9, 10` = clouds/cirrus).
  - Mark each `FieldObservation` with `usable = (cloudPct < 50 and validPixelPct >= 60)` and `status = 'LIVE'` (or `'CACHED'` when served from SQLite cache).
  - **Graceful Fallback:** If CDSE returns an error or has no cloud-free pass, fall back to the deterministic 13-point observation series and set `status = 'SIMULATED'`.

### 4.2 NASA POWER & ORNL MODIS (Key-Free Live District Data)
- **NASA POWER Daily Agroclimatology:**
  ```text
  GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETROOT,GWETTOP,T2M,T2M_MAX,PRECTOTCORR,RH2M&community=AG&longitude={lon}&latitude={lat}&start={YYYYMMDD}&end={YYYYMMDD}&format=JSON
  ```
  - Use `PRECTOTCORR`, `T2M`, `RH2M`, and `GWETROOT` (root-zone soil wetness index) to populate `DistrictReport.weather` with `provenance.status = 'LIVE'`.
- **ORNL DAAC MODIS 250 m NDVI (`MOD13Q1`):**
  ```text
  GET https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude={lat}&longitude={lon}&band=250m_16_days_NDVI&startDate=A2025001&endDate=A2025097&kmAboveBelow=1&kmLeftRight=1
  ```
  - Scale mean pixel value by `0.0001` to get `ndvi` (`0.00` to `1.00`). Cache in SQLite for 6 hours (`status = 'LIVE'` on fetch, `'CACHED'` on subsequent reads).

### 4.3 Open-Meteo 5-Day Forecast & Weather Alerts (Key-Free)
- **Endpoint:**
  ```text
  GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&timezone=Asia%2FKolkata&forecast_days=5
  ```
- Maps directly to `ForecastDay[]` (`date`, `tMaxC`, `tMinC`, `rainMm`, `rainProbPct`, `windKmh`, `et0Mm`).

### 4.4 Google Gemini (`GEMINI_API_KEY`)
1. **Soil Health Card Vision OCR (`POST /api/soil-cards/ocr`):**
   - Pass the uploaded image bytes to `gemini-2.5-flash` with a structured JSON response schema extracting `cardNumber`, `sampleDate`, `labName`, the 12 soil parameters (`pH, EC, OC, N, P, K, S, Zn, Fe, Cu, Mn, B` with `value`, `unit`, `ocrRaw`, `ocrConfidence`), and `recommendations`.
   - Run the deterministic agronomy validation & flag rules (§5.2) on the extracted parameters before saving as `status = 'NEEDS_REVIEW'`.
   - **Fallback:** If `GEMINI_API_KEY` fails or image is a test placeholder, return the `SHC-0002`-style OCR result with realistic flags (`DECIMAL_SHIFT_SUSPECTED` on pH 72 $\rightarrow$ 7.2, `UNIT_MISMATCH` on P, etc.) so the judge can test the human-in-the-loop review flow.
2. **Regional SMS Translation (`POST /api/advisories/generate` & `POST /api/soil-cards/{id}/generate-sms`):**
   - First generate `textEnglish` using the exact deterministic templates in §5.4.
   - Ask `gemini-2.5-flash` to translate `textEnglish` into `language` (`Hindi`, `Marathi`, or `Punjabi`) while keeping **all Western digits (`0-9`) and decimal numbers identical**.
   - Run `numbersPreserved(textEnglish, textLocal)` (§5.3). If Gemini altered any number, either re-inject the numbers or fall back to the deterministic template dictionary (`translation.method = 'TEMPLATE'`).

---

## 5. Exact Domain Logic & State Machine Rules

### 5.1 Geodesic Parcel Geometry (`FieldParcel`)
- Given `polygon.coordinates[0]` (array of `[lon, lat]` points):
  - Project equirectangularly around centroid $(\text{lat}_0, \text{lon}_0)$:
    $$x = \text{lon} \times 111320 \times \cos(\text{lat}_0), \quad y = \text{lat} \times 110540$$
  - Compute polygon area via the Shoelace formula: $\text{areaHa} = \text{round}(\text{area\_m}^2 / 10000, 2)$.
  - `pixelCount10m = round(areaHa * 100)`.
  - `sizeClass`: `< 0.1` $\rightarrow$ `'TOO_SMALL'`, `< 0.5` $\rightarrow$ `'SMALL'`, else `'ADEQUATE'`.
- **Phone masking:** Never return raw phone numbers. Format `+9190000000NN` as `+91 90xxxx00NN`.

### 5.2 Soil Health Card Ratings, Blocking Flags & Fertilizer Conversions
| Param | Label | Default Unit | Plausible Range | Rating Rule |
|---|---|---|---|---|
| `pH` | Soil pH | `–` | `3.5–10.5` | `<5.5` `STRONGLY_ACIDIC` · `5.5–6.5` `MODERATELY_ACIDIC` · `6.5–7.5` `NEUTRAL` · `7.5–8.5` `MODERATELY_ALKALINE` · `>8.5` `STRONGLY_ALKALINE` |
| `EC` | Electrical conductivity | `dS/m` | `0–20` | `<1` `NORMAL` · `1–3` `CRITICAL` · `>3` `INJURIOUS` |
| `OC` | Organic carbon | `%` | `0.05–5` | `<0.5` `LOW` · `0.5–0.75` `MEDIUM` · `>0.75` `HIGH` |
| `N` | Available nitrogen | `kg/ha` | `50–1200` | `<280` `LOW` · `280–560` `MEDIUM` · `>560` `HIGH` |
| `P` | Available phosphorus | `kg/ha` | `1–200` | `<10` `LOW` · `10–25` `MEDIUM` · `>25` `HIGH` |
| `K` | Available potassium | `kg/ha` | `20–1500` | `<108` `LOW` · `108–280` `MEDIUM` · `>280` `HIGH` |
| `S` | Sulphur | `ppm` | `0.5–200` | `<10` `DEFICIENT` else `SUFFICIENT` |
| `Zn` | Zinc | `ppm` | `0.05–50` | `<0.6` `DEFICIENT` else `SUFFICIENT` |
| `Fe` | Iron | `ppm` | `0.5–200` | `<4.5` `DEFICIENT` else `SUFFICIENT` |
| `Cu` | Copper | `ppm` | `0.05–50` | `<0.2` `DEFICIENT` else `SUFFICIENT` |
| `Mn` | Manganese | `ppm` | `0.2–200` | `<2` `DEFICIENT` else `SUFFICIENT` |
| `B` | Boron | `ppm` | `0.05–10` | `<0.5` `DEFICIENT` else `SUFFICIENT` |

- **OCR Flags (`OcrFlag`):**
  - `DECIMAL_SHIFT_SUSPECTED` (`blocking: true`): value is outside plausible range, but `value / 10` or `value / 100` falls inside plausible range (e.g. `pH = 72` $\rightarrow$ `suggestion: 7.2`).
  - `OUT_OF_RANGE` (`blocking: true`): value is outside plausible range and not a simple decimal shift.
  - `UNIT_MISMATCH` (`blocking: true`): e.g. `P` reported in `"kg/ha P2O5"` instead of elemental `"kg/ha"` (`suggestion = round(value / 2.2914, 1)`).
  - `LOW_CONFIDENCE` (`blocking: false`): `ocrConfidence < 0.75`.
  - `MISSING` (`blocking: true` until `confirmed == true`): `value is None`.
- **Confirmation Safeguard (`POST /api/soil-cards/{id}/confirm`):**
  - Reject with `422` (`code: "BLOCKING_FLAGS"`) if any parameter has `blocking == true` or `confirmed == false`.
- **Fertilizer Conversion Math:**
  - `kgPerHa = cardDose` if `cardDoseUnit == 'kg/ha'` else `round(cardDose * 2.4711, 1)`
  - `kgPerAcre = round(kgPerHa / 2.4711, 1)`
  - `bagSizeKg`: `Urea` $\rightarrow$ `45`, `DAP | MOP | SSP | NPK_10_26_26` $\rightarrow$ `50`, `Zinc_Sulphate | Other` $\rightarrow$ `null`
  - `bagsPerAcre = round((kgPerAcre / bagSizeKg) * 2) / 2` (nearest 0.5 bag)
  - `acres = areaHa * 2.4711`
  - `kgForFarm = round(kgPerAcre * acres)`
  - `bagsForFarm = round((kgForFarm / bagSizeKg) * 2) / 2`
  - *Verification benchmark:* For `SHC-0001` on `1.20 ha`, Urea `260 kg/ha` $\rightarrow$ `105.2 kg/acre` = **`2.5 bags/acre`**, farm `312 kg` = **`7 bags`**; DAP `108 kg/ha` $\rightarrow$ `43.7 kg/acre` = **`1 bag/acre`**, farm `130 kg` = **`2.5 bags`**.

### 5.3 SMS Encoding & Numeric Safeguard
- `encoding`: `'GSM7'` if every character is in the GSM-7 basic character set, else `'UCS2'`.
- `charCount`: `len(list(textLocal))`
- `segments`:
  - `GSM7`: `1` if `charCount <= 160` else `ceil(charCount / 153)`
  - `UCS2`: `1` if `charCount <= 70` else `ceil(charCount / 67)`
- `numbersPreserved`: Every regex match of `r"\d+(?:\.\d+)?"` in `textEnglish` must appear as a substring in `textLocal`. Block `POST /api/messages/{id}/submit` with `422` (`code: "NUMBERS_MISMATCH"`) if `numbersPreserved == False`.

### 5.4 SMS English Templates
- **`FARMER_ADVISORY` (`WATER`):**
  `"{name}, satellite shows possible water stress in your {crop} field at {village}. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: {kvk}. -Agri Dept {district}"`
- **`FARMER_ADVISORY` (`POSSIBLE_NUTRIENT`):**
  `"{name}, satellite shows weak growth in your {crop} field. Your Soil Health Card shows low {lowList}. Card advice per acre: {recList}. Confirm with KVK {kvk} before applying. -Agri Dept {district}"`
- **`FARMER_ADVISORY` (`MIXED` / `UNKNOWN`):**
  `"{name}, satellite shows stress in your {crop} field at {village}. An extension worker will contact you. Do not spray chemicals without KVK advice. KVK: {kvk}. -Agri Dept {district}"`
- **`DISTRICT_ADVISORY`:**
  `"{district}: {crop} crop stress risk is {riskLevel}. {smsAction} Weather: {topAlertOrNone}. KVK: {kvk}. -Agri Dept"`
- **`FOLLOWUP_REMINDER`:**
  `"Reminder: your {crop} field still shows stress since our message on {date}. Please inspect it and call KVK {kvk}. Reply 1 if you have taken action. -Agri Dept"`
- **`SOIL_CARD`:**
  `"Soil Health Card {cardNumber} ({sampleDate}): {ratingList}. Card advice per acre: {recList}. Ask KVK {kvk} before applying. -Agri Dept {district}"`

### 5.5 Separation of Duties & Lifecycle Rules
1. **Message Lifecycle:**
   `GENERATED` $\xrightarrow{\text{submit}}$ `PENDING_APPROVAL` $\xrightarrow{\text{approve}}$ `APPROVED` $\xrightarrow{\text{send}}$ `SENT` $\xrightarrow{\text{refresh-status}}$ `DELIVERED` | `FAILED` $\xrightarrow{\text{acknowledge}}$ `ACKNOWLEDGED`.
   - `approve` and `reject` **MUST** return `403` (`code: "SEPARATION_OF_DUTIES"`) if `X-Actor == message.generatedBy`.
   - `send` **MUST** return `422` (`code: "CONSENT_MISSING"`) if `farmer.consentSms == False`.
2. **21-Day Follow-Up & Case Closure:**
   - Thresholds on post-advisory usable Sentinel-2 passes:
     - `< 2` usable observations after day 5 $\rightarrow$ `INSUFFICIENT_DATA`
     - $\Delta\text{NDVI} \ge +0.05$ or $\text{slope} > +0.003/\text{day}$ $\rightarrow$ `RECOVERING` (Case status becomes `RECOVERING_PENDING_VERIFICATION` — **never auto-closes!**)
     - $\Delta\text{NDVI} \le -0.05$ or $\text{slope} < -0.003/\text{day}$ $\rightarrow$ `DETERIORATING` (Case status becomes `NEEDS_FIELD_SUPPORT` and auto-creates a `P1` `FieldSupportTask`)
     - Otherwise $\rightarrow$ `NOT_RECOVERING` (drafts reminder #1 if `reminderCount == 0`, or sets `NEEDS_FIELD_SUPPORT` if `reminderCount >= 1`).
   - `POST /api/cases/{id}/close` **MUST** return `422` (`code: "VERIFICATION_REQUIRED"`) unless the case has a `HumanVerification` with `outcome == 'CONFIRMED_RECOVERED'` OR a visited `FieldSupportTask` with `recommendClose == True`. Also enforce `X-Actor != latestVerification.verifiedBy` (`403`).

### 5.6 7-Layer SHA-256 Cryptographic Audit Chain
- Every state-mutating endpoint appends an `AuditEvent` row:
  - `prevHash`: `hash` of the previous event (or `"0000000000000000"` for event #1).
  - `hash`: `hashlib.sha256(f"{prevHash}|{layer}|{action}|{actor}|{entityId}|{summary}".encode()).hexdigest()[:16]`
- `GET /api/audit/verify-chain` recomputes hashes from event #1 to `N` and returns `{"valid": True, "eventCount": N, "brokenAtId": None}`.

---

## 6. Required Initial Seed Data (Must Exist on First Boot)

The frontend's `/design-lab` and deep links rely on these exact IDs being present in SQLite on startup:

### 6.1 25 Monitored Districts
```csv
id,district,state,lat,lon,crop,acreageLakh,kvk,language,ndvi,baseline,risk
yavatmal,Yavatmal,Maharashtra,20.3899,78.1307,Cotton,4.2,07232-242216,Marathi,0.49,0.68,87
akola,Akola,Maharashtra,20.7002,77.0082,Cotton,3.4,0724-2258372,Marathi,0.54,0.68,72
nashik,Nashik,Maharashtra,19.9975,73.7898,Soybean,2.1,0253-2305231,Marathi,0.64,0.65,38
nagpur,Nagpur,Maharashtra,21.1458,79.0882,Soybean,2.3,0712-2689485,Marathi,0.63,0.65,42
amravati,Amravati,Maharashtra,20.9374,77.7796,Cotton,3.0,0721-2661835,Marathi,0.58,0.68,59
ludhiana,Ludhiana,Punjab,30.9009,75.8573,Wheat,3.6,0161-2401960,Punjabi,0.62,0.65,52
bathinda,Bathinda,Punjab,30.207,74.9455,Cotton,2.4,0164-2215619,Punjabi,0.55,0.68,70
moga,Moga,Punjab,30.8165,75.1717,Wheat,2.1,01636-233119,Punjabi,0.64,0.65,40
patiala,Patiala,Punjab,30.3398,76.3869,Wheat,2.8,0175-2212974,Punjabi,0.65,0.65,35
sangrur,Sangrur,Punjab,30.2458,75.8421,Rice,2.2,01672-278129,Punjabi,0.69,0.70,37
meerut,Meerut,UP,28.9845,77.7064,Sugarcane,3.9,0121-2880521,Hindi,0.71,0.74,44
agra,Agra,UP,27.1767,78.0081,Wheat,2.5,0562-2960223,Hindi,0.60,0.65,57
jhansi,Jhansi,UP,25.4484,78.5685,Wheat,1.9,0510-2730466,Hindi,0.59,0.65,61
varanasi,Varanasi,UP,25.3176,82.9739,Rice,2.0,0542-2621182,Hindi,0.68,0.70,39
bareilly,Bareilly,UP,28.367,79.4304,Sugarcane,2.4,0581-2520360,Hindi,0.70,0.74,46
indore,Indore,MP,22.7196,75.8577,Soybean,3.7,0731-2470501,Hindi,0.61,0.65,55
ujjain,Ujjain,MP,23.1765,75.7885,Soybean,2.6,0734-2522359,Hindi,0.64,0.65,41
sehore,Sehore,MP,23.2032,77.0851,Soybean,2.8,07562-224561,Hindi,0.62,0.65,49
vidisha,Vidisha,MP,23.5251,77.8081,Wheat,2.0,07592-252145,Hindi,0.63,0.65,43
gwalior,Gwalior,MP,26.2183,78.1828,Wheat,1.8,0751-2467292,Hindi,0.58,0.65,62
jaipur,Jaipur,Rajasthan,26.9124,75.7873,Mustard,2.4,0141-2552909,Hindi,0.56,0.62,67
kota,Kota,Rajasthan,25.2138,75.8648,Soybean,2.3,0744-2471936,Hindi,0.60,0.65,58
sriganganagar,Sri Ganganagar,Rajasthan,29.9038,73.8772,Cotton,2.2,0154-2470190,Hindi,0.53,0.68,76
ajmer,Ajmer,Rajasthan,26.4499,74.6399,Wheat,1.7,0145-2671800,Hindi,0.61,0.65,51
bikaner,Bikaner,Rajasthan,28.0229,73.3119,Wheat,1.9,0151-2250017,Hindi,0.57,0.65,64
```

### 6.2 Key Entity IDs to Seed
*(Tip: You can copy the exact seed arrays from `farmpulse360/apps/web/src/mocks/data.ts` directly into your Python seed script!)*
- **Farmers (`FRM-0001` .. `FRM-0012`):**
  - `FRM-0001`: Ramesh Pawar (`yavatmal`, Ner, Cotton, `1.20 ha`, `Marathi`, `WORKER_VERIFIED`, `SHC-0001`, `CASE-0001` `MONITORING`)
  - `FRM-0002`: Sunita Jadhav (`yavatmal`, Darwha, Cotton, `0.80 ha`, `Marathi`, `WORKER_VERIFIED`, `CRITICAL WATER`, `CASE-0002` `NEEDS_FIELD_SUPPORT`, `FST-0001` `P1 OPEN`)
  - `FRM-0003`: Vithal Kale (`yavatmal`, Pusad, Cotton, `0.30 ha`, `UNVERIFIED`, `SMALL`, `LOW` reliability)
  - `FRM-0004`: Anjali Thakre (`akola`, Telhara, Cotton, `1.60 ha`, `CASE-0003` `RECOVERING_PENDING_VERIFICATION`)
  - `FRM-0005`: Gurpreet Singh (`ludhiana`, Jagraon, Wheat, `2.40 ha`, `Punjabi`, `SHC-0002` `NEEDS_REVIEW`)
  - `FRM-0006`: Harjit Kaur (`bathinda`, Rampura Phul, Cotton, `1.10 ha`, `Punjabi`, `CASE-0004` `NOT_RECOVERING`, `MSG-0004` `PENDING_APPROVAL`)
  - `FRM-0007`: Rajesh Yadav (`meerut`, Sardhana, Sugarcane, `0.90 ha`, `Hindi`, `CASE-0005` `CLOSED`)
  - `FRM-0008`: Kamla Devi (`jhansi`, Mauranipur, Wheat, `0.08 ha`, `TOO_SMALL`, `INSUFFICIENT` reliability)
  - `FRM-0009`: Mohan Patidar (`indore`, Depalpur, Soybean, `1.80 ha`, `CASE-0006` `DETECTED`, `MSG-0005` `GENERATED`)
  - `FRM-0010`: Lakshmi Meena (`sriganganagar`, Suratgarh, Cotton, `1.40 ha`, `CASE-0007` `INSUFFICIENT_DATA`, `FST-0002` `P3 ASSIGNED` to Sanjay Patil)
  - `FRM-0011`: Suresh Choudhary (`jaipur`, Chomu, Mustard, `0.45 ha`, `DISPUTED`, `consentSms: false`)
  - `FRM-0012`: Priya Deshmukh (`nashik`, Niphad, Soybean, `2.10 ha`, `SHC-0003` `SMS_PENDING_APPROVAL`, `MSG-0003`)
- **Soil Cards (`SHC-0001` .. `SHC-0003`):**
  - `SHC-0001` (`FRM-0001`, `CONFIRMED`)
  - `SHC-0002` (`FRM-0005`, `NEEDS_REVIEW`, with `DECIMAL_SHIFT_SUSPECTED` on `pH=72`, `UNIT_MISMATCH` on `P=38`, `LOW_CONFIDENCE` on `Zn=0.7`, `MISSING` on `B=null`, `ageFlag=true`)
  - `SHC-0003` (`FRM-0012`, `SMS_PENDING_APPROVAL`)
- **Messages (`MSG-0001` .. `MSG-0010`):**
  - Specifically `MSG-0003` (`SOIL_CARD` for `FRM-0012`, `PENDING_APPROVAL`, `generatedBy: "Vikas More"`) and `MSG-0004` (`FOLLOWUP_REMINDER` for `FRM-0006`, `PENDING_APPROVAL`, `generatedBy: "Asha Kulkarni"` so R. K. Sharma can approve it while Asha Kulkarni is blocked by separation of duties).

---

## 7. How to Connect & Test with the Frontend

1. Start the FastAPI server on port `8000`:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. In `farmpulse360/apps/web/.env`, set:
   ```env
   VITE_USE_MOCKS=false
   VITE_API_BASE=http://127.0.0.1:8000
   ```
3. Restart `npm run dev` in `farmpulse360/apps/web`.
4. Check the top-right status pill in the UI: it will switch from `MOCK DATA` to `LIVE API` with a pulsing green dot, and `/settings` will display the live upstream status of `NASA_POWER`, `NASA_GIBS_MODIS`, `OPEN_METEO`, `CDSE_SENTINEL2`, `GEMINI`, and `SMS`.

---

## 8. Complete Frontend Feature & Screen-by-Screen Integration Map

Because the frontend and backend were built in parallel, this section documents **every feature, screen, widget, persona, and button** that exists in `farmpulse360/apps/web` so you (and Claude) know exactly how the UI behaves and what data each screen expects.

### 8.1 Global Shell, Personas & Headers
- **Topbar Persona Switcher (`src/auth/personas.ts`):**
  The UI has 4 built-in government personas that can be switched at any time from the top-right dropdown. Every HTTP request automatically sends `X-Actor` and `X-Role` headers based on the active persona:
  1. **R. K. Sharma** (`DEPT_OFFICER` — District Agriculture Officer, Yavatmal) — **Default persona**
  2. **Asha Kulkarni** (`EXTENSION_WORKER` — Block Extension Officer, Yavatmal)
  3. **Dr. Gurप्रीत Sandhu** (`KVK_EXPERT` — Senior Agronomist, KVK Ludhiana)
  4. **Vikas More** (`LOCAL_REP` — Gram Panchayat Representative, Akola)
- **Live SSE Event Stream (`/api/events`):**
  The topbar opens an `EventSource` to `/api/events`. Whenever the backend emits an SSE event (`priority_scan.completed`, `message.status_changed`, `followup.checked`, `case.status_changed`, `soil_card.ocr_completed`, `audit.appended`), the frontend shows a toast notification and automatically refreshes the current screen's data.
- **Provenance Badges (`ProvenancePill`):**
  Every satellite metric, weather panel, soil card, and risk score renders a clickable provenance badge showing `source` (`CDSE_SENTINEL2`, `NASA_POWER`, `NASA_GIBS_MODIS`, `OPEN_METEO`, `GEMINI_OCR`, etc.), `status` (`LIVE` = green pulsing dot, `CACHED` = teal, `SIMULATED` = amber, `MANUAL` = slate), spatial resolution (`10m` vs `250m`), and observation age (`freshnessDays`).

---

### 8.2 Screen-by-Screen Feature Breakdown (All 18 Routes)

#### 1. `/` — Landing Page (`src/pages/Landing.tsx`)
- **What's on screen:** Executive pitch page explaining the 7-Layer Closed-Loop Agricultural Governance Architecture (250 m MODIS $\rightarrow$ 10 m Sentinel-2 $\rightarrow$ Soil Card OCR $\rightarrow$ Bilingual SMS $\rightarrow$ Separation-of-Duties Approval $\rightarrow$ 21-Day Recovery $\rightarrow$ Field Support & SHA-256 Audit Chain), interactive architecture cards, and quick-launch buttons into the console.
- **API calls:** None (static entry view).

#### 2. `/overview` — Command Overview (`src/pages/Overview.tsx`)
- **What's on screen:**
  - **8 KPI Stat Cards:** Districts Monitored (`25`), Critical Districts, Registered Farmers, Pending Approvals, Open Cases, Needs Field Support, Soil Cards Pending Review, Advisories Sent.
  - **7-Layer Pipeline Funnel Bar:** Visualizes live item counts across all 7 governance stages (`earlyWarning`, `fieldDiagnosis`, `soilCardOcr`, `advisoryDraft`, `humanApproval`, `followUp21d`, `fieldSupport`).
  - **Interactive 25-District Risk Map (`DistrictMap`):** Leaflet map with Esri Topo/Dark tiles + toggleable **live NASA GIBS MODIS 250 m NDVI satellite raster layer**, proportional risk circles, and click-to-inspect district drawer.
  - **Top Priority Districts Table & Recent SHA-256 Audit Ticker.**
  - **"Run Priority Scan" button:** Triggers a fresh satellite/weather scan across all 25 districts.
- **API calls:**
  - On mount: `GET /api/overview`, `GET /api/districts`
  - On "Run Priority Scan" click: `POST /api/districts/scan`

#### 3. `/early-warning` — District Early Warning (`src/pages/EarlyWarning.tsx`)
- **What's on screen:**
  - Full-bleed split view: **25-District Choropleth/Bubble Map** (with NASA GIBS MODIS NDVI raster toggle) on the left + filterable **Priority Queue Table** (filter by State, Risk Level `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`, Crop, search query) on the right.
  - **State Summary Strip:** Aggregate risk and critical district counts for Maharashtra, Punjab, UP, MP, and Rajasthan.
  - **Active Weather Alerts Ticker:** Synoptic heatwave, heavy rain, dry spell, and high wind alerts.
- **API calls:**
  - On mount: `GET /api/districts`, `GET /api/weather/alerts`
  - On "Run Priority Scan" click: `POST /api/districts/scan`

#### 4. `/district/:id` — District Deep-Dive Report (`src/pages/DistrictReport.tsx`)
- **What's on screen:**
  - **Composite Risk Breakdown:** Weighted gauge showing how `ndviAnomaly` (40%), `rainfallDeficit` (25%), `heatStress` (15%), `weatherAlerts` (10%), and `openCaseRatio` (10%) combine into the `0..100` `riskScore`.
  - **12-Point MODIS 250 m NDVI Time-Series Chart:** Plots observed `ndvi` vs. 10-year historical `baseline` (`Recharts` area chart).
  - **NASA POWER Observed Weather Strip:** Last 7 days `rainfall7dMm`, `rainfallBaselineMm`, `rainfallAnomalyPct`, `tMax7dC`, `rhMeanPct`, and `soilMoistureIndex` (`GWETROOT`).
  - **Open-Meteo 5-Day Forecast Table:** Daily `tMaxC`, `tMinC`, `rainMm`, `rainProbPct`, `windKmh`, and `et0Mm`.
  - **Registered Farmers & Cases in District** + **"Draft District Broadcast SMS" button** + **"Force Live Refresh" button**.
- **API calls:**
  - On mount: `GET /api/districts/{id}/report`
  - On "Refresh Live Data" click: `GET /api/districts/{id}/report?refresh=true`
  - On "Draft District Advisory" click: `POST /api/advisories/generate` (`kind: "DISTRICT_ADVISORY"`)

#### 5. `/farmers` — Farmer Registry (`src/pages/Farmers.tsx`)
- **What's on screen:**
  - Filterable table of all registered farmers showing Farmer ID (`FRM-0001`), village/district, crop, geodesic area (`hectares` + `acres`), **10 m Sentinel-2 Pixel Count** (`pixelCount10m`), **NDVI Reliability Pill** (`HIGH` / `MODERATE` / `LOW` / `INSUFFICIENT`), boundary verification status (`WORKER_VERIFIED` / `UNVERIFIED` / `DISPUTED`), Soil Card status, and active Case status.
- **API calls:**
  - On mount / filter: `GET /api/farmers?districtId=...&q=...`

#### 6. `/farmers/new` — Register Farmer & Draw Field Polygon (`src/pages/FarmerNew.tsx`)
- **What's on screen:**
  - Interactive **Leaflet Polygon Drawing Map (`FieldPolygonMap`)** where the extension worker clicks vertices around a farm plot (or selects a quick preset polygon).
  - **Live Geodesic Area & Sentinel-2 Pixel Preview:** Instantly calculates `hectares`, `acres`, `pixelCount10m`, and warns if the plot is `< 0.10 ha` (`TOO_SMALL` for 10 m Sentinel-2).
  - Form fields: Name, Phone, District, Village, Primary Crop, Sowing Date, Irrigation Source, Preferred Language, SMS Consent checkbox.
- **API calls:**
  - On submit: `POST /api/farmers`

#### 7. `/farmers/:id` — Farmer Field Diagnosis & Sentinel-2 Inspector (`src/pages/FarmerDetail.tsx`)
- **What's on screen:**
  - **Field Boundary Map (`FieldPolygonMap`):** Shows the exact GeoJSON farm boundary on satellite imagery + **Boundary Verification Modal** (`WORKER_VERIFIED` / `DISPUTED`).
  - **10 m Sentinel-2 Time-Series Chart:** Plots `ndvi` and `ndmi` passes alongside cloud cover (`cloudPct`) — cloud-rejected passes (`> 40%` cloud or `usable: false`) are highlighted as rejected markers.
  - **Stress Attribution Card:** Explains the diagnosed cause (`WATER`, `POSSIBLE_NUTRIENT`, `MIXED`, `UNKNOWN`, `INSUFFICIENT_DATA`), confidence (`HIGH`/`MEDIUM`/`LOW`), human-readable `drivers[]` bullets, and `recommendedCheck`.
  - **Linked Soil Health Card Summary, Active Case & Outbound SMS History.**
  - **Action Buttons:** `"Run Live Sentinel-2 Analysis"`, `"Verify Boundary"`, `"Draft Farmer Advisory SMS"`.
- **API calls:**
  - On mount: `GET /api/farmers/{id}`
  - On "Run Sentinel-2 Analysis": `POST /api/farmers/{id}/analyze`
  - On "Verify Boundary": `POST /api/farmers/{id}/boundary/verify`
  - On "Draft Advisory": `POST /api/advisories/generate` (`kind: "FARMER_ADVISORY"`)

#### 8. `/soil-cards` — Soil Health Card Registry (`src/pages/SoilCards.tsx`)
- **What's on screen:**
  - List of all digitized Soil Health Cards (`SHC-0001..`), showing farmer, lab name, sample date, age warning (`> 3 years`), OCR confidence, blocking flag count, and status (`NEEDS_REVIEW`, `CONFIRMED`, `SMS_PENDING_APPROVAL`, `SMS_SENT`).
- **API calls:**
  - On mount: `GET /api/soil-cards`

#### 9. `/soil-cards/new` — Soil Card Digitizer: Gemini Vision OCR + Manual Entry (`src/pages/SoilCardNew.tsx`)
- **What's on screen:**
  - **Tab 1 — AI Photo OCR (`POST /api/soil-cards/ocr`):** Drag-and-drop image uploader (plus 3 built-in sample Soil Health Card test images for instant demo testing) that sends `multipart/form-data` (`farmerId`, `image`) to Gemini Vision and redirects to the interactive review screen.
  - **Tab 2 — Manual 12-Parameter Entry (`POST /api/soil-cards/manual`):** Full form for all 12 ICAR parameters (`N`, `P`, `K`, `OC`, `pH`, `EC`, `S`, `Zn`, `Fe`, `Cu`, `Mn`, `B`), lab name, sample date, and cycle.
- **API calls:**
  - `POST /api/soil-cards/ocr` (`multipart/form-data`)
  - `POST /api/soil-cards/manual` (`application/json`)

#### 10. `/soil-cards/:id` — 12-Parameter ICAR Inspector, OCR Sanity Gate & Fertilizer Bag Calculator (`src/pages/SoilCardDetail.tsx`)
- **What's on screen:**
  - **OCR Plausibility & Sanity Banner (`SoilParameterTable`):** Highlights any parameter flagged with:
    - `OUT_OF_RANGE` (blocking)
    - `DECIMAL_SHIFT_SUSPECTED` (blocking — e.g. `pH = 72` instead of `7.2`, with a **1-click "Fix Decimal ($\div 10$)" button**)
    - `UNIT_MISMATCH` (blocking — e.g. `mg/kg` instead of `kg/ha`)
    - `LOW_CONFIDENCE` (non-blocking warning)
    - `MISSING` (non-blocking warning)
  - **Inline Parameter Editor:** Allows the officer to edit any value/unit (`PATCH /api/soil-cards/{id}`), which recomputes ratings and clears blocking flags.
  - **Fertilizer Bag Conversion Table:** Converts `kg/ha` lab advice into farmer-friendly **`kg/acre`**, **`bags/acre`** (rounded to nearest `0.5 bag`), and **total bags for the farmer's exact plot size**, plus `costInrEstimate` and `splitTiming`.
  - **Action Buttons:**
    - `"Confirm Soil Card"` (disabled with explanation until `blockingFlagsCount === 0`)
    - `"Generate Soil Card SMS"` (creates a `SOIL_CARD` message and sends it to the Approvals queue).
- **API calls:**
  - On mount: `GET /api/soil-cards/{id}`
  - On inline edit: `PATCH /api/soil-cards/{id}`
  - On confirm: `POST /api/soil-cards/{id}/confirm`
  - On SMS generation: `POST /api/soil-cards/{id}/generate-sms`

#### 11. `/advisories` — Advisory Composer & Regional SMS Translator (`src/pages/Advisories.tsx`)
- **What's on screen:**
  - **Left Column:** Filterable list of all outbound advisories (`FARMER_ADVISORY`, `DISTRICT_ADVISORY`, `FOLLOWUP_REMINDER`, `SOIL_CARD`) + **"New Advisory Generator"** modal.
  - **Right Column:**
    - **Rain-Deferral Gate Banner:** Automatically warns if 48-hour forecast rain $> 15\text{ mm}$ (`rainDeferral: true`) so fertilizer top-dressing is deferred.
    - **Bilingual Editor (`textEnglish` & `textLocal` in Hindi / Marathi / Punjabi)** with Gemini AI translation (`PATCH /api/messages/{id}`).
    - **Numeric Integrity Verifier (`numbersPreserved`):** Compares every number (`/\d+(?:\.\d+)?/g`) in `textEnglish` vs `textLocal` and blocks submission if a dose/phone number was altered during translation!
    - **Realistic Feature-Phone Handset Preview (`SmsPreviewCard`):** Shows `GSM-7` vs `UCS-2` encoding, character count, and SMS segment count (`160/153` vs `70/67`).
    - **"Submit for Approval" button** (`POST /api/messages/{id}/submit`).
- **API calls:**
  - `GET /api/messages`, `POST /api/advisories/generate`, `PATCH /api/messages/{id}`, `POST /api/messages/{id}/submit`

#### 12. `/approvals` — Two-Person Rule & Separation-of-Duties Queue (`src/pages/Approvals.tsx`)
- **What's on screen:**
  - Displays all messages in `PENDING_APPROVAL` or `APPROVED`.
  - **Separation-of-Duties Enforcement (`ApprovalCompare`):** Compares `message.generatedBy` with the currently logged-in persona (`X-Actor`). If the same person tries to approve their own draft, the UI shows a warning badge and the backend returns `403 SEPARATION_OF_DUTIES`! Switching the topbar persona (e.g. from Asha Kulkarni to R. K. Sharma) immediately unlocks approval.
  - **Dispatch & Delivery Loop:** Once `APPROVED`, clicking `"Send SMS Now"` dispatches via Twilio/Mock (`POST /api/messages/{id}/send`), `"Refresh Gateway Status"` polls delivery (`POST /api/messages/{id}/refresh-status`), and `"Record Farmer Ack"` logs farmer reply `1` or helpline call (`POST /api/messages/{id}/acknowledge`).
- **API calls:**
  - `GET /api/approvals`, `POST /api/messages/{id}/approve`, `POST /api/messages/{id}/reject`, `POST /api/messages/{id}/send`, `POST /api/messages/{id}/refresh-status`, `POST /api/messages/{id}/acknowledge`

#### 13. `/follow-up` — 21-Day Satellite Recovery Loop & Case Closure Gate (`src/pages/FollowUp.tsx`)
- **What's on screen:**
  - Tracks every active `Case` (`CASE-0001..0007`) after an advisory is sent.
  - **Before vs. After NDVI Sparkline & Delta Card:** Compares `baselineNdviAtAdvisory` against `postAdvisoryObservations[]` (`deltaNdvi` and `ndviSlopePerDay`).
  - **Hackathon Demo Time-Travel Simulator ("Fast-Forward +21 Days"):** Allows judges to simulate `+7`, `+14`, or `+21` days with scenarios `'RECOVERING'`, `'NOT_RECOVERING'`, `'DETERIORATING'`, or `'CLOUDY'` (`POST /api/demo/cases/{id}/fast-forward`) and then click `"Run 21-Day Evaluation"` (`POST /api/cases/{id}/followup/check`).
  - **Mandatory Human Verification & Case Closure Gate:** Even when satellite shows `RECOVERING`, a case **cannot** auto-close (`RECOVERING_PENDING_VERIFICATION`). An officer must first submit a `HumanVerification` (`POST /api/cases/{id}/verify`) and a different officer must close the case (`POST /api/cases/{id}/close`).
- **API calls:**
  - `GET /api/follow-ups`, `GET /api/cases`, `GET /api/cases/{id}`, `POST /api/demo/cases/{id}/fast-forward`, `POST /api/cases/{id}/followup/check`, `POST /api/cases/{id}/verify`, `POST /api/cases/{id}/close`, `POST /api/cases/{id}/reopen`

#### 14. `/field-support` — Extension Worker Dispatch Board (`src/pages/FieldSupport.tsx`)
- **What's on screen:**
  - Kanban/table of `FieldSupportTask` items (`FST-0001..0004`) prioritized `P1`..`P3` (created automatically when a crop is `DETERIORATING` at 21 days or has `INSUFFICIENT_DATA` from clouds/small plot size).
  - **Assign Extension Worker Modal (`POST /api/field-support/{id}/assign`)** and **Log Field Visit Outcome Modal (`POST /api/field-support/{id}/visit`)** with `findings`, `actionTaken`, and `recommendClose`.
- **API calls:**
  - `GET /api/field-support`, `POST /api/field-support/{id}/assign`, `POST /api/field-support/{id}/visit`

#### 15. `/audit` — 7-Layer Cryptographic SHA-256 Audit Ledger (`src/pages/Audit.tsx`)
- **What's on screen:**
  - Live ledger of every `AuditEvent` across layers `DATA_PROVENANCE`, `ANALYSIS`, `HUMAN_VERIFICATION`, `APPROVAL`, `OUTREACH`, `FIELD_ACTION`, `OUTCOME`, showing `prevHash` $\rightarrow$ `hash` (`16-char SHA-256`), actor, role, timestamp, and JSON payload inspector.
  - **"Verify SHA-256 Hash Chain" button:** Calls `GET /api/audit/verify-chain` and renders an animated cryptographic verification banner (`VALID` across $N$ events).
  - **"Export CSV" button:** Downloads `GET /api/audit/export.csv`.
- **API calls:**
  - `GET /api/audit`, `GET /api/audit/verify-chain`, `GET /api/audit/export.csv`

#### 16. `/audit/report/:caseId` — Printable Government Dossier (`src/pages/AuditReport.tsx`)
- **What's on screen:**
  - Print-ready (`@media print`) official Department of Agriculture dossier aggregating all 7 accountability sections (`DATA_PROVENANCE` .. `OUTCOME`) and SHA-256 chain integrity certificate for any case (or `/audit/report/illustrative`).
- **API calls:**
  - `GET /api/reports/case/{caseId}` and `GET /api/reports/illustrative`

#### 17. `/settings` — Live Upstream API Status & Demo Controls (`src/pages/Settings.tsx`)
- **What's on screen:**
  - Live health cards for all 6 upstream integrations (`NASA_POWER`, `NASA_GIBS_MODIS`, `OPEN_METEO`, `CDSE_SENTINEL2`, `GEMINI`, `SMS`) showing current mode (`LIVE`/`SIMULATED`/`MOCK`/`NOT_CONFIGURED`), `lastSuccessAt`, and `lastError`.
- **API calls:**
  - `GET /health`, `GET /api/meta/data-sources`

---

## 9. Priority Tiers & Playbook for Integrating an Already-Built Backend

If you already built your backend independently, integrate your endpoints in these **3 Priority Tiers**. Because the frontend (`src/api/client.ts`) automatically falls back to its built-in stateful store for any route that returns FastAPI's default `404 Not Found` or `501 Not Implemented`, **you can go live with Tier 1 immediately and add Tier 2 & Tier 3 incrementally!**

### Tier 1 — The "Real Satellite, Weather & Gemini AI" Core (Highest Impact for Judges)
Wire your existing Copernicus, NASA/Open-Meteo, and Gemini functions to these **8 routes first**:
1. `GET /health` & `GET /api/meta/data-sources` $\rightarrow$ Shows judges that `CDSE_SENTINEL2`, `NASA_POWER`, `OPEN_METEO`, and `GEMINI` are `LIVE` and configured.
2. `GET /api/districts` & `GET /api/districts/{id}/report` $\rightarrow$ Connects your NASA POWER / MODIS / Open-Meteo district risk and weather fetcher to the Early Warning map and District Report page.
3. `GET /api/farmers/{id}` & `POST /api/farmers/{id}/analyze` $\rightarrow$ Connects your **Copernicus Sentinel-2 (`CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET`)** polygon NDVI/NDMI fetcher and stress attribution logic to the Farmer Detail screen.
4. `POST /api/soil-cards/ocr` $\rightarrow$ Connects your **Gemini Vision (`GEMINI_API_KEY`)** Soil Health Card photo parser to the Soil Card uploader (`/soil-cards/new`).
5. `POST /api/advisories/generate` & `PATCH /api/messages/{id}` $\rightarrow$ Connects your **Gemini translation** (English $\rightarrow$ Hindi/Marathi/Punjabi) to the Advisory Composer (`/advisories`).

### Tier 2 — Core CRUD & Governance Loop
6. `GET /api/overview` (or let it aggregate from your DB)
7. `GET /api/farmers` & `POST /api/farmers`
8. `GET /api/soil-cards`, `GET /api/soil-cards/{id}`, `PATCH /api/soil-cards/{id}`, `POST /api/soil-cards/{id}/confirm`, `POST /api/soil-cards/{id}/generate-sms`
9. `GET /api/messages`, `GET /api/approvals`, `POST /api/messages/{id}/submit`, `POST /api/messages/{id}/approve`, `POST /api/messages/{id}/send`

### Tier 3 — 21-Day Follow-Up, Field Support & Audit Ledger
10. `GET /api/follow-ups`, `POST /api/demo/cases/{id}/fast-forward`, `POST /api/cases/{id}/followup/check`
11. `GET /api/cases`, `GET /api/cases/{id}`, `POST /api/cases/{id}/verify`, `POST /api/cases/{id}/close`
12. `GET /api/field-support`, `POST /api/field-support/{id}/assign`, `POST /api/field-support/{id}/visit`
13. `GET /api/audit`, `GET /api/audit/verify-chain`, `GET /api/reports/case/{caseId}`, `GET /api/reports/illustrative`

### Minimal `CamelModel` Base Class for FastAPI (Copy-Paste into Your Backend)
If your existing Python models use `snake_case` (e.g., `district_id`, `ndvi_anomaly_pct`, `risk_level`), inherit from this Pydantic v2 base class so FastAPI automatically serializes every response in the exact `camelCase` expected by the React frontend without renaming your Python variables:

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
```
When returning Pydantic models in FastAPI routes, use `response_model_by_alias=True` (or return `model.model_dump(by_alias=True)`).

