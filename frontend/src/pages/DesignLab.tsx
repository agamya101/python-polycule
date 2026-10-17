import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Moon,
  Smartphone,
  Sun,
  Tablet,
} from 'lucide-react';
import { CONCEPTS, type ConceptKey, type ThemeMode } from '@/theme/concepts';
import { useTheme } from '@/theme/useTheme';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';

const ROUTES_LIST = [
  { value: '/', label: 'Landing (/)' },
  { value: '/overview', label: 'Overview (/overview)' },
  { value: '/early-warning', label: 'Early Warning (/early-warning)' },
  { value: '/districts/yavatmal', label: 'District Report (/districts/yavatmal)' },
  { value: '/farmers', label: 'Farmers List (/farmers)' },
  { value: '/farmers/new', label: 'Register Farmer (/farmers/new)' },
  { value: '/farmers/FRM-0001', label: 'Farmer Detail (/farmers/FRM-0001)' },
  { value: '/soil-cards', label: 'Soil Health Cards (/soil-cards)' },
  {
    value: '/soil-cards/new?farmerId=FRM-0005',
    label: 'New Soil Card Wizard (/soil-cards/new?farmerId=FRM-0005)',
  },
  { value: '/soil-cards/SHC-0002', label: 'Soil Card Detail (/soil-cards/SHC-0002)' },
  { value: '/advisories', label: 'Advisories & SMS (/advisories)' },
  { value: '/approvals', label: 'Approvals Queue (/approvals)' },
  { value: '/follow-up', label: '21-Day Follow-Up (/follow-up)' },
  { value: '/field-support', label: 'Field Support Queue (/field-support)' },
  { value: '/audit', label: '7-Layer Audit Trail (/audit)' },
  {
    value: '/audit/report/CASE-0002',
    label: 'Accountability Report (/audit/report/CASE-0002)',
  },
  {
    value: '/audit/report/illustrative',
    label: 'Illustrative Report (/audit/report/illustrative)',
  },
  { value: '/settings', label: 'Settings (/settings)' },
];

type ViewportPreset = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: Record<
  ViewportPreset,
  { label: string; width: number; height: number }
> = {
  desktop: { label: 'Desktop 1440×900', width: 1440, height: 900 },
  tablet: { label: 'Tablet 834×1112', width: 834, height: 1112 },
  mobile: { label: 'Mobile 390×844', width: 390, height: 844 },
};

const CONCEPT_ORDER: ConceptKey[] = ['mitti', 'haryali', 'sarson'];

const COMPARISON_ROWS: Array<{
  attribute: string;
  mitti: string;
  haryali: string;
  sarson: string;
}> = [
  {
    attribute: 'Mood',
    mitti: 'Editorial agricultural almanac — grounded, archival, tactile',
    haryali: 'Satellite telemetry & agronomy mission control — crisp, analytical',
    sarson: 'Mustard fields at sunrise — warm, village-first, approachable',
  },
  {
    attribute: 'Primary',
    mitti: 'Terracotta clay & deep soil umber',
    haryali: 'Chlorophyll canopy green & forest emerald',
    sarson: 'Deep aubergine plum & rich earth',
  },
  {
    attribute: 'Accent',
    mitti: 'Olive leaf & harvest ochre',
    haryali: 'Solar lime & telemetry amber',
    sarson: 'Marigold / Sarson mustard gold',
  },
  {
    attribute: 'Background',
    mitti: 'Warm parchment paper / night loam',
    haryali: 'Mist dew / deep canopy night',
    sarson: 'Creamy buttermilk / warm plum dusk',
  },
  {
    attribute: 'Typography',
    mitti: 'Fraunces · Work Sans · Inter',
    haryali: 'Space Grotesk · IBM Plex Sans · Plus Jakarta Sans',
    sarson: 'Baloo 2 · Plus Jakarta Sans · Nunito',
  },
  {
    attribute: 'Layout',
    mitti: 'Dark-soil left sidebar + ruled almanac header',
    haryali: 'Compact icon rail + top telemetry bar',
    sarson: 'Sticky pill top-navigation + rolling hill backdrop',
  },
  {
    attribute: 'Card style',
    mitti: '6px radius, 1px ruled borders, warm paper shadow',
    haryali: '10px radius, subtle contour-line glass panels',
    sarson: '18px chunky rounded cards, soft mustard glow',
  },
  {
    attribute: 'Motion',
    mitti: 'Deliberate page-turn transitions (180ms)',
    haryali: 'Snappy instrument readouts (120ms)',
    sarson: 'Friendly springy micro-interactions (200ms)',
  },
  {
    attribute: 'Best for',
    mitti: 'District collectors, policy dossiers & print accountability reports',
    haryali: 'Remote-sensing analysts & state early-warning control rooms',
    sarson: 'Extension workers, KVK agronomists & village-level coordination',
  },
];

