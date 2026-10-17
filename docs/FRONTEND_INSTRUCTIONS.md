# FarmPulse 360 — FRONTEND BUILD INSTRUCTIONS (for the coding LLM)

You are the frontend engineer. Every decision has already been made in this file. **Do not substitute libraries, rename things, change colours, invent endpoints or skip steps.** If something is truly ambiguous, STOP and ask the user — do not guess.

## 0. Operating rules (read first, obey always)
1. Work **phase by phase** (Section 13). After each phase run `npm run build` and `npm run lint`; fix all errors before continuing. Then print: `PHASE X DONE — <one-line summary>` and wait for the user to say "continue".
2. Only use the packages listed in §2. No other UI kits (no MUI, shadcn, Chakra, framer-motion, axios).
3. All colours come from CSS variables defined in §4. **Never hard-code hex colours in components.** Never use Tailwind palette colours (`bg-blue-500`, `slate`, `gray`, `navy`, etc.). The only allowed colour classes are the token classes in §4.3.
4. **No navy / dark-blue / generic "SaaS dashboard" look anywhere.** No blue as primary, info or background in any concept.
5. Every number/visual that comes from data shows a `DataBadge` (LIVE / CACHED / SIMULATED / MANUAL) and, where relevant, a `ScaleBadge` (District · MODIS 250 m vs Field · Sentinel-2 10 m). Honesty labels are a judged feature.
6. The backend does not exist yet. Build against the **mock layer** (§9) that implements the exact API contract (§8). Later we flip one env var to use the real backend.
7. TypeScript `strict: true`. No `any` (use `unknown` + narrowing). Functional components + hooks only.
8. UI text language: English. SMS previews show regional scripts (Devanagari / Gurmukhi) — use the Noto fonts for those.
9. Windows + PowerShell environment. Use `npm`, not yarn/pnpm.

---

## 1. Product summary (context — 6 lines)
FarmPulse 360 is a department-side web app (agriculture department, extension workers, KVK experts, local representatives). Farmers never use the app; they receive SMS. Three features:
- **F1 Crop-stress early warning:** district risk heat map (MODIS NDVI anomaly), monitored-districts table sorted by risk, per-district report (score, confidence, priority, escalation, recommended action, freshness, reasoning chain, institutional briefing, roles), registered-farmer field polygons with Sentinel-2 NDVI/NDWI trend, weather alerts, multilingual SMS advisory.
- **F2 Soil Health Card (SHC) reader:** OCR of 12 parameters with error safeguards, unit-safe fertilizer conversion to bags/acre, plain-language regional SMS, **mandatory department approval** before sending, links to farmer record and feeds F1 reasoning.
- **F3 Follow-up & resolution:** 21-day satellite follow-up per farmer field after an advisory; outcomes recovering / not recovering / deteriorating / insufficient data; "Needs field support" queue; message lifecycle generated → approved → sent → delivered → acknowledged; unified, hash-chained audit with consolidated report.

---

## 2. Stack & setup (exact)
Project root: `HackShift/farmpulse360/apps/web` (create folders).

```powershell
mkdir farmpulse360\apps -Force; cd farmpulse360\apps
npm create vite@latest web -- --template react-ts
cd web
npm i react-router-dom@7 recharts@2 leaflet@1.9 react-leaflet@4.2 lucide-react react-hot-toast date-fns clsx tailwind-merge
npm i -D tailwindcss@4 @tailwindcss/vite@4 @types/leaflet @types/node
```
React must be 18 (react-leaflet 4 requires it). If Vite installed React 19, run `npm i react@18 react-dom@18 @types/react@18 @types/react-dom@18`.

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
});
```
`tsconfig.app.json` → add `"baseUrl": "."`, `"paths": { "@/*": ["src/*"] }`.

`.env` (and `.env.example`):
```
VITE_USE_MOCKS=true
VITE_API_BASE=http://127.0.0.1:8000
```

`index.html` `<head>` — add exactly:
```html
<title>FarmPulse 360</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Baloo+2:wght@500;700;800&family=Nunito:wght@400;600;700&family=DM+Mono:wght@400;500&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Sans+Gurmukhi:wght@400;600&display=swap" rel="stylesheet">
```
In `main.tsx` import `'leaflet/dist/leaflet.css'` before `'./index.css'`.

---

## 3. Folder structure (create exactly)
```
src/
  main.tsx  App.tsx  index.css
  theme/      concepts.css  ThemeContext.tsx  useTheme.ts  concepts.ts  useThemeColors.ts  ConceptBackdrop.tsx
  auth/       RoleContext.tsx  personas.ts  permissions.ts
  api/        contract.ts  client.ts  sse.ts
  mocks/      data.ts  store.ts  handlers.ts
  lib/        format.ts  geo.ts  sms.ts  soil.ts  cn.ts
  components/
    layout/   AppLayout.tsx  MittiLayout.tsx  HaryaliLayout.tsx  SarsonLayout.tsx  navItems.ts  TopActions.tsx
    ui/       Card.tsx Button.tsx Badge.tsx DataBadge.tsx ScaleBadge.tsx RiskBadge.tsx KpiCard.tsx Table.tsx Tabs.tsx Drawer.tsx Modal.tsx EmptyState.tsx Skeleton.tsx ErrorState.tsx Select.tsx Input.tsx Textarea.tsx Toggle.tsx ProgressBar.tsx Tooltip.tsx PageHeader.tsx RoleGate.tsx
    domain/   RiskGauge.tsx ReasoningChain.tsx DistrictMap.tsx FieldMap.tsx BoundaryEditor.tsx NdviTrendChart.tsx FollowUpChart.tsx WeatherStrip.tsx WeatherAlertList.tsx SmsPreview.tsx MessageStepper.tsx SoilParamTable.tsx FertilizerTable.tsx UnitConverter.tsx AgentStatusPanel.tsx AuditTimeline.tsx OutreachFunnel.tsx ReliabilityPanel.tsx RolesPanel.tsx InstitutionalBriefing.tsx
  pages/
    Landing.tsx Overview.tsx EarlyWarning.tsx DistrictReport.tsx Farmers.tsx FarmerNew.tsx FarmerDetail.tsx
    SoilCards.tsx SoilCardNew.tsx SoilCardDetail.tsx Advisories.tsx Approvals.tsx FollowUp.tsx FieldSupport.tsx
    Audit.tsx AuditReport.tsx Settings.tsx DesignLab.tsx NotFound.tsx
```

---

## 4. Theme system — 3 concepts × light/dark

### 4.1 Mechanism
- `<html data-concept="mitti|haryali|sarson" data-mode="light|dark">`.
- `ThemeContext` state: `concept`, `mode`, `setConcept`, `setMode`, `toggleMode`.
- Initial value priority: **URL query** `?concept=&mode=` → `localStorage` (`fp.concept`, `fp.mode`) → `localStorage fp.chosenConcept` → default `concept='mitti'`, mode = `prefers-color-scheme`.
- If URL has `embed=1`: read from URL only and **never write localStorage** (Design Lab iframes share storage).
- `concepts.ts` exports metadata used by Design Lab & Settings:
```ts
export const CONCEPTS = {
  mitti:   { name: 'Mitti Almanac',      tagline: 'Terracotta, clay & olive — an editorial farm almanac', fonts: 'Fraunces · Work Sans · IBM Plex Mono', layout: 'Dark-soil sidebar + ruled almanac pages' },
  haryali: { name: 'Haryali Canopy',     tagline: 'Chlorophyll greens — satellite mission control for crops', fonts: 'Space Grotesk · IBM Plex Sans · JetBrains Mono', layout: 'Icon rail + command top-bar, glass panels on contour lines' },
  sarson:  { name: 'Sarson Sunrise',     tagline: 'Mustard fields & aubergine — warm, friendly, village-first', fonts: 'Baloo 2 · Nunito · DM Mono', layout: 'Pill top-nav, rounded chunky cards over rolling field hills' },
} as const;
export type ConceptKey = keyof typeof CONCEPTS;
```

### 4.2 `theme/concepts.css` — paste exactly
```css
/* ================= MITTI ALMANAC ================= */
[data-concept="mitti"][data-mode="light"]{
  --fp-bg:#F7F0E3; --fp-bg-alt:#EFE4D0; --fp-surface:#FFFBF4; --fp-surface-2:#F3E9D8; --fp-border:#DCCBB0;
  --fp-ink:#2A1C12; --fp-ink-muted:#6E5A47; --fp-primary:#B4532A; --fp-on-primary:#FFF7EE; --fp-accent:#6B7F2A; --fp-on-accent:#FFFFFF;
  --fp-success:#4E7D2B; --fp-warning:#C98A12; --fp-danger:#A8321E; --fp-info:#5E7A6E;
  --fp-risk-low:#5E8C31; --fp-risk-medium:#D9A21B; --fp-risk-high:#D26A1E; --fp-risk-critical:#A8261B;
  --fp-ndvi-0:#8C5A2B; --fp-ndvi-1:#C9A04A; --fp-ndvi-2:#E5D36A; --fp-ndvi-3:#9CC25A; --fp-ndvi-4:#3F8A3A;
  --fp-nav-bg:#2A1C12; --fp-nav-ink:#F3E7D6; --fp-nav-active:#B4532A;
  --fp-furrow:rgba(180,83,42,.06); --fp-glow:rgba(201,138,18,.10);
  --fp-shadow:3px 3px 0 rgba(42,28,18,.12); --fp-map-filter:sepia(.25) saturate(.9);
}
[data-concept="mitti"][data-mode="dark"]{
  --fp-bg:#1B130D; --fp-bg-alt:#231910; --fp-surface:#2A1E15; --fp-surface-2:#35271C; --fp-border:#4A3727;
  --fp-ink:#F3E7D6; --fp-ink-muted:#BCA88F; --fp-primary:#E07A4C; --fp-on-primary:#1B130D; --fp-accent:#A9BE5A; --fp-on-accent:#1B130D;
  --fp-success:#8DBE5A; --fp-warning:#E9B84A; --fp-danger:#E5624A; --fp-info:#8FB3A3;
  --fp-risk-low:#86B95B; --fp-risk-medium:#E8BC45; --fp-risk-high:#EE8A42; --fp-risk-critical:#EF5B4A;
  --fp-ndvi-0:#A8703E; --fp-ndvi-1:#D8B25A; --fp-ndvi-2:#EEDD7A; --fp-ndvi-3:#A9CF66; --fp-ndvi-4:#5BAE4F;
  --fp-nav-bg:#120C08; --fp-nav-ink:#F3E7D6; --fp-nav-active:#E07A4C;
  --fp-furrow:rgba(224,122,76,.05); --fp-glow:rgba(233,184,74,.07);
  --fp-shadow:3px 3px 0 rgba(0,0,0,.45); --fp-map-filter:sepia(.2) brightness(.95);
}
[data-concept="mitti"]{ --fp-font-display:'Fraunces',serif; --fp-font-body:'Work Sans',sans-serif; --fp-font-mono:'IBM Plex Mono',monospace; --fp-radius-card:6px; --fp-radius-ctl:4px; }

