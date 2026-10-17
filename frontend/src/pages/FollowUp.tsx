import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FastForward,
  Lock,
  RefreshCw,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import type {
  Case,
  CaseDetail,
  FastForwardBody,
  FollowUp as FollowUpType,
  FollowUpOutcome,
  VerifyBody,
} from '@/api/contract';
import {
  checkFollowUp,
  closeCase,
  fastForwardCase,
  getCaseDetail,
  getCases,
  getFollowUps,
  reopenCase,
  verifyCase,
} from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Tooltip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { RoleGate } from '@/components/ui/RoleGate';
import { FollowUpChart } from '@/components/domain/FollowUpChart';
import { formatDate, formatDateTime, formatNum } from '@/lib/format';

function outcomeTone(outcome: FollowUpOutcome) {
  switch (outcome) {
    case 'RECOVERING':
      return 'success' as const;
    case 'NOT_RECOVERING':
      return 'warning' as const;
    case 'DETERIORATING':
      return 'danger' as const;
    case 'INSUFFICIENT_DATA':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
}

export const FollowUp: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryCaseId = searchParams.get('caseId');

  const [followUps, setFollowUps] = useState<FollowUpType[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | FollowUpOutcome>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(queryCaseId);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Fast-forward state
  const [ffDays, setFfDays] = useState<number>(10);
  const [ffScenario, setFfScenario] =
    useState<FastForwardBody['scenario']>('DETERIORATING');

  // Modals
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyMethod, setVerifyMethod] =
    useState<VerifyBody['method']>('FIELD_VISIT');
  const [verifyOutcome, setVerifyOutcome] =
    useState<VerifyBody['outcome']>('CONFIRMED_RECOVERED');
  const [verifyNote, setVerifyNote] = useState('');

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, casesRes] = await Promise.all([getFollowUps(), getCases()]);
      setFollowUps(list);
      setCases(casesRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load follow-up tracker');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const casesById = useMemo(() => {
    const map: Record<string, Case> = {};
    for (const c of cases) map[c.id] = c;
    return map;
  }, [cases]);

  const loadDrawerCase = useCallback(async (cId: string) => {
    setDrawerLoading(true);
    try {
      const detail = await getCaseDetail(cId);
      setCaseDetail(detail);
    } catch {
      toast.error(`Could not load case ${cId}`);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (queryCaseId) {
      setSelectedCaseId(queryCaseId);
      void loadDrawerCase(queryCaseId);
    }
  }, [queryCaseId, loadDrawerCase]);

  const openCaseDrawer = (cId: string) => {
    setSelectedCaseId(cId);
    setSearchParams({ caseId: cId });
    void loadDrawerCase(cId);
  };

  const closeCaseDrawer = () => {
    setSelectedCaseId(null);
    setCaseDetail(null);
    setSearchParams({});
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: followUps.length,
      PENDING: 0,
      RECOVERING: 0,
      NOT_RECOVERING: 0,
      DETERIORATING: 0,
      INSUFFICIENT_DATA: 0,
    };
    for (const f of followUps) {
      map[f.outcome] = (map[f.outcome] ?? 0) + 1;
    }
    return map;
  }, [followUps]);

  const filteredList = useMemo(() => {
    if (outcomeFilter === 'ALL') return followUps;
    return followUps.filter((f) => f.outcome === outcomeFilter);
  }, [followUps, outcomeFilter]);

  const handleRunCheckNow = async () => {
    if (!selectedCaseId) return;
    setActionBusy(true);
    try {
      await checkFollowUp(selectedCaseId);
      await Promise.all([loadList(), loadDrawerCase(selectedCaseId)]);
      toast.success('Follow-up satellite check completed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleFastForward = async () => {
    if (!selectedCaseId) return;
    setActionBusy(true);
    try {
      const updated = await fastForwardCase(selectedCaseId, {
        days: ffDays,
        scenario: ffScenario,
      });
      await Promise.all([loadList(), loadDrawerCase(selectedCaseId)]);
      toast.success(
        `Fast-forwarded +${ffDays} days (${ffScenario}) → outcome ${updated.outcome}`,
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRecordVerification = async () => {
    if (!selectedCaseId || !verifyNote.trim()) return;
    setActionBusy(true);
    try {
      await verifyCase(selectedCaseId, {
        method: verifyMethod,
        outcome: verifyOutcome,
        observation: verifyNote.trim(),
      });
      setVerifyModalOpen(false);
      setVerifyNote('');
      await Promise.all([loadList(), loadDrawerCase(selectedCaseId)]);
      toast.success('Human verification recorded');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCloseCase = async () => {
    if (!selectedCaseId || !closeReason.trim()) return;
    setActionBusy(true);
    try {
      await closeCase(selectedCaseId, closeReason.trim());
      setCloseModalOpen(false);
      setCloseReason('');
      await Promise.all([loadList(), loadDrawerCase(selectedCaseId)]);
      toast.success(`Case ${selectedCaseId} closed`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleReopenCase = async () => {
    if (!selectedCaseId || !reopenReason.trim()) return;
    setActionBusy(true);
    try {
      await reopenCase(selectedCaseId, reopenReason.trim());
      setReopenModalOpen(false);
      setReopenReason('');
      await Promise.all([loadList(), loadDrawerCase(selectedCaseId)]);
      toast.success(`Case ${selectedCaseId} reopened`);
    } finally {
      setActionBusy(false);
    }
  };

  const canCloseCurrentCase = useMemo(() => {
    if (!caseDetail || caseDetail.case.status === 'CLOSED') return false;
    const latestVer =
      caseDetail.case.verifications[caseDetail.case.verifications.length - 1];
    const hasRecoveredVer = latestVer?.outcome === 'CONFIRMED_RECOVERED';
    const hasRecommendCloseTask = caseDetail.fieldSupportTasks.some(
      (t) => t.visit?.recommendClose,
    );
    return hasRecoveredVer || hasRecommendCloseTask;
  }, [caseDetail]);

  const columns: TableColumn<FollowUpType>[] = [
    {
      key: 'caseId',
      header: 'Case',
      sortValue: (f) => f.caseId,
      render: (f) => (
        <span className="font-mono text-xs font-semibold text-primary">{f.caseId}</span>
      ),
    },
    {
      key: 'farmerName',
      header: 'Farmer',
      sortValue: (f) => casesById[f.caseId]?.farmerName ?? f.farmerId,
      render: (f) => {
        const fName = casesById[f.caseId]?.farmerName ?? f.farmerId;
        return (
          <div>
            <p className="text-sm font-medium text-ink">{fName}</p>
            <p className="text-xs text-ink-muted font-mono">{f.farmerId}</p>
          </div>
        );
      },
    },
    {
      key: 'districtId',
      header: 'District',
      sortValue: (f) => casesById[f.caseId]?.districtId ?? '',
      render: (f) => (
        <span className="text-xs capitalize text-ink">
          {casesById[f.caseId]?.districtId ?? '—'}
        </span>
      ),
    },
    {
      key: 'dayNumber',
      header: 'Day x/21',
      sortValue: (f) => f.dayNumber,
      render: (f) => (
        <div className="w-28 space-y-1">
          <div className="flex justify-between text-xs fp-num">
            <span>
              Day {f.dayNumber}/{f.windowDays}
            </span>
          </div>
          <ProgressBar
            value={Math.min(100, Math.round((f.dayNumber / f.windowDays) * 100))}
            tone={f.outcome === 'DETERIORATING' ? 'danger' : 'primary'}
          />
        </div>
      ),
    },
    {
      key: 'baselineNdvi',
      header: 'Baseline',
      sortValue: (f) => f.baselineNdvi ?? -1,
      render: (f) => (
        <span className="font-mono text-xs fp-num">{formatNum(f.baselineNdvi, 2)}</span>
      ),
    },
    {
      key: 'latestNdvi',
      header: 'Latest',
      sortValue: (f) => f.latestNdvi ?? -1,
      render: (f) => (
        <span className="font-mono text-xs fp-num">{formatNum(f.latestNdvi, 2)}</span>
      ),
    },
    {
      key: 'deltaNdvi',
      header: 'Δ NDVI',
      sortValue: (f) => f.deltaNdvi ?? -99,
      render: (f) => {
        if (f.deltaNdvi === null) return <span className="text-xs text-ink-muted">—</span>;
        const sign = f.deltaNdvi > 0 ? '+' : '';
        const color =
          f.deltaNdvi >= 0.05
            ? 'text-success font-semibold'
            : f.deltaNdvi <= -0.05
              ? 'text-danger font-semibold'
              : 'text-ink';
        return (
          <span className={`font-mono text-xs fp-num ${color}`}>
            {sign}
            {f.deltaNdvi.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'slopePerDay',
      header: 'Slope',
      sortValue: (f) => f.slopePerDay ?? -99,
      render: (f) => {
        if (f.slopePerDay === null) return <span className="text-xs text-ink-muted">—</span>;
        const Icon =
          f.slopePerDay > 0.002
            ? ArrowUpRight
            : f.slopePerDay < -0.002
              ? ArrowDownRight
              : ArrowRight;
        const color =
          f.slopePerDay > 0.002
            ? 'text-success'
            : f.slopePerDay < -0.002
              ? 'text-danger'
              : 'text-ink-muted';
        return (
          <span className={`inline-flex items-center gap-1 font-mono text-xs fp-num ${color}`}>
            <Icon className="h-3.5 w-3.5" />
            {f.slopePerDay > 0 ? '+' : ''}
            {f.slopePerDay.toFixed(4)}/d
          </span>
        );
      },
    },
    {
      key: 'outcome',
      header: 'Outcome',
      sortValue: (f) => f.outcome,
      render: (f) => <Badge tone={outcomeTone(f.outcome)}>{f.outcome}</Badge>,
    },
    {
      key: 'requiresHumanVerification',
      header: 'Human check',
      sortValue: (f) => (f.requiresHumanVerification ? 1 : 0),
      render: (f) =>
        f.requiresHumanVerification ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <UserCheck className="h-3.5 w-3.5" />
            Needed
          </span>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        ),
    },
    {
      key: 'scale',
      header: 'Scale',
      render: (f) => <ScaleBadge scale={f.monitoringScale} />,
    },
    {
      key: 'nextCheckAt',
      header: 'Next check',
      sortValue: (f) => f.nextCheckAt ?? '',
      render: (f) => (
        <span className="text-xs text-ink-muted fp-num">{formatDate(f.nextCheckAt)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Layer 6 · 21-Day Field Recovery Watch"
          title="Post-Advisory Follow-up"
          description="Sentinel-2 10 m field monitoring after farmer advisory dispatch."
        />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadList()} />;
  }

  const filterChips: Array<{ key: 'ALL' | FollowUpOutcome; label: string }> = [
    { key: 'ALL', label: 'All cases' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'RECOVERING', label: 'Recovering' },
    { key: 'NOT_RECOVERING', label: 'Not recovering' },
    { key: 'DETERIORATING', label: 'Deteriorating' },
    { key: 'INSUFFICIENT_DATA', label: 'Insufficient data' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 6 · 21-Day Field Recovery Watch"
        title="Post-Advisory Follow-up"
        description="Automated 21-day Sentinel-2 watch per parcel. Satellite recovery never auto-closes a case — human verification is mandatory."
        actions={
          <div className="flex items-center gap-2">
            <ScaleBadge scale="FIELD_SENTINEL2_10M" />
            <DataBadge status="SIMULATED" source="Sentinel-2 L2A 10m" />
          </div>
        }
      />

      {/* Outcome filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {filterChips.map((chip) => {
          const active = outcomeFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setOutcomeFilter(chip.key)}
              className={`inline-flex items-center gap-2 rounded-badge px-3 py-1.5 text-xs font-medium transition-colors border ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line bg-surface text-ink hover:bg-surface-2'
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`rounded-badge px-1.5 py-0.5 text-[11px] fp-num ${
                  active ? 'bg-surface/20 text-on-primary' : 'bg-surface-2 text-ink-muted'
                }`}
              >
                {counts[chip.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <Card
        eyebrow="Active Follow-Up Watchlist"
        title="21-Day Sentinel-2 Trajectory"
        actions={<DataBadge status="SIMULATED" source="Follow-up Agent" />}
      >
        <Table
          columns={columns}
          data={filteredList}
          rowKey={(f) => f.caseId}
          onRowClick={(f) => openCaseDrawer(f.caseId)}
        />
      </Card>

      <Drawer
        open={Boolean(selectedCaseId)}
        onClose={closeCaseDrawer}
        title={
          caseDetail
            ? `${caseDetail.case.id} · ${caseDetail.case.farmerName}`
            : selectedCaseId ?? 'Case Follow-Up'
        }
      >
        {drawerLoading || !caseDetail ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{caseDetail.case.status}</Badge>
                {caseDetail.followUp && (
                  <Badge tone={outcomeTone(caseDetail.followUp.outcome)}>
                    {caseDetail.followUp.outcome}
                  </Badge>
                )}
              </div>
              <Link
                to={`/farmers/${caseDetail.case.farmerId}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open farmer profile →
              </Link>
            </div>

            {caseDetail.followUp && (
              <>
                <FollowUpChart
                  observations={caseDetail.followUp.observations}
                  baselineNdvi={caseDetail.followUp.baselineNdvi}
                  windowDays={caseDetail.followUp.windowDays}
                />

                <div className="rounded-card border border-line bg-surface-2 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="fp-eyebrow">Latest Trajectory Evaluation</span>
                    <span className="text-xs font-mono text-ink-muted">
                      Day {caseDetail.followUp.dayNumber}/{caseDetail.followUp.windowDays} ·
                      Reminders: {caseDetail.case.reminderCount}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">
                    {caseDetail.followUp.outcomeReason}
                  </p>
                </div>

                {/* Observations list */}
                <div className="space-y-2">
                  <p className="fp-eyebrow">Post-Advisory Sentinel-2 Observations</p>
                  <div className="max-h-44 overflow-y-auto rounded-input border border-line divide-y divide-line">
                    {caseDetail.followUp.observations.map((obs, i) => (
                      <div
                        key={`${obs.date}-${i}`}
                        className="px-3 py-2 text-xs flex items-center justify-between bg-surface"
                      >
                        <span className="font-mono text-ink">{obs.date}</span>
                        <span className="font-mono fp-num text-ink">
                          NDVI: {obs.usable && obs.ndvi !== null ? obs.ndvi.toFixed(2) : '—'}
                        </span>
                        <span className="font-mono fp-num text-ink-muted">
                          Cloud: {obs.cloudPct}%
                        </span>
                        <Badge tone={obs.usable ? 'success' : 'warning'}>
                          {obs.usable ? 'Usable' : 'Cloudy'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Human Verifications */}
            <div className="space-y-2">
              <p className="fp-eyebrow">
                Human Verifications
              </p>
              {caseDetail.case.verifications.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  No human verification recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {caseDetail.case.verifications.map((v, vIdx) => (
                    <div
                      key={`${v.at}-${vIdx}`}
                      className="rounded-input border border-line bg-surface p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">
                          {v.outcome} via {v.method}
                        </span>
                        <span className="text-ink-muted fp-num">{formatDateTime(v.at)}</span>
                      </div>
                      <p className="text-ink">{v.observation}</p>
                      <p className="text-ink-muted">
                        Recorded by {v.verifiedBy} ({v.role})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-card border border-line bg-surface p-4 space-y-3">
              <p className="fp-eyebrow">Case & Verification Actions</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={actionBusy}
                  onClick={() => void handleRunCheckNow()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Run check now
                </Button>

                <RoleGate action="case.verify">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setVerifyModalOpen(true)}
                  >
                    <UserCheck className="h-4 w-4" />
                    Record verification
                  </Button>
                </RoleGate>

                {caseDetail.case.status !== 'CLOSED' ? (
                  <RoleGate action="case.close">
                    {canCloseCurrentCase ? (
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => setCloseModalOpen(true)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Close case
                      </Button>
                    ) : (
                      <Tooltip content="Cannot close case yet: requires a CONFIRMED_RECOVERED human verification or a field visit with recommendClose=true.">
                        <span className="inline-flex items-center gap-1.5 rounded-button border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-muted cursor-not-allowed">
                          <Lock className="h-3.5 w-3.5" />
                          Close case (verification required)
                        </span>
                      </Tooltip>
                    )}
                  </RoleGate>
                ) : (
                  <RoleGate action="case.close">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReopenModalOpen(true)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </Button>
                  </RoleGate>
                )}
              </div>
            </div>

            {/* 21-Day Window Projection Box */}
            <div className="rounded-card border-2 border-dashed border-warning/50 bg-warning/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FastForward className="h-4 w-4 text-warning" />
                  <span className="text-xs font-bold uppercase tracking-wider text-ink">
                    Advance 21-Day Recovery Window
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Advance by days"
                  value={String(ffDays)}
                  onChange={(e) => setFfDays(Number(e.target.value))}
                >
                  <option value="5">+5 days (1 pass)</option>
                  <option value="10">+10 days (2 passes)</option>
                  <option value="21">+21 days (full window)</option>
                </Select>
                <Select
                  label="Trajectory scenario"
                  value={ffScenario}
                  onChange={(e) =>
                    setFfScenario(e.target.value as FastForwardBody['scenario'])
                  }
                >
                  <option value="RECOVERING">RECOVERING (NDVI rises)</option>
                  <option value="NOT_RECOVERING">NOT_RECOVERING (flat)</option>
                  <option value="DETERIORATING">DETERIORATING (creates P1 task)</option>
                  <option value="CLOUDY">CLOUDY (insufficient data)</option>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="accent"
                  size="sm"
                  loading={actionBusy}
                  onClick={() => void handleFastForward()}
                >
                  <FastForward className="h-4 w-4" />
                  Advance +{ffDays} days ({ffScenario})
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Record Verification Modal */}
      <Modal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        title="Record human verification"
      >
        <div className="space-y-4">
          <Select
            label="Verification method"
            value={verifyMethod}
            onChange={(e) => setVerifyMethod(e.target.value as VerifyBody['method'])}
          >
            <option value="FIELD_VISIT">Field visit by extension worker / KVK</option>
            <option value="PHONE_CALL">Phone call with farmer</option>
            <option value="FARMER_REPLY">Farmer SMS confirmation</option>
          </Select>
          <Select
            label="Observed outcome"
            value={verifyOutcome}
            onChange={(e) => setVerifyOutcome(e.target.value as VerifyBody['outcome'])}
          >
            <option value="CONFIRMED_RECOVERED">
              CONFIRMED_RECOVERED — Crop vigour restored
            </option>
            <option value="NOT_RECOVERED">
              NOT_RECOVERED — Needs continued support
            </option>
            <option value="COULD_NOT_REACH">
              COULD_NOT_REACH — Unable to contact farmer
            </option>
            <option value="DISAGREES_WITH_ASSESSMENT">
              DISAGREES_WITH_ASSESSMENT — Farmer reports normal crop
            </option>
          </Select>
          <Textarea
            label="Farmer / field observation (required)"
            rows={3}
            value={verifyNote}
            onChange={(e) => setVerifyNote(e.target.value)}
            placeholder="E.g. Farmer irrigated twice; new leaf flush visible across central plot."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setVerifyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={actionBusy}
              disabled={!verifyNote.trim()}
              onClick={() => void handleRecordVerification()}
            >
              Save verification
            </Button>
          </div>
        </div>
      </Modal>

      {/* Close Case Modal */}
      <Modal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        title={`Close case ${selectedCaseId ?? ''}`}
      >
        <div className="space-y-4">
          <div className="rounded-input border border-success/30 bg-success/10 p-3 text-xs text-ink flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>
              Human verification requirement satisfied. Closing this case records an immutable
              OUTCOME event in the audit chain.
            </span>
          </div>
          <Textarea
            label="Closure summary reason (required)"
            rows={3}
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="E.g. Satellite NDVI recovery (+0.11) confirmed by field visit."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCloseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={actionBusy}
              disabled={!closeReason.trim()}
              onClick={() => void handleCloseCase()}
            >
              Confirm closure
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reopen Case Modal */}
      <Modal
        open={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        title={`Reopen case ${selectedCaseId ?? ''}`}
      >
        <div className="space-y-4">
          <div className="rounded-input border border-warning/30 bg-warning/10 p-3 text-xs text-ink flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span>Reopening returns the case to active monitoring and logs an audit event.</span>
          </div>
          <Textarea
            label="Reason for reopening (required)"
            rows={3}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="E.g. Farmer reported renewed wilting after heatwave."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReopenModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={actionBusy}
              disabled={!reopenReason.trim()}
              onClick={() => void handleReopenCase()}
            >
              Reopen case
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
