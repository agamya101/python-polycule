import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Filter } from 'lucide-react';
import { getDistricts, getFarmers, getWeatherAlerts } from '@/api/client';
import type {
  DistrictSummary,
  DistrictsResponse,
  Farmer,
  RiskLevel,
  WeatherAlert,
} from '@/api/contract';
import { DistrictMap, type DistrictMapHandle } from '@/components/domain/DistrictMap';
import { RiskGauge } from '@/components/domain/RiskGauge';
import { WeatherAlertIcon } from '@/components/domain/WeatherAlertList';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { formatSignedPct } from '@/lib/format';

export default function EarlyWarning() {
  const navigate = useNavigate();
  const mapRef = useRef<DistrictMapHandle>(null);

  const [res, setRes] = useState<DistrictsResponse | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [cropFilter, setCropFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string>('yavatmal');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, aRes, fRes] = await Promise.all([
        getDistricts(),
        getWeatherAlerts(),
        getFarmers(),
      ]);
      setRes(dRes);
      setAlerts(aRes);
      setFarmers(fRes);
      if (dRes.districts.length > 0 && !selectedId) {
        setSelectedId(dRes.districts[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load districts');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredDistricts = useMemo(() => {
    if (!res) return [];
    return res.districts.filter((d) => {
      if (stateFilter !== 'ALL' && d.state !== stateFilter) return false;
      if (riskFilter !== 'ALL' && d.riskLevel !== riskFilter) return false;
      if (cropFilter !== 'ALL' && d.primaryCrop !== cropFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !d.district.toLowerCase().includes(q) &&
          !d.state.toLowerCase().includes(q) &&
          !d.primaryCrop.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [res, stateFilter, riskFilter, cropFilter, search]);

  const selectedDistrict: DistrictSummary | null = useMemo(() => {
    if (!res) return null;
    return (
      res.districts.find((d) => d.id === selectedId) ??
      filteredDistricts[0] ??
      res.districts[0] ??
      null
    );
  }, [res, selectedId, filteredDistricts]);

  const handleSelectRow = (d: DistrictSummary) => {
    setSelectedId(d.id);
    mapRef.current?.flyToDistrict(d.id);
  };

  if (loading && !res) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[460px] w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !res) {
    return <ErrorState message={error ?? 'No district data'} onRetry={loadData} />;
  }

  const states = [...new Set(res.districts.map((d) => d.state))];
  const crops = [...new Set(res.districts.map((d) => d.primaryCrop))];
  const selectedAlerts = alerts.filter((a) => a.districtId === selectedDistrict?.id);

  const columns: TableColumn<DistrictSummary>[] = [
    {
      key: 'priorityRank',
      header: 'Rank',
      sortValue: (d) => d.priorityRank,
      render: (d) => <span className="fp-num font-bold text-ink">#{d.priorityRank}</span>,
    },
    {
      key: 'district',
      header: 'District',
      sortValue: (d) => d.district,
      render: (d) => (
        <div>
          <span className="font-bold text-ink">{d.district}</span>
          <span className="block text-[11px] font-mono text-ink-muted">
            {d.acreageLakh} lakh ha
          </span>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      sortValue: (d) => d.state,
      render: (d) => <span className="text-xs font-medium">{d.state}</span>,
    },
    {
      key: 'crop',
      header: 'Crop',
      sortValue: (d) => d.primaryCrop,
      render: (d) => <span className="text-xs font-mono">{d.primaryCrop}</span>,
    },
    {
      key: 'ndvi',
      header: 'NDVI',
      sortValue: (d) => d.ndvi,
      render: (d) => <span className="fp-num font-semibold">{d.ndvi.toFixed(2)}</span>,
    },
    {
      key: 'baseline',
      header: 'Baseline',
      sortValue: (d) => d.ndviBaseline,
      render: (d) => (
        <span className="fp-num text-ink-muted">{d.ndviBaseline.toFixed(2)}</span>
      ),
    },
    {
      key: 'anomaly',
      header: 'Anomaly %',
      sortValue: (d) => d.ndviAnomalyPct,
      render: (d) => (
        <span
          className={`fp-num font-bold ${
            d.ndviAnomalyPct <= -15
              ? 'text-danger'
              : d.ndviAnomalyPct <= -5
                ? 'text-warning'
                : 'text-success'
          }`}
        >
          {formatSignedPct(d.ndviAnomalyPct, 1)}
        </span>
      ),
    },
    {
      key: 'riskScore',
      header: 'Risk',
      sortValue: (d) => d.riskScore,
      render: (d) => (
        <div className="w-28 flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              value={d.riskScore}
              tone={
                d.riskLevel === 'CRITICAL'
                  ? 'danger'
                  : d.riskLevel === 'HIGH'
                    ? 'warning'
                    : d.riskLevel === 'MEDIUM'
                      ? 'accent'
                      : 'success'
              }
            />
          </div>
          <span className="fp-num font-bold text-xs w-6 text-right">{d.riskScore}</span>
        </div>
      ),
    },
    {
      key: 'riskLevel',
      header: 'Level',
      sortValue: (d) => d.riskScore,
      render: (d) => <RiskBadge level={d.riskLevel} />,
    },
    {
      key: 'alerts',
      header: 'Weather Alerts',
      sortValue: (d) => d.weatherAlertCount,
      render: (d) => {
        const dAlerts = alerts.filter((a) => a.districtId === d.id);
        if (dAlerts.length === 0) return <span className="text-ink-muted font-mono">—</span>;
        return (
          <div className="flex items-center gap-1.5">
            {dAlerts.map((a) => (
              <span
                key={a.id}
                title={a.title}
                className="p-1 rounded-ctl bg-warning/15 text-warning border border-warning/30"
              >
                <WeatherAlertIcon type={a.type} className="w-3.5 h-3.5" />
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'farmers',
      header: 'Farmers',
      sortValue: (d) => d.registeredFarmers,
      render: (d) => <span className="fp-num">{d.registeredFarmers}</span>,
    },
    {
      key: 'freshness',
      header: 'Freshness',
      sortValue: (d) => d.provenance.freshnessDays ?? 99,
      render: (d) => (
        <span className="font-mono text-xs text-ink-muted">
          {d.provenance.freshnessDays ?? 2}d ago
        </span>
      ),
    },
    {
      key: 'data',
      header: 'Data',
      render: (d) => (
        <div className="flex items-center gap-2">
          <DataBadge status={d.provenance.status} provenance={d.provenance} />
          <Link
            to={`/districts/${d.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-mono font-bold text-primary hover:underline"
          >
            Report →
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 1 · Satellite Crop-Stress Early Warning"
        title="District Risk Heat Map & Monitored Leaderboard"
        description="MODIS 250 m 8-day NDVI anomalies fused with synoptic weather alerts across 25 districts. Click a district to fly on map; double-click or open report for full multi-agent diagnostic."
        badges={
          <>
            <ScaleBadge scale="DISTRICT_MODIS_250M" />
            <DataBadge status="LIVE" source="NASA GIBS MODIS Terra MOD13Q1 & Open-Meteo" />
          </>
        }
      />

      {/* State summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {res.states.map((st) => (
          <div
            key={st.state}
            onClick={() => setStateFilter((prev) => (prev === st.state ? 'ALL' : st.state))}
            className={`fp-card p-3.5 cursor-pointer transition-colors ${
              stateFilter === st.state ? 'border-primary bg-surface-2' : ''
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-ink">{st.state}</span>
              <span className="text-ink-muted">{st.districtCount} dist</span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={st.avgRisk}
                label={`Avg Risk: ${st.avgRisk.toFixed(1)}`}
                tone={st.avgRisk >= 65 ? 'danger' : st.avgRisk >= 50 ? 'warning' : 'success'}
              />
            </div>
            <div className="mt-1.5 text-[10px] font-mono text-ink-muted">
              Critical: {st.criticalDistricts} · High: {st.highDistricts}
            </div>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className="fp-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-ink-muted mr-2 self-center">
          <Filter className="w-3.5 h-3.5 text-primary" />
          FILTERS
        </div>
        <Input
          label="Search District / Crop"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Yavatmal, Cotton…"
          className="w-48"
        />
        <Select
          label="State"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="ALL">All States</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          label="Risk Level"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as 'ALL' | RiskLevel)}
        >
          <option value="ALL">All Risk Levels</option>
          <option value="CRITICAL">CRITICAL (≥85)</option>
          <option value="HIGH">HIGH (70–84)</option>
          <option value="MEDIUM">MEDIUM (45–69)</option>
          <option value="LOW">LOW (&lt;45)</option>
        </Select>
        <Select
          label="Primary Crop"
          value={cropFilter}
          onChange={(e) => setCropFilter(e.target.value)}
        >
          <option value="ALL">All Crops</option>
          {crops.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {(search || stateFilter !== 'ALL' || riskFilter !== 'ALL' || cropFilter !== 'ALL') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStateFilter('ALL');
              setRiskFilter('ALL');
              setCropFilter('ALL');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Map (8 cols) + Selected District Card (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <DistrictMap
            ref={mapRef}
            districts={filteredDistricts}
            alerts={alerts}
            farmers={farmers}
            selectedDistrictId={selectedDistrict?.id}
            onSelectDistrict={(d) => setSelectedId(d.id)}
          />
        </div>

        <div className="lg:col-span-4">
          {selectedDistrict ? (
            <Card
              eyebrow={`Priority #${selectedDistrict.priorityRank} · Selected District`}
              title={`${selectedDistrict.district}, ${selectedDistrict.state}`}
              actions={
                <DataBadge
                  status={selectedDistrict.provenance.status}
                  provenance={selectedDistrict.provenance}
                />
              }
              className="space-y-4"
            >
              <div className="flex justify-center py-1">
                <RiskGauge
                  score={selectedDistrict.riskScore}
                  level={selectedDistrict.riskLevel}
                  size="sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">Primary Crop</div>
                  <div className="font-bold text-ink mt-0.5">
                    {selectedDistrict.primaryCrop} ({selectedDistrict.acreageLakh}L ha)
                  </div>
                </div>
                <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">MODIS NDVI vs Base</div>
                  <div className="font-bold fp-num text-ink mt-0.5">
                    {selectedDistrict.ndvi.toFixed(2)} / {selectedDistrict.ndviBaseline.toFixed(2)}{' '}
                    <span className="text-danger">
                      ({formatSignedPct(selectedDistrict.ndviAnomalyPct, 1)})
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">Registered Farmers</div>
                  <div className="font-bold fp-num text-ink mt-0.5">
                    {selectedDistrict.registeredFarmers} parcels ({selectedDistrict.openCases} open cases)
                  </div>
                </div>
                <div className="p-2.5 rounded-ctl bg-surface-2 border border-line">
                  <div className="text-ink-muted">KVK Helpline</div>
                  <div className="font-bold fp-num text-ink mt-0.5">
                    {selectedDistrict.kvkContact}
                  </div>
                </div>
              </div>

              {selectedAlerts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-mono font-bold text-ink-muted uppercase">
                    Active Weather Alerts
                  </div>
                  {selectedAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-ctl bg-warning/15 border border-warning/30 text-xs"
                    >
                      <div className="font-bold text-ink">{a.title}</div>
                      <p className="text-ink-muted text-[11px] mt-0.5">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={() => navigate(`/districts/${selectedDistrict.id}`)}
                  icon={<ExternalLink className="w-4 h-4" />}
                  className="w-full justify-center"
                >
                  Open District Report
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/advisories?kind=DISTRICT_ADVISORY&districtId=${selectedDistrict.id}`,
                    )
                  }
                  className="w-full justify-center"
                >
                  Draft District SMS Advisory
                </Button>
              </div>
            </Card>
          ) : (
            <EmptyState title="No district selected" />
          )}
        </div>
      </div>

      {/* Monitored Districts Leaderboard Table */}
      <Card
        eyebrow="Monitored Districts Leaderboard"
        title="Monitored Districts"
        actions={
          <div className="flex items-center gap-2">
            <ScaleBadge scale="DISTRICT_MODIS_250M" />
            <DataBadge status="LIVE" source="NASA MODIS 250 m & Open-Meteo" />
          </div>
        }
      >
        <Table
          data={filteredDistricts}
          columns={columns}
          rowKey={(d) => d.id}
          defaultSortKey="riskScore"
          defaultSortDir="desc"
          selectedRowKey={selectedDistrict?.id}
          onRowClick={handleSelectRow}
          onRowDoubleClick={(d) => navigate(`/districts/${d.id}`)}
          emptyState={
            <EmptyState
              title="No districts match filter"
              hint="Try clearing the state, crop, or risk level filters."
            />
          }
        />
      </Card>
    </div>
  );
}
