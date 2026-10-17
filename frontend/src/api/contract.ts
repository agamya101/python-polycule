export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type DataStatus = 'LIVE' | 'CACHED' | 'SIMULATED' | 'MANUAL';
export type Language = 'English' | 'Hindi' | 'Marathi' | 'Punjabi';
export type Role = 'DEPT_OFFICER' | 'EXTENSION_WORKER' | 'KVK_EXPERT' | 'LOCAL_REP';
export type Scale = 'DISTRICT_MODIS_250M' | 'FIELD_SENTINEL2_10M';

export interface Provenance { source: string; status: DataStatus; scale: Scale | null; observedAt: string | null; fetchedAt: string; freshnessDays: number | null; note: string | null; }

export interface DistrictSummary { id: string; district: string; state: string; lat: number; lon: number; primaryCrop: string; acreageLakh: number; language: Language; kvkContact: string; ndvi: number; ndviBaseline: number; ndviAnomalyPct: number; riskScore: number; riskLevel: RiskLevel; priorityRank: number; weatherAlertCount: number; registeredFarmers: number; openCases: number; provenance: Provenance; }
export interface StateSummary { state: string; avgRisk: number; districtCount: number; criticalDistricts: number; highDistricts: number; }
export interface DistrictsResponse { generatedAt: string; summary: { districtsMonitored: number; activeAlerts: number; criticalDistricts: number; registeredFarmers: number; needsFieldSupport: number; pendingApprovals: number; }; states: StateSummary[]; districts: DistrictSummary[]; }

export type ReasoningStatus = 'OK' | 'WARN' | 'ABSTAIN';
export interface ReasoningStep { step: number; agent: string; title: string; detail: string; status: ReasoningStatus; evidence: Provenance[]; }

export interface WeatherObs { rainfall7dMm: number; rainfallAnomalyPct: number; avgTempC: number; tempAnomalyC: number; humidityPct: number; provenance: Provenance; }
export interface ForecastDay { date: string; tMaxC: number; tMinC: number; rainMm: number; rainProbPct: number; windKmh: number; et0Mm: number; }
export type WeatherAlertType = 'HEAVY_RAIN' | 'HEATWAVE' | 'COLD_WAVE' | 'HIGH_WIND' | 'DRY_SPELL';
export type AlertSeverity = 'WATCH' | 'WARNING' | 'SEVERE';
export interface WeatherAlert { id: string; districtId: string; type: WeatherAlertType; severity: AlertSeverity; title: string; message: string; validFrom: string; validTo: string; provenance: Provenance; }

export interface RoleResponsibility { role: 'AGRICULTURE_DEPARTMENT' | 'EXTENSION_WORKER' | 'KVK' | 'LOCAL_REPRESENTATIVE'; title: string; responsibilities: string[]; contact: string; }
export interface InstitutionalBriefing { headline: string; summary: string; actions: string[]; insuranceSignal: { claimProbability: number; affectedAcreagePct: number; note: string }; }
export interface DistrictReport { runId: string; generatedAt: string; district: DistrictSummary; crop: string; cropStage: string; daysToHarvest: number; riskScore: number; riskLevel: RiskLevel; confidence: number; priority: Priority; escalate: boolean; escalationReason: string | null; recommendedAction: string; rootCause: string; freshness: { overall: 'FRESH' | 'AGING' | 'STALE'; ndviAgeDays: number | null; weatherAgeDays: number | null }; weather: WeatherObs; forecast5d: ForecastDay[]; weatherAlerts: WeatherAlert[]; pest: { name: string; probability: number }; reasoningChain: ReasoningStep[]; institutionalBriefing: InstitutionalBriefing; roles: RoleResponsibility[]; registeredFarmers: Farmer[]; warnings: string[]; dataSources: Provenance[]; }

