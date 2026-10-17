import toast from 'react-hot-toast';
import type {
  AcknowledgeBody,
  AdvisoryGenerate,
  ApiError,
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
  Role,
  SoilCard,
  SoilCardManualCreate,
  SoilCardPatch,
  TaskStatus,
  VerifyBody,
  VisitBody,
  WeatherAlert,
} from './contract';
import { PERSONAS } from '@/auth/personas';
import {
  mockAcknowledgeMessage,
  mockAnalyzeFarmer,
  mockApproveMessage,
  mockAssignFieldSupportTask,
  mockCheckFollowUp,
  mockCloseCase,
  mockConfirmSoilCard,
  mockCreateFarmer,
  mockCreateSoilCardManual,
  mockCreateSoilCardOcr,
  mockFastForwardFollowUp,
  mockGenerateAdvisory,
  mockGenerateSoilCardSms,
  mockGetApprovals,
  mockGetAuditEvents,
  mockGetCaseDetail,
  mockGetCases,
  mockGetConsolidatedReport,
  mockGetDataSources,
  mockGetDistrictReport,
  mockGetDistricts,
  mockGetFarmerDetail,
  mockGetFarmers,
  mockGetFieldSupportTasks,
  mockGetFollowUps,
  mockGetHealth,
  mockGetMessage,
  mockGetMessages,
  mockGetOverview,
  mockGetSoilCard,
  mockGetSoilCards,
  mockGetWeatherAlerts,
  mockPatchMessage,
  mockPatchSoilCard,
  mockRefreshMessageStatus,
  mockRejectMessage,
  mockReopenCase,
  mockRunPriorityScan,
  mockSendMessage,
  mockSubmitMessage,
  mockVerifyAuditChain,
  mockVerifyBoundary,
  mockVerifyCase,
  mockVisitFieldSupportTask,
  MockApiError,
  type ActorHeaders,
} from '@/mocks/handlers';

export class ApiClientError extends Error {
  code: string;
  detail: string;
  status: number;
  constructor(code: string, detail: string, status: number) {
    super(detail);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}

export function getApiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined) || 'http://127.0.0.1:8000';
}

let activeActorOverride: ActorHeaders | null = null;

export function setClientActor(actor: string, role: Role): void {
  activeActorOverride = { actor, role };
}

export function getClientActor(): ActorHeaders {
  if (activeActorOverride) return activeActorOverride;
  const savedId = typeof window !== 'undefined' ? localStorage.getItem('fp.persona') : null;
  const found = PERSONAS.find((p) => p.id === savedId) ?? PERSONAS[1]; // default p2 R. K. Sharma
  return { actor: found.name, role: found.role };
}

async function wrapMock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MockApiError) {
      toast.error(err.detail);
      throw new ApiClientError(err.code, err.detail, err.status);
    }
    const msg = err instanceof Error ? err.message : 'Unexpected mock error';
    toast.error(msg);
    throw new ApiClientError('MOCK_ERROR', msg, 500);
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  mockFallback?: () => Promise<T>,
): Promise<T> {
  if (isMockMode() && mockFallback) {
    return wrapMock(mockFallback);
  }

  const actor = getClientActor();
  const headers = new Headers(options.headers);
  headers.set('X-Actor', actor.actor);
  headers.set('X-Role', actor.role);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    if (mockFallback) {
      return wrapMock(mockFallback);
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    toast.error(msg);
    throw new ApiClientError('NETWORK_ERROR', msg, 503);
  }

  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let detail = `Request failed (${res.status})`;
    let rawCode: string | undefined;
    try {
      const errJson = (await res.json()) as Partial<ApiError>;
      if (errJson.detail) detail = errJson.detail;
      if (errJson.code) {
        code = errJson.code;
        rawCode = errJson.code;
      }
    } catch {
      // ignore json parse error
    }

    // If the live backend hasn't implemented this route yet (FastAPI default 404 "Not Found" without domain error code, or 501),
    // seamlessly fall back to the stateful mock store so partial backend integration works out-of-the-box.
    const isUnimplementedRoute =
      (res.status === 404 && !rawCode && detail === 'Not Found') || res.status === 501;
    if (isUnimplementedRoute && mockFallback) {
      return wrapMock(mockFallback);
    }

    toast.error(detail);
    throw new ApiClientError(code, detail, res.status);
  }

  return (await res.json()) as T;
}

