import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  FileEdit,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Stamp,
  XCircle,
} from 'lucide-react';
import type {
  AcknowledgeBody,
  Case,
  DistrictSummary,
  Farmer,
  Language,
  MessageStatus,
  OutboundMessage,
} from '@/api/contract';
import {
  acknowledgeMessage,
  approveMessage,
  generateAdvisory,
  getCases,
  getDistricts,
  getFarmers,
  getMessages,
  patchMessage,
  refreshMessageStatus,
  rejectMessage,
  sendMessage,
  submitMessage,
} from '@/api/client';
import { useRole } from '@/auth/RoleContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { Tabs } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { RoleGate } from '@/components/ui/RoleGate';
import { SmsPreview } from '@/components/domain/SmsPreview';
import { MessageStepper } from '@/components/domain/MessageStepper';
import { computeSmsMeta } from '@/lib/sms';
import { formatDateTime } from '@/lib/format';

const LANGUAGES: Language[] = ['Hindi', 'Marathi', 'Punjabi', 'English'];

function statusTone(status: MessageStatus) {
  switch (status) {
    case 'ACKNOWLEDGED':
    case 'DELIVERED':
    case 'APPROVED':
      return 'success' as const;
    case 'PENDING_APPROVAL':
    case 'SENT':
    case 'QUEUED':
      return 'warning' as const;
    case 'REJECTED':
    case 'FAILED':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export const Advisories: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { persona } = useRole();

  const initialKindParam = searchParams.get('kind');
  const initialDistrictParam = searchParams.get('districtId') ?? '';
  const initialFarmerParam = searchParams.get('farmerId') ?? '';
  const initialCaseParam = searchParams.get('caseId') ?? '';

  const [activeTab, setActiveTab] = useState<'compose' | 'all'>('compose');
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose state
  const [composeKind, setComposeKind] = useState<
    'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'FOLLOWUP_REMINDER'
  >(
    initialKindParam === 'DISTRICT_ADVISORY' ||
      initialKindParam === 'FARMER_ADVISORY' ||
      initialKindParam === 'FOLLOWUP_REMINDER'
      ? initialKindParam
      : initialDistrictParam && !initialFarmerParam
        ? 'DISTRICT_ADVISORY'
        : 'FARMER_ADVISORY',
  );
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>(
    initialDistrictParam || 'yavatmal',
  );
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>(
    initialFarmerParam || 'FRM-0001',
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialCaseParam || 'CASE-0004',
  );
  const [selectedLang, setSelectedLang] = useState<Language>('Marathi');
  const [draftMsg, setDraftMsg] = useState<OutboundMessage | null>(null);
  const [editEn, setEditEn] = useState('');
  const [editLocal, setEditLocal] = useState('');
  const [generating, setGenerating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // All messages filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterKind, setFilterKind] = useState<string>('ALL');
  const [filterDistrict, setFilterDistrict] = useState<string>('ALL');

  // Drawer & modals
  const [drawerMsg, setDrawerMsg] = useState<OutboundMessage | null>(null);
  const [drawerEditEn, setDrawerEditEn] = useState('');
  const [drawerEditLocal, setDrawerEditLocal] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [ackMethod, setAckMethod] = useState<AcknowledgeBody['method']>('PHONE_CALL');
  const [ackNote, setAckNote] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, fRes, cRes, mRes] = await Promise.all([
        getDistricts(),
        getFarmers(),
        getCases(),
        getMessages(),
      ]);
      const districtList = dRes.districts ?? (dRes as any).items ?? [];
      setDistricts(districtList);
      setFarmers(fRes);
      setCases(cRes);
      setMessages(mRes);

      if (initialFarmerParam) {
        const f = fRes.find((item) => item.id === initialFarmerParam);
        if (f) setSelectedLang(f.language);
      } else if (initialDistrictParam) {
        const d = districtList.find((item: DistrictSummary) => item.id === initialDistrictParam);
        if (d) setSelectedLang(d.language);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load advisories');
    } finally {
      setLoading(false);
    }
  }, [initialDistrictParam, initialFarmerParam]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const farmersById = useMemo(() => {
    const map: Record<string, Farmer> = {};
    for (const f of farmers) map[f.id] = f;
    return map;
  }, [farmers]);

  const handleKindChange = (
    nextKind: 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'FOLLOWUP_REMINDER',
  ) => {
    setComposeKind(nextKind);
    setDraftMsg(null);
    if (nextKind === 'DISTRICT_ADVISORY') {
      const d = districts.find((item) => item.id === selectedDistrictId);
      if (d) setSelectedLang(d.language);
    } else if (nextKind === 'FARMER_ADVISORY') {
      const f = farmers.find((item) => item.id === selectedFarmerId);
      if (f) setSelectedLang(f.language);
    } else {
      const c = cases.find((item) => item.id === selectedCaseId);
      const f = farmers.find((item) => item.id === c?.farmerId);
      if (f) setSelectedLang(f.language);
    }
  };

  const handleDistrictSelect = (distId: string) => {
    setSelectedDistrictId(distId);
    const d = (districts ?? []).find((item) => item.id === distId);
    if (d) setSelectedLang(d.language);
  };

  const handleFarmerSelect = (fId: string) => {
    setSelectedFarmerId(fId);
    const f = (farmers ?? []).find((item) => item.id === fId);
    if (f) setSelectedLang(f.language);
  };

  const handleCaseSelect = (cId: string) => {
    setSelectedCaseId(cId);
    const c = (cases ?? []).find((item) => item.id === cId);
    if (c) {
      setSelectedFarmerId(c.farmerId);
      const f = (farmers ?? []).find((item) => item.id === c.farmerId);
      if (f) setSelectedLang(f.language);
    }
  };

  const consentingDistrictFarmersCount = useMemo(() => {
    return (farmers ?? []).filter((f) => f.districtId === selectedDistrictId && f.consentSms).length;
  }, [farmers, selectedDistrictId]);

  const selectedDistrictName = useMemo(() => {
    return (
      (districts ?? []).find((d) => d.id === selectedDistrictId)?.district ?? selectedDistrictId
    );
  }, [districts, selectedDistrictId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let msg: OutboundMessage;
      if (composeKind === 'DISTRICT_ADVISORY') {
        msg = await generateAdvisory({
          kind: 'DISTRICT_ADVISORY',
          districtId: selectedDistrictId,
          language: selectedLang,
        });
      } else if (composeKind === 'FARMER_ADVISORY') {
        const f = farmers.find((item) => item.id === selectedFarmerId);
        msg = await generateAdvisory({
          kind: 'FARMER_ADVISORY',
          farmerId: selectedFarmerId,
          districtId: f?.districtId,
          caseId: f?.openCaseId ?? undefined,
          language: selectedLang,
        });
      } else {
        const c = cases.find((item) => item.id === selectedCaseId);
        msg = await generateAdvisory({
          kind: 'FOLLOWUP_REMINDER',
          caseId: selectedCaseId,
          farmerId: c?.farmerId,
          districtId: c?.districtId,
          language: selectedLang,
        });
      }
      setDraftMsg(msg);
      setEditEn(msg.textEnglish);
      setEditLocal(msg.textLocal);
      const updated = await getMessages();
      setMessages(updated);
      toast.success(`Draft ${msg.id} generated`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraftEdit = async () => {
    if (!draftMsg) return;
    setSavingEdit(true);
    try {
      const updated = await patchMessage(draftMsg.id, {
        textEnglish: editEn,
        textLocal: editLocal,
      });
      setDraftMsg(updated);
      setEditEn(updated.textEnglish);
      setEditLocal(updated.textLocal);
      setMessages(await getMessages());
      toast.success('Draft edits saved');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSubmitDraft = async () => {
    if (!draftMsg) return;
    setSubmittingDraft(true);
    try {
      let current = draftMsg;
      if (
        (current.status === 'GENERATED' || current.status === 'REJECTED') &&
        (editEn !== current.textEnglish || editLocal !== current.textLocal)
      ) {
        current = await patchMessage(current.id, {
          textEnglish: editEn,
          textLocal: editLocal,
        });
      }
      const submitted = await submitMessage(current.id);
      setDraftMsg(submitted);
      setMessages(await getMessages());
      toast.success(`Message ${submitted.id} submitted for department approval`);
    } finally {
      setSubmittingDraft(false);
    }
  };

  const liveSmsCheck = useMemo(() => {
    if (!draftMsg) return null;
    return computeSmsMeta(editEn, editLocal);
  }, [draftMsg, editEn, editLocal]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (filterStatus !== 'ALL' && m.status !== filterStatus) return false;
      if (filterKind !== 'ALL' && m.kind !== filterKind) return false;
      if (filterDistrict !== 'ALL' && m.districtId !== filterDistrict) return false;
      return true;
    });
  }, [messages, filterStatus, filterKind, filterDistrict]);

  const openDrawer = (m: OutboundMessage) => {
    setDrawerMsg(m);
    setDrawerEditEn(m.textEnglish);
    setDrawerEditLocal(m.textLocal);
  };

  const syncAfterDrawerAction = async (updated: OutboundMessage) => {
    setDrawerMsg(updated);
    setDrawerEditEn(updated.textEnglish);
    setDrawerEditLocal(updated.textLocal);
    if (draftMsg?.id === updated.id) {
      setDraftMsg(updated);
      setEditEn(updated.textEnglish);
      setEditLocal(updated.textLocal);
    }
    setMessages(await getMessages());
  };

  const handleDrawerSaveEdit = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await patchMessage(drawerMsg.id, {
        textEnglish: drawerEditEn,
        textLocal: drawerEditLocal,
      });
      await syncAfterDrawerAction(updated);
      toast.success('Message text updated');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerSubmit = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await submitMessage(drawerMsg.id);
      await syncAfterDrawerAction(updated);
      toast.success('Submitted for approval');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerApprove = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await approveMessage(drawerMsg.id, 'Verified numbers and KVK contact');
      await syncAfterDrawerAction(updated);
      toast.success('Message approved');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerReject = async () => {
    if (!drawerMsg || !rejectReason.trim()) return;
    setActionBusy(true);
    try {
      const updated = await rejectMessage(drawerMsg.id, rejectReason.trim());
      await syncAfterDrawerAction(updated);
      setRejectModalOpen(false);
      setRejectReason('');
      toast.success('Message rejected');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerSend = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await sendMessage(drawerMsg.id);
      await syncAfterDrawerAction(updated);
      toast.success('SMS dispatched to gateway');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerRefresh = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await refreshMessageStatus(drawerMsg.id);
      await syncAfterDrawerAction(updated);
      toast.success(`Gateway status: ${updated.status}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDrawerAcknowledge = async () => {
    if (!drawerMsg) return;
    setActionBusy(true);
    try {
      const updated = await acknowledgeMessage(drawerMsg.id, {
        method: ackMethod,
        note: ackNote.trim() || 'Confirmed by farmer',
      });
      await syncAfterDrawerAction(updated);
      setAckModalOpen(false);
      setAckNote('');
      toast.success('Farmer acknowledgement recorded');
    } finally {
      setActionBusy(false);
    }
  };

  const columns: TableColumn<OutboundMessage>[] = [
    {
      key: 'id',
      header: 'ID',
      sortValue: (m) => m.id,
      render: (m) => <span className="font-mono text-xs font-medium text-ink">{m.id}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      sortValue: (m) => m.kind,
      render: (m) => <Badge tone="neutral">{m.kind.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'target',
      header: 'Target',
      sortValue: (m) =>
        (m.farmerId ? farmersById[m.farmerId]?.name : m.districtId) ?? m.districtId,
      render: (m) => {
        const fName = m.farmerId ? farmersById[m.farmerId]?.name : null;
        return (
          <div className="text-sm">
            {m.farmerId ? (
              <span className="font-medium text-ink">
                {fName ?? m.farmerId}{' '}
                <span className="text-xs text-ink-muted">({m.farmerId})</span>
              </span>
            ) : (
              <span className="font-medium capitalize text-ink">
                District: {m.districtId} ({m.recipientCount} farmers)
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'language',
      header: 'Language',
      sortValue: (m) => m.language,
      render: (m) => <span className="text-xs text-ink">{m.language}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (m) => m.status,
      render: (m) => <Badge tone={statusTone(m.status)}>{m.status}</Badge>,
    },
    {
      key: 'generatedBy',
      header: 'Generated by',
      sortValue: (m) => m.generatedBy,
      render: (m) => <span className="text-xs text-ink-muted">{m.generatedBy}</span>,
    },
    {
      key: 'approvedBy',
      header: 'Approved by',
      sortValue: (m) => m.approvedBy ?? '',
      render: (m) => (
        <span className="text-xs text-ink-muted">{m.approvedBy ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortValue: (m) => m.createdAt,
      render: (m) => (
        <span className="text-xs text-ink-muted fp-num">{formatDateTime(m.createdAt)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Layer 5 · Multilingual Outreach"
          title="Advisories & Outbound SMS"
          description="Compose, verify numeric fidelity, submit for department approval, and track delivery through farmer acknowledgement."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  const canEditDraft =
    draftMsg && (draftMsg.status === 'GENERATED' || draftMsg.status === 'REJECTED');
  const canEditDrawer =
    drawerMsg && (drawerMsg.status === 'GENERATED' || drawerMsg.status === 'REJECTED');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 5 · Multilingual Outreach"
        title="Advisories & Outbound SMS"
        description="Draft localized farmer advisories with strict numeric preservation. Nothing is dispatched without Agriculture Department approval."
        actions={
          <div className="flex items-center gap-2">
            <DataBadge status="LIVE" source="SMS Outreach Ledger" />
            <Link to="/approvals">
              <Button variant="ghost" size="sm">
                <Stamp className="h-4 w-4" />
                Approval Queue (
                {messages.filter((m) => m.status === 'PENDING_APPROVAL').length})
              </Button>
            </Link>
          </div>
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'compose' | 'all')}
        tabs={[
          { key: 'compose', label: 'Compose' },
          {
            key: 'all',
            label: 'All messages',
            badge: messages.length,
          },
        ]}
      />

      {activeTab === 'compose' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Card
              eyebrow="Step 1 · Configure Target & Template"
              title="Generate localized advisory"
              actions={<DataBadge status="SIMULATED" source="Advisory Agent + Templates" />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select
                  label="Advisory kind"
                  value={composeKind}
                  onChange={(e) =>
                    handleKindChange(
                      e.target.value as
                        | 'DISTRICT_ADVISORY'
                        | 'FARMER_ADVISORY'
                        | 'FOLLOWUP_REMINDER',
                    )
                  }
                >
                  <option value="FARMER_ADVISORY">Farmer Advisory</option>
                  <option value="DISTRICT_ADVISORY">District Advisory</option>
                  <option value="FOLLOWUP_REMINDER">Follow-up Reminder</option>
                </Select>

                {composeKind === 'DISTRICT_ADVISORY' && (
                  <Select
                    label="Target district"
                    value={selectedDistrictId}
                    onChange={(e) => handleDistrictSelect(e.target.value)}
                  >
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.district} ({d.state})
                      </option>
                    ))}
                  </Select>
                )}

                {composeKind === 'FARMER_ADVISORY' && (
                  <Select
                    label="Target farmer"
                    value={selectedFarmerId}
                    onChange={(e) => handleFarmerSelect(e.target.value)}
                  >
                    {farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.id} · {f.village})
                      </option>
                    ))}
                  </Select>
                )}

                {composeKind === 'FOLLOWUP_REMINDER' && (
                  <Select
                    label="Target active case"
                    value={selectedCaseId}
                    onChange={(e) => handleCaseSelect(e.target.value)}
                  >
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} · {c.farmerName} ({c.status})
                      </option>
                    ))}
                  </Select>
                )}

                <Select
                  label="Language"
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value as Language)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              {composeKind === 'DISTRICT_ADVISORY' && (
                <div className="mt-4 rounded-input border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs text-ink flex items-center justify-between">
                  <span>
                    Will be sent to{' '}
                    <strong className="fp-num">{consentingDistrictFarmersCount}</strong>{' '}
                    consenting registered farmers in{' '}
                    <strong>{selectedDistrictName}</strong>.
                  </span>
                  <Badge tone="primary">{consentingDistrictFarmersCount} recipients</Badge>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <RoleGate action="message.generate">
                  <Button
                    variant="primary"
                    loading={generating}
                    onClick={() => void handleGenerate()}
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </Button>
                </RoleGate>
              </div>
            </Card>

            {draftMsg ? (
              <Card
                eyebrow="Step 2 · Review & Edit"
                title="English source & regional translation"
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(draftMsg.status)}>{draftMsg.status}</Badge>
                    <DataBadge status="MANUAL" source={draftMsg.generatedBy} />
                  </div>
                }
              >
                <div className="space-y-4">
                  <Textarea
                    label="English text (authoritative reference)"
                    rows={4}
                    value={editEn}
                    disabled={!canEditDraft}
                    onChange={(e) => setEditEn(e.target.value)}
                  />
                  <Textarea
                    label={`Regional text (${selectedLang})`}
                    rows={4}
                    className="font-regional"
                    value={editLocal}
                    disabled={!canEditDraft}
                    onChange={(e) => setEditLocal(e.target.value)}
                  />

                  {liveSmsCheck && (
                    <div
                      className={`rounded-input border p-3 text-xs flex items-center justify-between ${
                        liveSmsCheck.numbersPreserved
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-danger/30 bg-danger/10 text-danger'
                      }`}
                    >
                      <span>
                        {liveSmsCheck.numbersPreserved
                          ? '✓ All numeric values (doses, KVK phone, dates) match between English and regional text.'
                          : '✗ Numbers changed in translation — submission is blocked until numbers match.'}
                      </span>
                      <span className="font-mono">
                        {liveSmsCheck.charCount} chars · {liveSmsCheck.segments} seg (
                        {liveSmsCheck.encoding})
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {canEditDraft ? (
                      <RoleGate action="message.edit">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={savingEdit}
                          onClick={() => void handleSaveDraftEdit()}
                        >
                          <FileEdit className="h-4 w-4" />
                          Save edit
                        </Button>
                      </RoleGate>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        Editing is locked once submitted (unless rejected).
                      </span>
                    )}

                    {(draftMsg.status === 'GENERATED' || draftMsg.status === 'REJECTED') && (
                      <RoleGate action="message.submit">
                        <Button
                          variant="accent"
                          loading={submittingDraft}
                          disabled={liveSmsCheck ? !liveSmsCheck.numbersPreserved : false}
                          onClick={() => void handleSubmitDraft()}
                        >
                          <Stamp className="h-4 w-4" />
                          Submit for approval
                        </Button>
                      </RoleGate>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title="No draft generated yet"
                hint="Select an advisory kind, target, and language above, then click Generate to inspect the SMS and numeric safety check."
              />
            )}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card
              eyebrow="Handset Preview"
              title="Farmer SMS rendering"
              actions={<DataBadge status="LIVE" source="GSM-7 / UCS-2 Analyzer" />}
            >
              {draftMsg ? (
                <SmsPreview
                  language={selectedLang}
                  textEnglish={editEn}
                  textLocal={editLocal}
                />
              ) : (
                <p className="text-sm text-ink-muted py-8 text-center">
                  Generate a message to preview how it appears on the farmer&apos;s handset.
                </p>
              )}
            </Card>

            {draftMsg && (
              <Card eyebrow="Lifecycle" title="Message status trail">
                <MessageStepper
                  status={draftMsg.status}
                  history={draftMsg.statusHistory}
                  rejectedReason={draftMsg.rejectedReason}
                />
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card
          eyebrow="Outreach Ledger"
          title="Outbound Messages"
          actions={<DataBadge status="LIVE" source="Outreach Ledger" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Select
              label="Filter by status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="GENERATED">GENERATED</option>
              <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="SENT">SENT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="FAILED">FAILED</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            </Select>
            <Select
              label="Filter by kind"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
            >
              <option value="ALL">All kinds</option>
              <option value="FARMER_ADVISORY">FARMER_ADVISORY</option>
              <option value="DISTRICT_ADVISORY">DISTRICT_ADVISORY</option>
              <option value="SOIL_CARD">SOIL_CARD</option>
              <option value="FOLLOWUP_REMINDER">FOLLOWUP_REMINDER</option>
            </Select>
            <Select
              label="Filter by district"
              value={filterDistrict}
              onChange={(e) => setFilterDistrict(e.target.value)}
            >
              <option value="ALL">All districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.district}
                </option>
              ))}
            </Select>
          </div>

          <Table
            columns={columns}
            data={filteredMessages}
            rowKey={(m) => m.id}
            onRowClick={openDrawer}
          />
        </Card>
      )}

      <Drawer
        open={Boolean(drawerMsg)}
        onClose={() => setDrawerMsg(null)}
        title={drawerMsg ? `${drawerMsg.id} · ${drawerMsg.kind.replace(/_/g, ' ')}` : 'Message'}
      >
        {drawerMsg && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-ink">
                {drawerMsg.farmerId ? (
                  <span>
                    Farmer:{' '}
                    <strong>
                      {farmersById[drawerMsg.farmerId]?.name ?? drawerMsg.farmerId}
                    </strong>{' '}
                    ({drawerMsg.farmerId})
                  </span>
                ) : (
                  <span>
                    District: <strong className="capitalize">{drawerMsg.districtId}</strong> (
                    {drawerMsg.recipientCount} consenting farmers)
                  </span>
                )}
              </div>
              <Badge tone={statusTone(drawerMsg.status)}>{drawerMsg.status}</Badge>
            </div>

            <MessageStepper
              status={drawerMsg.status}
              history={drawerMsg.statusHistory}
              rejectedReason={drawerMsg.rejectedReason}
            />

            <SmsPreview
              language={drawerMsg.language}
              textEnglish={drawerEditEn}
              textLocal={drawerEditLocal}
            />

            {canEditDrawer && (
              <div className="space-y-3 rounded-card border border-line bg-surface-2 p-4">
                <p className="fp-eyebrow">Edit Draft / Rejected Text</p>
                <Textarea
                  label="English text"
                  rows={3}
                  value={drawerEditEn}
                  onChange={(e) => setDrawerEditEn(e.target.value)}
                />
                <Textarea
                  label={`Local text (${drawerMsg.language})`}
                  rows={3}
                  className="font-regional"
                  value={drawerEditLocal}
                  onChange={(e) => setDrawerEditLocal(e.target.value)}
                />
                <RoleGate action="message.edit">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={actionBusy}
                    onClick={() => void handleDrawerSaveEdit()}
                  >
                    <FileEdit className="h-4 w-4" />
                    Save edit
                  </Button>
                </RoleGate>
              </div>
            )}

            <div className="rounded-card border border-line bg-surface-2 p-4 space-y-3">
              <p className="fp-eyebrow">Role-Gated Lifecycle Actions</p>
              <div className="flex flex-wrap gap-2">
                {(drawerMsg.status === 'GENERATED' || drawerMsg.status === 'REJECTED') && (
                  <RoleGate action="message.submit">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={actionBusy}
                      onClick={() => void handleDrawerSubmit()}
                    >
                      <Stamp className="h-4 w-4" />
                      Submit for approval
                    </Button>
                  </RoleGate>
                )}

                {drawerMsg.status === 'PENDING_APPROVAL' && (
                  <>
                    <RoleGate action="message.approve" generatedBy={drawerMsg.generatedBy}>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={actionBusy}
                        onClick={() => void handleDrawerApprove()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                    </RoleGate>
                    <RoleGate action="message.approve" generatedBy={drawerMsg.generatedBy}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRejectModalOpen(true)}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </RoleGate>
                  </>
                )}

                {drawerMsg.status === 'APPROVED' && (
                  <RoleGate action="message.send">
                    <Button
                      variant="accent"
                      size="sm"
                      loading={actionBusy}
                      onClick={() => void handleDrawerSend()}
                    >
                      <Send className="h-4 w-4" />
                      Send SMS
                    </Button>
                  </RoleGate>
                )}

                {(drawerMsg.status === 'SENT' || drawerMsg.status === 'QUEUED') && (
                  <RoleGate action="message.send">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={actionBusy}
                      onClick={() => void handleDrawerRefresh()}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh status
                    </Button>
                  </RoleGate>
                )}

                {(drawerMsg.status === 'SENT' || drawerMsg.status === 'DELIVERED') && (
                  <RoleGate action="message.acknowledge">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setAckModalOpen(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark acknowledged
                    </Button>
                  </RoleGate>
                )}
              </div>
              {drawerMsg.status === 'PENDING_APPROVAL' &&
                drawerMsg.generatedBy === persona.name && (
                  <p className="text-xs text-warning flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Separation of duties: You generated this message ({persona.name}), so a
                    Department Officer must approve it.
                  </p>
                )}
            </div>

            <div className="space-y-2">
              <p className="fp-eyebrow">Status History</p>
              <div className="space-y-2">
                {drawerMsg.statusHistory.map((h, idx) => (
                  <div
                    key={`${h.status}-${idx}`}
                    className="rounded-input border border-line bg-surface p-2.5 text-xs flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-ink">{h.status}</span>
                      <span className="text-ink-muted"> · {h.actor}</span>
                      {h.note && <p className="text-ink-muted mt-0.5">{h.note}</p>}
                    </div>
                    <span className="text-ink-muted fp-num shrink-0">
                      {formatDateTime(h.at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject outbound message"
      >
        <div className="space-y-4">
          <Textarea
            label="Reason for rejection (required)"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain what needs correction before re-submitting..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={actionBusy}
              disabled={!rejectReason.trim()}
              onClick={() => void handleDrawerReject()}
            >
              Confirm rejection
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={ackModalOpen}
        onClose={() => setAckModalOpen(false)}
        title="Record farmer acknowledgement"
      >
        <div className="space-y-4">
          <Select
            label="Acknowledgement method"
            value={ackMethod}
            onChange={(e) => setAckMethod(e.target.value as AcknowledgeBody['method'])}
          >
            <option value="FARMER_REPLY">SMS reply &ldquo;1&rdquo; from farmer</option>
            <option value="PHONE_CALL">Verified via phone call</option>
            <option value="IN_PERSON">Confirmed during field worker visit</option>
          </Select>
          <Textarea
            label="Verification note"
            rows={3}
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            placeholder="E.g. Farmer confirmed receiving message and started evening irrigation."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAckModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={actionBusy}
              onClick={() => void handleDrawerAcknowledge()}
            >
              Record acknowledgement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