/* ================= HARYALI CANOPY ================= */
[data-concept="haryali"][data-mode="light"]{
  --fp-bg:#EEF5EC; --fp-bg-alt:#E2EDDF; --fp-surface:#FFFFFF; --fp-surface-2:#F4F9F2; --fp-border:#CFE0CA;
  --fp-ink:#10241A; --fp-ink-muted:#4D6656; --fp-primary:#1E6B3C; --fp-on-primary:#FFFFFF; --fp-accent:#7FB800; --fp-on-accent:#10241A;
  --fp-success:#2E8B4E; --fp-warning:#D19A00; --fp-danger:#C2412D; --fp-info:#2C8C83;
  --fp-risk-low:#3C9A55; --fp-risk-medium:#E0B000; --fp-risk-high:#E07B1F; --fp-risk-critical:#C9302C;
  --fp-ndvi-0:#A0522D; --fp-ndvi-1:#D4A84B; --fp-ndvi-2:#EDE26A; --fp-ndvi-3:#8CCB4F; --fp-ndvi-4:#1F8A3E;
  --fp-nav-bg:#FFFFFF; --fp-nav-ink:#10241A; --fp-nav-active:#1E6B3C;
  --fp-contour:rgba(30,107,60,.10); --fp-glow:rgba(127,184,0,.14); --fp-glass:rgba(255,255,255,.82);
  --fp-shadow:0 1px 2px rgba(16,36,26,.06),0 8px 24px rgba(16,36,26,.06); --fp-map-filter:none;
}
[data-concept="haryali"][data-mode="dark"]{
  --fp-bg:#0B1510; --fp-bg-alt:#0F1C15; --fp-surface:#13241A; --fp-surface-2:#1A3023; --fp-border:#24402F;
  --fp-ink:#E3F1E6; --fp-ink-muted:#93B09D; --fp-primary:#4CC97A; --fp-on-primary:#06110B; --fp-accent:#C8F135; --fp-on-accent:#0B1510;
  --fp-success:#5DD68A; --fp-warning:#F2C230; --fp-danger:#FF6B57; --fp-info:#4FD1C1;
  --fp-risk-low:#5DD68A; --fp-risk-medium:#F2C230; --fp-risk-high:#FF9A3D; --fp-risk-critical:#FF5A4E;
  --fp-ndvi-0:#B8673A; --fp-ndvi-1:#E0B556; --fp-ndvi-2:#F0E67A; --fp-ndvi-3:#9BDA5E; --fp-ndvi-4:#3FC46A;
  --fp-nav-bg:#0F1C15; --fp-nav-ink:#E3F1E6; --fp-nav-active:#4CC97A;
  --fp-contour:rgba(76,201,122,.08); --fp-glow:rgba(200,241,53,.10); --fp-glass:rgba(19,36,26,.72);
  --fp-shadow:0 0 0 1px rgba(76,201,122,.08),0 12px 32px rgba(0,0,0,.5); --fp-map-filter:none;
}
[data-concept="haryali"]{ --fp-font-display:'Space Grotesk',sans-serif; --fp-font-body:'IBM Plex Sans',sans-serif; --fp-font-mono:'JetBrains Mono',monospace; --fp-radius-card:14px; --fp-radius-ctl:10px; }

/* ================= SARSON SUNRISE ================= */
[data-concept="sarson"][data-mode="light"]{
  --fp-bg:#FFF7DB; --fp-bg-alt:#FDEFC0; --fp-surface:#FFFDF5; --fp-surface-2:#FFF3CC; --fp-border:#EED9A0;
  --fp-ink:#2B1533; --fp-ink-muted:#6B5372; --fp-primary:#5B2A72; --fp-on-primary:#FFF7DB; --fp-accent:#F2A900; --fp-on-accent:#2B1533;
  --fp-success:#3F8F3A; --fp-warning:#E07A00; --fp-danger:#C8323C; --fp-info:#2F8F7A;
  --fp-risk-low:#4C9A3F; --fp-risk-medium:#F2B400; --fp-risk-high:#EB7A10; --fp-risk-critical:#CC2E3A;
  --fp-ndvi-0:#9B5B2E; --fp-ndvi-1:#E2B04A; --fp-ndvi-2:#F4E27A; --fp-ndvi-3:#A6D25E; --fp-ndvi-4:#3E9B45;
  --fp-nav-bg:#FFFDF5; --fp-nav-ink:#2B1533; --fp-nav-active:#F2A900;
  --fp-hill-1:rgba(242,169,0,.35); --fp-hill-2:rgba(63,143,58,.25); --fp-hill-3:rgba(91,42,114,.14); --fp-sun:rgba(242,169,0,.35);
  --fp-shadow:0 6px 0 rgba(91,42,114,.10),0 14px 30px rgba(91,42,114,.10); --fp-map-filter:saturate(1.1);
}
[data-concept="sarson"][data-mode="dark"]{
  --fp-bg:#170E1C; --fp-bg-alt:#1E1325; --fp-surface:#251831; --fp-surface-2:#30203E; --fp-border:#45305A;
  --fp-ink:#FBEFD6; --fp-ink-muted:#C3AFC9; --fp-primary:#C79BE0; --fp-on-primary:#170E1C; --fp-accent:#FFC53D; --fp-on-accent:#170E1C;
  --fp-success:#7ACB6E; --fp-warning:#FFA040; --fp-danger:#FF6B78; --fp-info:#5FD0B5;
  --fp-risk-low:#7ACB6E; --fp-risk-medium:#FFC53D; --fp-risk-high:#FF9840; --fp-risk-critical:#FF5D6C;
  --fp-ndvi-0:#B06A3A; --fp-ndvi-1:#E8BA56; --fp-ndvi-2:#F6E58A; --fp-ndvi-3:#AEDB6A; --fp-ndvi-4:#55B65C;
  --fp-nav-bg:#1E1325; --fp-nav-ink:#FBEFD6; --fp-nav-active:#FFC53D;
  --fp-hill-1:rgba(255,197,61,.16); --fp-hill-2:rgba(122,203,110,.14); --fp-hill-3:rgba(199,155,224,.12); --fp-sun:rgba(251,239,214,.14);
  --fp-shadow:0 6px 0 rgba(0,0,0,.35),0 14px 30px rgba(0,0,0,.45); --fp-map-filter:brightness(.9) saturate(.9);
}
[data-concept="sarson"]{ --fp-font-display:'Baloo 2',cursive; --fp-font-body:'Nunito',sans-serif; --fp-font-mono:'DM Mono',monospace; --fp-radius-card:22px; --fp-radius-ctl:999px; }

/* ================= SHARED SKIN CLASSES ================= */
html,body{ background:var(--fp-bg); color:var(--fp-ink); font-family:var(--fp-font-body); }
.font-regional{ font-family:'Noto Sans Devanagari','Noto Sans Gurmukhi',var(--fp-font-body); }
.leaflet-tile-pane{ filter:var(--fp-map-filter); }
.fp-card{ background:var(--fp-surface); border:1px solid var(--fp-border); border-radius:var(--fp-radius-card); box-shadow:var(--fp-shadow); }
.fp-btn{ border-radius:var(--fp-radius-ctl); font-weight:600; padding:.55rem 1rem; display:inline-flex; gap:.5rem; align-items:center; transition:transform .12s, background .12s; }
.fp-btn:focus-visible,.fp-input:focus-visible{ outline:2px solid var(--fp-accent); outline-offset:2px; }
.fp-btn:disabled{ opacity:.5; cursor:not-allowed; }
.fp-btn-primary{ background:var(--fp-primary); color:var(--fp-on-primary); }
.fp-btn-accent{ background:var(--fp-accent); color:var(--fp-on-accent); }
.fp-btn-ghost{ background:transparent; color:var(--fp-ink); border:1px solid var(--fp-border); }
.fp-btn-danger{ background:var(--fp-danger); color:#fff; }
.fp-input{ background:var(--fp-surface-2); border:1px solid var(--fp-border); border-radius:var(--fp-radius-ctl); padding:.5rem .75rem; color:var(--fp-ink); }
.fp-eyebrow{ font-size:.72rem; letter-spacing:.12em; text-transform:uppercase; color:var(--fp-ink-muted); font-weight:600; }
.fp-num{ font-family:var(--fp-font-mono); font-variant-numeric:tabular-nums; }

/* Mitti specifics: almanac rules, hard offset shadow, small caps */
[data-concept="mitti"] .fp-eyebrow{ font-variant:small-caps; text-transform:none; letter-spacing:.08em; font-size:.85rem; border-bottom:1px solid var(--fp-border); padding-bottom:.25rem; }
[data-concept="mitti"] .fp-kpi-value{ font-family:var(--fp-font-display); font-size:2.6rem; font-weight:700; line-height:1; }
[data-concept="mitti"] .fp-btn-primary:hover{ transform:translate(-1px,-1px); box-shadow:2px 2px 0 var(--fp-ink); }
[data-concept="mitti"] h1,[data-concept="mitti"] h2{ font-family:var(--fp-font-display); }

/* Haryali specifics: glass panels, mono eyebrow, glow */
[data-concept="haryali"] .fp-card{ background:var(--fp-glass); backdrop-filter:blur(10px); }
[data-concept="haryali"] .fp-eyebrow{ font-family:var(--fp-font-mono); text-transform:none; letter-spacing:.02em; }
[data-concept="haryali"] .fp-eyebrow::before{ content:"// "; color:var(--fp-accent); }
[data-concept="haryali"] .fp-kpi-value{ font-family:var(--fp-font-mono); font-size:2.2rem; font-weight:600; }
[data-concept="haryali"] .fp-btn-primary:hover{ box-shadow:0 0 0 4px color-mix(in srgb, var(--fp-primary) 25%, transparent); }
[data-concept="haryali"] h1,[data-concept="haryali"] h2{ font-family:var(--fp-font-display); letter-spacing:-.02em; }
.fp-live-dot{ width:8px; height:8px; border-radius:999px; background:var(--fp-success); animation:fp-pulse 1.6s infinite; }
@keyframes fp-pulse{ 0%{ box-shadow:0 0 0 0 color-mix(in srgb,var(--fp-success) 60%,transparent);} 100%{ box-shadow:0 0 0 10px transparent;} }

/* Sarson specifics: chunky rounded, pill eyebrow, bouncy hover */
[data-concept="sarson"] .fp-card{ border-width:2px; }
[data-concept="sarson"] .fp-eyebrow{ display:inline-block; background:color-mix(in srgb,var(--fp-accent) 25%,transparent); color:var(--fp-ink); padding:.15rem .6rem; border-radius:999px; }
[data-concept="sarson"] .fp-kpi-value{ font-family:var(--fp-font-display); font-size:2.5rem; font-weight:800; }
[data-concept="sarson"] .fp-card:hover,[data-concept="sarson"] .fp-btn:hover{ transform:translateY(-2px); }
[data-concept="sarson"] h1,[data-concept="sarson"] h2{ font-family:var(--fp-font-display); }

/* Backdrop base */
.fp-backdrop{ position:fixed; inset:0; z-index:0; pointer-events:none; }
[data-concept="mitti"] .fp-backdrop{
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.07'/%3E%3C/svg%3E"),
    repeating-linear-gradient(115deg, transparent 0 22px, var(--fp-furrow) 22px 23px),
    radial-gradient(1100px 600px at 100% 0%, var(--fp-glow), transparent 60%);
}
[data-concept="haryali"] .fp-backdrop{ background:radial-gradient(900px 520px at 92% -10%, var(--fp-glow), transparent 60%), radial-gradient(700px 400px at -10% 110%, var(--fp-glow), transparent 60%); }
[data-concept="haryali"][data-mode="dark"] .fp-backdrop::after{ content:""; position:absolute; inset:0; background-image:radial-gradient(var(--fp-contour) 1px, transparent 1px); background-size:22px 22px; }
[data-concept="sarson"] .fp-backdrop{ background:linear-gradient(180deg, var(--fp-bg) 0%, var(--fp-bg-alt) 100%); }
[data-concept="sarson"][data-mode="dark"] .fp-backdrop{ background-image:radial-gradient(rgba(251,239,214,.35) 1px, transparent 1.5px), linear-gradient(180deg,var(--fp-bg),var(--fp-bg-alt)); background-size:90px 90px, auto; }
@media (prefers-reduced-motion: reduce){ *{ animation:none!important; transition:none!important; } }
@media print{ .fp-backdrop,nav,aside,.no-print{ display:none!important; } .fp-card{ box-shadow:none; } }
```

### 4.3 `index.css` — paste exactly
```css
@import "tailwindcss";
@import "./theme/concepts.css";
@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *));
@theme inline {
  --color-bg: var(--fp-bg); --color-bg-alt: var(--fp-bg-alt);
  --color-surface: var(--fp-surface); --color-surface-2: var(--fp-surface-2);
  --color-line: var(--fp-border); --color-ink: var(--fp-ink); --color-ink-muted: var(--fp-ink-muted);
  --color-primary: var(--fp-primary); --color-on-primary: var(--fp-on-primary);
  --color-accent: var(--fp-accent); --color-on-accent: var(--fp-on-accent);
  --color-success: var(--fp-success); --color-warning: var(--fp-warning); --color-danger: var(--fp-danger); --color-info: var(--fp-info);
  --color-risk-low: var(--fp-risk-low); --color-risk-medium: var(--fp-risk-medium); --color-risk-high: var(--fp-risk-high); --color-risk-critical: var(--fp-risk-critical);
  --font-display: var(--fp-font-display); --font-body: var(--fp-font-body); --font-mono: var(--fp-font-mono);
  --radius-card: var(--fp-radius-card); --radius-ctl: var(--fp-radius-ctl);
}
```
Allowed colour utilities: `bg-|text-|border-|ring-|fill-|stroke-` + `bg, bg-alt, surface, surface-2, line, ink, ink-muted, primary, on-primary, accent, on-accent, success, warning, danger, info, risk-*`, with optional `/NN` opacity. Fonts: `font-display|font-body|font-mono`. Radius: `rounded-card|rounded-ctl`.

### 4.4 `ConceptBackdrop.tsx`
Render `<div className="fp-backdrop" aria-hidden>` always, plus:
- **haryali:** inside it a full-screen `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" fill="none" stroke="var(--fp-contour)" strokeWidth={1.2}>` with these paths:
  `M-50 120 C120 60,260 180,420 110 S700 40,850 130` · `M-50 170 C140 110,270 230,430 160 S690 90,850 180` · `M-50 220 C150 165,280 280,440 210 S680 140,850 230` · `M-50 400 C100 350,300 470,470 400 S720 330,850 420` · `M-50 450 C110 400,310 520,480 450 S730 380,850 470` · `M560 300 c40-30 110-20 120 20 s-30 70-80 60 s-80-50-40-80z` · `M530 300 c50-60 170-50 185 25 s-50 110-130 95 s-110-60-55-120z`.