export async function getHealth(): Promise<{ status: 'ok' }> {
  return requestJson<{ status: 'ok' }>('/health', {}, () => mockGetHealth());
}

export async function getDataSources(): Promise<DataSourceStatus[]> {
  return requestJson<DataSourceStatus[]>('/api/meta/data-sources', {}, () => mockGetDataSources());
}

export async function getOverview(): Promise<OverviewResponse> {
  return requestJson<OverviewResponse>('/api/overview', {}, () => mockGetOverview());
}

export async function getDistricts(): Promise<DistrictsResponse> {
  return requestJson<DistrictsResponse>('/api/districts', {}, () => mockGetDistricts());
}

export async function getDistrictReport(id: string, refresh = false): Promise<DistrictReport> {
  return requestJson<DistrictReport>(
    `/api/districts/${encodeURIComponent(id)}/report?refresh=${refresh}`,
    {},
    () => mockGetDistrictReport(id, refresh, getClientActor()),
  );
}

export async function runPriorityScan(): Promise<{ runId: string }> {
  return requestJson<{ runId: string }>(
    '/api/districts/scan',
    { method: 'POST' },
    () => mockRunPriorityScan(getClientActor()),
  );
}

export async function getWeatherAlerts(districtId?: string): Promise<WeatherAlert[]> {
  const qs = districtId ? `?districtId=${encodeURIComponent(districtId)}` : '';
  return requestJson<WeatherAlert[]>(
    `/api/weather/alerts${qs}`,
    {},
    () => mockGetWeatherAlerts(districtId),
  );
}

export async function getFarmers(districtId?: string, q?: string): Promise<Farmer[]> {
  const params = new URLSearchParams();
  if (districtId) params.set('districtId', districtId);
  if (q) params.set('q', q);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return requestJson<Farmer[]>(
    `/api/farmers${qs}`,
    {},
    () => mockGetFarmers(districtId, q),
  );
}

export async function createFarmer(body: FarmerCreate): Promise<Farmer> {
  return requestJson<Farmer>(
    '/api/farmers',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockCreateFarmer(body, getClientActor()),
  );
}

export async function getFarmerDetail(id: string): Promise<FarmerDetail> {
  return requestJson<FarmerDetail>(
    `/api/farmers/${encodeURIComponent(id)}`,
    {},
    () => mockGetFarmerDetail(id),
  );
}

export async function analyzeFarmer(id: string): Promise<FarmerDetail> {
  return requestJson<FarmerDetail>(
    `/api/farmers/${encodeURIComponent(id)}/analyze`,
    { method: 'POST' },
    () => mockAnalyzeFarmer(id, getClientActor()),
  );
}

export async function verifyBoundary(id: string, body: BoundaryVerifyBody): Promise<Farmer> {
  return requestJson<Farmer>(
    `/api/farmers/${encodeURIComponent(id)}/boundary/verify`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockVerifyBoundary(id, body, getClientActor()),
  );
}

export async function getSoilCards(farmerId?: string): Promise<SoilCard[]> {
  const qs = farmerId ? `?farmerId=${encodeURIComponent(farmerId)}` : '';
  return requestJson<SoilCard[]>(
    `/api/soil-cards${qs}`,
    {},
    () => mockGetSoilCards(farmerId),
  );
}

export async function createSoilCardOcr(farmerId: string, image: File): Promise<SoilCard> {
  const fd = new FormData();
  fd.append('farmerId', farmerId);
  fd.append('image', image);
  return requestJson<SoilCard>(
    '/api/soil-cards/ocr',
    {
      method: 'POST',
      body: fd,
    },
    () => mockCreateSoilCardOcr(farmerId, image.name, getClientActor()),
  );
}

export async function createSoilCardManual(body: SoilCardManualCreate): Promise<SoilCard> {
  return requestJson<SoilCard>(
    '/api/soil-cards/manual',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockCreateSoilCardManual(body, getClientActor()),
  );
}

