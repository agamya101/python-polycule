import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Send,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  confirmSoilCard,
  createSoilCardManual,
  createSoilCardOcr,
  generateSoilCardSms,
  getFarmers,
  patchSoilCard,
  submitMessage,
} from '@/api/client';
import type {
  Farmer,
  Language,
  OutboundMessage,
  RecommendationInput,
  SoilCard,
  SoilParam,
} from '@/api/contract';
import { FertilizerTable } from '@/components/domain/FertilizerTable';
import { SmsPreview } from '@/components/domain/SmsPreview';
import { SoilParamTable } from '@/components/domain/SoilParamTable';
import { UnitConverter } from '@/components/domain/UnitConverter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleGate } from '@/components/ui/RoleGate';
import { Select } from '@/components/ui/Select';
import {
  computeFertilizerRec,
  evaluateSoilParam,
  getParamSpec,
  SOIL_PARAM_SPECS,
} from '@/lib/soil';

const STEPS = [
  '1. Select Farmer',
  '2. Upload / Entry',
  '3. Review & Safeguards',
  '4. Interpretation',
  '5. Regional SMS',
] as const;

export default function SoilCardNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillFarmerId = searchParams.get('farmerId') ?? '';

  const [step, setStep] = useState(1);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [farmerSearch, setFarmerSearch] = useState('');
  const [selectedFarmerId, setSelectedFarmerId] = useState(prefillFarmerId || 'FRM-0005');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const [card, setCard] = useState<SoilCard | null>(null);
  const [smsLanguage, setSmsLanguage] = useState<Language>('Punjabi');
  const [generatedMsg, setGeneratedMsg] = useState<OutboundMessage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getFarmers().then((list) => {
      setFarmers(list);
      const found = list.find((f) => f.id === (prefillFarmerId || 'FRM-0005')) ?? list[0];
      if (found) {
        setSelectedFarmerId(found.id);
        setSmsLanguage(found.language);
      }
    });
  }, [prefillFarmerId]);

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId) ?? farmers[0];

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be 8 MB or smaller');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRunOcr = async () => {
    if (!selectedFarmer) return;
    setBusy(true);
    try {
      const dummyFile =
        selectedFile ?? new File(['mock-shc'], 'soil-health-card.jpg', { type: 'image/jpeg' });
      const created = await createSoilCardOcr(selectedFarmer.id, dummyFile);
      const farmArea = selectedFarmer.field?.areaHa ?? 1.2;
      const normalizedParams = (created.params ?? []).map((p) =>
        evaluateSoilParam(
          p.param,
          p.value,
          p.unit,
          p.ocrRaw ?? (p.value !== null ? String(p.value) : null),
          p.ocrConfidence ?? 0.95,
          p.confirmed ?? false,
        ),
      );
      const normalizedRecs = (created.recommendations ?? []).map((r) =>
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
      setCard({ ...created, params: normalizedParams, recommendations: normalizedRecs });
      setSmsLanguage(selectedFarmer.language);
      toast.success('OCR extracted 12 parameters — review safeguard flags before confirming');
      setStep(3);
    } finally {
      setBusy(false);
    }
  };

  const handleEnterManually = async () => {
    if (!selectedFarmer) return;
    setBusy(true);
    try {
      const created = await createSoilCardManual({
        farmerId: selectedFarmer.id,
        cardNumber: `MAN-2026-0099`,
        sampleDate: '2026-05-10',
        labName: 'District Soil Testing Laboratory',
        params: SOIL_PARAM_SPECS.map((s) => ({
          param: s.param,
          value: (s.min + s.max) / 4,
          unit: s.defaultUnit,
        })),
        recommendations: [
          {
            product: 'Urea',
            productLabel: 'Urea',
            cardDose: 220,
            cardDoseUnit: 'kg/ha',
            timing: 'Split application',
            sourceText: 'Urea @ 220 kg/ha',
          },
        ],
      });
      const farmArea = selectedFarmer.field?.areaHa ?? 1.2;
      const normalizedParams = (created.params ?? []).map((p) =>
        evaluateSoilParam(
          p.param,
          p.value,
          p.unit,
          p.ocrRaw ?? (p.value !== null ? String(p.value) : null),
          p.ocrConfidence ?? 0.95,
          p.confirmed ?? false,
        ),
      );
      const normalizedRecs = (created.recommendations ?? []).map((r) =>
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
      setCard({ ...created, params: normalizedParams, recommendations: normalizedRecs });
      setSmsLanguage(selectedFarmer.language);
      setStep(3);
    } finally {
      setBusy(false);
    }
  };

  const handleParamChange = (
    param: SoilParam,
    updates: { value?: number | null; unit?: string; confirmed?: boolean },
  ) => {
    if (!card) return;
    const nextParams = card.params.map((p) => {
      if (p.param !== param) return p;
      const val = updates.value !== undefined ? updates.value : p.value;
      const unit = updates.unit !== undefined ? updates.unit : p.unit;
      const conf = updates.confirmed !== undefined ? updates.confirmed : p.confirmed;
      return evaluateSoilParam(p.param, val, unit, p.ocrRaw, p.ocrConfidence, conf);
    });
    setCard({ ...card, params: nextParams });
  };

  const handleRecommendationsChange = (inputs: RecommendationInput[]) => {
    if (!card) return;
    const area = selectedFarmer?.field.areaHa ?? 1.0;
    const recs = inputs.map((r) => computeFertilizerRec(r, area));
    setCard({ ...card, recommendations: recs });
  };

  const handleSaveChanges = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const updated = await patchSoilCard(card.id, {
        cardNumber: card.cardNumber,
        sampleDate: card.sampleDate,
        labName: card.labName,
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
      toast.success('Changes saved to Soil Health Card');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCard = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await handleSaveChanges();
      const confirmed = await confirmSoilCard(card.id);
      setCard(confirmed);
      toast.success('Soil Health Card confirmed');
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSms = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const msg = await generateSoilCardSms(card.id, smsLanguage);
      setGeneratedMsg(msg);
      toast.success(`Generated ${smsLanguage} Soil Health Card SMS`);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!generatedMsg) return;
    setBusy(true);
    try {
      const submitted = await submitMessage(generatedMsg.id);
      setGeneratedMsg(submitted);
      toast.success('Submitted to Agriculture Department approval queue');
      if (card) {
        navigate(`/soil-cards/${card.id}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const blockingCount = card
    ? (card.params ?? []).reduce(
        (acc, p) => acc + (p.flags ? p.flags.filter((f) => f.blocking).length : 0),
        0,
      )
    : 0;
  const unconfirmedCount = card ? (card.params ?? []).filter((p) => !p.confirmed).length : 0;
  const canConfirm = card !== null && blockingCount === 0 && unconfirmedCount === 0;

  const filteredFarmers = farmers.filter((f) => {
    if (!farmerSearch.trim()) return true;
    const q = farmerSearch.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      f.village.toLowerCase().includes(q)
    );
  });

  const GROUPS: { key: 'REACTION' | 'ORGANIC' | 'PRIMARY' | 'SECONDARY' | 'MICRO'; title: string }[] = [
    { key: 'REACTION', title: 'Soil Reaction (pH, EC)' },
    { key: 'ORGANIC', title: 'Organic Carbon (OC)' },
    { key: 'PRIMARY', title: 'Primary Nutrients (N, P, K)' },
    { key: 'SECONDARY', title: 'Secondary Nutrient (S)' },
    { key: 'MICRO', title: 'Micronutrients (Zn, Fe, Cu, Mn, B)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="F2 · Soil Health Card 5-Step Wizard"
        title="Scan or Enter Soil Health Card"
        description="Extract 12 soil parameters, verify OCR safeguard flags, convert fertilizer doses to bags/acre, and submit a regional SMS for department approval."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/soil-cards')}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back to Soil Cards
          </Button>
        }
      />

      {/* Stepper Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {STEPS.map((label, idx) => {
          const sNum = idx + 1;
          const isActive = step === sNum;
          const isDone = step > sNum;
          return (
            <button
              key={label}
              type="button"
              disabled={sNum > 2 && !card}
              onClick={() => setStep(sNum)}
              className={`p-3 rounded-ctl border text-left text-xs font-mono transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-on-primary border-primary font-bold'
                  : isDone
                    ? 'bg-success/15 text-success border-success/40 font-semibold'
                    : 'bg-surface-2 text-ink-muted border-line'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* STEP 1: Select Farmer */}
      {step === 1 && (
        <Card eyebrow="Step 1 of 5" title="Select Registered Farmer" className="space-y-4">
          <Input
            label="Search Farmer by Name, ID, or Village"
            value={farmerSearch}
            onChange={(e) => setFarmerSearch(e.target.value)}
            placeholder="e.g. Gurpreet, FRM-0005, Yavatmal…"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
            {filteredFarmers.map((f) => {
              const isSelected = f.id === selectedFarmerId;
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setSelectedFarmerId(f.id);
                    setSmsLanguage(f.language);
                  }}
                  className={`p-3.5 rounded-card border cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-primary/10 border-primary'
                      : 'bg-surface-2 border-line hover:border-primary/50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-ink">
                      {f.name} <span className="font-mono text-xs text-primary">({f.id})</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {f.village}, {f.districtId.toUpperCase()} · {f.crop} · {f.field.areaHa} ha ·{' '}
                      {f.language}
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Continue to Upload / Entry
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: Upload Image or Enter Manually */}
      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            eyebrow="Option A · Gemini Vision OCR"
            title="Upload Soil Health Card Image"
            actions={<DataBadge status="SIMULATED" source="GEMINI_OCR" />}
            className="space-y-4"
          >
            <label className="border-2 border-dashed border-line rounded-card p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-surface-2 transition-colors text-center">
              <Upload className="w-8 h-8 text-primary" />
              <div>
                <div className="text-sm font-bold text-ink">
                  Drag & drop Soil Health Card photo, or click to browse
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  Supports JPG / PNG ≤ 8 MB (or click "Read card" directly in demo mode)
                </div>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>

            {previewUrl && (
              <div className="p-2 rounded-ctl bg-surface-2 border border-line">
                <img
                  src={previewUrl}
                  alt="Soil card preview"
                  className="max-h-48 mx-auto object-contain rounded"
                />
              </div>
            )}

            <RoleGate action="soil.create">
              <Button
                variant="primary"
                loading={busy}
                onClick={handleRunOcr}
                className="w-full justify-center"
              >
                Read card (Run OCR & Safeguards)
              </Button>
            </RoleGate>
          </Card>

          <Card
            eyebrow="Option B · Manual Extension Entry"
            title="Enter 12 Parameters Manually"
            actions={<DataBadge status="MANUAL" />}
            className="space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-2 text-xs text-ink-muted leading-relaxed">
              <p>
                If the printed Soil Health Card is smudged or unavailable as an image, initialize a
                12-row parameter sheet and type values directly from the laboratory printout.
              </p>
              <p>
                Plausible range checks, unit conversions, and bag/acre calculations still run
                automatically.
              </p>
            </div>
            <RoleGate action="soil.create">
              <Button
                variant="ghost"
                loading={busy}
                onClick={handleEnterManually}
                icon={<FileSpreadsheet className="w-4 h-4" />}
                className="w-full justify-center"
              >
                Enter manually
              </Button>
            </RoleGate>
          </Card>
        </div>
      )}

      {/* STEP 3: Review Split View */}
      {step === 3 && card && (
        <div className="space-y-6">
          {/* Blocking flags banner */}
          <div
            className={`p-4 rounded-card border flex flex-wrap items-center justify-between gap-4 ${
              blockingCount > 0 || unconfirmedCount > 0
                ? 'bg-danger/10 border-danger/40 text-ink'
                : 'bg-success/10 border-success/40 text-ink'
            }`}
          >
            <div className="flex items-center gap-3">
              {blockingCount > 0 || unconfirmedCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              )}
              <div className="text-xs sm:text-sm">
                <strong>
                  {blockingCount} blocking flag(s) · {unconfirmedCount} unconfirmed parameter(s)
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UnitConverter />
              <RoleGate action="soil.edit">
                <Button variant="ghost" size="sm" loading={busy} onClick={handleSaveChanges}>
                  Save changes
                </Button>
              </RoleGate>
              <RoleGate
                action="soil.confirm"
                extraDisableReason={
                  !canConfirm
                    ? 'Resolve all blocking flags and confirm all 12 rows first'
                    : null
                }
              >
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy}
                  onClick={handleConfirmCard}
                >
                  Confirm card →
                </Button>
              </RoleGate>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 4 cols: Zoomable Card Image / Facsimile */}
            <Card
              className="lg:col-span-4 space-y-3"
              eyebrow="Scanned Card Facsimile"
              title={card.cardNumber ?? card.id}
              actions={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
                    className="fp-btn fp-btn-ghost p-1.5"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
                    className="fp-btn fp-btn-ghost p-1.5"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            >
              <div
                onWheel={(e) => {
                  if (e.deltaY < 0) setZoom((z) => Math.min(2, z + 0.1));
                  else setZoom((z) => Math.max(0.75, z - 0.1));
                }}
                className="overflow-auto max-h-[540px] rounded-ctl border border-line bg-surface-2 p-3"
              >
                <div
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                  className="space-y-2 text-xs font-mono"
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="Uploaded SHC" className="w-full rounded" />
                  ) : (
                    <div className="p-3 bg-surface border border-line rounded space-y-2">
                      <div className="font-bold text-primary border-b border-line pb-1">
                        GOVT SOIL HEALTH CARD · {card.cardNumber}
                      </div>
                      <div>Farmer: {selectedFarmer?.name}</div>
                      <div>Sample Date: {card.sampleDate}</div>
                      <div>Lab: {card.labName}</div>
                      <div className="border-t border-line pt-1 space-y-1">
                        {card.params.map((p) => (
                          <div key={p.param} className="flex justify-between">
                            <span>{p.param}:</span>
                            <span>
                              {p.ocrRaw ?? p.value ?? 'MISSING'} {p.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Right 8 cols: Meta + SoilParamTable + FertilizerTable */}
            <div className="lg:col-span-8 space-y-6">
              <Card eyebrow="Card Metadata" title="Laboratory & Sample Details">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="Card Number"
                    value={card.cardNumber ?? ''}
                    onChange={(e) => setCard({ ...card, cardNumber: e.target.value })}
                  />
                  <Input
                    type="date"
                    label="Sample Date"
                    value={card.sampleDate ?? ''}
                    onChange={(e) => setCard({ ...card, sampleDate: e.target.value })}
                  />
                  <Input
                    label="Soil Testing Laboratory"
                    value={card.labName ?? ''}
                    onChange={(e) => setCard({ ...card, labName: e.target.value })}
                  />
                </div>
              </Card>

              <Card
                eyebrow="12 Soil Parameters & Safeguard Flags"
                title="Parameter Review Table"
              >
                <SoilParamTable params={card.params} onChangeParam={handleParamChange} />
              </Card>

              <Card
                eyebrow="Unit-Safe Fertilizer Conversion"
                title="Card Fertilizer Recommendations"
              >
                <FertilizerTable
                  recommendations={card.recommendations}
                  editable
                  onChangeRecommendations={handleRecommendationsChange}
                />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Interpretation */}
      {step === 4 && card && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {GROUPS.map((grp) => {
              const grpParams = card.params.filter(
                (p) => getParamSpec(p.param).group === grp.key,
              );
              return (
                <Card key={grp.key} eyebrow="Agronomic Interpretation" title={grp.title}>
                  <div className="space-y-4">
                    {grpParams.map((p) => {
                      const spec = getParamSpec(p.param);
                      const pct =
                        p.value !== null
                          ? Math.min(
                              100,
                              Math.max(0, ((p.value - spec.min) / (spec.max - spec.min)) * 100),
                            )
                          : 0;
                      return (
                        <div
                          key={p.param}
                          className="p-3 rounded-ctl bg-surface-2 border border-line space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-ink">
                              {p.label} ({p.param})
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="fp-num font-bold text-sm">
                                {p.value ?? '—'} {p.unit}
                              </span>
                              {p.rating && <Badge tone="primary">{p.rating}</Badge>}
                            </div>
                          </div>
                          {/* Range scale bar with marker */}
                          <div className="relative h-2 rounded-full bg-surface border border-line">
                            <div
                              className="w-3 h-3 rounded-full bg-primary border-2 border-surface absolute -top-0.5"
                              style={{ left: `calc(${pct}% - 6px)` }}
                            />
                          </div>
                          <p className="text-xs text-ink-muted">{p.interpretation}</p>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card eyebrow="What the Card Recommends" title="Converted Fertilizer Doses">
            <FertilizerTable recommendations={card.recommendations} editable={false} />
          </Card>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => setStep(5)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Proceed to Regional SMS Generation
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: SMS Generation & Submit for Approval */}
      {step === 5 && card && (
        <Card
          eyebrow="Step 5 of 5 · Mandatory Approval Gate"
          title="Generate Plain-Language Regional SMS"
          className="space-y-5"
        >
          <div className="p-3.5 rounded-ctl bg-warning/15 border border-warning/40 text-xs font-mono text-ink">
            This SMS will not be sent until an Agriculture Department officer approves it.
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Target Farmer SMS Language"
              value={smsLanguage}
              onChange={(e) => setSmsLanguage(e.target.value as Language)}
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

          {generatedMsg && (
            <div className="space-y-4">
              <SmsPreview
                language={generatedMsg.language}
                textEnglish={generatedMsg.textEnglish}
                textLocal={generatedMsg.textLocal}
                phoneMasked={selectedFarmer?.phoneMasked}
              />
              <div className="flex justify-end">
                <RoleGate action="message.submit">
                  <Button
                    variant="accent"
                    loading={busy}
                    onClick={handleSubmitForApproval}
                    icon={<Send className="w-4 h-4" />}
                  >
                    Submit for department approval
                  </Button>
                </RoleGate>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
