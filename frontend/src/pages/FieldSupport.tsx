import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ClipboardCheck,
  Columns,
  ExternalLink,
  List,
  MapPin,
  Tractor,
  UserPlus,
} from 'lucide-react';
import type { FieldSupportTask, TaskStatus } from '@/api/contract';
import {
  assignFieldSupportTask,
  getFieldSupportTasks,
  visitFieldSupportTask,
} from '@/api/client';
import { PERSONAS } from '@/auth/personas';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { RoleGate } from '@/components/ui/RoleGate';
import { formatDateTime, formatRelative } from '@/lib/format';

const COLUMNS: Array<{ status: TaskStatus; title: string }> = [
  { status: 'OPEN', title: 'Open' },
  { status: 'ASSIGNED', title: 'Assigned' },
  { status: 'VISITED', title: 'Visited' },
  { status: 'RESOLVED', title: 'Resolved' },
];

function priorityTone(p: FieldSupportTask['priority']) {
  switch (p) {
    case 'P1':
      return 'danger' as const;
    case 'P2':
      return 'warning' as const;
    default:
      return 'info' as const;
  }
}

export const FieldSupport: React.FC = () => {
  const [tasks, setTasks] = useState<FieldSupportTask[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Assign modal
  const [assignTask, setAssignTask] = useState<FieldSupportTask | null>(null);
  const fieldAssignees = useMemo(
    () =>
      PERSONAS.filter(
        (p) => p.role === 'KVK_EXPERT' || p.role === 'LOCAL_REP',
      ),
    [],
  );
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(
    fieldAssignees[0]?.id ?? 'p4',
  );

  // Visit modal
  const [visitTask, setVisitTask] = useState<FieldSupportTask | null>(null);
  const [visitFindings, setVisitFindings] = useState('');
  const [visitActionTaken, setVisitActionTaken] = useState('');
  const [visitRecommendClose, setVisitRecommendClose] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFieldSupportTasks();
      setTasks(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load field support queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleAssignSubmit = async () => {
    if (!assignTask) return;
    const targetPersona =
      fieldAssignees.find((p) => p.id === selectedPersonaId) ?? fieldAssignees[0];
    if (!targetPersona) return;
    const assignedRole: 'KVK_EXPERT' | 'LOCAL_REP' =
      targetPersona.role === 'LOCAL_REP' ? 'LOCAL_REP' : 'KVK_EXPERT';
    setBusy(true);
    try {
      await assignFieldSupportTask(assignTask.id, {
        assignedTo: targetPersona.name,
        assignedRole,
      });
      setAssignTask(null);
      await loadTasks();
      toast.success(`Assigned ${assignTask.id} to ${targetPersona.name}`);
    } finally {
      setBusy(false);
    }
  };

  const handleVisitSubmit = async () => {
    if (!visitTask || !visitFindings.trim() || !visitActionTaken.trim()) return;
    setBusy(true);
    try {
      await visitFieldSupportTask(visitTask.id, {
        findings: visitFindings.trim(),
        actionTaken: visitActionTaken.trim(),
        recommendClose: visitRecommendClose,
      });
      setVisitTask(null);
      setVisitFindings('');
      setVisitActionTaken('');
      setVisitRecommendClose(false);
      await loadTasks();
      toast.success(`Recorded field visit for ${visitTask.id}`);
    } finally {
      setBusy(false);
    }
  };

  const tableColumns: TableColumn<FieldSupportTask>[] = [
    {
      key: 'id',
      header: 'Task',
      sortValue: (t) => t.id,
      render: (t) => <span className="font-mono text-xs font-semibold text-ink">{t.id}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      sortValue: (t) => t.priority,
      render: (t) => <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>,
    },
    {
      key: 'farmerName',
      header: 'Farmer & Village',
      sortValue: (t) => t.farmerName,
      render: (t) => (
        <div>
          <Link
            to={`/farmers/${t.farmerId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t.farmerName} ({t.farmerId})
          </Link>
          <p className="text-xs text-ink-muted capitalize">
            {t.village}, {t.districtId}
          </p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (t) => <span className="text-xs text-ink">{t.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (t) => t.status,
      render: (t) => <Badge tone="neutral">{t.status}</Badge>,
    },
    {
      key: 'assignedTo',
      header: 'Assignee',
      render: (t) => (
        <span className="text-xs text-ink-muted">
          {t.assignedTo ? `${t.assignedTo} (${t.assignedRole})` : 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'dueBy',
      header: 'Due',
      sortValue: (t) => t.dueBy,
      render: (t) =>
        t.overdue ? (
          <Badge tone="danger">Overdue · {formatRelative(t.dueBy)}</Badge>
        ) : (
          <span className="text-xs text-ink-muted fp-num">{formatRelative(t.dueBy)}</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => (
        <div className="flex items-center gap-2">
          {t.status === 'OPEN' && (
            <RoleGate action="task.assign">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAssignTask(t);
                  setSelectedPersonaId(fieldAssignees[0]?.id ?? 'p4');
                }}
              >
                Assign
              </Button>
            </RoleGate>
          )}
          {(t.status === 'OPEN' || t.status === 'ASSIGNED') && (
            <RoleGate action="task.visit">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setVisitTask(t);
                  setVisitFindings(t.visit?.findings ?? '');
                  setVisitActionTaken(t.visit?.actionTaken ?? '');
                  setVisitRecommendClose(t.visit?.recommendClose ?? false);
                }}
              >
                Record visit
              </Button>
            </RoleGate>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Layer 6 · Ground Intervention Dispatch"
          title="Field Support Queue"
          description="Escalated P1–P3 field tasks for KVK agronomists and local representatives when remote advisory is not enough."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadTasks()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 6 · Ground Intervention Dispatch"
        title="Field Support Queue"
        description="On-ground escalation queue triggered by deteriorating NDVI, repeated non-recovery, or persistent cloud cover."
        actions={
          <div className="flex items-center gap-2">
            <DataBadge status="LIVE" source="Field Support Queue" />
            <div className="inline-flex rounded-button border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'board'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Columns className="h-3.5 w-3.5" />
                Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'table'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>
          </div>
        }
      />

      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="rounded-card border border-line bg-surface-2 shadow-card p-3.5 flex flex-col gap-3 min-h-[420px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <Tractor className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-ink">
                      {col.title}
                    </span>
                  </div>
                  <Badge tone="neutral">{colTasks.length}</Badge>
                </div>

                {colTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-ink-muted py-8 text-center">
                    No tasks in {col.title}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {colTasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-card border border-line bg-surface p-3.5 shadow-card space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                            <span className="font-mono text-xs font-semibold text-ink">
                              {t.id}
                            </span>
                          </div>
                          {t.overdue ? (
                            <Badge tone="danger">
                              Overdue ({formatRelative(t.dueBy)})
                            </Badge>
                          ) : (
                            <span className="text-[11px] font-mono text-ink-muted fp-num">
                              Due {formatRelative(t.dueBy)}
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-ink">{t.farmerName}</p>
                          <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5 capitalize">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {t.village}, {t.districtId}
                          </p>
                        </div>

                        <p className="text-xs text-ink leading-relaxed bg-surface-2 rounded-input p-2.5 border border-line">
                          {t.reason}
                        </p>

                        <div className="text-xs text-ink-muted">
                          Assignee:{' '}
                          <strong className="text-ink">
                            {t.assignedTo
                              ? `${t.assignedTo} (${t.assignedRole})`
                              : 'Unassigned'}
                          </strong>
                        </div>

                        {t.visit && (
                          <div className="rounded-input border border-success/30 bg-success/10 p-2.5 text-xs space-y-1">
                            <p className="font-semibold text-ink">
                              Visit findings ({formatDateTime(t.visit.visitedAt)}):
                            </p>
                            <p className="text-ink">{t.visit.findings}</p>
                            {t.visit.actionTaken && (
                              <p className="text-ink-muted">
                                Action: {t.visit.actionTaken}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line text-xs">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/farmers/${t.farmerId}`}
                              className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                            >
                              Farmer
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                            <Link
                              to={`/follow-up?caseId=${t.caseId}`}
                              className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                            >
                              {t.caseId}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {(t.status === 'OPEN' || t.status === 'ASSIGNED') && (
                              <RoleGate action="task.assign">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAssignTask(t);
                                    setSelectedPersonaId(fieldAssignees[0]?.id ?? 'p4');
                                  }}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Assign
                                </Button>
                              </RoleGate>
                            )}
                            {(t.status === 'OPEN' || t.status === 'ASSIGNED') && (
                              <RoleGate action="task.visit">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => {
                                    setVisitTask(t);
                                    setVisitFindings(t.visit?.findings ?? '');
                                    setVisitActionTaken(t.visit?.actionTaken ?? '');
                                    setVisitRecommendClose(t.visit?.recommendClose ?? false);
                                  }}
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  Record visit
                                </Button>
                              </RoleGate>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card
          eyebrow="Table View"
          title="Field Support Tasks"
          actions={<DataBadge status="LIVE" source="Field Support Queue" />}
        >
          <Table columns={tableColumns} data={tasks} rowKey={(t) => t.id} />
        </Card>
      )}

      {/* Assign Modal */}
      <Modal
        open={Boolean(assignTask)}
        onClose={() => setAssignTask(null)}
        title={assignTask ? `Assign ${assignTask.id} (${assignTask.farmerName})` : 'Assign task'}
      >
        <div className="space-y-4">
          <Select
            label="Select KVK Expert or Local Representative"
            value={selectedPersonaId}
            onChange={(e) => setSelectedPersonaId(e.target.value)}
          >
            {fieldAssignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.roleLabel} ({p.role})
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAssignTask(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void handleAssignSubmit()}
            >
              Confirm assignment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record Visit Modal */}
      <Modal
        open={Boolean(visitTask)}
        onClose={() => setVisitTask(null)}
        title={
          visitTask
            ? `Record field visit · ${visitTask.id} (${visitTask.farmerName})`
            : 'Record field visit'
        }
      >
        <div className="space-y-4">
          <Textarea
            label="On-ground findings (required)"
            rows={3}
            value={visitFindings}
            onChange={(e) => setVisitFindings(e.target.value)}
            placeholder="E.g. Root zone moisture critically low; no pest infestation observed."
          />
          <Textarea
            label="Action taken / advice given (required)"
            rows={3}
            value={visitActionTaken}
            onChange={(e) => setVisitActionTaken(e.target.value)}
            placeholder="E.g. Arranged community borewell slot for evening irrigation; advised mulching."
          />
          <Toggle
            checked={visitRecommendClose}
            onChange={setVisitRecommendClose}
            label="Recommend case closure (crop has recovered on ground)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setVisitTask(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={!visitFindings.trim() || !visitActionTaken.trim()}
              onClick={() => void handleVisitSubmit()}
            >
              Save visit report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
