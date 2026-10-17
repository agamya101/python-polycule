import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { Farmer, OutboundMessage, SoilCard } from '@/api/contract';
import {
  approveMessage,
  getApprovals,
  getFarmers,
  getSoilCards,
  rejectMessage,
  sendMessage,
} from '@/api/client';
import { useRole } from '@/auth/RoleContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { RoleGate } from '@/components/ui/RoleGate';
import { Tooltip } from '@/components/ui/Tooltip';
import { FertilizerTable } from '@/components/domain/FertilizerTable';
import { formatDateTime } from '@/lib/format';

export const Approvals: React.FC = () => {
  const { persona } = useRole();
  const [queue, setQueue] = useState<OutboundMessage[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [recentlyApproved, setRecentlyApproved] = useState<Record<string, OutboundMessage>>(
    {},
  );
  const [soilCardsById, setSoilCardsById] = useState<Record<string, SoilCard>>({});
  const [approveNotes, setApproveNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<OutboundMessage | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [approvalsRes, soilRes, farmersRes] = await Promise.all([
        getApprovals(),
        getSoilCards(),
        getFarmers(),
      ]);
      // Sort oldest first
      const sorted = [...approvalsRes].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      setQueue(sorted);
      setFarmers(farmersRes);
      const map: Record<string, SoilCard> = {};
      for (const sc of soilRes) {
        map[sc.id] = sc;
      }
      setSoilCardsById(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const farmersById = useMemo(() => {
    const map: Record<string, Farmer> = {};
    for (const f of farmers) map[f.id] = f;
    return map;
  }, [farmers]);

  const handleApprove = async (msg: OutboundMessage) => {
    setBusyId(msg.id);
    try {
      const note = approveNotes[msg.id]?.trim() || 'Department approved for SMS dispatch';
      const updated = await approveMessage(msg.id, note);
      setRecentlyApproved((prev) => ({ ...prev, [msg.id]: updated }));
      setQueue((prev) => prev.filter((item) => item.id !== msg.id));
      toast.success(`Message ${msg.id} approved`);
    } finally {
      setBusyId(null);
    }
  };

  const handleSendNow = async (msg: OutboundMessage) => {
    setBusyId(msg.id);
    try {
      const sent = await sendMessage(msg.id);
      setRecentlyApproved((prev) => ({ ...prev, [msg.id]: sent }));
      toast.success(`Message ${msg.id} dispatched (${sent.status})`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusyId(rejectTarget.id);
    try {
      await rejectMessage(rejectTarget.id, rejectReason.trim());
      setQueue((prev) => prev.filter((item) => item.id !== rejectTarget.id));
      toast.success(`Message ${rejectTarget.id} rejected`);
      setRejectTarget(null);
      setRejectReason('');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Layer 4 · Institutional Approval Gate"
          title="Department Approval Queue"
          description="Nothing reaches a farmer without department approval."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  const allApprovedCards = Object.values(recentlyApproved);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 4 · Institutional Approval Gate"
        title="Department Approval Queue"
        description="Nothing reaches a farmer without department approval. Separation of duties is strictly enforced: the person who generated a message cannot approve their own draft."
        actions={
          <div className="flex items-center gap-2">
            <DataBadge status="LIVE" source="Approval Gate" />
            <Badge tone={queue.length > 0 ? 'warning' : 'success'}>
              {queue.length} pending
            </Badge>
          </div>
        }
      />

      {allApprovedCards.length > 0 && (
        <div className="space-y-4">
          <p className="fp-eyebrow">Approved in this session — ready to send</p>
          {allApprovedCards.map((msg) => {
            const fName = msg.farmerId ? farmersById[msg.farmerId]?.name : null;
            const approvedEvent = msg.statusHistory.find((e) => e.status === 'APPROVED');
            return (
              <Card
                key={msg.id}
                eyebrow={`${msg.id} · ${msg.kind.replace(/_/g, ' ')}`}
                title={
                  msg.farmerId
                    ? fName ?? msg.farmerId
                    : `District: ${msg.districtId}`
                }
                actions={<Badge tone="success">{msg.status}</Badge>}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-ink-muted">
                    Approved by <strong>{msg.approvedBy}</strong> at{' '}
                    {formatDateTime(approvedEvent?.at ?? msg.createdAt)}.
                  </p>
                  {msg.status === 'APPROVED' ? (
                    <RoleGate action="message.send">
                      <Button
                        variant="accent"
                        size="sm"
                        loading={busyId === msg.id}
                        onClick={() => void handleSendNow(msg)}
                      >
                        <Send className="h-4 w-4" />
                        Send now
                      </Button>
                    </RoleGate>
                  ) : (
                    <Badge tone="info">Dispatched ({msg.status})</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {queue.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Approval queue is clear"
          hint="All pending farmer advisories, Soil Health Card summaries, and follow-up reminders have been reviewed."
          action={
            <Link to="/advisories">
              <Button variant="ghost" size="sm">
                View all messages
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {queue.map((msg) => {
            const isSelfGenerated = msg.generatedBy === persona.name;
            const fName = msg.farmerId ? farmersById[msg.farmerId]?.name : null;
            const linkedSoilCard = msg.soilCardId ? soilCardsById[msg.soilCardId] : undefined;
            const lowSoilParams = linkedSoilCard
              ? linkedSoilCard.params.filter(
                  (p) =>
                    p.rating === 'LOW' ||
                    p.rating === 'DEFICIENT' ||
                    p.rating === 'CRITICAL' ||
                    p.rating === 'INJURIOUS',
                )
              : [];

            return (
              <Card
                key={msg.id}
                eyebrow={`Queued ${formatDateTime(msg.createdAt)} · Generated by ${msg.generatedBy}`}
                title={
                  msg.farmerId
                    ? `${msg.id} · ${fName ?? msg.farmerId} (${msg.farmerId})`
                    : `${msg.id} · District ${msg.districtId} (${msg.recipientCount} recipients)`
                }
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{msg.kind.replace(/_/g, ' ')}</Badge>
                    <Badge tone="warning">{msg.status}</Badge>
                    <DataBadge status="MANUAL" source={msg.generatedBy} />
                  </div>
                }
              >
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-input border border-line bg-surface-2 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="fp-eyebrow">English Source Text</span>
                        <span className="text-xs text-ink-muted font-mono">
                          Authoritative
                        </span>
                      </div>
                      <p className="text-sm text-ink leading-relaxed">{msg.textEnglish}</p>
                    </div>

                    <div className="rounded-input border border-line bg-surface-2 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="fp-eyebrow">
                          Regional SMS ({msg.language})
                        </span>
                        <span className="text-xs font-mono text-ink-muted">
                          {msg.charCount} chars · {msg.segments} seg ({msg.encoding})
                        </span>
                      </div>
                      <p className="text-sm text-ink font-regional leading-relaxed">
                        {msg.textLocal}
                      </p>
                      <div className="mt-2 pt-2 border-t border-line flex items-center justify-between text-xs">
                        <span
                          className={
                            msg.translation.numbersPreserved
                              ? 'text-success font-medium'
                              : 'text-danger font-medium'
                          }
                        >
                          {msg.translation.numbersPreserved
                            ? '✓ Numeric check passed'
                            : '✗ Numbers changed in translation'}
                        </span>
                        <span className="text-ink-muted">
                          Method: {msg.translation.method}
                        </span>
                      </div>
                    </div>
                  </div>

                  {msg.kind === 'SOIL_CARD' && linkedSoilCard && (
                    <div className="rounded-card border border-line bg-surface-2 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-ink">
                            Soil Health Card {linkedSoilCard.cardNumber} (Sample:{' '}
                            {linkedSoilCard.sampleDate ?? 'N/A'})
                          </span>
                        </div>
                        <Link
                          to={`/soil-cards/${linkedSoilCard.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Inspect full card ({linkedSoilCard.id})
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-muted">Flagged ratings:</span>
                        {lowSoilParams.length > 0 ? (
                          lowSoilParams.map((p) => (
                            <Badge key={p.param} tone="warning">
                              {p.label}: {p.value} {p.unit} ({p.rating})
                            </Badge>
                          ))
                        ) : (
                          <Badge tone="success">All parameters sufficient / neutral</Badge>
                        )}
                      </div>

                      <FertilizerTable recommendations={linkedSoilCard.recommendations} />
                    </div>
                  )}

                  <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="w-full sm:max-w-md">
                      <Input
                        label="Approval note (optional)"
                        placeholder="E.g. Verified KVK helpline and bag conversion"
                        value={approveNotes[msg.id] ?? ''}
                        onChange={(e) =>
                          setApproveNotes((prev) => ({
                            ...prev,
                            [msg.id]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isSelfGenerated ? (
                        <Tooltip content="Separation of duties: You generated this message, so another authorized officer must approve or reject it.">
                          <div className="inline-flex items-center gap-2 rounded-button border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                            <ShieldAlert className="h-4 w-4" />
                            Self-approval blocked ({msg.generatedBy})
                          </div>
                        </Tooltip>
                      ) : (
                        <>
                          <RoleGate action="message.approve" generatedBy={msg.generatedBy}>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId === msg.id}
                              onClick={() => {
                                setRejectTarget(msg);
                                setRejectReason('');
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </RoleGate>
                          <RoleGate action="message.approve" generatedBy={msg.generatedBy}>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={busyId === msg.id}
                              onClick={() => void handleApprove(msg)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </Button>
                          </RoleGate>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${rejectTarget.id}` : 'Reject message'}
      >
        <div className="space-y-4">
          <Textarea
            label="Rejection reason (required)"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Specify what the author must fix before resubmitting..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busyId === rejectTarget?.id}
              disabled={!rejectReason.trim()}
              onClick={() => void handleRejectConfirm()}
            >
              Reject message
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
