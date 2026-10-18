import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, FlaskConical, Plus } from 'lucide-react';
import { getFarmers, getMessages, getSoilCards } from '@/api/client';
import type { Farmer, OutboundMessage, SoilCard } from '@/api/contract';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleGate } from '@/components/ui/RoleGate';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';

export default function SoilCards() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<SoilCard[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cList, fList, mList] = await Promise.all([
        getSoilCards(),
        getFarmers(),
        getMessages(),
      ]);
      setCards(cList);
      setFarmers(fList);
      setMessages(mList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load soil cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading && cards.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  const columns: TableColumn<SoilCard>[] = [
    {
      key: 'id',
      header: 'ID',
      sortValue: (c) => c.id,
      render: (c) => <span className="font-mono text-xs font-bold text-primary">{c.id}</span>,
    },
    {
      key: 'farmer',
      header: 'Farmer',
      sortValue: (c) => c.farmerId,
      render: (c) => {
        const f = farmers.find((x) => x.id === c.farmerId);
        return (
          <Link
            to={`/farmers/${c.farmerId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-ink hover:text-primary hover:underline"
          >
            {f ? `${f.name} (${f.village})` : c.farmerId}
          </Link>
        );
      },
    },
    {
      key: 'cardNumber',
      header: 'Card No.',
      sortValue: (c) => c.cardNumber ?? '',
      render: (c) => <span className="font-mono text-xs">{c.cardNumber ?? '—'}</span>,
    },
    {
      key: 'sampleDate',
      header: 'Sample Date',
      sortValue: (c) => c.sampleDate ?? '',
      render: (c) => <span className="font-mono text-xs">{c.sampleDate ?? '—'}</span>,
    },
    {
      key: 'age',
      header: 'Age (Years)',
      sortValue: (c) => c.cardAgeYears ?? 0,
      render: (c) => (
        <div className="inline-flex items-center gap-1.5 font-mono text-xs">
          <span>{c.cardAgeYears !== null ? `${c.cardAgeYears.toFixed(1)} yrs` : '—'}</span>
          {c.ageFlag && (
            <Tooltip content="Older than 2 years — proposed local re-test flag">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-ctl bg-warning/15 text-warning border border-warning/40 text-[10px]">
                <AlertTriangle className="w-3 h-3" /> &gt;2y
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      sortValue: (c) => c.extractionMethod,
      render: (c) => (
        <Badge tone="info">
          {c.extractionMethod === 'GEMINI_OCR' ? 'Gemini OCR' : 'Lab Entry'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (c) => c.status,
      render: (c) => {
        const tone =
          c.status === 'CONFIRMED' || c.status === 'SMS_APPROVED' || c.status === 'SMS_SENT'
            ? 'success'
            : c.status === 'NEEDS_REVIEW' || c.status === 'SMS_PENDING_APPROVAL'
              ? 'warning'
              : 'danger';
        return <Badge tone={tone}>{c.status}</Badge>;
      },
    },
    {
      key: 'flags',
      header: 'Flags Count',
      sortValue: (c) => (c.params ?? []).reduce((acc, p) => acc + (p.flags ?? []).length, 0),
      render: (c) => {
        const totalFlags = (c.params ?? []).reduce((acc, p) => acc + (p.flags ?? []).length, 0);
        const blockingCount = (c.params ?? []).reduce(
          (acc, p) => acc + (p.flags ? p.flags.filter((f) => f.blocking).length : 0),
          0,
        );
        if (totalFlags === 0) {
          return <span className="text-xs font-mono text-success">0 flags</span>;
        }
        return (
          <Badge tone={blockingCount > 0 ? 'danger' : 'warning'}>
            {totalFlags} flag{totalFlags > 1 ? 's' : ''} ({blockingCount} blocking)
          </Badge>
        );
      },
    },
    {
      key: 'messageStatus',
      header: 'Message Status',
      render: (c) => {
        const msg = messages.find((m) => m.id === c.messageId || m.soilCardId === c.id);
        if (!msg) return <span className="text-xs font-mono text-ink-muted">Not drafted</span>;
        return (
          <Badge
            tone={
              msg.status === 'ACKNOWLEDGED' || msg.status === 'DELIVERED'
                ? 'success'
                : msg.status === 'PENDING_APPROVAL'
                  ? 'warning'
                  : 'info'
            }
          >
            {msg.id} · {msg.status}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="F2 · Soil Health Card Reader & Safeguards"
        title="Soil Health Cards"
        description="12-parameter OCR extraction with decimal-shift and unit-mismatch safeguards, converted to bags/acre, and gated by mandatory Agriculture Department approval."
        actions={
          <RoleGate action="soil.create">
            <Button
              variant="primary"
              onClick={() => navigate('/soil-cards/new')}
              icon={<Plus className="w-4 h-4" />}
            >
              New soil card
            </Button>
          </RoleGate>
        }
      />

      <Card>
        <Table
          data={cards}
          columns={columns}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/soil-cards/${c.id}`)}
          emptyState={
            <EmptyState
              icon={<FlaskConical className="w-5 h-5" />}
              title="No Soil Health Cards recorded"
              action={
                <Button variant="primary" size="sm" onClick={() => navigate('/soil-cards/new')}>
                  New Soil Card
                </Button>
              }
            />
          }
        />
      </Card>
    </div>
  );
}
