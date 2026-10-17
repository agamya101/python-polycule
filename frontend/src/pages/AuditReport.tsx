import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import type { ConsolidatedReport } from '@/api/contract';
import { getConsolidatedReport } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { DataBadge } from '@/components/ui/DataBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDateTime } from '@/lib/format';

export const AuditReport: React.FC = () => {
  const { caseId = 'CASE-0002' } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [report, setReport] = useState<ConsolidatedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getConsolidatedReport(caseId);
      setReport(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consolidated report');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <ErrorState
        message={error ?? 'Report not found'}
        onRetry={() => void loadReport()}
      />
    );
  }

  return (
    <div className="relative max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/audit')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Audit Trail
        </Button>
        <div className="flex items-center gap-2">
          <DataBadge
            status="LIVE"
            source="Consolidated Accountability Dossier"
          />
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print Dossier
          </Button>
        </div>
      </div>

      {/* Printable Report Sheet */}
      <div className="relative overflow-hidden rounded-card border border-line bg-surface p-6 sm:p-10 shadow-card space-y-8">
        {/* Document Header */}
        <header className="relative z-10 border-b-2 border-line pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="fp-eyebrow">
              Department of Agriculture &amp; Rural Development · Accountability Dossier
            </p>
            <div className="flex items-center gap-2.5">
              <BrandLogo />
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
                KrishiMitra — Farmer Action &amp; Accountability Report
              </h1>
            </div>
            <p className="text-xs text-ink-muted">
              End-to-end evidentiary chain across satellite analysis, human verification,
              department approval, SMS outreach, and ground follow-up.
            </p>
          </div>
          <div className="text-left sm:text-right font-mono text-xs space-y-1 shrink-0">
            <div>
              <span className="text-ink-muted">Case ID: </span>
              <strong className="text-ink">{report.caseId}</strong>
            </div>
            <div>
              <span className="text-ink-muted">Generated: </span>
              <span className="text-ink fp-num">{formatDateTime(report.generatedAt)}</span>
            </div>
            <div>
              <Badge tone="success">OFFICIAL CASE RECORD</Badge>
            </div>
          </div>
        </header>

        {/* 9 Numbered Sections */}
        <div className="relative z-10 space-y-6">
          {report.sections.map((sec, sIdx) => (
            <section
              key={sec.key}
              className="rounded-card border border-line bg-surface-2/40 overflow-hidden"
            >
              <div className="px-4 py-3 bg-surface-2 border-b border-line flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-badge bg-primary text-on-primary font-mono text-xs font-bold">
                    {sIdx + 1}
                  </span>
                  <h2 className="font-display text-sm sm:text-base font-semibold text-ink">
                    {sec.title}
                  </h2>
                </div>
                <span className="text-xs font-mono text-ink-muted">
                  Accountable role: <strong className="text-ink">{sec.accountableRole}</strong>
                </span>
              </div>

              <div className="divide-y divide-line">
                {sec.rows.map((row, rIdx) => (
                  <div
                    key={`${sec.key}-${rIdx}`}
                    className="px-4 py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
                  >
                    <div className="sm:col-span-4 font-medium text-ink-muted">
                      {row.label}
                    </div>
                    <div className="sm:col-span-6 text-ink font-medium break-words">
                      {row.value}
                    </div>
                    <div className="sm:col-span-2 flex sm:justify-end">
                      {row.status ? (
                        <Badge tone="success">VERIFIED</Badge>
                      ) : (
                        <span className="text-ink-muted font-mono text-[11px]">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Integrity Footer */}
        <footer className="relative z-10 border-t-2 border-line pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {report.integrity.chainValid ? (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-danger shrink-0" />
            )}
            <span className="text-ink">
              Cryptographic Audit Chain:{' '}
              <strong>
                {report.integrity.chainValid ? 'VALID ✓' : 'BROKEN ✗'}
              </strong>{' '}
              ({report.integrity.eventCount} linked events)
            </span>
          </div>
          <div className="font-mono text-ink-muted">
            Last SHA-256 digest:{' '}
            <span className="text-ink font-semibold">{report.integrity.lastHash}</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