- **sarson:** (a) sun: `<div className="absolute -top-16 right-10 w-72 h-72 rounded-full blur-2xl" style={{background:'var(--fp-sun)'}}/>`; (b) bottom hills `<svg className="absolute bottom-0 left-0 w-full h-[240px]" viewBox="0 0 1440 260" preserveAspectRatio="none">` with paths filled `var(--fp-hill-1)`, `var(--fp-hill-2)`, `var(--fp-hill-3)`:
  `M0 120 C240 60 480 160 720 110 S1200 60 1440 120 V260 H0Z` · `M0 170 C300 120 520 210 800 160 S1260 130 1440 180 V260 H0Z` · `M0 215 C260 185 560 245 860 210 S1300 195 1440 225 V260 H0Z`.
- **mitti:** nothing extra (CSS handles grain + furrows).
App content wrapper must be `relative z-10`.

### 4.5 `useThemeColors()`
Returns resolved hex strings for chart/map use: `{ primary, accent, ink, inkMuted, border, surface, success, warning, danger, info, risk: {LOW,MEDIUM,HIGH,CRITICAL}, ndvi: [0..4] }` by reading `getComputedStyle(document.documentElement)`; recompute when `concept` or `mode` changes.

---

## 5. Layouts (one per concept; `AppLayout` picks by concept)
Shared nav items (`navItems.ts`, this order, lucide icons):
| Label | Route | Icon | Badge |
|---|---|---|---|
| Command Center | /overview | `LayoutDashboard` | – |
| Early Warning | /early-warning | `Satellite` | activeAlerts |
| Farmers | /farmers | `Users` | – |
| Soil Cards | /soil-cards | `FlaskConical` | – |
| Advisories | /advisories | `MessageSquareText` | – |
| Approvals | /approvals | `ShieldCheck` | pendingApprovals |
| Follow-up | /follow-up | `Activity` | – |
| Field Support | /field-support | `Tractor` | needsFieldSupport |
| Audit | /audit | `ScrollText` | – |
| Settings | /settings | `Settings` | – |

`TopActions` (all layouts): DataMode pill (`MOCK DATA` when `VITE_USE_MOCKS=true`, else `LIVE API` with `.fp-live-dot`), persona switcher (dropdown, §6), light/dark toggle (`Sun`/`Moon`).

- **MittiLayout:** fixed left sidebar 248px, `background:var(--fp-nav-bg)`, `color:var(--fp-nav-ink)`; logo "FarmPulse 360" in Fraunces 22px with a small `Sprout` icon; nav items 14px, active item has 3px left bar `var(--fp-nav-active)` and bold text; sidebar footer shows persona name + role. Main area: max-width 1400px, padding 32px; top row = page title area left, `TopActions` right; thin 1px rule under header.
- **HaryaliLayout:** fixed left icon rail 76px (`--fp-nav-bg`, border-right line), icons 22px with `Tooltip` labels, active = rounded-ctl filled `primary/15` + icon colour primary + 2px accent dot; top bar 60px glass (`--fp-glass`, blur) with breadcrumb (mono), search input (filters farmers/districts → navigates), `TopActions`. Main padding 24px, full width.
- **SarsonLayout:** top bar 72px, surface with 2px bottom border; logo left in Baloo 2 800 with sun icon in accent blob; horizontal pill nav (active = `bg-accent text-on-accent`, rounded-full), overflow items (Audit, Settings) in a "More" menu; below 1024px replace with fixed bottom tab bar (Command, Early Warning, Farmers, Follow-up, More sheet). Main max-width 1320px centered, padding 28px, bottom padding 260px (so hills show).

All layouts render `<ConceptBackdrop/>` and `<Outlet/>`. Responsive: ≥1280 full; 768–1279 Mitti sidebar collapses to icons, Haryali unchanged; <768 all show a hamburger drawer except Sarson (bottom tabs).

---

## 6. Personas, roles, permissions
`personas.ts`:
| id | name | role |
|---|---|---|
| p1 | Asha Kulkarni | DEPT_OFFICER |
| p2 | R. K. Sharma | DEPT_OFFICER |
| p3 | Vikas More | EXTENSION_WORKER |
| p4 | Dr. Neha Rao | KVK_EXPERT |
| p5 | Sanjay Patil | LOCAL_REP |

`RoleContext` stores current persona (localStorage `fp.persona`, default p1; in embed mode p1, not persisted). API client sends headers `X-Actor: <name>` and `X-Role: <role>`.

