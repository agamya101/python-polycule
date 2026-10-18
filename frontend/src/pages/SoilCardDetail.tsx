import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Send,
} from 'lucide-react';
import {
  confirmSoilCard,
  generateSoilCardSms,
  getAuditEvents,
  getFarmerDetail,
  getMessages,
  getSoilCard,
  patchSoilCard,
  submitMessage,
} from '@/api/client';
import type {
  AuditEvent,
  FarmerDetail,
  Language,
  OutboundMessage,
  RecommendationInput,
  SoilCard,
  SoilParam,
} from '@/api/contract';
import { AuditTimeline } from '@/components/domain/AuditTimeline';
import { FertilizerTable } from '@/components/domain/FertilizerTable';
import { MessageStepper } from '@/components/domain/MessageStepper';
import { SmsPreview } from '@/components/domain/SmsPreview';
import { SoilParamTable } from '@/components/domain/SoilParamTable';
import { UnitConverter } from '@/components/domain/UnitConverter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleGate } from '@/components/ui/RoleGate';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { computeFertilizerRec, evaluateSoilParam } from '@/lib/soil';

export default function SoilCardDetail() {
  const { cardId = 'SHC-0001' } = useParams<{ cardId: string }>();
  const navigate = useNavigate();

  const [card, setCard] = useState<SoilCard | null>(null);
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [linkedMsg, setLinkedMsg] = useState<OutboundMessage | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [smsLang, setSmsLang] = useState<Language>('Marathi');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sc = await getSoilCard(cardId);
      const normalizedParams = (sc.params ?? []).map((p) =>
        evaluateSoilParam(
          p.param,
          p.value,
          p.unit,
          p.ocrRaw ?? (p.value !== null ? String(p.value) : null),
          p.ocrConfidence ?? 0.95,
          p.confirmed ?? false,
        ),
      );
      const [fDetail, msgs, audits] = await Promise.all([
        getFarmerDetail(sc.farmerId),
        getMessages({ farmerId: sc.farmerId }),
        getAuditEvents({ farmerId: sc.farmerId }),
      ]);
      setFarmer(fDetail);
      setSmsLang(fDetail.language);
      const farmArea = fDetail?.field?.areaHa ?? 1.2;
      const normalizedRecs = (sc.recommendations ?? []).map((r) =>
        computeFertilizerRec(
          {
            product: r.product as any,
            productLabel: r.productLabel || r.product,
            cardDose: r.cardDose,
            cardDoseUnit: r.cardDoseUnit,
            timing: r.timing,
            sourceText: r.sourceText,
          },
          farmArea,
        ),
      );
      setCard({ ...sc, params: normalizedParams, recommendations: normalizedRecs });
      const foundMsg =
        msgs.find((m) => m.id === sc.messageId || m.soilCardId === sc.id) ?? null;
      setLinkedMsg(foundMsg);
      setAuditEvents(audits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load soil card');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading && !card) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !card) {
    return <ErrorState message={error ?? 'Soil card not found'} onRetry={loadData} />;
  }

  const isEditable = card.status === 'NEEDS_REVIEW';
  const blockingCount = (card.params ?? []).reduce(
    (acc, p) => acc + (p.flags ? p.flags.filter((f) => f.blocking).length : 0),
    0,
  );
  const unconfirmedCount = (card.params ?? []).filter((p) => !p.confirmed).length;
  const canConfirm = blockingCount === 0 && unconfirmedCount === 0;

  const handleParamChange = (
    param: SoilParam,
    updates: { value?: number | null; unit?: string; confirmed?: boolean },
  ) => {
    const nextParams = card.params.map((p) => {
      if (p.param !== param) return p;
      const val = updates.value !== undefined ? updates.value : p.value;
      const unit = updates.unit !== undefined ? updates.unit : p.unit;
      const conf = updates.confirmed !== undefined ? updates.confirmed : p.confirmed;
      return evaluateSoilParam(p.param, val, unit, p.ocrRaw, p.ocrConfidence, conf);
    });
    setCard({ ...card, params: nextParams });
  };

  const handleRecsChange = (inputs: RecommendationInput[]) => {
    const area = farmer?.field.areaHa ?? 1.2;
    setCard({
      ...card,
      recommendations: inputs.map((r) => computeFertilizerRec(r, area)),
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const updated = await patchSoilCard(card.id, {
        params: card.params.map((p) => ({
          param: p.param,
          value: p.value,
          unit: p.unit,
          confirmed: p.confirmed,
        })),
        recommendations: card.recommendations.map((r) => ({
          product: r.product,
          productLabel: r.productLabel,
          cardDose: r.cardDose,
          cardDoseUnit: r.cardDoseUnit,
          timing: r.timing,
          sourceText: r.sourceText,
        })),
      });
      setCard(updated);
      toast.success('Soil card changes saved');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await handleSave();
      const confirmed = await confirmSoilCard(card.id);
      setCard(confirmed);
      toast.success('Soil Health Card confirmed');
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSms = async () => {
    setBusy(true);
    try {
      const msg = await generateSoilCardSms(card.id, smsLang);
      setLinkedMsg(msg);
      toast.success('Generated Soil Health Card SMS');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitSms = async () => {
    if (!linkedMsg) return;
    setBusy(true);
    try {
      const sub = await submitMessage(linkedMsg.id);
      setLinkedMsg(sub);
      toast.success('Submitted SMS for department approval');
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Soil Health Card · ${card.id}`}
        title={card.cardNumber ?? card.id}
        description={`Sample Date: ${card.sampleDate ?? '—'} (${card.cardAgeYears ?? 0} yrs) · Lab: ${card.labName ?? '—'} · Created by ${card.createdBy}`}
        badges={
          <>
            <Badge
              tone={
                card.status === 'CONFIRMED' || card.status === 'SMS_SENT'
                  ? 'success'
                  : 'warning'
              }
            >
              {card.status}
            </Badge>
            <DataBadge
              status={card.extractionMethod === 'MANUAL' ? 'MANUAL' : 'SIMULATED'}
              source={card.extractionMethod}
            />
            {card.ageFlag && (
              <Badge tone="warning">
                Older than 2 years — proposed local re-test flag
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <UnitConverter />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/soil-cards')}
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              All Soil Cards
            </Button>
          </>
        }
      />

      {/* Linked Farmer Card */}
      {farmer && (
        <Card
          eyebrow="Linked Farmer & Parcel"
          title={farmer.name}
          actions={
            <Link
              to={`/farmers/${farmer.id}`}
              className="text-xs font-mono font-bold text-primary hover:underline"
            >
              Open Farmer Detail →
            </Link>
          }
        >
          <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
            <span>Village: {farmer.village}</span>
            <span>District: {farmer.districtId.toUpperCase()}</span>
            <span>Crop: {farmer.crop}</span>
            <span>
              Parcel Area: <strong>{farmer.field.areaHa.toFixed(2)} ha</strong> (
              {(farmer.field.areaHa * 2.4711).toFixed(2)} acres)
            </span>
            <span>Language: {farmer.language}</span>
          </div>
        </Card>
      )}

      {/* Safeguard Banner when NEEDS_REVIEW */}
      {isEditable && (
        <div
          className={`p-4 rounded-card border flex flex-wrap items-center justify-between gap-4 ${
            canConfirm
              ? 'bg-success/10 border-success/40'
              : 'bg-danger/10 border-danger/40'
          }`}
        >
          <div className="flex items-center gap-3">
            {canConfirm ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-danger" />
            )}
            <div className="text-xs sm:text-sm">
              <strong>
                {blockingCount} blocking flag(s) · {unconfirmedCount} unconfirmed row(s)
              </strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RoleGate action="soil.edit">
              <Button variant="ghost" size="sm" loading={busy} onClick={handleSave}>
                Save changes
              </Button>
            </RoleGate>
            <RoleGate
              action="soil.confirm"
              extraDisableReason={
                !canConfirm ? 'Resolve blocking flags and confirm all 12 rows first' : null
              }
            >
              <Button variant="primary" size="sm" loading={busy} onClick={handleConfirm}>
                Confirm card
              </Button>
            </RoleGate>
          </div>
        </div>
      )}

      {/* 12 Soil Parameters Table */}
      <Card
        eyebrow="12 Soil Parameters"
        title="Soil Parameter Values, Ratings & OCR Safeguards"
      >
        <SoilParamTable
          params={card.params}
          readOnly={!isEditable}
          onChangeParam={handleParamChange}
        />
      </Card>

      {/* Fertilizer Conversion Table */}
      <Card
        eyebrow="Unit-Safe Fertilizer Conversion"
        title="Fertilizer Doses in kg/ha, kg/acre & Bags/Acre"
      >
        <FertilizerTable
          recommendations={card.recommendations}
          editable={isEditable}
          onChangeRecommendations={handleRecsChange}
        />
      </Card>

      {/* SMS Section & Message Stepper */}
      <Card
        eyebrow="Regional SMS & Mandatory Department Approval"
        title="Soil Health Card Advisory SMS"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-ctl bg-warning/15 border border-warning/40 text-xs font-mono text-ink">
            This SMS will not be sent until an Agriculture Department officer approves it.
          </div>

          {!linkedMsg && card.status === 'CONFIRMED' && (
            <div className="flex items-end gap-3">
              <Select
                label="SMS Language"
                value={smsLang}
                onChange={(e) => setSmsLang(e.target.value as Language)}
              >
                <option value="Marathi">Marathi</option>
                <option value="Hindi">Hindi</option>
                <option value="Punjabi">Punjabi</option>
                <option value="English">English</option>
              </Select>
              <RoleGate action="soil.generateSms">
                <Button variant="primary" loading={busy} onClick={handleGenerateSms}>
                  Generate SMS
                </Button>
              </RoleGate>
            </div>
          )}

          {linkedMsg && (
            <div className="space-y-4">
              <SmsPreview
                language={linkedMsg.language}
                textEnglish={linkedMsg.textEnglish}
                textLocal={linkedMsg.textLocal}
                phoneMasked={farmer?.phoneMasked}
              />
              <MessageStepper
                status={linkedMsg.status}
                history={linkedMsg.statusHistory}
                rejectedReason={linkedMsg.rejectedReason}
              />
              {linkedMsg.status === 'GENERATED' && (
                <div className="flex justify-end">
                  <RoleGate action="message.submit">
                    <Button
                      variant="accent"
                      loading={busy}
                      onClick={handleSubmitSms}
                      icon={<Send className="w-4 h-4" />}
                    >
                      Submit for department approval
                    </Button>
                  </RoleGate>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Audit Events */}
      <Card eyebrow="Provenance & Verification Trail" title="Audit Events">
        <AuditTimeline events={auditEvents} />
      </Card>
    </div>
  );
}
