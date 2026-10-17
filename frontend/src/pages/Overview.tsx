import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Radar,
  ShieldCheck,
  Tractor,
  Users,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getDistricts, getOverview, runPriorityScan } from '@/api/client';
import type { AgentEvent, DistrictsResponse, OverviewResponse } from '@/api/contract';
import { subscribeRun } from '@/api/sse';
import { AgentStatusPanel } from '@/components/domain/AgentStatusPanel';
import { AuditTimeline } from '@/components/domain/AuditTimeline';
import { DistrictMap } from '@/components/domain/DistrictMap';
import { OutreachFunnel } from '@/components/domain/OutreachFunnel';
import { WeatherAlertList } from '@/components/domain/WeatherAlertList';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { RoleGate } from '@/components/ui/RoleGate';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/theme/useThemeColors';

export default function Overview() {
  const navigate = useNavigate();
  const colors = useThemeColors();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [districtsRes, setDistrictsRes] = useState<DistrictsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scanEvents, setScanEvents] = useState<AgentEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, dists] = await Promise.all([getOverview(), getDistricts()]);
      setData(ov);
      setDistrictsRes(dists);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRunScan = async () => {
    setShowScanPanel(true);
    setScanning(true);
    setScanEvents([]);
    try {
      const { runId } = await runPriorityScan();
      subscribeRun(
        runId,
        (ev) => {
          setScanEvents((prev) => [...prev, ev]);
        },
        () => {
          setScanning(false);
          void loadData();
        },
      );
    } catch {
      setScanning(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'No overview data'} onRetry={loadData} />;
  }

  const { kpis, outreachFunnel, followUpOutcomes, topDistricts, weatherAlerts, recentEvents } =
    data;

  const pieData = [
    { name: 'Pending', value: followUpOutcomes.pending, color: colors.inkMuted },
    { name: 'Recovering', value: followUpOutcomes.recovering, color: colors.success },
    { name: 'Not Recovering', value: followUpOutcomes.notRecovering, color: colors.warning },
    { name: 'Deteriorating', value: followUpOutcomes.deteriorating, color: colors.danger },
    { name: 'Insufficient Data', value: followUpOutcomes.insufficientData, color: colors.info },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Department Command Center"
        title="Crop Stress, Soil Health & Resolution Overview"
        description="Unified accountability view across 25 monitored districts, registered farmer parcels, SMS approvals, and 21-day satellite follow-ups."
        badges={
          <>
            <DataBadge status="SIMULATED" source="Multi-Source Department Pipeline" />
            <ScaleBadge scale="DISTRICT_MODIS_250M" />
          </>
        }
        actions={
          <RoleGate action="scan.run">
            <Button
              variant="primary"
              loading={scanning}
              onClick={handleRunScan}
              icon={<Radar className="w-4 h-4" />}
            >
              Run priority scan
            </Button>
          </RoleGate>
        }
      />

      {showScanPanel && <AgentStatusPanel events={scanEvents} running={scanning} />}

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Districts Monitored"
          value={kpis.districtsMonitored}
          footnote="Across 5 states (MODIS 250 m)"
          icon={<MapPin className="w-4 h-4" />}
          trend={[25, 25, 25, 25, 25]}
          badge={<DataBadge status="SIMULATED" />}
        />
        <KpiCard
          label="Active Weather Alerts"
          value={kpis.activeAlerts}
          footnote="Heatwave, heavy rain & dry spell"
          icon={<AlertTriangle className="w-4 h-4" />}
          trend={[2, 3, 4, 5, 5]}
          badge={<DataBadge status="SIMULATED" />}
        />
        <KpiCard
          label="Critical Districts"
          value={kpis.criticalDistricts}
          footnote="Risk score ≥ 85 (P1 escalation)"
          icon={<AlertTriangle className="w-4 h-4 text-danger" />}
          trend={[1, 1, 2, 1, 1]}
          badge={<DataBadge status="SIMULATED" />}
        />
        <KpiCard
          label="Registered Farmers"
          value={kpis.registeredFarmers}
          footnote="Sentinel-2 10 m field polygons"
          icon={<Users className="w-4 h-4" />}
          trend={[8, 9, 10, 11, 12]}
          badge={<DataBadge status="MANUAL" />}
        />
        <KpiCard
          label="Pending Approvals"
          value={kpis.pendingApprovals}
          footnote="Mandatory officer sign-off queue"
          icon={<ShieldCheck className="w-4 h-4" />}
          trend={[3, 2, 4, 2, 2]}
          badge={<DataBadge status="MANUAL" />}
        />
        <KpiCard
          label="Needs Field Support"
          value={kpis.needsFieldSupport}
          footnote="Open & assigned ground visits"
          icon={<Tractor className="w-4 h-4" />}
          trend={[1, 1, 2, 2, 2]}
          badge={<DataBadge status="MANUAL" />}
        />
        <KpiCard
          label="Monitoring Cases"
          value={kpis.monitoringCases}
          footnote="Active 21-day follow-up cases"
          icon={<Activity className="w-4 h-4" />}
          trend={[4, 5, 5, 6, 6]}
          badge={<DataBadge status="SIMULATED" />}
        />
        <KpiCard
          label="Acknowledged / sent"
          value={
            kpis.acknowledgedRatePct !== null ? `${kpis.acknowledgedRatePct.toFixed(1)}%` : '—'
          }
          footnote="Only farmer ack counts as reached"
          icon={<CheckCircle2 className="w-4 h-4" />}
          trend={[40, 42, 45, 48, 50]}
          badge={<DataBadge status="MANUAL" />}
        />
      </div>

      {/* 12-col grid: Mini DistrictMap (7 cols) + Top 5 Risk Districts (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          className="lg:col-span-7"
          eyebrow="District Risk Heat Map"
          title="MODIS 250 m Early-Warning Map"
          actions={
            <Link to="/early-warning" className="text-xs font-mono font-bold text-primary hover:underline">
              Full Early Warning →
            </Link>
          }
        >
          <DistrictMap
            districts={districtsRes?.districts ?? topDistricts}
            mini
            onSelectDistrict={(d) => navigate(`/districts/${d.id}`)}
          />
        </Card>

        <Card
          className="lg:col-span-5"
          eyebrow="Priority Leaderboard"
          title="Top 5 Risk Districts"
          actions={<DataBadge status="SIMULATED" source="MODIS 250 m Composite" />}
        >
          <div className="divide-y divide-line">
            {topDistricts.map((d) => (
              <div
                key={d.id}
                className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-muted">
                      #{d.priorityRank}
                    </span>
                    <Link
                      to={`/districts/${d.id}`}
                      className="font-bold text-sm text-ink hover:text-primary underline-offset-2 hover:underline"
                    >
                      {d.district}
                    </Link>
                    <span className="text-xs text-ink-muted">({d.state})</span>
                  </div>
                  <div className="text-xs font-mono text-ink-muted mt-0.5">
                    {d.primaryCrop} · NDVI {d.ndvi.toFixed(2)} ({d.ndviAnomalyPct.toFixed(1)}%) ·{' '}
                    {d.registeredFarmers} farmers
                  </div>
                </div>
                <RiskBadge level={d.riskLevel} score={d.riskScore} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Outreach Funnel (6 cols) + Follow-Up Outcomes Donut (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          className="lg:col-span-6"
          eyebrow="Message Accountability Lifecycle"
          title="Outreach Funnel"
          actions={
            <Link to="/advisories" className="text-xs font-mono font-bold text-primary hover:underline">
              Manage Advisories →
            </Link>
          }
        >
          <OutreachFunnel funnel={outreachFunnel} />
        </Card>

        <Card
          className="lg:col-span-6"
          eyebrow="21-Day Satellite Follow-Up"
          title="Follow-Up Outcomes Breakdown"
          actions={
            <div className="flex items-center gap-2">
              <ScaleBadge scale="FIELD_SENTINEL2_10M" />
              <DataBadge status="SIMULATED" />
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.ink,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs font-mono">
              {pieData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2 rounded-ctl bg-surface-2 border border-line"
                >
                  <span className="inline-flex items-center gap-2 text-ink">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: item.color }}
                    />
                    {item.name}
                  </span>
                  <strong className="text-ink">{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Weather Alerts (5 cols) + Recent Audit Events (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          className="lg:col-span-5"
          eyebrow="Agrometeorological Warnings"
          title="Active Weather Alerts"
          actions={<DataBadge status="SIMULATED" source="Open-Meteo + NASA POWER" />}
        >
          <WeatherAlertList alerts={weatherAlerts} />
        </Card>

        <Card
          className="lg:col-span-7"
          eyebrow="Hash-Chained Ledger"
          title="Recent Audit Events"
          actions={
            <Link to="/audit" className="text-xs font-mono font-bold text-primary hover:underline">
              Full Audit Ledger →
            </Link>
          }
        >
          <AuditTimeline events={recentEvents} compact />
        </Card>
      </div>
    </div>
  );
}