export async function getSoilCard(id: string): Promise<SoilCard> {
  return requestJson<SoilCard>(
    `/api/soil-cards/${encodeURIComponent(id)}`,
    {},
    () => mockGetSoilCard(id),
  );
}

export async function patchSoilCard(id: string, body: SoilCardPatch): Promise<SoilCard> {
  return requestJson<SoilCard>(
    `/api/soil-cards/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    () => mockPatchSoilCard(id, body, getClientActor()),
  );
}

export async function confirmSoilCard(id: string): Promise<SoilCard> {
  return requestJson<SoilCard>(
    `/api/soil-cards/${encodeURIComponent(id)}/confirm`,
    { method: 'POST' },
    () => mockConfirmSoilCard(id, getClientActor()),
  );
}

export async function generateSoilCardSms(id: string, language: Language): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/soil-cards/${encodeURIComponent(id)}/generate-sms`,
    {
      method: 'POST',
      body: JSON.stringify({ language }),
    },
    () => mockGenerateSoilCardSms(id, language, getClientActor()),
  );
}

export async function generateAdvisory(body: AdvisoryGenerate): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    '/api/advisories/generate',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockGenerateAdvisory(body, getClientActor()),
  );
}

export async function getMessages(filters?: {
  status?: MessageStatus;
  kind?: MessageKind;
  farmerId?: string;
  districtId?: string;
}): Promise<OutboundMessage[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.kind) params.set('kind', filters.kind);
  if (filters?.farmerId) params.set('farmerId', filters.farmerId);
  if (filters?.districtId) params.set('districtId', filters.districtId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return requestJson<OutboundMessage[]>(
    `/api/messages${qs}`,
    {},
    () => mockGetMessages(filters),
  );
}

export async function getMessage(id: string): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}`,
    {},
    () => mockGetMessage(id),
  );
}

export async function patchMessage(id: string, body: MessagePatch): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    () => mockPatchMessage(id, body, getClientActor()),
  );
}

export async function submitMessage(id: string): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/submit`,
    { method: 'POST' },
    () => mockSubmitMessage(id, getClientActor()),
  );
}

export async function approveMessage(id: string, note = ''): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ note }),
    },
    () => mockApproveMessage(id, note, getClientActor()),
  );
}

export async function rejectMessage(id: string, reason: string): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
    () => mockRejectMessage(id, { reason }, getClientActor()),
  );
}

export async function sendMessage(id: string): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/send`,
    { method: 'POST' },
    () => mockSendMessage(id, getClientActor()),
  );
}

export async function refreshMessageStatus(id: string): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/refresh-status`,
    { method: 'POST' },
    () => mockRefreshMessageStatus(id, getClientActor()),
  );
}

export async function acknowledgeMessage(id: string, body: AcknowledgeBody): Promise<OutboundMessage> {
  return requestJson<OutboundMessage>(
    `/api/messages/${encodeURIComponent(id)}/acknowledge`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockAcknowledgeMessage(id, body, getClientActor()),
  );
}

export async function getApprovals(): Promise<OutboundMessage[]> {
  return requestJson<OutboundMessage[]>(
    '/api/approvals',
    {},
    () => mockGetApprovals(),
  );
}

export async function getCases(filters?: {
  status?: CaseStatus;
  districtId?: string;
}): Promise<Case[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.districtId) params.set('districtId', filters.districtId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return requestJson<Case[]>(
    `/api/cases${qs}`,
    {},
    () => mockGetCases(filters),
  );
}

export async function getCaseDetail(id: string): Promise<CaseDetail> {
  return requestJson<CaseDetail>(
    `/api/cases/${encodeURIComponent(id)}`,
    {},
    () => mockGetCaseDetail(id),
  );
}

export async function checkFollowUp(caseId: string): Promise<FollowUp> {
  return requestJson<FollowUp>(
    `/api/cases/${encodeURIComponent(caseId)}/followup/check`,
    { method: 'POST' },
    () => mockCheckFollowUp(caseId, getClientActor()),
  );
}

