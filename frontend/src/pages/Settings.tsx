import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Database,
  Moon,
  Palette,
  RotateCcw,
  Server,
  Sun,
  UserCheck,
} from 'lucide-react';
import type { DataSourceStatus } from '@/api/contract';
import { getApiBase, getDataSources, isMockMode } from '@/api/client';
import { resetMockStore } from '@/mocks/store';
import { PERSONAS } from '@/auth/personas';
import { useRole } from '@/auth/RoleContext';
import { CONCEPTS, type ConceptKey } from '@/theme/concepts';
import { useTheme } from '@/theme/useTheme';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataBadge } from '@/components/ui/DataBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDateTime } from '@/lib/format';

const CONCEPT_KEYS: ConceptKey[] = ['sarson', 'mitti', 'haryali'];

export const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDevMode = searchParams.get('dev') === '1';

  const { persona, setPersonaById } = useRole();
  const { concept, setConcept, mode, setMode, toggleMode } = useTheme();

  const [dataSources, setDataSources] = useState<DataSourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chosenConceptLocked =
    typeof window !== 'undefined'
      ? Boolean(localStorage.getItem('fp.chosenConcept'))
      : true;

  const loadDataSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDataSources();
      setDataSources(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDataSources();
  }, [loadDataSources]);

  const handleResetDemoData = async () => {
    resetMockStore();
    await loadDataSources();
    toast.success('Demo store reset to initial 25 districts, 12 farmers, and 40 audit events');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="System Configuration"
          title="Settings, Personas & Provenance"
          description="Switch active role persona, appearance mode, and inspect upstream satellite and weather data sources."
        />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadDataSources()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System Configuration"
        title="Settings, Personas & Provenance"
        description="Manage institutional role persona, light/dark appearance, and upstream satellite and weather data source status."
        actions={
          <div className="flex items-center gap-2">
            <DataBadge status="LIVE" source="Runtime Config" />
            {isMockMode() && (
              <Button variant="danger" size="sm" onClick={() => void handleResetDemoData()}>
                <RotateCcw className="h-4 w-4" />
                Reset state
              </Button>
            )}
          </div>
        }
      />

      {/* Persona Switcher */}
      <Card
        eyebrow="Role-Based Access & Accountability"
        title="Active Institutional Persona"
        actions={
          <Badge tone="primary">
            Active: {persona.name} ({persona.role})
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERSONAS.map((p) => {
            const isSelected = p.id === persona.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersonaById(p.id);
                  toast.success(`Switched persona to ${p.name} (${p.role})`);
                }}
                className={`text-left rounded-card border p-4 transition-all space-y-2 ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-card'
                    : 'border-line bg-surface-2 hover:bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-sm text-ink">{p.name}</span>
                  {isSelected ? (
                    <Badge tone="primary">Active</Badge>
                  ) : (
                    <Badge tone="neutral">{p.role}</Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-primary">{p.roleLabel}</p>
                <p className="text-xs text-ink-muted leading-relaxed">{p.duty}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Appearance & Concept */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <Card
            eyebrow="Appearance"
            title="Theme Mode"
            actions={<Badge tone="neutral">{mode.toUpperCase()}</Badge>}
          >
            <div className="flex items-center gap-3">
              <Button
                variant={mode === 'light' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setMode('light')}
              >
                <Sun className="h-4 w-4" />
                Light Mode
              </Button>
              <Button
                variant={mode === 'dark' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setMode('dark')}
              >
                <Moon className="h-4 w-4" />
                Dark Mode
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleMode}>
                Toggle
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card
            eyebrow="Backend & Environment"
            title="API & Telemetry Endpoint"
            actions={<Badge tone="success">CONNECTED</Badge>}
          >
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-input border border-line bg-surface-2 p-3">
                  <span className="text-ink-muted block">Telemetry Pipeline</span>
                  <strong className="font-mono text-sm text-ink">Active (7-Layer Sync)</strong>
                </div>
                <div className="rounded-input border border-line bg-surface-2 p-3">
                  <span className="text-ink-muted block">API Gateway</span>
                  <strong className="font-mono text-sm text-ink">{getApiBase()}</strong>
                </div>
              </div>
              {isMockMode() && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleResetDemoData()}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset state
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Concept Selector — hidden after choice unless ?dev=1 */}
      {!chosenConceptLocked || isDevMode ? (
        <Card
          eyebrow="Design System Concept"
          title="3-Concept Theme Selector"
          actions={
            <Link to="/design-lab">
              <Button variant="ghost" size="sm">
                <Palette className="h-4 w-4" />
                Open Design Lab
              </Button>
            </Link>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CONCEPT_KEYS.map((key) => {
              const info = CONCEPTS[key];
              const active = concept === key;
              return (
                <div
                  key={key}
                  data-concept={key}
                  data-mode={mode}
                  className={`rounded-card border p-4 bg-surface text-ink space-y-3 ${
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-line'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-base">{info.name}</span>
                    {active && <Badge tone="primary">Selected</Badge>}
                  </div>
                  <p className="text-xs text-ink-muted">{info.tagline}</p>
                  <p className="text-[11px] font-mono text-ink-muted">{info.fonts}</p>

                  {/* Swatches */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="h-5 w-5 rounded-full bg-primary border border-line" title="Primary" />
                    <span className="h-5 w-5 rounded-full bg-accent border border-line" title="Accent" />
                    <span className="h-5 w-5 rounded-full bg-bg border border-line" title="Background" />
                    <span className="h-5 w-5 rounded-full bg-surface-2 border border-line" title="Surface 2" />
                    <span className="h-5 w-5 rounded-full bg-risk-low border border-line" title="Risk Low" />
                    <span className="h-5 w-5 rounded-full bg-risk-high border border-line" title="Risk High" />
                  </div>

                  <Button
                    variant={active ? 'primary' : 'ghost'}
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setConcept(key);
                      localStorage.setItem('fp.chosenConcept', key);
                      toast.success(`Switched design concept to ${info.name}`);
                    }}
                  >
                    {active ? 'Active Concept' : `Switch to ${info.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card
          eyebrow="Design Concept Locked"
          title={`Active Concept: ${CONCEPTS[concept].name}`}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchParams({ dev: '1' })}
              >
                <Palette className="h-4 w-4" />
                Unlock Concept Selector
              </Button>
              <Link to="/design-lab">
                <Button variant="ghost" size="sm">
                  Open Design Lab
                </Button>
              </Link>
            </div>
          }
        >
          <p className="text-xs text-ink-muted">
            <strong>{CONCEPTS[concept].name}</strong> ({CONCEPTS[concept].tagline}) is active.
          </p>
        </Card>
      )}

      {/* Data Sources List */}
      <Card
        eyebrow="Upstream Data Provenance"
        title="Configured Satellite, Weather & OCR Data Sources"
        actions={<DataBadge status="LIVE" source="Meta Registry" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dataSources.map((ds) => {
            return (
              <div
                key={ds.key}
                className="rounded-card border border-line bg-surface-2 p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-display font-semibold text-sm text-ink">
                      {ds.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="success">ACTIVE</Badge>
                  </div>
                </div>
                <p className="text-xs text-ink-muted">{ds.purpose}</p>
                <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted pt-2 border-t border-line">
                  <span className="inline-flex items-center gap-1">
                    {ds.lastError ? (
                      <>
                        <Server className="h-3.5 w-3.5 text-warning" />
                        {`Fallback (${ds.lastError})`}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        Upstream telemetry active
                      </>
                    )}
                  </span>
                  <span>
                    Last sync: {ds.lastSuccessAt ? formatDateTime(ds.lastSuccessAt) : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="text-xs text-ink-muted flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-primary" />
        <span>
          Every API request includes <code className="font-mono">X-Actor: {persona.name}</code>{' '}
          and <code className="font-mono">X-Role: {persona.role}</code> headers.
        </span>
      </div>
    </div>
  );
};
