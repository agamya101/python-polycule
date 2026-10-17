import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Activity,
  FlaskConical,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react';
import { analyzeFarmer, getFarmerDetail, verifyBoundary } from '@/api/client';
import type { BoundaryVerifyBody, FarmerDetail as FarmerDetailType } from '@/api/contract';
import { AuditTimeline } from '@/components/domain/AuditTimeline';
import { FieldMap } from '@/components/domain/FieldMap';
import { MessageStepper } from '@/components/domain/MessageStepper';
import { NdviTrendChart } from '@/components/domain/NdviTrendChart';
import { ReasoningChain } from '@/components/domain/ReasoningChain';
import { ReliabilityPanel } from '@/components/domain/ReliabilityPanel';
import { SmsPreview } from '@/components/domain/SmsPreview';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { RoleGate } from '@/components/ui/RoleGate';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatSignedNum, formatSignedPct, haToAcres } from '@/lib/format';
import { formatBagsDisplay } from '@/lib/soil';

export default function FarmerDetail() {
  const { farmerId = 'FRM-0001' } = useParams<{ farmerId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<FarmerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFarmerDetail(farmerId);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load farmer detail');
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const updated = await analyzeFarmer(farmerId);
      setDetail(updated);
      toast.success('Field stress & Soil Health Card analysis refreshed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleVerifyBoundary = async (body: BoundaryVerifyBody) => {
    await verifyBoundary(farmerId, body);
    toast.success(`Boundary marked as ${body.status}`);
    await loadDetail();
  };

  if (loading && !detail) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !detail) {
    return <ErrorState message={error ?? 'Farmer not found'} onRetry={loadDetail} />;
  }

  const acres = haToAcres(detail.field.areaHa);
  const stress = detail.latestStress;
  const stressTypeDisplay =
    !stress || stress.stressType === 'NONE'
      ? 'NONE'
      : stress.stressType.startsWith('POSSIBLE_')
        ? `Possible ${stress.stressType.replace('POSSIBLE_', '')}`
        : `Possible ${stress.stressType}`;

  const firstSentMsg = detail.messages.find(
    (m) => m.status === 'SENT' || m.status === 'DELIVERED' || m.status === 'ACKNOWLEDGED',
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Farmer Record · ${detail.id}`}
        title={detail.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Village: {detail.village}</span>
            <span>·</span>
            <Link
              to={`/districts/${detail.districtId}`}
              className="font-semibold text-primary hover:underline"
            >
              District: {detail.districtId.toUpperCase()}
            </Link>
            <span>·</span>
            <span>
              Crop: {detail.crop} (Sown {detail.sowingDate})
            </span>
            <span>·</span>
            <span className="font-mono">
              {detail.field.areaHa.toFixed(2)} ha ({acres.toFixed(2)} acres)
            </span>
            <span>·</span>
            <span>Lang: {detail.language}</span>
            <span>·</span>
            <span className="font-mono">{detail.phoneMasked}</span>
          </span>
        }
        badges={
          <>
            <Badge tone={detail.consentSms ? 'success' : 'danger'}>
              {detail.consentSms ? 'SMS Consent Granted' : 'No SMS Consent'}
            </Badge>
            <ScaleBadge scale="FIELD_SENTINEL2_10M" />
          </>
        }
        actions={
          <>
            <RoleGate action="farmer.analyze">
              <Button
                variant="ghost"
                size="sm"
                loading={analyzing}
                onClick={handleAnalyze}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Analyze now
              </Button>
            </RoleGate>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/soil-cards/new?farmerId=${detail.id}`)}
              icon={<FlaskConical className="w-4 h-4" />}
            >
              Add soil card
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                navigate(
                  `/advisories?kind=FARMER_ADVISORY&farmerId=${detail.id}&districtId=${detail.districtId}`,
                )
              }
              icon={<MessageSquarePlus className="w-4 h-4" />}
            >
              Generate farmer advisory
            </Button>
          </>
        }
      />

      {/* 12-col grid: FieldMap + BoundaryEditor (6 cols) | Stress Metrics + ReliabilityPanel (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card
          className="lg:col-span-6"
          eyebrow="Parcel Geometry & Ground Verification"
          title="Field Boundary Map"
        >
          <FieldMap
            polygon={detail.field.polygon}
            center={detail.field.centroid}
            boundaryStatus={detail.field.boundaryStatus}
            stressLevel={stress?.stressLevel ?? 'LOW'}
            editorMode="VERIFY"
            onPolygonChange={(poly) => {
              setDetail((prev) =>
                prev
                  ? {
                      ...prev,
                      field: { ...prev.field, polygon: poly },
                    }
                  : prev,
              );
            }}
            onVerifyBoundary={handleVerifyBoundary}
          />
          {detail.field.boundaryNote && (
            <div className="mt-3 p-2.5 rounded-ctl bg-surface-2 border border-line text-xs font-mono text-ink-muted">
              Note ({detail.field.boundaryVerifiedBy ?? 'Worker'}): "{detail.field.boundaryNote}"
            </div>
          )}
        </Card>

        <div className="lg:col-span-6 space-y-6">
          <Card
            eyebrow="Sentinel-2 10 m Parcel Diagnostics"
            title="Field Stress Metrics"
            actions={
              stress ? (
                <DataBadge status={stress.provenance.status} provenance={stress.provenance} />
              ) : undefined
            }
          >
            {stress ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">NDVI Latest vs Baseline</div>
                  <div className="text-lg font-bold fp-num text-ink mt-1">
                    {stress.ndviLatest !== null ? stress.ndviLatest.toFixed(2) : '—'}{' '}
                    <span className="text-xs font-normal text-ink-muted">
                      / {stress.ndviBaseline?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted mt-0.5">
                    Anomaly: {formatSignedPct(stress.ndviAnomalyPct, 1)} ({stress.baselineMethod})
                  </div>
                </div>

                <div className="p-3 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">NDWI Moisture Index</div>
                  <div className="text-lg font-bold fp-num text-ink mt-1">
                    {stress.ndwiLatest !== null ? stress.ndwiLatest.toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted mt-0.5">
                    Change: {formatSignedNum(stress.ndwiChange, 2)} vs baseline
                  </div>
                </div>

                <div className="p-3 rounded-ctl bg-surface-2 border border-line flex flex-col justify-between">
                  <div className="text-ink-muted">Stress Level</div>
                  <div className="mt-1">
                    <RiskBadge level={stress.stressLevel} />
                  </div>
                </div>

                <div className="p-3 rounded-ctl bg-surface-2 border border-line flex flex-col justify-between">
                  <div className="text-ink-muted">Stress Classification</div>
                  <div className="text-sm font-bold font-mono text-ink mt-1">
                    {stressTypeDisplay}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">No stress summary available.</p>
            )}
          </Card>

          <ReliabilityPanel
            reliability={stress?.reliability ?? 'LOW'}
            reasons={stress?.reliabilityReasons ?? []}
            pixelCount={detail.field.pixelCount10m}
            areaHa={detail.field.areaHa}
          />
        </div>
      </div>

      {/* Full-width NdviTrendChart */}
      <Card
        eyebrow="60-Day Time Series"
        title="Sentinel-2 10 m NDVI & NDWI Trajectory"
      >
        <NdviTrendChart
          observations={detail.observations}
          baselineNdvi={stress?.ndviBaseline ?? 0.65}
          advisoryDate={firstSentMsg?.createdAt ?? null}
        />
      </Card>

      {/* Field Reasoning Chain */}
      <Card
        eyebrow="Field-Level Diagnostic Reasoning"
        title="Multi-Agent Evidence Chain"
        actions={<DataBadge status="SIMULATED" />}
      >
        <ReasoningChain steps={detail.reasoningChain} />
      </Card>

      {/* Soil Card Summary + Follow-up Mini Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          {detail.soilCard ? (
            <Card
              eyebrow="F2 · Linked Soil Health Card"
              title={`Card ${detail.soilCard.cardNumber ?? detail.soilCard.id}`}
              actions={
                <Link
                  to={`/soil-cards/${detail.soilCard.id}`}
                  className="text-xs font-mono font-bold text-primary hover:underline"
                >
                  Open Soil Card →
                </Link>
              }
            >
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-mono text-ink-muted mb-1.5">
                    Low / Deficient / Notable Parameters
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.soilCard.params
                      .filter(
                        (p) =>
                          p.rating === 'LOW' ||
                          p.rating === 'DEFICIENT' ||
                          p.rating === 'MODERATELY_ALKALINE' ||
                          p.rating === 'STRONGLY_ALKALINE' ||
                          p.rating === 'STRONGLY_ACIDIC',
                      )
                      .map((p) => (
                        <Badge key={p.param} tone="warning">
                          {p.param}: {p.value} {p.unit} ({p.rating})
                        </Badge>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-mono text-ink-muted mb-1.5">
                    Converted Recommendations
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {detail.soilCard.recommendations.map((r, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-ctl bg-surface-2 border border-line"
                      >
                        <div className="font-bold text-ink">{r.productLabel}</div>
                        <div className="font-mono text-primary font-bold mt-0.5">
                          {formatBagsDisplay(r.bagsPerAcre, r.kgPerAcre)} / acre
                        </div>
                        <div className="text-[11px] font-mono text-ink-muted">
                          Farm ({detail.field.areaHa} ha):{' '}
                          {r.bagsForFarm !== null
                            ? `${r.bagsForFarm} bags (${r.kgForFarm} kg)`
                            : `${r.kgForFarm} kg`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<FlaskConical className="w-5 h-5" />}
              title="No Soil Health Card Linked"
              hint="Scan or enter a Soil Health Card so nutrient deficiencies and bag/acre doses feed into F1 reasoning."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/soil-cards/new?farmerId=${detail.id}`)}
                >
                  Add Soil Health Card
                </Button>
              }
            />
          )}
        </div>

        <div className="lg:col-span-5">
          {detail.followUp && detail.openCase ? (
            <Card
              eyebrow="F3 · 21-Day Follow-Up"
              title={`Case Status: ${detail.openCase.status}`}
              actions={
                <Link
                  to={`/follow-up?caseId=${detail.openCase.id}`}
                  className="text-xs font-mono font-bold text-primary hover:underline"
                >
                  Open Follow-up Drawer →
                </Link>
              }
              className="space-y-4"
            >
              <ProgressBar
                value={detail.followUp.dayNumber}
                max={detail.followUp.windowDays}
                label={`Day ${detail.followUp.dayNumber} of ${detail.followUp.windowDays}`}
                showPct
              />
              <div className="flex items-center justify-between text-xs font-mono">
                <span>Follow-Up Outcome:</span>
                <Badge
                  tone={
                    detail.followUp.outcome === 'RECOVERING'
                      ? 'success'
                      : detail.followUp.outcome === 'DETERIORATING'
                        ? 'danger'
                        : detail.followUp.outcome === 'NOT_RECOVERING'
                          ? 'warning'
                          : 'info'
                  }
                >
                  {detail.followUp.outcome}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                {detail.followUp.outcomeReason}
              </p>
            </Card>
          ) : (
            <EmptyState
              icon={<Activity className="w-5 h-5" />}
              title="No Active Follow-Up Case"
              hint="21-day satellite follow-up starts automatically once an approved advisory is sent."
            />
          )}
        </div>
      </div>

      {/* Outbound Messages with MessageStepper */}
      <Card
        eyebrow="Outbound SMS History & Reach Lifecycle"
        title={`Messages for ${detail.name}`}
      >
        {detail.messages.length === 0 ? (
          <p className="text-xs text-ink-muted">No SMS messages drafted for this farmer yet.</p>
        ) : (
          <div className="space-y-6">
            {detail.messages.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-card bg-surface-2 border border-line space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-primary">
                      {msg.id}
                    </span>
                    <Badge tone="neutral">{msg.kind}</Badge>
                    <Badge tone="primary">{msg.status}</Badge>
                  </div>
                  <div className="text-xs font-mono text-ink-muted">
                    Drafted by {msg.generatedBy}
                    {msg.approvedBy ? ` · Approved by ${msg.approvedBy}` : ''}
                  </div>
                </div>
                <SmsPreview
                  language={msg.language}
                  textEnglish={msg.textEnglish}
                  textLocal={msg.textLocal}
                  phoneMasked={detail.phoneMasked}
                />
                <MessageStepper
                  status={msg.status}
                  history={msg.statusHistory}
                  rejectedReason={msg.rejectedReason}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Audit Timeline */}
      <Card
        eyebrow="Farmer Accountability Trail"
        title="Audit Events"
      >
        <AuditTimeline events={detail.auditEvents} />
      </Card>
    </div>
  );
}
