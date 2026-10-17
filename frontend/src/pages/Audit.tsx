import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Download,
  FileText,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from 'lucide-react';
import type {
  AuditEvent,
  AuditLayer,
  Case,
  ChainVerifyResponse,
  DistrictSummary,
  Farmer,
} from '@/api/contract';
import {
  exportAuditCsv,
  getAuditEvents,
  getCases,
  getDistricts,
  getFarmers,
  verifyAuditChain,
} from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { AuditTimeline } from '@/components/domain/AuditTimeline';

const ALL_LAYERS: AuditLayer[] = [
  'DATA_PROVENANCE',
  'ANALYSIS',
  'HUMAN_VERIFICATION',
  'APPROVAL',
  'OUTREACH',
  'FIELD_ACTION',
  'OUTCOME',
];

export const Audit: React.FC = () => {
  const navigate = useNavigate();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [chainStatus, setChainStatus] = useState<ChainVerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedLayers, setSelectedLayers] = useState<AuditLayer[]>([]);
  const [caseFilter, setCaseFilter] = useState<string>('ALL');
  const [farmerFilter, setFarmerFilter] = useState<string>('ALL');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Consolidated report selector
  const [reportCaseId, setReportCaseId] = useState<string>('CASE-0002');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evRes, cRes, fRes, dRes, verifyRes] = await Promise.all([
        getAuditEvents({ limit: 200 }),
        getCases(),
        getFarmers(),
        getDistricts(),
        verifyAuditChain(),
      ]);
      setEvents(evRes);
      setCases(cRes);
      setFarmers(fRes);
      setDistricts(dRes.districts);
      setChainStatus(verifyRes);
      if (cRes.length > 0 && !cRes.some((c) => c.id === 'CASE-0002')) {
        setReportCaseId(cRes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await verifyAuditChain();
      setChainStatus(res);
      if (res.valid) {
        toast.success(`Hash chain verified: ${res.eventCount} events intact`);
      } else {
        toast.error(`Chain broken at event #${res.brokenAtId ?? 'unknown'}`);
      }
    } finally {
      setVerifying(false);
    }
  };

  const toggleLayer = (layer: AuditLayer) => {
    setSelectedLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    );
  };

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      if (selectedLayers.length > 0 && !selectedLayers.includes(e.layer)) return false;
      if (caseFilter !== 'ALL' && e.caseId !== caseFilter) return false;
      if (farmerFilter !== 'ALL' && e.farmerId !== farmerFilter) return false;
      if (districtFilter !== 'ALL' && e.districtId !== districtFilter) return false;
      if (q) {
        const hay = `${e.summary} ${e.actor} ${e.action} ${e.entityId} ${e.hash}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, selectedLayers, caseFilter, farmerFilter, districtFilter, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Layer 7 · Cryptographic Accountability"
          title="7-Layer Audit Trail"
          description="Immutable SHA-256 hash-chained ledger of every satellite observation, human review, approval, SMS dispatch, and field outcome."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 7 · Cryptographic Accountability"
        title="7-Layer Audit Trail"
        description="Tamper-evident hash chain across all 7 accountability layers — from satellite ingestion to verified ground closure."
        actions={
          <div className="flex items-center gap-2">
            <DataBadge status="LIVE" source="SHA-256 Audit Ledger" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void exportAuditCsv();
                toast.success('Audit CSV exported');
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Filters Card */}
          <Card
            eyebrow="Filter Audit Ledger"
            title="Multi-layer & entity filters"
            actions={
              <Badge tone="neutral">
                Showing {filteredEvents.length} of {events.length} events
              </Badge>
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-ink-muted mb-2">
                  Filter by accountability layer (multi-select):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_LAYERS.map((layer) => {
                    const active = selectedLayers.includes(layer);
                    return (
                      <button
                        key={layer}
                        type="button"
                        onClick={() => toggleLayer(layer)}
                        className={`rounded-badge px-2.5 py-1 text-xs font-mono transition-colors border ${
                          active
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-line bg-surface-2 text-ink hover:bg-surface'
                        }`}
                      >
                        {layer}
                      </button>
                    );
                  })}
                  {selectedLayers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedLayers([])}
                      className="text-xs text-primary underline px-2 py-1"
                    >
                      Clear layers
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Select
                  label="Case"
                  value={caseFilter}
                  onChange={(e) => setCaseFilter(e.target.value)}
                >
                  <option value="ALL">All cases</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({c.farmerName})
                    </option>
                  ))}
                </Select>
                <Select
                  label="Farmer"
                  value={farmerFilter}
                  onChange={(e) => setFarmerFilter(e.target.value)}
                >
                  <option value="ALL">All farmers</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.id})
                    </option>
                  ))}
                </Select>
                <Select
                  label="District"
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                >
                  <option value="ALL">All districts</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.district}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Search text / hash"
                  placeholder="Actor, summary, hash..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card
            eyebrow="Hash-Chained Event Stream"
            title="Chronological accountability log"
            actions={<DataBadge status="LIVE" source="Audit Chain" />}
          >
            <AuditTimeline events={filteredEvents} />
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          {/* Chain Integrity Card */}
          <Card
            eyebrow="Cryptographic Verification"
            title="Chain integrity check"
            actions={
              chainStatus?.valid ? (
                <Badge tone="success">Valid ✓</Badge>
              ) : (
                <Badge tone="danger">Broken ✗</Badge>
              )
            }
          >
            <div className="space-y-4">
              {chainStatus ? (
                <div
                  className={`rounded-input border p-3.5 text-xs space-y-1.5 ${
                    chainStatus.valid
                      ? 'border-success/30 bg-success/10 text-ink'
                      : 'border-danger/30 bg-danger/10 text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {chainStatus.valid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>Chain valid ✓ ({chainStatus.eventCount} events)</span>
                      </>
                    ) : (
                      <>
                        <ShieldX className="h-4 w-4 text-danger" />
                        <span>
                          Broken at #{chainStatus.brokenAtId} ✗ ({chainStatus.eventCount}{' '}
                          events)
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-ink-muted">
                    Every event links to <span className="font-mono">prevHash</span> via
                    deterministic SHA-256 digest.
                  </p>
                </div>
              ) : null}

              <Button
                variant="primary"
                size="sm"
                className="w-full"
                loading={verifying}
                onClick={() => void handleVerifyChain()}
              >
                <ShieldCheck className="h-4 w-4" />
                Verify chain
              </Button>
            </div>
          </Card>

          {/* Consolidated Report Card */}
          <Card
            eyebrow="Print-Ready Dossier"
            title="Consolidated report"
            actions={<DataBadge status="LIVE" source="9-Section Dossier" />}
          >
            <div className="space-y-4">
              <p className="text-xs text-ink-muted leading-relaxed">
                Generate a 9-section Farmer Action &amp; Accountability Report suitable for
                district collectors, KVK heads, and institutional audits.
              </p>

              <Select
                label="Select case"
                value={reportCaseId}
                onChange={(e) => setReportCaseId(e.target.value)}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.farmerName} ({c.status})
                  </option>
                ))}
              </Select>

              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/audit/report/${reportCaseId}`)}
                >
                  <FileText className="h-4 w-4" />
                  Open case report ({reportCaseId})
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => navigate('/audit/report/illustrative')}
                >
                  <Sparkles className="h-4 w-4" />
                  View illustrative report
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