export async function verifyCase(caseId: string, body: VerifyBody): Promise<Case> {
  return requestJson<Case>(
    `/api/cases/${encodeURIComponent(caseId)}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockVerifyCase(caseId, body, getClientActor()),
  );
}

export async function closeCase(caseId: string, reason: string): Promise<Case> {
  return requestJson<Case>(
    `/api/cases/${encodeURIComponent(caseId)}/close`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
    () => mockCloseCase(caseId, { reason }, getClientActor()),
  );
}

export async function reopenCase(caseId: string, reason: string): Promise<Case> {
  return requestJson<Case>(
    `/api/cases/${encodeURIComponent(caseId)}/reopen`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
    () => mockReopenCase(caseId, { reason }, getClientActor()),
  );
}

export async function fastForwardCase(caseId: string, body: FastForwardBody): Promise<FollowUp> {
  return requestJson<FollowUp>(
    `/api/demo/cases/${encodeURIComponent(caseId)}/fast-forward`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockFastForwardFollowUp(caseId, body, getClientActor()),
  );
}

export async function getFollowUps(): Promise<FollowUp[]> {
  return requestJson<FollowUp[]>(
    '/api/follow-ups',
    {},
    () => mockGetFollowUps(),
  );
}

export async function getFieldSupportTasks(status?: TaskStatus): Promise<FieldSupportTask[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return requestJson<FieldSupportTask[]>(
    `/api/field-support${qs}`,
    {},
    () => mockGetFieldSupportTasks(status),
  );
}

export async function assignFieldSupportTask(id: string, body: AssignBody): Promise<FieldSupportTask> {
  return requestJson<FieldSupportTask>(
    `/api/field-support/${encodeURIComponent(id)}/assign`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockAssignFieldSupportTask(id, body, getClientActor()),
  );
}

export async function visitFieldSupportTask(id: string, body: VisitBody): Promise<FieldSupportTask> {
  return requestJson<FieldSupportTask>(
    `/api/field-support/${encodeURIComponent(id)}/visit`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    () => mockVisitFieldSupportTask(id, body, getClientActor()),
  );
}

export async function getAuditEvents(filters?: {
  layer?: AuditLayer;
  caseId?: string;
  farmerId?: string;
  districtId?: string;
  limit?: number;
}): Promise<AuditEvent[]> {
  const params = new URLSearchParams();
  if (filters?.layer) params.set('layer', filters.layer);
  if (filters?.caseId) params.set('caseId', filters.caseId);
  if (filters?.farmerId) params.set('farmerId', filters.farmerId);
  if (filters?.districtId) params.set('districtId', filters.districtId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return requestJson<AuditEvent[]>(
    `/api/audit${qs}`,
    {},
    () => mockGetAuditEvents(filters),
  );
}

export async function verifyAuditChain(): Promise<ChainVerifyResponse> {
  return requestJson<ChainVerifyResponse>(
    '/api/audit/verify-chain',
    {},
    () => mockVerifyAuditChain(),
  );
}

export async function getConsolidatedReport(caseId: string): Promise<ConsolidatedReport> {
  const path =
    caseId === 'illustrative'
      ? '/api/reports/illustrative'
      : `/api/reports/case/${encodeURIComponent(caseId)}`;
  return requestJson<ConsolidatedReport>(
    path,
    {},
    () => mockGetConsolidatedReport(caseId),
  );
}

export async function exportAuditCsv(): Promise<void> {
  if (!isMockMode()) {
    window.open(`${getApiBase()}/api/audit/export.csv`, '_blank');
    return;
  }
  const events = await mockGetAuditEvents({ limit: 1000 });
  const headers = [
    'id',
    'at',
    'layer',
    'action',
    'actor',
    'role',
    'caseId',
    'farmerId',
    'districtId',
    'entityType',
    'entityId',
    'summary',
    'isSimulated',
    'prevHash',
    'hash',
  ];
  const escapeCsv = (val: unknown) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = events.map((e) =>
    [
      e.id,
      e.at,
      e.layer,
      e.action,
      e.actor,
      e.role,
      e.caseId,
      e.farmerId,
      e.districtId,
      e.entityType,
      e.entityId,
      e.summary,
      e.isSimulated,
      e.prevHash,
      e.hash,
    ]
      .map(escapeCsv)
      .join(','),
  );
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `krishimitra-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