export type BoundaryStatus = 'UNVERIFIED' | 'WORKER_VERIFIED' | 'DISPUTED';
export type SizeClass = 'TOO_SMALL' | 'SMALL' | 'ADEQUATE';
export interface GeoPolygon { type: 'Polygon'; coordinates: number[][][]; } // GeoJSON order [lon, lat]; ring closed
export interface FieldParcel { polygon: GeoPolygon; centroid: [number, number]; areaHa: number; pixelCount10m: number; sizeClass: SizeClass; boundaryStatus: BoundaryStatus; boundaryNote: string | null; boundaryVerifiedBy: string | null; boundaryVerifiedAt: string | null; } // centroid = [lat, lon]
export interface FieldObservation { date: string; ndvi: number | null; ndwi: number | null; cloudPct: number; validPixelPct: number; usable: boolean; status: DataStatus; }
export type StressType = 'NONE' | 'WATER' | 'POSSIBLE_NUTRIENT' | 'MIXED' | 'UNKNOWN';
export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export interface FieldStressSummary { asOf: string; ndviLatest: number | null; ndviBaseline: number | null; baselineMethod: 'PREVIOUS_YEAR' | 'CROP_DEFAULT'; ndviAnomalyPct: number | null; ndwiLatest: number | null; ndwiBaseline: number | null; ndwiChange: number | null; stressLevel: RiskLevel; stressType: StressType; reliability: Reliability; reliabilityReasons: string[]; provenance: Provenance; }
export interface Farmer { id: string; name: string; phoneMasked: string; language: Language; village: string; districtId: string; crop: string; sowingDate: string; consentSms: boolean; consentAt: string | null; registeredBy: string; createdAt: string; field: FieldParcel; latestStress: FieldStressSummary | null; soilCardId: string | null; openCaseId: string | null; isDemo: boolean; }
export interface FarmerDetail extends Farmer { observations: FieldObservation[]; reasoningChain: ReasoningStep[]; soilCard: SoilCard | null; messages: OutboundMessage[]; openCase: Case | null; followUp: FollowUp | null; auditEvents: AuditEvent[]; }
export interface FarmerCreate { name: string; phone: string; language: Language; village: string; districtId: string; crop: string; sowingDate: string; consentSms: boolean; polygon: GeoPolygon; }
export interface BoundaryVerifyBody { status: 'WORKER_VERIFIED' | 'DISPUTED'; note: string; polygon: GeoPolygon | null; }

export type SoilParam = 'pH' | 'EC' | 'OC' | 'N' | 'P' | 'K' | 'S' | 'Zn' | 'Fe' | 'Cu' | 'Mn' | 'B';
export type SoilRating = 'STRONGLY_ACIDIC' | 'MODERATELY_ACIDIC' | 'NEUTRAL' | 'MODERATELY_ALKALINE' | 'STRONGLY_ALKALINE' | 'NORMAL' | 'CRITICAL' | 'INJURIOUS' | 'LOW' | 'MEDIUM' | 'HIGH' | 'DEFICIENT' | 'SUFFICIENT';
export type OcrFlagCode = 'OUT_OF_RANGE' | 'DECIMAL_SHIFT_SUSPECTED' | 'UNIT_MISMATCH' | 'LOW_CONFIDENCE' | 'MISSING';
export interface OcrFlag { code: OcrFlagCode; message: string; suggestion: number | null; blocking: boolean; }
export interface SoilParamValue { param: SoilParam; label: string; value: number | null; unit: string; ocrRaw: string | null; ocrConfidence: number | null; rating: SoilRating | null; interpretation: string; flags: OcrFlag[]; confirmed: boolean; }
export type FertilizerProduct = 'Urea' | 'DAP' | 'MOP' | 'SSP' | 'NPK_10_26_26' | 'Zinc_Sulphate' | 'Other';
export interface FertilizerRecommendation { product: FertilizerProduct; productLabel: string; cardDose: number; cardDoseUnit: 'kg/ha' | 'kg/acre'; kgPerHa: number; kgPerAcre: number; bagSizeKg: number | null; bagsPerAcre: number | null; bagsForFarm: number | null; kgForFarm: number; timing: string | null; sourceText: string; }
export type SoilCardStatus = 'NEEDS_REVIEW' | 'CONFIRMED' | 'SMS_PENDING_APPROVAL' | 'SMS_APPROVED' | 'SMS_SENT' | 'SMS_REJECTED';
export interface SoilCard { id: string; farmerId: string; cardNumber: string | null; sampleDate: string | null; labName: string | null; imageUrl: string | null; status: SoilCardStatus; params: SoilParamValue[]; recommendations: FertilizerRecommendation[]; cardAgeYears: number | null; ageFlag: boolean; extractionMethod: 'GEMINI_OCR' | 'MANUAL'; createdBy: string; confirmedBy: string | null; messageId: string | null; createdAt: string; }
export interface RecommendationInput { product: FertilizerProduct; productLabel: string; cardDose: number; cardDoseUnit: 'kg/ha' | 'kg/acre'; timing: string | null; sourceText: string; }
export interface SoilCardManualCreate { farmerId: string; cardNumber: string | null; sampleDate: string | null; labName: string | null; params: { param: SoilParam; value: number | null; unit: string }[]; recommendations: RecommendationInput[]; }
export interface SoilCardPatch { cardNumber?: string | null; sampleDate?: string | null; labName?: string | null; params?: { param: SoilParam; value: number | null; unit: string; confirmed: boolean }[]; recommendations?: RecommendationInput[]; }

