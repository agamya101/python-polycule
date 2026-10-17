import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Filter, UserPlus } from 'lucide-react';
import { getDistricts, getFarmers, getSoilCards } from '@/api/client';
import type {
  BoundaryStatus,
  DistrictSummary,
  Farmer,
  Reliability,
  RiskLevel,
  SoilCard,
} from '@/api/contract';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataBadge } from '@/components/ui/DataBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { RoleGate } from '@/components/ui/RoleGate';
import { ScaleBadge } from '@/components/ui/ScaleBadge';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';

export default function Farmers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [soilCards, setSoilCards] = useState<SoilCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [stressFilter, setStressFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [reliabilityFilter, setReliabilityFilter] = useState<'ALL' | Reliability>('ALL');
  const [boundaryFilter, setBoundaryFilter] = useState<'ALL' | BoundaryStatus>('ALL');
  const [search, setSearch] = useState(initialQuery);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fList, dRes, sList] = await Promise.all([
        getFarmers(),
        getDistricts(),
        getSoilCards(),
      ]);
      setFarmers(fList);
      setDistricts(dRes.districts);
      setSoilCards(sList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load farmers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return farmers.filter((f) => {
      if (districtFilter !== 'ALL' && f.districtId !== districtFilter) return false;
      if (stressFilter !== 'ALL' && f.latestStress?.stressLevel !== stressFilter) return false;
      if (reliabilityFilter !== 'ALL' && f.latestStress?.reliability !== reliabilityFilter)
        return false;
      if (boundaryFilter !== 'ALL' && f.field.boundaryStatus !== boundaryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !f.name.toLowerCase().includes(q) &&
          !f.id.toLowerCase().includes(q) &&
          !f.village.toLowerCase().includes(q) &&
          !f.crop.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [farmers, districtFilter, stressFilter, reliabilityFilter, boundaryFilter, search]);

  if (loading && farmers.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  const columns: TableColumn<Farmer>[] = [
    {
      key: 'id',
      header: 'ID',
      sortValue: (f) => f.id,
      render: (f) => <span className="font-mono text-xs font-bold text-primary">{f.id}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      sortValue: (f) => f.name,
      render: (f) => (
        <div>
          <span className="font-bold text-ink">{f.name}</span>
          <span className="block text-[11px] font-mono text-ink-muted">{f.phoneMasked}</span>
        </div>
      ),
    },
    {
      key: 'village',
      header: 'Village',
      sortValue: (f) => f.village,
      render: (f) => <span>{f.village}</span>,
    },
    {
      key: 'district',
      header: 'District',
      sortValue: (f) => f.districtId,
      render: (f) => {
        const d = districts.find((x) => x.id === f.districtId);
        return (
          <Link
            to={`/districts/${f.districtId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-semibold text-ink hover:text-primary hover:underline"
          >
            {d?.district ?? f.districtId}
          </Link>
        );
      },
    },
    {
      key: 'crop',
      header: 'Crop',
      sortValue: (f) => f.crop,
      render: (f) => <span className="text-xs font-mono">{f.crop}</span>,
    },
    {
      key: 'area',
      header: 'Area (ha)',
      sortValue: (f) => f.field.areaHa,
      render: (f) => (
        <span className="fp-num font-semibold">
          {f.field.areaHa.toFixed(2)} ha{' '}
          <span className="text-[10px] text-ink-muted">({f.field.pixelCount10m}px)</span>
        </span>
      ),
    },
    {
      key: 'sizeClass',
      header: 'Size Class',
      sortValue: (f) => f.field.areaHa,
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
      sortValue: (f) => f.field.boundaryStatus,
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
      header: 'Stress (10 m)',
      sortValue: (f) => f.latestStress?.ndviAnomalyPct ?? 0,
      render: (f) =>
        f.latestStress ? (
          <div className="flex flex-col gap-1">
            <RiskBadge level={f.latestStress.stressLevel} />
            <span className="text-[11px] font-mono text-ink-muted">
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
      sortValue: (f) => f.latestStress?.reliability ?? '',
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
      key: 'soilCard',
      header: 'Soil Card',
      render: (f) => {
        const sc = soilCards.find((s) => s.id === f.soilCardId);
        if (!sc) return <span className="text-ink-muted font-mono">—</span>;
        return (
          <Link
            to={`/soil-cards/${sc.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex flex-col text-xs font-mono text-primary hover:underline"
          >
            <span className="font-bold">{sc.id}</span>
            <span className="text-[10px] text-ink-muted">{sc.status}</span>
          </Link>
        );
      },
    },
    {
      key: 'case',
      header: 'Case',
      render: (f) =>
        f.openCaseId ? (
          <Link
            to={`/follow-up?caseId=${f.openCaseId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-mono font-bold text-primary hover:underline"
          >
            {f.openCaseId}
          </Link>
        ) : (
          <span className="text-ink-muted font-mono">—</span>
        ),
    },
    {
      key: 'consent',
      header: 'Consent',
      render: (f) => (
        <Badge tone={f.consentSms ? 'success' : 'danger'}>
          {f.consentSms ? 'SMS Opt-In' : 'No Consent'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Field-Scale Registry"
        title="Registered Farmer Parcels"
        description="Department registry of farmer field polygons with 10 m Sentinel-2 NDVI/NDWI tracking, boundary verification status, and linked Soil Health Cards."
        badges={
          <>
            <ScaleBadge scale="FIELD_SENTINEL2_10M" />
            <DataBadge status="MANUAL" source="Extension Worker Registry" />
          </>
        }
        actions={
          <RoleGate action="farmer.register">
            <Button
              variant="primary"
              onClick={() => navigate('/farmers/new')}
              icon={<UserPlus className="w-4 h-4" />}
            >
              Register farmer
            </Button>
          </RoleGate>
        }
      />

      {/* Filters */}
      <div className="fp-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-ink-muted mr-2 self-center">
          <Filter className="w-3.5 h-3.5 text-primary" />
          FILTERS
        </div>
        <Input
          label="Search Name / ID / Village"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Ramesh, FRM-0001…"
          className="w-48"
        />
        <Select
          label="District"
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
        >
          <option value="ALL">All Districts</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.district} ({d.state})
            </option>
          ))}
        </Select>
        <Select
          label="Stress Level"
          value={stressFilter}
          onChange={(e) => setStressFilter(e.target.value as 'ALL' | RiskLevel)}
        >
          <option value="ALL">All Stress Levels</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </Select>
        <Select
          label="Reliability"
          value={reliabilityFilter}
          onChange={(e) => setReliabilityFilter(e.target.value as 'ALL' | Reliability)}
        >
          <option value="ALL">All Reliabilities</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
          <option value="INSUFFICIENT">INSUFFICIENT</option>
        </Select>
        <Select
          label="Boundary Status"
          value={boundaryFilter}
          onChange={(e) => setBoundaryFilter(e.target.value as 'ALL' | BoundaryStatus)}
        >
          <option value="ALL">All Boundaries</option>
          <option value="WORKER_VERIFIED">WORKER_VERIFIED</option>
          <option value="UNVERIFIED">UNVERIFIED</option>
          <option value="DISPUTED">DISPUTED</option>
        </Select>
      </div>

      <Card>
        <Table
          data={filtered}
          columns={columns}
          rowKey={(f) => f.id}
          defaultSortKey="id"
          defaultSortDir="asc"
          onRowClick={(f) => navigate(`/farmers/${f.id}`)}
          emptyState={
            <EmptyState
              title="No farmers match filter"
              hint="Adjust your search query or register a new farmer parcel."
            />
          }
        />
      </Card>
    </div>
  );
}