`permissions.ts` (`can(role, action)`), used by `RoleGate` (renders the button **disabled** with tooltip "Requires: <roles>" — never hide):
| action | roles |
|---|---|
| farmer.register, boundary.verify | EXTENSION_WORKER, KVK_EXPERT |
| soil.create, soil.edit, soil.confirm, soil.generateSms | EXTENSION_WORKER, KVK_EXPERT |
| message.generate, message.edit, message.submit | DEPT_OFFICER, EXTENSION_WORKER, KVK_EXPERT |
| message.approve, message.reject, message.send | DEPT_OFFICER (approve/reject also require actor ≠ generatedBy → tooltip "Separation of duties: you drafted this") |
| message.acknowledge, case.verify | EXTENSION_WORKER, KVK_EXPERT, LOCAL_REP, DEPT_OFFICER |
| case.close | DEPT_OFFICER (actor must differ from the latest verification's verifiedBy) |
| case.reopen, task.assign, scan.run | DEPT_OFFICER |
| task.visit | KVK_EXPERT, LOCAL_REP |
| farmer.analyze, followup.check, demo.fastForward | all |

---

## 7. Routes (`App.tsx`)
```
/                         Landing            (no layout)
/design-lab               DesignLab          (no layout)
/overview                 Overview
/early-warning            EarlyWarning
/districts/:districtId    DistrictReport
/farmers                  Farmers
/farmers/new              FarmerNew
/farmers/:farmerId        FarmerDetail
/soil-cards               SoilCards
/soil-cards/new           SoilCardNew        (?farmerId= optional)
/soil-cards/:cardId       SoilCardDetail
/advisories               Advisories         (?kind=&districtId=&farmerId=&caseId= prefill compose)
/approvals                Approvals
/follow-up                FollowUp           (?caseId= opens drawer)
/field-support            FieldSupport
/audit                    Audit
/audit/report/:caseId     AuditReport        (caseId may be "illustrative")
/settings                 Settings
*                         NotFound
```
Wrap with `ThemeProvider` → `RoleProvider` → `<Toaster position="bottom-right"/>` (toast style uses surface/ink/border vars).

---

## 8. API CONTRACT v1 (identical in backend doc — copy to `src/api/contract.ts` verbatim)
```ts
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type DataStatus = 'LIVE' | 'CACHED' | 'SIMULATED' | 'MANUAL';
export type Language = 'English' | 'Hindi' | 'Marathi' | 'Punjabi';
export type Role = 'DEPT_OFFICER' | 'EXTENSION_WORKER' | 'KVK_EXPERT' | 'LOCAL_REP';
export type Scale = 'DISTRICT_MODIS_250M' | 'FIELD_SENTINEL2_10M';

export interface Provenance { source: string; status: DataStatus; scale: Scale | null; observedAt: string | null; fetchedAt: string; freshnessDays: number | null; note: string | null; }

export interface DistrictSummary { id: string; district: string; state: string; lat: number; lon: number; primaryCrop: string; acreageLakh: number; language: Language; kvkContact: string; ndvi: number; ndviBaseline: number; ndviAnomalyPct: number; riskScore: number; riskLevel: RiskLevel; priorityRank: number; weatherAlertCount: number; registeredFarmers: number; openCases: number; provenance: Provenance; }
export interface StateSummary { state: string; avgRisk: number; districtCount: number; criticalDistricts: number; highDistricts: number; }
export interface DistrictsResponse { generatedAt: string; summary: { districtsMonitored: number; activeAlerts: number; criticalDistricts: number; registeredFarmers: number; needsFieldSupport: number; pendingApprovals: number; }; states: StateSummary[]; districts: DistrictSummary[]; }

export type ReasoningStatus = 'OK' | 'WARN' | 'ABSTAIN';
export interface ReasoningStep { step: number; agent: string; title: string; detail: string; status: ReasoningStatus; evidence: Provenance[]; }

export interface WeatherObs { rainfall7dMm: number; rainfallAnomalyPct: number; avgTempC: number; tempAnomalyC: number; humidityPct: number; provenance: Provenance; }
export interface ForecastDay { date: string; tMaxC: number; tMinC: number; rainMm: number; rainProbPct: number; windKmh: number; et0Mm: number; }
export type WeatherAlertType = 'HEAVY_RAIN' | 'HEATWAVE' | 'COLD_WAVE' | 'HIGH_WIND' | 'DRY_SPELL';
export type AlertSeverity = 'WATCH' | 'WARNING' | 'SEVERE';
export interface WeatherAlert { id: string; districtId: string; type: WeatherAlertType; severity: AlertSeverity; title: string; message: string; validFrom: string; validTo: string; provenance: Provenance; }

export interface RoleResponsibility { role: 'AGRICULTURE_DEPARTMENT' | 'EXTENSION_WORKER' | 'KVK' | 'LOCAL_REPRESENTATIVE'; title: string; responsibilities: string[]; contact: string; }
export interface InstitutionalBriefing { headline: string; summary: string; actions: string[]; insuranceSignal: { claimProbability: number; affectedAcreagePct: number; note: string }; }
export interface DistrictReport { runId: string; generatedAt: string; district: DistrictSummary; crop: string; cropStage: string; daysToHarvest: number; riskScore: number; riskLevel: RiskLevel; confidence: number; priority: Priority; escalate: boolean; escalationReason: string | null; recommendedAction: string; rootCause: string; freshness: { overall: 'FRESH' | 'AGING' | 'STALE'; ndviAgeDays: number | null; weatherAgeDays: number | null }; weather: WeatherObs; forecast5d: ForecastDay[]; weatherAlerts: WeatherAlert[]; pest: { name: string; probability: number }; reasoningChain: ReasoningStep[]; institutionalBriefing: InstitutionalBriefing; roles: RoleResponsibility[]; registeredFarmers: Farmer[]; warnings: string[]; dataSources: Provenance[]; }

export type BoundaryStatus = 'UNVERIFIED' | 'WORKER_VERIFIED' | 'DISPUTED';
export type SizeClass = 'TOO_SMALL' | 'SMALL' | 'ADEQUATE';
export interface GeoPolygon { type: 'Polygon'; coordinates: number[][][]; } // GeoJSON order [lon, lat]; ring closed
export interface FieldParcel { polygon: GeoPolygon; centroid: [number, number]; areaHa: number; pixelCount10m: number; sizeClass: SizeClass; boundaryStatus: BoundaryStatus; boundaryNote: string | null; boundaryVerifiedBy: string | null; boundaryVerifiedAt: string | null; } // centroid = [lat, lon]
export interface FieldObservation { date: string; ndvi: number | null; ndwi: number | null; cloudPct: number; validPixelPct: number; usable: boolean; status: DataStatus; }
export type StressType = 'NONE' | 'WATER' | 'POSSIBLE_NUTRIENT' | 'MIXED' | 'UNKNOWN';
export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export interface FieldStressSummary { asOf: string; ndviLatest: number | null; ndviBaseline: number | null; baselineMethod: 'PREVIOUS_YEAR' | 'CROP_DEFAULT'; ndviAnomalyPct: number | null; ndwiLatest: number | null; ndwiBaseline: number | null; ndwiChange: number | null; stressLevel: RiskLevel; stressType: StressType; reliability: Reliability; reliabilityReasons: string[]; provenance: Provenance; }
export interface Farmer { id: string; name: string; phoneMasked: string; language: Language; village: string; districtId: string; crop: string; sowingDate: string; consentSms: boolean; consentAt: string | null; registeredBy: string; createdAt: string; field: FieldParcel; latestStress: FieldStressSummary | null; soilCardId: string | null; openCaseId: string | null; isDemo: boolean; }
export interface FarmerDetail extends Farmer { observations: FieldObservation[]; reasoningChain: ReasoningStep[]; soilCard: SoilCard | null; messages: OutboundMessage[]; openCase: Case | null; followUp: FollowUp | null; auditEvents: AuditEvent[]; }
export interface FarmerCreate { name: string; phone: string; language: Language; village: string; districtId: string; crop: string; sowingDate: string; consentSms: boolean; polygon: GeoPolygon; }
export interface BoundaryVerifyBody { status: 'WORKER_VERIFIED' | 'DISPUTED'; note: string; polygon: GeoPolygon | null; }

export type SoilParam = 'pH' | 'EC' | 'OC' | 'N' | 'P' | 'K' | 'S' | 'Zn' | 'Fe' | 'Cu' | 'Mn' | 'B';
export type SoilRating = 'STRONGLY_ACIDIC' | 'MODERATELY_ACIDIC' | 'NEUTRAL' | 'MODERATELY_ALKALINE' | 'STRONGLY_ALKALINE' | 'NORMAL' | 'CRITICAL' | 'INJURIOUS' | 'LOW' | 'MEDIUM' | 'HIGH' | 'DEFICIENT' | 'SUFFICIENT';
export type OcrFlagCode = 'OUT_OF_RANGE' | 'DECIMAL_SHIFT_SUSPECTED' | 'UNIT_MISMATCH' | 'LOW_CONFIDENCE' | 'MISSING';
export interface OcrFlag { code: OcrFlagCode; message: string; suggestion: number | null; blocking: boolean; }
export interface SoilParamValue { param: SoilParam; label: string; value: number | null; unit: string; ocrRaw: string | null; ocrConfidence: number | null; rating: SoilRating | null; interpretation: string; flags: OcrFlag[]; confirmed: boolean; }
export type FertilizerProduct = 'Urea' | 'DAP' | 'MOP' | 'SSP' | 'NPK_10_26_26' | 'Zinc_Sulphate' | 'Other';
export interface FertilizerRecommendation { product: FertilizerProduct; productLabel: string; cardDose: number; cardDoseUnit: 'kg/ha' | 'kg/acre'; kgPerHa: number; kgPerAcre: number; bagSizeKg: number | null; bagsPerAcre: number | null; bagsForFarm: number | null; kgForFarm: number; timing: string | null; sourceText: string; }
export type SoilCardStatus = 'NEEDS_REVIEW' | 'CONFIRMED' | 'SMS_PENDING_APPROVAL' | 'SMS_APPROVED' | 'SMS_SENT' | 'SMS_REJECTED';
export interface SoilCard { id: string; farmerId: string; cardNumber: string | null; sampleDate: string | null; labName: string | null; imageUrl: string | null; status: SoilCardStatus; params: SoilParamValue[]; recommendations: FertilizerRecommendation[]; cardAgeYears: number | null; ageFlag: boolean; extractionMethod: 'GEMINI_OCR' | 'MANUAL'; createdBy: string; confirmedBy: string | null; messageId: string | null; createdAt: string; }
export interface RecommendationInput { product: FertilizerProduct; productLabel: string; cardDose: number; cardDoseUnit: 'kg/ha' | 'kg/acre'; timing: string | null; sourceText: string; }
export interface SoilCardManualCreate { farmerId: string; cardNumber: string | null; sampleDate: string | null; labName: string | null; params: { param: SoilParam; value: number | null; unit: string }[]; recommendations: RecommendationInput[]; }
export interface SoilCardPatch { cardNumber?: string | null; sampleDate?: string | null; labName?: string | null; params?: { param: SoilParam; value: number | null; unit: string; confirmed: boolean }[]; recommendations?: RecommendationInput[]; }

export type MessageKind = 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'SOIL_CARD' | 'FOLLOWUP_REMINDER';
export type MessageStatus = 'GENERATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';
export interface StatusEvent { status: MessageStatus; at: string; actor: string; role: Role | 'SYSTEM'; note: string | null; }
export interface OutboundMessage { id: string; kind: MessageKind; parentId: string | null; caseId: string | null; farmerId: string | null; soilCardId: string | null; districtId: string; language: Language; textEnglish: string; textLocal: string; charCount: number; segments: number; encoding: 'GSM7' | 'UCS2'; translation: { method: 'GEMINI' | 'TEMPLATE' | 'NONE'; numbersPreserved: boolean; warning: string | null }; status: MessageStatus; statusHistory: StatusEvent[]; recipientCount: number; deliveryStats: { sent: number; delivered: number; failed: number; acknowledged: number } | null; generatedBy: string; approvedBy: string | null; rejectedReason: string | null; provider: 'MOCK' | 'TWILIO'; providerMessageId: string | null; createdAt: string; }
export interface AdvisoryGenerate { kind: 'DISTRICT_ADVISORY' | 'FARMER_ADVISORY' | 'FOLLOWUP_REMINDER'; districtId?: string; farmerId?: string; caseId?: string; language: Language; }
export interface MessagePatch { textEnglish: string; textLocal: string; }
export interface AcknowledgeBody { method: 'FARMER_REPLY' | 'PHONE_CALL' | 'IN_PERSON'; note: string; }

export type CaseStatus = 'DETECTED' | 'ADVISORY_PENDING_APPROVAL' | 'MONITORING' | 'RECOVERING_PENDING_VERIFICATION' | 'NOT_RECOVERING' | 'NEEDS_FIELD_SUPPORT' | 'INSUFFICIENT_DATA' | 'FIELD_VISITED' | 'CLOSED' | 'REOPENED';
export type FollowUpOutcome = 'PENDING' | 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'INSUFFICIENT_DATA';
export interface HumanVerification { method: 'PHONE_CALL' | 'FIELD_VISIT' | 'FARMER_REPLY'; outcome: 'CONFIRMED_RECOVERED' | 'NOT_RECOVERED' | 'COULD_NOT_REACH' | 'DISAGREES_WITH_ASSESSMENT'; observation: string; verifiedBy: string; role: Role; at: string; }
export interface Case { id: string; farmerId: string; farmerName: string; districtId: string; status: CaseStatus; trigger: 'FIELD_STRESS' | 'DISTRICT_ALERT' | 'SOIL_CARD' | 'MANUAL'; openedAt: string; stressAtOpen: FieldStressSummary; reminderCount: number; lastMessageId: string | null; verifications: HumanVerification[]; closedAt: string | null; closedBy: string | null; closeReason: string | null; }
export interface FollowUp { caseId: string; farmerId: string; startedAt: string; windowDays: number; extendedOnce: boolean; dayNumber: number; monitoringScale: Scale; baselineNdvi: number | null; observations: FieldObservation[]; latestNdvi: number | null; deltaNdvi: number | null; slopePerDay: number | null; outcome: FollowUpOutcome; outcomeReason: string; requiresHumanVerification: boolean; lastCheckedAt: string | null; nextCheckAt: string | null; }
export interface CaseDetail { case: Case; farmer: Farmer; followUp: FollowUp | null; messages: OutboundMessage[]; fieldSupportTasks: FieldSupportTask[]; auditEvents: AuditEvent[]; }
export interface VerifyBody { method: HumanVerification['method']; outcome: HumanVerification['outcome']; observation: string; }
export interface ReasonBody { reason: string; }
export interface FastForwardBody { days: number; scenario: 'RECOVERING' | 'NOT_RECOVERING' | 'DETERIORATING' | 'CLOUDY'; }

export type TaskStatus = 'OPEN' | 'ASSIGNED' | 'VISITED' | 'RESOLVED' | 'CANCELLED';
export interface FieldSupportTask { id: string; caseId: string; farmerId: string; farmerName: string; districtId: string; village: string; reason: string; priority: 'P1' | 'P2' | 'P3'; createdAt: string; dueBy: string; overdue: boolean; status: TaskStatus; assignedTo: string | null; assignedRole: 'KVK_EXPERT' | 'LOCAL_REP' | null; visit: { visitedAt: string; visitedBy: string; findings: string; actionTaken: string; recommendClose: boolean } | null; }
export interface AssignBody { assignedTo: string; assignedRole: 'KVK_EXPERT' | 'LOCAL_REP'; }
export interface VisitBody { findings: string; actionTaken: string; recommendClose: boolean; }

export type AuditLayer = 'DATA_PROVENANCE' | 'ANALYSIS' | 'HUMAN_VERIFICATION' | 'APPROVAL' | 'OUTREACH' | 'FIELD_ACTION' | 'OUTCOME';
export interface AuditEvent { id: number; at: string; layer: AuditLayer; action: string; actor: string; role: Role | 'SYSTEM'; caseId: string | null; farmerId: string | null; districtId: string | null; entityType: string; entityId: string; summary: string; details: Record<string, unknown>; isSimulated: boolean; prevHash: string; hash: string; }
export interface ReportRow { label: string; value: string; status: DataStatus | null; }
export interface ReportSection { key: string; title: string; accountableRole: string; rows: ReportRow[]; }
export interface ConsolidatedReport { caseId: string; generatedAt: string; isIllustrative: boolean; sections: ReportSection[]; integrity: { eventCount: number; chainValid: boolean; lastHash: string }; }
export interface ChainVerifyResponse { valid: boolean; eventCount: number; brokenAtId: number | null; }

export interface AgentEvent { runId: string; agent: 'Satellite Scout' | 'Weather Watch' | 'Crop Risk Analyst' | 'Field Monitor'; step: string; status: 'RUNNING' | 'COMPLETE' | 'ERROR'; message: string; at: string; }
export interface OverviewResponse { generatedAt: string; kpis: { districtsMonitored: number; activeAlerts: number; criticalDistricts: number; registeredFarmers: number; pendingApprovals: number; needsFieldSupport: number; monitoringCases: number; acknowledgedRatePct: number | null; }; outreachFunnel: { generated: number; pendingApproval: number; approved: number; sent: number; delivered: number; acknowledged: number; failed: number; rejected: number; }; followUpOutcomes: { pending: number; recovering: number; notRecovering: number; deteriorating: number; insufficientData: number; }; topDistricts: DistrictSummary[]; weatherAlerts: WeatherAlert[]; recentEvents: AuditEvent[]; }
export interface DataSourceStatus { key: 'NASA_POWER' | 'NASA_GIBS_MODIS' | 'OPEN_METEO' | 'CDSE_SENTINEL2' | 'GEMINI' | 'SMS'; name: string; purpose: string; mode: 'LIVE' | 'SIMULATED' | 'MOCK' | 'NOT_CONFIGURED'; lastSuccessAt: string | null; lastError: string | null; }
export interface ApiError { detail: string; code: string; }
```

### 8.1 Endpoints (all JSON; headers `X-Actor`, `X-Role`; errors return `ApiError` with 400/403/404/409/422)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /health | – | `{status:'ok'}` |
| GET | /api/meta/data-sources | – | `DataSourceStatus[]` |
| GET | /api/overview | – | `OverviewResponse` |
| GET | /api/districts | – | `DistrictsResponse` |
| GET | /api/districts/{id}/report?refresh=false | – | `DistrictReport` |
| POST | /api/districts/scan | – | `{runId:string}` |
| GET (SSE) | /api/stream/{runId} | – | `data: AgentEvent` lines; final `event: end` |
| GET | /api/weather/alerts?districtId= | – | `WeatherAlert[]` |
| GET | /api/farmers?districtId=&q= | – | `Farmer[]` |
| POST | /api/farmers | `FarmerCreate` | `Farmer` |
| GET | /api/farmers/{id} | – | `FarmerDetail` |
| POST | /api/farmers/{id}/analyze | – | `FarmerDetail` |
| POST | /api/farmers/{id}/boundary/verify | `BoundaryVerifyBody` | `Farmer` |
| GET | /api/soil-cards?farmerId= | – | `SoilCard[]` |
| POST | /api/soil-cards/ocr | multipart `farmerId`, `image` | `SoilCard` |
| POST | /api/soil-cards/manual | `SoilCardManualCreate` | `SoilCard` |
| GET | /api/soil-cards/{id} | – | `SoilCard` |
| PATCH | /api/soil-cards/{id} | `SoilCardPatch` | `SoilCard` |
| POST | /api/soil-cards/{id}/confirm | – | `SoilCard` |
| POST | /api/soil-cards/{id}/generate-sms | `{language}` | `OutboundMessage` |
| POST | /api/advisories/generate | `AdvisoryGenerate` | `OutboundMessage` |
| GET | /api/messages?status=&kind=&farmerId=&districtId= | – | `OutboundMessage[]` |
| GET | /api/messages/{id} | – | `OutboundMessage` |
| PATCH | /api/messages/{id} | `MessagePatch` | `OutboundMessage` |
| POST | /api/messages/{id}/submit | – | `OutboundMessage` |
| POST | /api/messages/{id}/approve | `{note:string}` | `OutboundMessage` |
| POST | /api/messages/{id}/reject | `ReasonBody` | `OutboundMessage` |
| POST | /api/messages/{id}/send | – | `OutboundMessage` |
| POST | /api/messages/{id}/refresh-status | – | `OutboundMessage` |
| POST | /api/messages/{id}/acknowledge | `AcknowledgeBody` | `OutboundMessage` |
| GET | /api/approvals | – | `OutboundMessage[]` (PENDING_APPROVAL) |
| GET | /api/cases?status=&districtId= | – | `Case[]` |
| GET | /api/cases/{id} | – | `CaseDetail` |
| POST | /api/cases/{id}/followup/check | – | `FollowUp` |
| POST | /api/cases/{id}/verify | `VerifyBody` | `Case` |
| POST | /api/cases/{id}/close | `ReasonBody` | `Case` |
| POST | /api/cases/{id}/reopen | `ReasonBody` | `Case` |
| POST | /api/demo/cases/{id}/fast-forward | `FastForwardBody` | `FollowUp` |
| GET | /api/follow-ups | – | `FollowUp[]` |
| GET | /api/field-support?status= | – | `FieldSupportTask[]` |
| POST | /api/field-support/{id}/assign | `AssignBody` | `FieldSupportTask` |
| POST | /api/field-support/{id}/visit | `VisitBody` | `FieldSupportTask` |
| GET | /api/audit?layer=&caseId=&farmerId=&districtId=&limit=200 | – | `AuditEvent[]` |
| GET | /api/audit/export.csv | – | CSV file |
| GET | /api/audit/verify-chain | – | `ChainVerifyResponse` |
| GET | /api/reports/case/{caseId} | – | `ConsolidatedReport` |
| GET | /api/reports/illustrative | – | `ConsolidatedReport` |

---

## 9. Mock layer (must behave like the backend)
`api/client.ts`: one exported async function per endpoint (e.g. `getDistricts()`, `getDistrictReport(id, refresh)`, `approveMessage(id, note)`…). If `import.meta.env.VITE_USE_MOCKS === 'true'` call `mocks/handlers.ts`, else `fetch(VITE_API_BASE + path)` with headers; on non-2xx parse `ApiError` and `throw new ApiClientError(code, detail, status)`. Show errors with `toast.error(detail)`.
`api/sse.ts`: `subscribeRun(runId, onEvent, onEnd)` → real `EventSource` or, in mock mode, a timer emitting 12 `AgentEvent`s (3 per agent, 400 ms apart) then `onEnd`.

`mocks/store.ts`: in-memory mutable store initialised from `mocks/data.ts`, 300 ms artificial latency, enforces the **same permission + state rules** as backend (§9.3). Every mutation appends an `AuditEvent` (fake hash = 16-char hex of a simple string hash of previous hash + summary).

### 9.1 Mock seed data (`mocks/data.ts`) — these match the backend seed exactly
**Districts** (`provenance.status='SIMULATED'`, scale `DISTRICT_MODIS_250M`; riskLevel: ≥85 CRITICAL, ≥70 HIGH, ≥45 MEDIUM else LOW; ndviAnomalyPct = (ndvi−baseline)/baseline×100 rounded 1dp; priorityRank by risk desc):
```
id,district,state,lat,lon,crop,acreageLakh,kvk,language,ndvi,baseline,risk
yavatmal,Yavatmal,Maharashtra,20.3899,78.1307,Cotton,4.2,07232-242216,Marathi,0.49,0.68,87
akola,Akola,Maharashtra,20.7002,77.0082,Cotton,3.4,0724-2258372,Marathi,0.54,0.68,72
nashik,Nashik,Maharashtra,19.9975,73.7898,Soybean,2.1,0253-2305231,Marathi,0.64,0.65,38
nagpur,Nagpur,Maharashtra,21.1458,79.0882,Soybean,2.3,0712-2689485,Marathi,0.63,0.65,42
amravati,Amravati,Maharashtra,20.9374,77.7796,Cotton,3.0,0721-2661835,Marathi,0.58,0.68,59
ludhiana,Ludhiana,Punjab,30.9009,75.8573,Wheat,3.6,0161-2401960,Punjabi,0.62,0.65,52
bathinda,Bathinda,Punjab,30.207,74.9455,Cotton,2.4,0164-2215619,Punjabi,0.55,0.68,70
moga,Moga,Punjab,30.8165,75.1717,Wheat,2.1,01636-233119,Punjabi,0.64,0.65,40
patiala,Patiala,Punjab,30.3398,76.3869,Wheat,2.8,0175-2212974,Punjabi,0.65,0.65,35
sangrur,Sangrur,Punjab,30.2458,75.8421,Rice,2.2,01672-278129,Punjabi,0.69,0.70,37
meerut,Meerut,UP,28.9845,77.7064,Sugarcane,3.9,0121-2880521,Hindi,0.71,0.74,44
agra,Agra,UP,27.1767,78.0081,Wheat,2.5,0562-2960223,Hindi,0.60,0.65,57
jhansi,Jhansi,UP,25.4484,78.5685,Wheat,1.9,0510-2730466,Hindi,0.59,0.65,61
varanasi,Varanasi,UP,25.3176,82.9739,Rice,2.0,0542-2621182,Hindi,0.68,0.70,39
bareilly,Bareilly,UP,28.367,79.4304,Sugarcane,2.4,0581-2520360,Hindi,0.70,0.74,46
indore,Indore,MP,22.7196,75.8577,Soybean,3.7,0731-2470501,Hindi,0.61,0.65,55
ujjain,Ujjain,MP,23.1765,75.7885,Soybean,2.6,0734-2522359,Hindi,0.64,0.65,41
sehore,Sehore,MP,23.2032,77.0851,Soybean,2.8,07562-224561,Hindi,0.62,0.65,49
vidisha,Vidisha,MP,23.5251,77.8081,Wheat,2.0,07592-252145,Hindi,0.63,0.65,43
gwalior,Gwalior,MP,26.2183,78.1828,Wheat,1.8,0751-2467292,Hindi,0.58,0.65,62
jaipur,Jaipur,Rajasthan,26.9124,75.7873,Mustard,2.4,0141-2552909,Hindi,0.56,0.62,67
kota,Kota,Rajasthan,25.2138,75.8648,Soybean,2.3,0744-2471936,Hindi,0.60,0.65,58
sriganganagar,Sri Ganganagar,Rajasthan,29.9038,73.8772,Cotton,2.2,0154-2470190,Hindi,0.53,0.68,76
ajmer,Ajmer,Rajasthan,26.4499,74.6399,Wheat,1.7,0145-2671800,Hindi,0.61,0.65,51
bikaner,Bikaner,Rajasthan,28.0229,73.3119,Wheat,1.9,0151-2250017,Hindi,0.57,0.65,64
```
**Weather alerts (mock):** yavatmal HEATWAVE WARNING (41.8 °C), yavatmal DRY_SPELL WATCH, sriganganagar HEATWAVE SEVERE (45.2 °C), ludhiana HIGH_WIND WATCH (46 km/h), nashik HEAVY_RAIN WARNING (72 mm).

**Farmers** (all `isDemo:true`, phone `+9190000000NN` → masked `+91 90xxxx00NN`, consentSms true except FRM-0011; polygon = rectangle around a centroid offset `+0.012° lat, +0.015° lon` × index-dependent jitter from the district centre; build with `lib/geo.ts makeRectangle(centerLat, centerLon, areaHa, aspect=1.5, rotationDeg)`; registeredBy "Vikas More"):
| id | name | district | village | crop | areaHa | lang | boundary | scenario |
|---|---|---|---|---|---|---|---|---|
| FRM-0001 | Ramesh Pawar | yavatmal | Ner | Cotton | 1.20 | Marathi | WORKER_VERIFIED | stress HIGH, POSSIBLE_NUTRIENT, SHC-0001; CASE-0001 MONITORING day 8 |
| FRM-0002 | Sunita Jadhav | yavatmal | Darwha | Cotton | 0.80 | Marathi | WORKER_VERIFIED | CRITICAL WATER; CASE-0002 NEEDS_FIELD_SUPPORT (DETERIORATING), FST-0001 P1 OPEN |
| FRM-0003 | Vithal Kale | yavatmal | Pusad | Cotton | 0.30 | Marathi | UNVERIFIED | SMALL, LOW stress, reliability LOW |
| FRM-0004 | Anjali Thakre | akola | Telhara | Cotton | 1.60 | Marathi | WORKER_VERIFIED | CASE-0003 RECOVERING_PENDING_VERIFICATION |
| FRM-0005 | Gurpreet Singh | ludhiana | Jagraon | Wheat | 2.40 | Punjabi | WORKER_VERIFIED | LOW stress; SHC-0002 NEEDS_REVIEW |
| FRM-0006 | Harjit Kaur | bathinda | Rampura Phul | Cotton | 1.10 | Punjabi | WORKER_VERIFIED | CASE-0004 NOT_RECOVERING, reminderCount 1, MSG-0004 pending |
| FRM-0007 | Rajesh Yadav | meerut | Sardhana | Sugarcane | 0.90 | Hindi | WORKER_VERIFIED | CASE-0005 CLOSED |
| FRM-0008 | Kamla Devi | jhansi | Mauranipur | Wheat | 0.08 | Hindi | UNVERIFIED | TOO_SMALL, reliability INSUFFICIENT |
| FRM-0009 | Mohan Patidar | indore | Depalpur | Soybean | 1.80 | Hindi | WORKER_VERIFIED | HIGH, UNKNOWN; CASE-0006 DETECTED; MSG-0005 GENERATED |
| FRM-0010 | Lakshmi Meena | sriganganagar | Suratgarh | Cotton | 1.40 | Hindi | WORKER_VERIFIED | CASE-0007 INSUFFICIENT_DATA (clouds), FST-0002 P3 ASSIGNED to Sanjay Patil |
| FRM-0011 | Suresh Choudhary | jaipur | Chomu | Mustard | 0.45 | Hindi | DISPUTED | SMALL, consentSms false, reliability LOW |
| FRM-0012 | Priya Deshmukh | nashik | Niphad | Soybean | 2.10 | Marathi | WORKER_VERIFIED | LOW; SHC-0003 SMS_PENDING_APPROVAL (MSG-0003) |

Observations per farmer: every 5 days for the last 60 days (13 points), NDVI pattern by scenario (healthy ≈0.62–0.70; stressed drops to ≈0.45; recovering rises after advisory date; deteriorating keeps falling; cloudy → `usable:false`, `cloudPct` 70–95, ndvi null). NDWI ≈ NDVI − 0.35 (water stress: −0.5). Status `SIMULATED`.

**Soil cards:**
- SHC-0001 (FRM-0001, CONFIRMED, sample 2025-06-12, card MH-YVT-2025-04417): pH 8.1, EC 0.38, OC 0.42, N 196, P 14.2, K 312, S 8.5, Zn 0.48, Fe 6.1, Cu 0.9, Mn 4.2, B 0.62. Recs: Urea 260 kg/ha, DAP 108 kg/ha, Zinc Sulphate 25 kg/ha.
- SHC-0002 (FRM-0005, NEEDS_REVIEW, sample 2023-11-02, card PB-LDH-2023-11873, GEMINI_OCR): pH **72** (DECIMAL_SHIFT_SUSPECTED, suggestion 7.2), EC 0.52, OC 0.61, N 248, P **38 unit "kg/ha P2O5"** (UNIT_MISMATCH, suggestion 16.6), K 265, S 12.4, Zn 0.7 (ocrConfidence 0.62 → LOW_CONFIDENCE), Fe 5.2, Cu 0.6, Mn 3.8, B **null** (MISSING). ageFlag true. Recs: Urea 220, DAP 100, MOP 50 kg/ha.
- SHC-0003 (FRM-0012, SMS_PENDING_APPROVAL, sample 2026-03-20, card MH-NSK-2026-00981): pH 6.9, EC 0.21, OC 0.81, N 302, P 9.1, K 140, S 15, Zn 0.9, Fe 7.8, Cu 1.1, Mn 5.6, B 0.71. Recs: SSP 250, MOP 60 kg/ha.
Ratings/interpretations/conversions computed with `lib/soil.ts` (same rules as backend, §10.3).

**Messages:** MSG-0001 FARMER_ADVISORY FRM-0001 Marathi DELIVERED · MSG-0002 FARMER_ADVISORY FRM-0002 ACKNOWLEDGED (PHONE_CALL) · MSG-0003 SOIL_CARD FRM-0012 PENDING_APPROVAL (generatedBy Vikas More) · MSG-0004 FOLLOWUP_REMINDER FRM-0006 PENDING_APPROVAL (generatedBy Asha Kulkarni → Asha cannot approve, R. K. Sharma can) · MSG-0005 FARMER_ADVISORY FRM-0009 GENERATED · MSG-0006 DISTRICT_ADVISORY yavatmal Marathi SENT recipientCount 3 deliveryStats {sent 3, delivered 2, failed 0, acknowledged 1} · MSG-0007 FARMER_ADVISORY FRM-0010 FAILED · MSG-0008 FRM-0004 ACKNOWLEDGED · MSG-0009 FRM-0007 ACKNOWLEDGED · MSG-0010 FRM-0006 DELIVERED. Each has a realistic `statusHistory`. Provide real Marathi/Hindi/Punjabi `textLocal` strings (write natural translations; keep digits 0-9 Western).

**Audit:** ~40 events consistent with the above across all 7 layers.

### 9.2 Mock SMS translation
Mock `generate` builds `textEnglish` with the templates in §10.4 and `textLocal` from a small hand-written dictionary per language (fine if partly English); `translation.method='TEMPLATE'`.

### 9.3 State rules (frontend mock AND backend enforce these)
- Message: GENERATED →(submit) PENDING_APPROVAL →(approve) APPROVED →(send) QUEUED→SENT →(refresh-status) DELIVERED | FAILED →(acknowledge) ACKNOWLEDGED. REJECTED from PENDING_APPROVAL; editing a REJECTED message returns it to GENERATED. Edit only in GENERATED/REJECTED. Acknowledge allowed from SENT or DELIVERED. Send requires farmer consent (`CONSENT_MISSING`).
- Mock delivery: `refresh-status` on SENT → DELIVERED if ≥5 s since SENT.
- Case: DETECTED →(advisory submitted) ADVISORY_PENDING_APPROVAL →(sent) MONITORING → follow-up outcome mapping (§10.5) → CLOSED only via close endpoint when latest verification is CONFIRMED_RECOVERED or a task visit has `recommendClose`. REOPENED from CLOSED.
- Soil card confirm blocked while any `flags[].blocking` is true or any param `confirmed=false` (`BLOCKING_FLAGS`).

---

## 10. Domain logic the UI displays (implement in `lib/`)
### 10.1 `lib/sms.ts`
- `encoding`: GSM7 if every char is in the GSM-7 basic set, else UCS2.
- `segments`: GSM7 → ≤160 → 1 else ceil(n/153); UCS2 → ≤70 → 1 else ceil(n/67). Count characters with `[...text].length`.
- `numbersPreserved(en, local)`: every `/\d+(\.\d+)?/g` token in `en` appears in `local`.

### 10.2 `lib/geo.ts`
- `areaHa(polygon)`: equirectangular projection around the centroid (x = lon·111320·cos(lat₀), y = lat·110540), shoelace, m² / 10000, 2 dp.
- `sizeClass(areaHa)`: <0.1 TOO_SMALL, <0.5 SMALL, else ADEQUATE. `pixelCount10m = round(areaHa × 100)`.
- `makeRectangle(...)` for mocks; `centroid(polygon)`.

### 10.3 `lib/soil.ts` (display & mock; backend is authoritative)
| Param | Label | Unit | Plausible range | Rating rule |
|---|---|---|---|---|
| pH | Soil pH | – | 3.5–10.5 | <5.5 STRONGLY_ACIDIC · 5.5–6.5 MODERATELY_ACIDIC · 6.5–7.5 NEUTRAL · 7.5–8.5 MODERATELY_ALKALINE · >8.5 STRONGLY_ALKALINE |
| EC | Electrical conductivity | dS/m | 0–20 | <1 NORMAL · 1–3 CRITICAL · >3 INJURIOUS |
| OC | Organic carbon | % | 0.05–5 | <0.5 LOW · 0.5–0.75 MEDIUM · >0.75 HIGH |
| N | Available nitrogen | kg/ha | 50–1200 | <280 LOW · 280–560 MEDIUM · >560 HIGH |
| P | Available phosphorus | kg/ha | 1–200 | <10 LOW · 10–25 MEDIUM · >25 HIGH |
| K | Available potassium | kg/ha | 20–1500 | <108 LOW · 108–280 MEDIUM · >280 HIGH |
| S | Sulphur | ppm | 0.5–200 | <10 DEFICIENT else SUFFICIENT |
| Zn | Zinc | ppm | 0.05–50 | <0.6 DEFICIENT else SUFFICIENT |
| Fe | Iron | ppm | 0.5–200 | <4.5 DEFICIENT else SUFFICIENT |
| Cu | Copper | ppm | 0.05–50 | <0.2 DEFICIENT else SUFFICIENT |
| Mn | Manganese | ppm | 0.2–200 | <2 DEFICIENT else SUFFICIENT |
| B | Boron | ppm | 0.05–10 | <0.5 DEFICIENT else SUFFICIENT |
Fertilizer conversion: `kgPerAcre = kgPerHa / 2.4711` (1 dp); bag sizes Urea 45, DAP 50, MOP 50, SSP 50, NPK_10_26_26 50, Zinc_Sulphate/Other → null; `bagsPerAcre = round((kgPerAcre/bag)*2)/2`; farm acres = areaHa × 2.4711; `kgForFarm = kgPerAcre × acres` (0 dp); `bagsForFarm = round((kgForFarm/bag)*2)/2`. If bagsPerAcre is 0 but kg > 0 show "less than ½ bag (X kg)". Unit converter: P→P₂O₅ ×2.2914; K→K₂O ×1.2046; ppm→kg/ha ×2.24; kg/acre→kg/ha ×2.4711; µS/cm→dS/m ÷1000.
Example to verify UI: SHC-0001 on 1.20 ha → Urea 105.2 kg/acre = **2.5 bags/acre**, farm 312 kg = **7 bags**; DAP 43.7 kg/acre = **1 bag/acre**, farm 130 kg = **2.5 bags**; Zinc Sulphate 10.1 kg/acre (no bag).

### 10.4 SMS English templates (mock uses these; backend uses the same)
- FARMER_ADVISORY WATER: `{name}, satellite shows possible water stress in your {crop} field at {village}. If soil is dry, irrigate when power or canal water is available. Do not spray without KVK advice. KVK: {kvk}. -Agri Dept {district}`
- FARMER_ADVISORY POSSIBLE_NUTRIENT: `{name}, satellite shows weak growth in your {crop} field. Your Soil Health Card shows low {lowList}. Card advice per acre: {recList}. Confirm with KVK {kvk} before applying. -Agri Dept {district}`
- FARMER_ADVISORY MIXED/UNKNOWN: `{name}, satellite shows stress in your {crop} field at {village}. An extension worker will contact you. Do not spray chemicals without KVK advice. KVK: {kvk}. -Agri Dept {district}`
- DISTRICT_ADVISORY: `{district}: {crop} crop stress risk is {riskLevel}. {smsAction} Weather: {topAlertOrNone}. KVK: {kvk}. -Agri Dept`
  smsAction: CRITICAL/HIGH `Inspect your field today; irrigate if soil is dry; do not spray without KVK advice.` · MEDIUM `Check your crop closely this week.` · LOW `No action needed now.`
- FOLLOWUP_REMINDER: `Reminder: your {crop} field still shows stress since our message on {date}. Please inspect it and call KVK {kvk}. Reply 1 if you have taken action. -Agri Dept`
- SOIL_CARD: `Soil Health Card {cardNumber} ({sampleDate}): {ratingList}. Card advice per acre: {recList}. Ask KVK {kvk} before applying. -Agri Dept {district}` — ratingList lists only LOW/DEFICIENT/acidic/alkaline/CRITICAL/INJURIOUS params, e.g. `Nitrogen LOW, Sulphur DEFICIENT, Zinc DEFICIENT`; recList e.g. `Urea 2.5 bags (45kg), DAP 1 bag (50kg), Zinc Sulphate 10.1 kg`.

### 10.5 Follow-up outcome → case status (display text)
RECOVERING → RECOVERING_PENDING_VERIFICATION ("Recovering — needs human verification before closing") · NOT_RECOVERING → reminder #1 drafted, or NEEDS_FIELD_SUPPORT if reminderCount ≥ 1 · DETERIORATING → NEEDS_FIELD_SUPPORT (P1) · INSUFFICIENT_DATA → INSUFFICIENT_DATA (+ P3 task after extension). Thresholds shown in a rules box: Δ ≥ +0.05 or slope > +0.003/day = recovering; Δ ≤ −0.05 or slope < −0.003/day = deteriorating; otherwise not recovering; needs ≥2 usable post-advisory observations after day 5.

---

## 11. Shared components (behaviour)
- `Card` (`fp-card p-5`), optional `eyebrow`, `title`, `actions`. `PageHeader` (eyebrow + h1 + description + right actions).
- `Button` variants `primary|accent|ghost|danger`, sizes `sm|md`, `loading` (spinner via `Loader2` spin).
- `Badge` tones `neutral|primary|accent|success|warning|danger|info`. `RiskBadge(level)` uses `bg-risk-*/15 text-risk-*` + dot. `DataBadge(status)`: LIVE success, CACHED info, SIMULATED warning (striped background `repeating-linear-gradient`), MANUAL accent; tooltip with source/observedAt. `ScaleBadge(scale)`: "District · MODIS 250 m" (`Globe` icon) / "Field · Sentinel-2 10 m" (`Crosshair` icon).
- `KpiCard`: eyebrow label, `.fp-kpi-value fp-num` value, delta/footnote, icon. Haryali variant shows a tiny sparkline (Recharts `LineChart` 80×28) if `trend` prop given.
- `Table`: sortable headers (`ArrowUpDown`), sticky header, row hover `bg-surface-2`, empty state slot, client-side pagination 20/page.
- `Drawer` (right, 560px), `Modal` (centered, max 640px), both trap focus & close on Esc.
- `EmptyState` (icon, title, hint, action), `Skeleton` (pulsing `bg-surface-2`), `ErrorState` (message + Retry).
- `RiskGauge`: SVG semicircle 0–100 with 4 coloured arcs (risk vars), needle, score in `fp-kpi-value`.
- `ReasoningChain`: vertical timeline; node icon by status (OK `CheckCircle2` success, WARN `AlertTriangle` warning, ABSTAIN `CircleSlash` ink-muted); shows agent, title, detail, evidence DataBadges.
- `DistrictMap`: react-leaflet, centre [23.5, 78.5], zoom 5, tiles light `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`, dark `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` (attribution "© OpenStreetMap © CARTO"). Layers (toggle chips top-left): **Risk** (CircleMarker radius = 8 + acreageLakh×3, fill risk colour, opacity .75), **NDVI anomaly** (fill by anomaly ramp: ≤−20% ndvi-0, −20..−10 ndvi-1, −10..−3 ndvi-2, −3..+3 ndvi-3, >+3 ndvi-4), **Weather alerts** (divIcon with lucide icon: HEAVY_RAIN `CloudRain`, HEATWAVE `ThermometerSun`, COLD_WAVE `Snowflake`, HIGH_WIND `Wind`, DRY_SPELL `Sun`; ring colour by severity WATCH warning / WARNING risk-high / SEVERE danger), **Farmers** (small dots, visible only zoom ≥ 8). Popup: district, risk, NDVI, alerts, "Open report" link. Legend bottom-right. ScaleBadge top-right. `flyTo(districtId)` via ref.
- `FieldMap`: tiles Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (attribution "Tiles © Esri"), fit to polygon, polygon stroke by boundaryStatus (VERIFIED success solid, UNVERIFIED warning dashed, DISPUTED danger dashed), fill by stress risk colour .25. Overlay chips: boundary status, area ha / acres, pixel count, ScaleBadge FIELD.
- `BoundaryEditor`: inside FieldMap; "Redraw" → clicks add vertices (Polyline preview), "Finish" (≥3 points) closes ring, live area & size class; then "Mark verified" / "Mark disputed" (note required) → `verifyBoundary`.
- `NdviTrendChart`: Recharts ComposedChart; NDVI line primary, NDWI line info, baseline ReferenceLine dashed ink-muted, unusable observations as hollow dots at y=0.1 with "cloud" tooltip, cloudPct as light bars on right axis (0–100). Optional `advisoryDate` ReferenceLine accent labelled "Advisory sent".
- `FollowUpChart`: same + band ReferenceArea baseline±0.05, x axis "Day 0…21".
- `WeatherStrip`: 5 cards (date, icon, tMax/tMin, rain mm & prob, wind, ET₀).
- `SmsPreview`: phone-style bubble (surface-2, rounded-card), `font-regional` for local text, footer: language, chars, segments, encoding, numbers check (✓ success / ✗ danger "Numbers changed in translation — blocked"), toggle "Show English". Never show full phone numbers.
- `MessageStepper`: GENERATED → PENDING_APPROVAL → APPROVED → SENT → DELIVERED → ACKNOWLEDGED; REJECTED/FAILED shown as red branch; each step shows time + actor from history; caption: "Sent ≠ delivered ≠ acknowledged. Only farmer acknowledgement counts as reached."
- `SoilParamTable`: rows for 12 params: label, value input (`fp-input fp-num`), unit select, rating badge, OCR confidence bar (red <0.8), flags (each flag chip; DECIMAL_SHIFT/UNIT_MISMATCH show "Apply {suggestion}" button), "Confirm" checkbox; MISSING row has "Acknowledge missing" checkbox. Read-only mode for confirmed cards.
- `FertilizerTable`: product, card dose + unit, kg/ha, kg/acre, bag size, bags/acre, bags for farm, timing, source text (italic); caption "Converted from the card's own recommendation. No new doses are created."
- `UnitConverter`: popover with from/to selects for the conversions in §10.3.
- `AgentStatusPanel`: 4 agent rows with status chip (IDLE/RUNNING spinner/COMPLETE/ERROR) + scrolling log (mono, 12px) of AgentEvents.
- `AuditTimeline`: list with layer icon/colour: DATA_PROVENANCE `Database` info · ANALYSIS `Brain` primary · HUMAN_VERIFICATION `UserCheck` success · APPROVAL `Stamp` accent · OUTREACH `Send` warning · FIELD_ACTION `Tractor` risk-high · OUTCOME `Flag` ink. Each row: time (date-fns `d MMM, HH:mm`), actor + role, summary, SIMULATED badge if `isSimulated`, hash first 10 chars mono.
- `OutreachFunnel`: horizontal bars Generated → Pending → Approved → Sent → Delivered → Acknowledged (+ Failed/Rejected small), percentages relative to Generated.
- `ReliabilityPanel`: big reliability chip + reasons list + small-field explainer: "Sentinel-2 pixels are 10 m × 10 m. This field covers ~{pixelCount} pixels; fields under 0.5 ha (<50 pixels) mix with neighbouring land, and under 0.1 ha cannot be monitored by satellite."
- `RolesPanel`: 4 cards (Agriculture Department, Extension Worker, KVK, Local Representative) with responsibilities list & contact.
- `InstitutionalBriefing`: headline, summary, actions list, insurance signal (claim probability %, affected acreage %) with note "Indicative signal only — not a claim decision", buttons Copy text & Print.

---

## 12. Pages (what each must contain)
All pages: `PageHeader`, loading skeletons, empty and error states, DataBadges on data.

1. **Landing `/`** — full-screen concept backdrop; left: eyebrow "Agriculture & Rural Development", H1 "FarmPulse 360", sub "From satellite warning to farmer SMS to verified recovery — every step accountable."; 3 feature tiles (Early warning `Satellite`, Soil Health Card `FlaskConical`, Follow-up `Activity`). Right: "Continue as" — 5 persona cards (name, role, one-line duty); click → set persona → `/overview`. Footer link "Compare design concepts → /design-lab". Small honesty note: "Demo build. Farmer records are synthetic."
2. **Overview `/overview`** — KPI row (8 KpiCards from `OverviewResponse.kpis`; label acknowledged rate as "Acknowledged / sent"); "Run priority scan" button (scan.run) → `AgentStatusPanel` with SSE, then refresh data; mini `DistrictMap` (Risk layer only, 320px high); Top 5 risk districts list (RiskBadge, link); `OutreachFunnel`; follow-up outcomes donut (Recharts PieChart, colours: pending ink-muted, recovering success, not recovering warning, deteriorating danger, insufficient info); weather alerts list; recent audit events (`AuditTimeline` compact, 10). Layout: 12-col grid.
3. **Early Warning `/early-warning`** — top: filters (search, state, risk level, crop) + layer chips. Main: `DistrictMap` (60vh) left 8 cols; right 4 cols "Selected district" card (risk gauge mini, NDVI vs baseline, alerts, farmers count, "Open report"). Below: **Monitored districts table** (default sort risk desc — this is the leaderboard): Rank, District, State, Crop, NDVI, Baseline, Anomaly % (coloured), Risk (bar + number), Level, Weather alerts (icons), Farmers, Freshness (days), Data. Row click → select + flyTo; double-click/“Report” → `/districts/:id`. State summary strip (avg risk per state as small bars).
4. **District Report `/districts/:id`** — header: district, state, crop, stage, days to harvest, DataBadge, "Refresh" (refresh=true), "Generate district advisory" (→ `/advisories?kind=DISTRICT_ADVISORY&districtId=`). Row: `RiskGauge` · Confidence % (ProgressBar) · Priority chip P1–P4 · Escalation banner (danger, reason) if escalate. Cards: Recommended action + root cause; Freshness panel (overall FRESH/AGING/STALE, NDVI age, weather age); `ReasoningChain`; Weather (observed values + `WeatherStrip` + `WeatherAlertList`); `InstitutionalBriefing`; `RolesPanel`; Registered farmers table (name, village, area, size class, boundary, stress, reliability, case status → link); warnings list; data sources list.
5. **Farmers `/farmers`** — filters (district, stress level, reliability, boundary status, search) + "Register farmer" (farmer.register). Table: ID, Name, Village, District, Crop, Area (ha), Size class, Boundary, Stress (RiskBadge + type), Reliability, Soil card (status/—), Case (status/—), Consent.
6. **Farmer New `/farmers/new`** — form left (name, phone, language, village, district select, crop select [Cotton, Wheat, Rice, Soybean, Sugarcane, Mustard], sowing date, consent checkbox with text "Farmer agreed to receive SMS from the Agriculture Department. They can stop anytime."), right `FieldMap` centred on chosen district with `BoundaryEditor` (required). Live area/size class/pixel count; warning if SMALL or TOO_SMALL. Submit → `/farmers/:id`.
7. **Farmer Detail `/farmers/:id`** — header (name, ID, DEMO badge, village, district link, crop, sowing date, area ha/acres, language, consent chip, masked phone) + actions: Analyze now, Generate farmer advisory (→ advisories prefilled), Add soil card. Grid: `FieldMap`+`BoundaryEditor` (6 cols) | Stress metric cards (NDVI latest/baseline/anomaly with baselineMethod, NDWI latest/change, Stress level, Stress type — always prefixed "Possible" for non-NONE) + `ReliabilityPanel` (6 cols). Full-width `NdviTrendChart`. `ReasoningChain` (field). Soil card summary card (low/deficient params chips, recommendation bags/acre, link) or EmptyState. Messages list with `MessageStepper` each. Follow-up mini panel (day x/21, outcome) linking `/follow-up?caseId=`. Audit events (`AuditTimeline` filtered).
8. **Soil Cards `/soil-cards`** — table: ID, Farmer, Card no., Sample date, Age (years, flag icon if ageFlag "Older than 2 years — proposed local re-test flag"), Method (OCR/Manual), Status, Flags count, Message status. Button "New soil card".
9. **Soil Card New `/soil-cards/new`** — 5-step wizard with stepper header: (1) Select farmer (searchable; prefill from query); (2) Upload image (drag & drop, jpg/png ≤ 8 MB, preview) → "Read card" (calls OCR) — or "Enter manually" (blank 12-row table); (3) Review: split view — image left (zoom with mouse wheel / buttons), right meta (card number, sample date, lab) + `SoilParamTable` + `UnitConverter` + `FertilizerTable` (editable rows: product select, label, dose, unit, timing, source text; add/remove row). Banner listing blocking flags count. "Save changes" (PATCH) and "Confirm card" (disabled until no blocking flags & all confirmed); (4) Interpretation: grouped cards — Soil reaction (pH, EC), Organic carbon, Primary nutrients (N, P, K), Secondary (S), Micronutrients (Zn, Fe, Cu, Mn, B) — each shows value, unit, range scale bar with marker, rating badge, interpretation text; plus "What the card recommends" (FertilizerTable read-only); (5) SMS: language select (default farmer language) → "Generate SMS" → `SmsPreview` → "Submit for department approval" (message.submit). Show notice: "This SMS will not be sent until an Agriculture Department officer approves it."
10. **Soil Card Detail `/soil-cards/:id`** — same sections read-only (or editable while NEEDS_REVIEW), linked farmer card, message stepper, audit events.
11. **Advisories `/advisories`** — Tabs: **Compose** | **All messages**. Compose: kind (District / Farmer / Follow-up reminder), target select (district or farmer or case), language (default target language) → "Generate" → editable English + local textareas (only when GENERATED/REJECTED; "Save edit"), `SmsPreview`, numbers check, "Submit for approval". District advisory shows "Will be sent to {n} consenting registered farmers in {district}". All messages: filters (status, kind, district), table (ID, kind, target, language, status chip, generated by, approved by, created) → `Drawer` with `MessageStepper`, texts, history, and role-gated actions: Submit, Approve, Reject, Send, Refresh status, Mark acknowledged (modal: method + note).
12. **Approvals `/approvals`** — header note "Nothing reaches a farmer without department approval." Queue of cards (oldest first): kind badge, target, generated by/at, English and local text side by side, for SOIL_CARD a compact soil summary + FertilizerTable + link to card. Actions: Approve (optional note) / Reject (reason required, modal). Disabled with separation-of-duties tooltip when actor = generatedBy. After approve show "Send now" button (message.send).
13. **Follow-up `/follow-up`** — explanation strip: "District-level analysis uses MODIS (250 m, 8-day). Follow-up watches each farmer's own field with Sentinel-2 (10 m, ~5-day revisit, cloud-dependent)." Outcome filter chips with counts. Table: Case, Farmer, District, Day x/21 (ProgressBar), Baseline, Latest, Δ NDVI (coloured), Slope (arrow icon), Outcome badge, Human verification needed (icon), Scale badge, Next check. Row → `Drawer`: `FollowUpChart`, observation list (date, NDVI, cloud %, usable), outcome + reason, rules box (§10.5), verifications list, actions: "Run check now", "Record verification" (modal: method, outcome, observation), "Close case" (case.close; disabled unless allowed, tooltip explains), "Reopen", and a **DEMO** box "Fast-forward" (days 5/10/21 + scenario) clearly labelled "Generates SIMULATED observations".
14. **Field Support `/field-support`** — header "Needs field support — the queue the department acts on". 4 columns (OPEN, ASSIGNED, VISITED, RESOLVED) of task cards: priority chip (P1 danger, P2 warning, P3 info), farmer + village + district, reason, due (relative; overdue = danger badge), assignee. Actions: Assign (modal: persona select filtered to KVK_EXPERT / LOCAL_REP), Record visit (modal: findings, action taken, recommend close checkbox), links to farmer & case. Toggle to table view.
15. **Audit `/audit`** — chain integrity card ("Verify chain" → valid ✓ / broken at #id ✗, event count), Export CSV button (opens `/api/audit/export.csv`; in mock mode generate CSV client-side), filters: layer chips (multi), case, farmer, district, text search; `AuditTimeline` full; side card "Consolidated report": case select → open `/audit/report/:caseId`; button "View illustrative report".
16. **Audit Report `/audit/report/:caseId`** — print-ready document: title "FarmPulse 360 — Farmer Action & Accountability Report", case id, generated at; if `isIllustrative` a diagonal watermark "ILLUSTRATIVE — SYNTHETIC DATA" (CSS, ink 6% opacity) and banner; 9 sections as numbered blocks with accountable role on the right and rows as 2-col tables with DataBadges; integrity footer (event count, chain valid, last hash). Buttons (no-print): Print, Back.
17. **Settings `/settings`** — persona switcher; theme mode; concept selector (3 cards with swatches) — hidden after choice unless `?dev=1`; data sources list (`/api/meta/data-sources`) with mode chips; API mode (mock/live) read-only from env; "Reset demo data" (mock mode only: reloads store).
18. **NotFound** — friendly empty state in concept style + link to overview.

---

## 13. DESIGN LAB `/design-lab` (the 3-way comparison — build exactly)
Purpose: compare the 3 concepts side by side, both modes, on every page.
- Top toolbar (sticky, neutral styling using the **current** concept): title "Design Lab — choose your concept"; **Page selector** (select with all routes; for param routes use `/districts/yavatmal`, `/farmers/FRM-0001`, `/soil-cards/SHC-0002`, `/audit/report/CASE-0002`, `/audit/report/illustrative`, `/soil-cards/new?farmerId=FRM-0005`); **Global mode** buttons (All light / All dark / Mixed); **Viewport** buttons (Desktop 1440×900, Tablet 834×1112, Mobile 390×844); "Sync scroll" toggle is NOT required.
- Body: 3 equal columns (stack vertically below 1200px). Each column:
  1. Concept header card styled in **that concept** (render the header inside a `<div data-concept=".." data-mode="..">` so its own tokens apply): name, tagline, fonts line, layout line, swatches for light & dark (primary, accent, bg, surface, ink, 4 risk colours), its own Light/Dark toggle.
  2. Preview frame: `<iframe src={`${route}${sep}concept=${key}&mode=${mode}&embed=1`}>` at the chosen viewport size, scaled to column width with `transform: scale(colWidth / viewportWidth)` and `transform-origin: top left` (measure with ResizeObserver); wrapper height = viewportHeight × scale; rounded-card border.
  3. Buttons: "Open full screen" (new tab, same URL without `embed`) and **"Choose this concept"** → `localStorage.setItem('fp.chosenConcept', key)` + `fp.concept`, toast "Chosen: {name}. Tell the coding assistant: 'Concept chosen: {key}'".
- Below the columns: a comparison table (rows: Mood, Primary, Accent, Background, Typography, Layout, Card style, Motion, Best for) for the three concepts.
- Embedded pages must work standalone (mock data in each iframe, persona p1).

---

## 14. Build phases (do in order; stop after each)
| Phase | Work | Done when |
|---|---|---|
| F0 | Scaffold §2, folders §3, eslint passes | `npm run dev` shows Vite page |
| F1 | Theme system §4 (all 3 concepts, both modes), `ThemeContext`, `ConceptBackdrop`, `useThemeColors`, persona/role §6 | A temp page shows tokens switching for all 6 combos |
| F2 | Contract §8 → `contract.ts`; mock data/store/handlers §9; `client.ts`, `sse.ts`; `lib/*` §10 with unit-like console checks of the SHC-0001 conversion numbers | Calling every client function in a temp page logs valid data |
| F3 | Layouts §5 + routes §7 + all UI components §11 (placeholders for pages) | Navigation works in all 3 concepts and both modes |
| F4 | Design Lab §13 | 3 columns render any route in iframes, per-column mode toggle works |
| F5 | Pages 1–4 (Landing, Overview, Early Warning, District Report) | Scan SSE animation works; map layers toggle |
| F6 | Pages 5–7 (Farmers, Farmer New, Farmer Detail) incl. boundary editor | Registering a farmer with a drawn polygon works in mock |
| F7 | Pages 8–10 (Soil cards) | SHC-0002 flags block confirm until fixed; SHC-0001 shows 2.5 bags/acre urea |
| F8 | Pages 11–12 (Advisories, Approvals) | Full lifecycle GENERATED→ACKNOWLEDGED works; separation-of-duties enforced |
| F9 | Pages 13–14 (Follow-up, Field Support) | Fast-forward DETERIORATING creates a P1 task visible in Field Support |
| F10 | Pages 15–18 (Audit, Report, Settings, NotFound) + print CSS | Report prints cleanly; illustrative watermark shows |
| F11 | Polish: responsive, focus states, keyboard nav, empty/error states, contrast check, no console errors; review every page in Design Lab × 3 concepts × 2 modes | User reviews Design Lab |
| **CHECKPOINT** | **User chooses a concept.** Then set default concept to the chosen key in `ThemeContext`, hide concept selector (except `?dev=1`), keep `/design-lab` route | User confirms |
| F12 (after backend exists) | Set `VITE_USE_MOCKS=false`; test every page against the API; fix only contract mismatches **in the backend's favour only if the backend matches §8**, otherwise report the mismatch to the user | All pages load real data |

## 15. Final acceptance checklist (print it with ✓/✗ at the end)
- [ ] 3 concepts × light/dark all render every page; no hard-coded colours; no blue/navy anywhere.
- [ ] Design Lab shows all 3 simultaneously with per-column mode toggle and page selector.
- [ ] Every data panel has DataBadge; district vs field ScaleBadge shown on maps/charts.
- [ ] Monitored-districts table sorted by risk is the single leaderboard.
- [ ] District report has score, confidence, priority, escalation, action, freshness, reasoning chain, briefing, roles, farmers, weather.
- [ ] Farmer field polygon + NDVI/NDWI trend + reliability + boundary verification + small-field explainer.
- [ ] SHC: 12 params, flags block confirmation, unit converter, bags/acre conversion, approval required before sending.
- [ ] Messages show generated/approved/sent/delivered/acknowledged distinctly.
- [ ] Follow-up never auto-closes; insufficient-data and human-verification states visible; field-support queue works.
- [ ] Audit timeline with 7 layers, chain verify, CSV, consolidated + illustrative report.
- [ ] `npm run build` and `npm run lint` pass with zero errors.