export type MessageKind = 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'SOIL_CARD' | 'FOLLOWUP_REMINDER';
export type MessageStatus = 'GENERATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';
export interface StatusEvent { status: MessageStatus; at: string; actor: string; role: Role | 'SYSTEM'; note: string | null; }
export interface OutboundMessage { id: string; kind: MessageKind; parentId: string | null; caseId: string | null; farmerId: string | null; soilCardId: string | null; districtId: string; language: Language; textEnglish: string; textLocal: string; charCount: number; segments: number; encoding: 'GSM7' | 'UCS2'; translation: { method: 'GEMINI' | 'TEMPLATE' | 'NONE'; numbersPreserved: boolean; warning: string | null }; status: MessageStatus; statusHistory: StatusEvent[]; recipientCount: number; deliveryStats: { sent: number; delivered: number; failed: number; acknowledged: number } | null; generatedBy: string; approvedBy: string | null; rejectedReason: string | null; provider: 'MOCK' | 'TWILIO'; providerMessageId: string | null; createdAt: string; }
export interface AdvisoryGenerate { kind: 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'FOLLOWUP_REMINDER'; districtId?: string; farmerId?: string; caseId?: string; language: Language; }
export interface MessagePatch { textEnglish: string; textLocal: string; }
export interface AcknowledgeBody { method: 'FARMER_REPLY' | 'PHONE_CALL' | 'IN_PERSON'; note: string; }

export type CaseStatus = 'DETECTED' | 'ADVISORY_PENDING_APPROVAL' | 'MONITORING' | 'RECOVERING_PENDING_VERIFICATION' | 'NOT_RECOVERING' | 'NEEDS_FIELD_SUPPORT' | 'INSUFFICIENT_DATA' | 'FIELD_VISITED' | 'CLOSED' | 'REOPENED';
export type FollowUpOutcome = 'PENDING' | 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'INSUFFICIENT_DATA';
export interface HumanVerification { method: 'PHONE_CALL' | 'FIELD_VISIT' | 'FARMER_REPLY'; outcome: 'CONFIRMED_RECOVERED' | 'NOT_RECOVERED' | 'COULD_NOT_REACH' | 'DISAGREES_WITH_ASSESSMENT'; observation: string; verifiedBy: string; role: Role; at: string; }
export interface Case { id: string; farmerId: string; farmerName: string; districtId: string; status: CaseStatus; trigger: 'FIELD_STRESS' | 'DISTRICT_ALERT' | 'SOIL_CARD' | 'MANUAL'; openedAt: string; stressAtOpen: FieldStressSummary; reminderCount: number; lastMessageId: string | null; verifications: HumanVerification[]; closedAt: string | null; closedBy: string | null; closeReason: string | null; }
export interface FollowUp { caseId: string; farmerId: string; startedAt: string; windowDays: number; extendedOnce: boolean; dayNumber: number; monitoringScale: Scale; baselineNdvi: number | null; observations: FieldObservation[]; latestNdvi: number | null; deltaNdvi: number | null; slopePerDay: number | null; outcome: FollowUpOutcome; outcomeReason: string; requiresHumanVerification: boolean; lastCheckedAt: string | null; nextCheckAt: string | null; }
export interface CaseDetail { case: Case; farmer: Farmer; followUp: FollowUp | null; messages: OutboundMessage[]; fieldSupportTasks: FieldSupportTask[]; auditEvents: AuditEvent[]; }
export interface VerifyBody { method: HumanVerification['method']; outcome: HumanVerification['outcome']; observation: string; }
export interface ReasonBody { reason: string; }
export interface FastForwardBody { days: number; scenario: 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'CLOUDY'; }