interface ScaledFrameProps {
  conceptKey: ConceptKey;
  mode: ThemeMode;
  route: string;
  viewportWidth: number;
  viewportHeight: number;
}

const ScaledPreviewFrame: React.FC<ScaledFrameProps> = ({
  conceptKey,
  mode,
  route,
  viewportWidth,
  viewportHeight,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [colWidth, setColWidth] = useState<number>(420);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setColWidth(w);
    };
    updateWidth();
    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(1, colWidth / viewportWidth);
  const scaledHeight = Math.round(viewportHeight * scale);
  const sep = route.includes('?') ? '&' : '?';
  const iframeSrc = `${route}${sep}concept=${conceptKey}&mode=${mode}&embed=1`;

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-card border border-line bg-surface shadow-card"
      style={{ height: `${scaledHeight}px` }}
    >
      <iframe
        title={`${conceptKey}-${mode}-preview`}
        src={iframeSrc}
        style={{
          width: `${viewportWidth}px`,
          height: `${viewportHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 'none',
        }}
      />
    </div>
  );
};

export const DesignLab: React.FC = () => {
  const { concept: activeConcept, setConcept, setMode: setGlobalThemeMode } = useTheme();
  const [selectedRoute, setSelectedRoute] = useState<string>('/overview');
  const [viewport, setViewport] = useState<ViewportPreset>('desktop');
  const [columnModes, setColumnModes] = useState<Record<ConceptKey, ThemeMode>>({
    mitti: 'light',
    haryali: 'dark',
    sarson: 'light',
  });

  const setAllModes = (m: ThemeMode) => {
    setColumnModes({ mitti: m, haryali: m, sarson: m });
  };

  const setMixedModes = () => {
    setColumnModes({ mitti: 'light', haryali: 'dark', sarson: 'light' });
  };

  const toggleColumnMode = (key: ConceptKey) => {
    setColumnModes((prev) => ({
      ...prev,
      [key]: prev[key] === 'light' ? 'dark' : 'light',
    }));
  };

  const handleChooseConcept = (key: ConceptKey) => {
    const chosenMode = columnModes[key];
    localStorage.setItem('fp.chosenConcept', key);
    localStorage.setItem('fp.concept', key);
    setConcept(key);
    setGlobalThemeMode(chosenMode);
    const name = CONCEPTS[key].name;
    toast.success(
      `Chosen: ${name}. Tell the coding assistant: 'Concept chosen: ${key}'`,
      { duration: 5000 },
    );
  };

  const vp = VIEWPORTS[viewport];

  return (
    <div className="min-h-screen bg-bg text-ink pb-16">
      {/* Sticky Top Toolbar */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/overview">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                App
              </Button>
            </Link>
            <div>
              <h1 className="font-display text-base sm:text-lg font-bold text-ink">
                Design Lab — choose your concept
              </h1>
              <p className="text-xs text-ink-muted">
                Side-by-side live comparison of Mitti Almanac, Haryali Canopy, and Sarson
                Sunrise across every route and mode.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Page selector */}
            <div className="w-64">
              <Select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
              >
                {ROUTES_LIST.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Global mode buttons */}
            <div className="inline-flex rounded-button border border-line bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setAllModes('light')}
                className="inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
              >
                <Sun className="h-3.5 w-3.5" />
                All light
              </button>
              <button
                type="button"
                onClick={() => setAllModes('dark')}
                className="inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
              >
                <Moon className="h-3.5 w-3.5" />
                All dark
              </button>
              <button
                type="button"
                onClick={setMixedModes}
                className="inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
              >
                Mixed
              </button>
            </div>

            {/* Viewport buttons */}
            <div className="inline-flex rounded-button border border-line bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium ${
                  viewport === 'desktop'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Laptop className="h-3.5 w-3.5" />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                className={`inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium ${
                  viewport === 'tablet'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Tablet className="h-3.5 w-3.5" />
                Tablet
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                className={`inline-flex items-center gap-1 rounded-button px-2.5 py-1 text-xs font-medium ${
                  viewport === 'mobile'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main 3-Column Comparison */}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-6 space-y-10">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {CONCEPT_ORDER.map((key) => {
            const info = CONCEPTS[key];
            const colMode = columnModes[key];
            const isChosen = activeConcept === key;
            const sep = selectedRoute.includes('?') ? '&' : '?';
            const fullScreenUrl = `${selectedRoute}${sep}concept=${key}&mode=${colMode}`;

            return (
              <div key={key} className="flex flex-col gap-4">
                {/* 1. Concept Header Card styled in THAT concept */}
                <div
                  data-concept={key}
                  data-mode={colMode}
                  className="rounded-card border border-line bg-surface text-ink p-4 shadow-card space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-ink">
                          {info.name}
                        </h2>
                        {isChosen && <Badge tone="primary">Active</Badge>}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">{info.tagline}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleColumnMode(key)}
                      className="inline-flex items-center gap-1.5 rounded-button border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-bg"
                    >
                      {colMode === 'light' ? (
                        <>
                          <Sun className="h-3.5 w-3.5 text-accent" />
                          Light
                        </>
                      ) : (
                        <>
                          <Moon className="h-3.5 w-3.5 text-accent" />
                          Dark
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-[11px] font-mono text-ink-muted space-y-0.5">
                    <div>Fonts: {info.fonts}</div>
                    <div>Layout: {info.layout}</div>
                  </div>

                  {/* Swatches for light & dark */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(['light', 'dark'] as const).map((swatchMode) => (
                      <div
                        key={swatchMode}
                        data-concept={key}
                        data-mode={swatchMode}
                        className="rounded-input border border-line bg-bg p-2 flex items-center justify-between"
                      >
                        <span className="text-[10px] font-mono uppercase text-ink-muted">
                          {swatchMode}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-primary border border-line"
                            title="Primary"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-accent border border-line"
                            title="Accent"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-surface border border-line"
                            title="Surface"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-ink border border-line"
                            title="Ink"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-risk-low border border-line"
                            title="Risk Low"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-risk-medium border border-line"
                            title="Risk Medium"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-risk-high border border-line"
                            title="Risk High"
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full bg-risk-critical border border-line"
                            title="Risk Critical"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Scaled Preview Iframe */}
                <ScaledPreviewFrame
                  conceptKey={key}
                  mode={colMode}
                  route={selectedRoute}
                  viewportWidth={vp.width}
                  viewportHeight={vp.height}
                />

                {/* 3. Action Buttons */}
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={fullScreenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-button border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-surface-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open full screen
                  </a>
                  <Button
                    variant={isChosen ? 'accent' : 'primary'}
                    size="sm"
                    onClick={() => handleChooseConcept(key)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Choose this concept ({info.name})
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison Table below the columns */}
        <section className="rounded-card border border-line bg-surface p-6 shadow-card space-y-4">
          <div>
            <p className="fp-eyebrow">Architectural & Visual Comparison</p>
            <h2 className="font-display text-lg font-bold text-ink">
              Concept Matrix — Mitti vs Haryali vs Sarson
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-ink-muted font-mono uppercase">
                  <th className="py-2.5 px-3">Dimension</th>
                  <th className="py-2.5 px-3">Mitti Almanac (mitti)</th>
                  <th className="py-2.5 px-3">Haryali Canopy (haryali)</th>
                  <th className="py-2.5 px-3">Sarson Sunrise (sarson)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.attribute} className="hover:bg-surface-2/60">
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      {row.attribute}
                    </td>
                    <td className="py-2.5 px-3 text-ink-muted">{row.mitti}</td>
                    <td className="py-2.5 px-3 text-ink-muted">{row.haryali}</td>
                    <td className="py-2.5 px-3 text-ink font-medium">{row.sarson}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
