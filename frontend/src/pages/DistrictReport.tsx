import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  Bug,
  Clock,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react';
import { getDistrictReport } from '@/api/client';
import type { DistrictReport as DistrictReportType, Farmer } from '@/api/contract';
import { InstitutionalBriefing } from '@/components/domain/InstitutionalBriefing';
import { ReasoningChain } from '@/components/domain/ReasoningChain';
import { RiskGauge } from '@/components/domain/RiskGauge';
import { RolesPanel } from '@/components/domain/RolesPanel';
import { WeatherAlertList } from '@/components/domain/WeatherAlertList';
import { WeatherStrip } from '@/components/domain/WeatherStrip';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { formatSignedPct } from '@/lib/format';

export default function DistrictReport() {
  const { districtId = 'yavatmal' } = useParams<{ districtId: string }>();
  const navigate = useNavigate();

  const [report, setReport] = useState<DistrictReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await getDistrictReport(districtId, refresh);
        setReport(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load district report');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [districtId],
  );

  useEffect(() => {
    void loadReport(false);
  }, [loadReport]);

  if (loading && !report) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return <ErrorState message={error ?? 'District not found'} onRetry={() => loadReport(false)} />;
  }

  const { district } = report;

  const farmerColumns: TableColumn<Farmer>[] = [
    {
      key: 'name',
      header: 'Farmer',
      sortValue: (f) => f.name,
      render: (f) => (
        <Link
          to={`/farmers/${f.id}`}
          className="font-bold text-ink hover:text-primary hover:underline"
        >
          {f.name} <span className="font-mono text-xs text-ink-muted">({f.id})</span>
        </Link>
      ),
    },
    {
      key: 'village',
      header: 'Village',
      sortValue: (f) => f.village,
      render: (f) => <span>{f.village}</span>,
    },
    {
      key: 'area',
      header: 'Area (ha)',
      sortValue: (f) => f.field.areaHa,
      render: (f) => <span className="fp-num">{f.field.areaHa.toFixed(2)} ha</span>,
    },
    {
      key: 'sizeClass',
      header: 'Size Class',
      render: (f) => (
        <Badge
          tone={
            f.field.sizeClass === 'ADEQUATE'
              ? 'success'
              : f.field.sizeClass === 'SMALL'
                ? 'warning'
                : 'danger'
          }
        >
          {f.field.sizeClass}
        </Badge>
      ),
    },
    {
      key: 'boundary',
      header: 'Boundary',
      render: (f) => (
        <Badge
          tone={
            f.field.boundaryStatus === 'WORKER_VERIFIED'
              ? 'success'
              : f.field.boundaryStatus === 'DISPUTED'
                ? 'danger'
                : 'warning'
          }
        >
          {f.field.boundaryStatus}
        </Badge>
      ),
    },
    {
      key: 'stress',
      header: 'Field Stress (10 m)',
      render: (f) =>
        f.latestStress ? (
          <div className="flex items-center gap-1.5">
            <RiskBadge level={f.latestStress.stressLevel} />
            <span className="text-xs font-mono text-ink-muted">
              {f.latestStress.stressType === 'NONE'
                ? 'NONE'
                : `Possible ${f.latestStress.stressType}`}
            </span>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'reliability',
      header: 'Reliability',
      render: (f) =>
        f.latestStress ? (
          <Badge
            tone={
              f.latestStress.reliability === 'HIGH'
                ? 'success'
                : f.latestStress.reliability === 'MEDIUM'
                  ? 'info'
                  : f.latestStress.reliability === 'LOW'
                    ? 'warning'
                    : 'danger'
            }
          >
            {f.latestStress.reliability}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'case',
      header: 'Case Status',
      render: (f) =>
        f.openCaseId ? (
          <Link
            to={`/follow-up?caseId=${f.openCaseId}`}
            className="font-mono text-xs font-bold text-primary hover:underline"
          >
            {f.openCaseId} →
          </Link>
        ) : (
          <span className="text-ink-muted font-mono text-xs">No open case</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`District Report · Priority #${district.priorityRank}`}
        title={`${district.district}, ${district.state}`}
        description={`Primary Crop: ${report.crop} · Stage: ${report.cropStage} · ~${report.daysToHarvest} days to harvest · KVK Helpline: ${district.kvkContact}`}
        badges={
          <>
            <ScaleBadge scale="DISTRICT_MODIS_250M" />
            <DataBadge status={district.provenance.status} provenance={district.provenance} />
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              loading={refreshing}
              onClick={() => loadReport(true)}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                navigate(`/advisories?kind=DISTRICT_ADVISORY&districtId=${district.id}`)
              }
              icon={<MessageSquarePlus className="w-4 h-4" />}
            >
              Generate district advisory
            </Button>
          </>
        }
      />

      {/* Escalation Banner if escalate=true */}
      {report.escalate && (
        <div className="p-4 rounded-card bg-danger/15 border-2 border-danger text-ink flex items-start gap-3">
          <AlertOctagon className="w-6 h-6 text-danger shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm text-danger uppercase font-mono">
              Mandatory Department Escalation Triggered ({report.priority})
            </div>
            <p className="text-sm">{report.escalationReason}</p>
          </div>
        </div>
      )}

      {/* Top row: RiskGauge, Confidence + Priority, Recommended Action + Root Cause, Freshness + Pest */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          className="lg:col-span-3 flex flex-col items-center justify-center"
          eyebrow="Composite Risk Score"
          actions={
            <DataBadge
              status={district.provenance?.status ?? 'LIVE'}
              provenance={district.provenance}
            />
          }
        >
          <RiskGauge score={report.riskScore} level={report.riskLevel} />
        </Card>

        <Card
          className="lg:col-span-5 space-y-4"
          eyebrow="Diagnostic Summary & Recommended Action"
          title={`Priority ${report.priority} Action Plan`}
          actions={
            <Badge
              tone={
                report.priority === 'P1'
                  ? 'danger'
                  : report.priority === 'P2'
                    ? 'warning'
                    : 'info'
              }
              className="text-sm px-3 py-1 font-bold"
            >
              Priority {report.priority}
            </Badge>
          }
        >
          <ProgressBar
            value={report.confidence}
            label="Diagnostic Confidence"
            showPct
            tone="primary"
          />
          <div className="p-4 rounded-ctl bg-surface-2 border border-line space-y-1.5">
            <div className="text-xs font-mono font-bold uppercase text-primary">
              Recommended Department Action
            </div>
            <p className="text-sm text-ink leading-relaxed break-words">{report.recommendedAction}</p>
          </div>
          <div className="p-4 rounded-ctl bg-surface-2 border border-line space-y-1.5">
            <div className="text-xs font-mono font-bold uppercase text-ink-muted">
              Identified Root Cause
            </div>
            <p className="text-xs text-ink-muted leading-relaxed break-words">{report.rootCause}</p>
          </div>
        </Card>

        <Card
          className="lg:col-span-4 space-y-4"
          eyebrow="Data Freshness & Biotic Signal"
          title="Telemetry Health"
        >
          <div className="p-3 rounded-ctl bg-surface-2 border border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Overall Freshness</span>
            </div>
            <Badge
              tone={
                report.freshness.overall === 'FRESH'
                  ? 'success'
                  : report.freshness.overall === 'AGING'
                    ? 'warning'
                    : 'danger'
              }
            >
              {report.freshness.overall}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">MODIS NDVI Age</div>
              <div className="font-bold text-ink mt-0.5">
                {report.freshness.ndviAgeDays ?? 2} days
              </div>
            </div>
            <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">Weather Obs Age</div>
              <div className="font-bold text-ink mt-0.5">
                {report.freshness.weatherAgeDays ?? 0} days
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-ctl bg-surface-2 border border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold flex items-center gap-1.5 text-ink">
                <Bug className="w-4 h-4 text-warning" /> Pest Conduciveness
              </span>
              <DataBadge
                status={report.weather?.provenance?.status ?? 'LIVE'}
                source="Agrometeorological Biotic Model"
              />
            </div>
            <div className="text-xs text-ink font-medium">{report.pest.name}</div>
            <ProgressBar
              value={report.pest.probability}
              label="Weather Conduciveness Probability"
              showPct
              tone={report.pest.probability >= 60 ? 'warning' : 'info'}
            />
          </div>
        </Card>
      </div>

      {/* Reasoning Chain */}
      <Card
        eyebrow="Transparent AI & Multi-Agent Evidence"
        title="4-Agent Diagnostic Reasoning Chain"
        actions={
          <DataBadge
            status={district.provenance?.status ?? 'LIVE'}
            source="NASA MODIS & Open-Meteo Multi-Agent Ingestion"
          />
        }
      >
        <ReasoningChain steps={report.reasoningChain} />
      </Card>

      {/* Weather Observations + 5-Day Forecast Strip + Alerts */}
      <Card
        eyebrow="Agrometeorological Context"
        title="Observed Weather & 5-Day Synoptic Forecast"
        actions={
          <DataBadge
            status={report.weather.provenance.status}
            provenance={report.weather.provenance}
          />
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">7-Day Rainfall</div>
              <div className="text-lg font-bold fp-num text-ink mt-0.5">
                {report.weather.rainfall7dMm.toFixed(1)} mm
              </div>
            </div>
            <div className="p-3 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">Rainfall Anomaly</div>
              <div className="text-lg font-bold fp-num text-warning mt-0.5">
                {formatSignedPct(report.weather.rainfallAnomalyPct, 0)}
              </div>
            </div>
            <div className="p-3 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">Avg Max Temp</div>
              <div className="text-lg font-bold fp-num text-ink mt-0.5">
                {report.weather.avgTempC.toFixed(1)} °C
              </div>
            </div>
            <div className="p-3 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">Temp Anomaly</div>
              <div className="text-lg font-bold fp-num text-danger mt-0.5">
                +{report.weather.tempAnomalyC.toFixed(1)} °C
              </div>
            </div>
            <div className="p-3 rounded-ctl bg-surface-2 border border-line">
              <div className="text-ink-muted">Relative Humidity</div>
              <div className="text-lg font-bold fp-num text-ink mt-0.5">
                {report.weather.humidityPct}%
              </div>
            </div>
          </div>

          <WeatherStrip forecast={report.forecast5d} />
          <WeatherAlertList alerts={report.weatherAlerts} />
        </div>
      </Card>

      {/* Institutional Briefing */}
      <InstitutionalBriefing briefing={report.institutionalBriefing} />

      {/* Roles Panel */}
      <Card
        eyebrow="Department Accountability Matrix"
        title="Who Does What in This District"
      >
        <RolesPanel roles={report.roles} />
      </Card>

      {/* Registered Farmers in District */}
      <Card
        eyebrow="Field-Scale Monitoring"
        title={`Registered Farmer Parcels in ${district.district}`}
        actions={
          <div className="flex items-center gap-2">
            <ScaleBadge scale="FIELD_SENTINEL2_10M" />
            <DataBadge status="LIVE" source="KrishiMitra Farmer Registry" />
          </div>
        }
      >
        <Table
          data={report.registeredFarmers}
          columns={farmerColumns}
          rowKey={(f) => f.id}
          onRowClick={(f) => navigate(`/farmers/${f.id}`)}
          emptyState={
            <EmptyState
              title="No registered farmers in this district yet"
              hint="Extension workers can register farmer field polygons from the Farmers page."
              action={
                <Button variant="primary" size="sm" onClick={() => navigate('/farmers/new')}>
                  Register Farmer
                </Button>
              }
            />
          }
        />
      </Card>

      {/* Warnings & Data Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card eyebrow="Honesty & Scale Caveats" title="Operational Warnings">
          {report.warnings.length === 0 ? (
            <p className="text-xs text-ink-muted">
              No scale or parcel warnings triggered for this district.
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-ink">
              {report.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow="Provenance Ledger" title="Data Sources Used in Report">
          <div className="space-y-2">
            {report.dataSources.map((ds, i) => (
              <div
                key={i}
                className="p-2.5 rounded-ctl bg-surface-2 border border-line flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-ink">{ds.source}</div>
                  {ds.note && <div className="text-[11px] text-ink-muted">{ds.note}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ds.scale && <ScaleBadge scale={ds.scale} />}
                  <DataBadge status={ds.status} provenance={ds} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