export type TaskStatus = 'OPEN' | 'ASSIGNED' | 'VISITED' | 'RESOLVED' | 'CANCELLED';
export interface FieldSupportTask { id: string; caseId: string; farmerId: string; farmerName: string; districtId: string; village: string; reason: string; priority: 'P1' | 'P2' | 'P3'; createdAt: string; dueBy: string; overdue: boolean; status: TaskStatus; assignedTo: string | null; assignedRole: 'KVK_EXPERT' | 'LOCAL_REP' | null; visit: { visitedAt: string; visitedBy: string; findings: string; actionTaken: string; recommendClose: boolean } | null; }
export interface AssignBody { assignedTo: string; assignedRole: 'KVK_EXPERT' | 'LOCAL_REP'; }
export interface VisitBody { findings: string; actionTaken: string; recommendClose: boolean; }

export type AuditLayer = 'DATA_PROVENANCE' | 'ANALYSIS' | 'HUMAN_VERIFICATION' | 'APPROVAL' | 'OUTREACH' | 'FIELD_ACTION' | 'OUTCOME';
export interface AuditEvent { id: number; at: string; layer: AuditLayer; action: string; actor: string; role: Role | 'SYSTEM'; caseId: string | null; farmerId: string | null; districtId: string | null; entityType: string; entityId: string; summary: string; details: Record<string, unknown>; isSimulated: boolean; prevHash: string; hash: string; }
export interface ReportRow { label: string; value: string; status: DataStatus | null; }
export interface ReportSection { key: string; title: string; accountableRole: string; rows: ReportRow[]; }
export interface ConsolidatedReport { caseId: string; generatedAt: string; isIllustrative: boolean; sections: ReportSection[]; integrity: { eventCount: number; chainValid: boolean; lastHash: string }; }
export interface ChainVerifyResponse { valid: boolean; eventCount: number; brokenAtId: number | null; }

export interface AgentEvent { runId: string; agent: 'Satellite Scout' | 'Weather Watch' | 'Crop Risk Analyst' | 'Field Monitor'; step: string; status: 'RUNNING' | 'COMPLETE' | 'ERROR'; message: string; at: string; }
export interface OverviewResponse { generatedAt: string; kpis: { districtsMonitored: number; activeAlerts: number; criticalDistricts: number; registeredFarmers: number; pendingApprovals: number; needsFieldSupport: number; monitoringCases: number; acknowledgedRatePct: number | null; }; outreachFunnel: { generated: number; pendingApproval: number; approved: number; sent: number; delivered: number; acknowledged: number; failed: number; rejected: number; }; followUpOutcomes: { pending: number; recovering: number; notRecovering: number; deteriorating: number; insufficientData: number; }; topDistricts: DistrictSummary[]; weatherAlerts: WeatherAlert[]; recentEvents: AuditEvent[]; }
export interface DataSourceStatus { key: 'NASA_POWER' | 'NASA_GIBS_MODIS' | 'OPEN_METEO' | 'CDSE_SENTINEL2' | 'GEMINI' | 'SMS'; name: string; purpose: string; mode: 'LIVE' | 'SIMULATED' | 'MOCK' | 'NOT_CONFIGURED'; lastSuccessAt: string | null; lastError: string | null; }
export interface ApiError { detail: string; code: string; }
