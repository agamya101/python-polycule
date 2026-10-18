# KrishiMitra (FarmPulse 360)
> Autonomous Multi-Agent Crop Risk Intelligence, Remote Sensing & Closed-Loop Agricultural Governance Platform

KrishiMitra is an institutional-grade agricultural monitoring and advisory platform designed for state agriculture departments, Krishi Vigyan Kendra (KVK) agronomy experts, and field extension networks. It transitions agricultural governance from ungrounded broadcast advisories to an authentic, verified, closed-loop workflow: from satellite-detected macro-stress, down to 10 m parcel diagnostics, Soil Health Card OCR extraction, two-person department approval gates, 21-day satellite recovery tracking, and an immutable SHA-256 cryptographic audit trail.

---

## Table of Contents

- [Core Architectural Overview](#core-architectural-overview)
- [The 7-Layer Closed-Loop Governance Pipeline](#the-7-layer-closed-loop-governance-pipeline)
- [Remote Sensing & Upstream Telemetry Engines](#remote-sensing--upstream-telemetry-engines)
- [Multi-Agent Diagnostic Reasoning](#multi-agent-diagnostic-reasoning)
- [Soil Health Card OCR & Dosage Engine](#soil-health-card-ocr--dosage-engine)
- [Outbound Outreach & Two-Person Approval Gate](#outbound-outreach--two-person-approval-gate)
- [21-Day Post-Advisory Recovery & Ground Intervention](#21-day-post-advisory-recovery--ground-intervention)
- [Cryptographic SHA-256 Audit Trail](#cryptographic-sha-256-audit-trail)
- [Role-Based Access Control & Separation of Duties](#role-based-access-control--separation-of-duties)
- [Triple-Skin Cultural Design System](#triple-skin-cultural-design-system)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Local Quickstart & Installation](#local-quickstart--installation)
- [Verification & Test Suite](#verification--test-suite)
- [Team & Authors](#team--authors)

---

## Core Architectural Overview

KrishiMitra solves key structural weaknesses in conventional agricultural advisory systems:

1. **Uncalibrated Broad-Scale Warnings**: Traditional systems issue generic district-wide SMS blasts without verifying parcel boundaries or actual vegetation stress. KrishiMitra fuses macroscopic 250 m NASA MODIS anomaly detection with high-resolution 10 m ESA Copernicus Sentinel-2 multispectral parcel analysis.
2. **Hallucination & Unit Miscalculations**: Agricultural recommendations must never fabricate chemical dosages. KrishiMitra uses Google Gemini 1.5 Flash Vision with deterministic OCR safeguard rules that catch decimal shifts (e.g., pH 72 flagged and corrected to 7.2) and compute unit-safe conversions from laboratory kg/ha to farmer-practical bags/acre.
3. **Absence of Accountability & Reach Verification**: Message dispatch does not equal farmer reach. The system tracks the complete outreach lifecycle: `GENERATED` -> `PENDING_APPROVAL` -> `APPROVED` -> `SENT` -> `DELIVERED` -> `ACKNOWLEDGED`. Only explicit farmer acknowledgement registers as reached.
4. **Ungrounded Case Closure**: Cases do not auto-close when satellite indices rise. A mandatory human verification step (phone call, field visit, or SMS reply) is required before a case can be closed by an authorized department officer.
5. **Tamper-Evident Record Keeping**: Every observation, reasoning step, institutional sign-off, and field visit is sealed into an immutable SHA-256 cryptographic audit hash chain.

---

## The 7-Layer Closed-Loop Governance Pipeline

The frontend and backend coordinate across seven distinct operational governance layers:

```
[Layer 1: Command Center]
       |
       v
[Layer 2: District Early Warning]  <-- NASA MODIS 250 m + Open-Meteo Synoptic Forecast
       |
       v
[Layer 3: Parcel Diagnostics]      <-- Copernicus Sentinel-2 10 m (NDVI/NDWI)
       |
       v
[Layer 4: Soil Card Digitizer]     <-- Gemini 1.5 Flash OCR + ICAR Sanity Checks
       |
       v
[Layer 5: Bilingual Advisory]      <-- Regional SMS (Marathi, Hindi, Punjabi) with Numeric Gate
       |
       v
[Layer 6: Approval & Dispatch]     <-- Two-Person Rule & Separation of Duties
       |
       v
[Layer 7: 21-Day Recovery Watch]   <-- Post-Advisory Sentinel-2 Loop & Field Intervention Dispatch
       |
       v
[Cryptographic Audit Ledger]       <-- SHA-256 Hash Chain Across All Layers
```

### Layer 1: Department Command Center (`/overview`)
- High-level situational awareness across 25 monitored agricultural districts spanning 5 states (Maharashtra, Punjab, Uttar Pradesh, Madhya Pradesh, and Rajasthan).
- Live KPI monitoring: Districts Monitored, Critical Risk Districts, Active Weather Alerts, Registered Farmers, Pending Approvals, Open Monitoring Cases, and Needs Field Support count.
- Live trigger for the multi-agent priority scan orchestrator with real-time SSE progress reporting.

### Layer 2: Satellite Crop-Stress Early Warning (`/early-warning`, `/districts/:id`)
- Macro-level screening using NASA GIBS MODIS Terra MOD13Q1 250 m 8-day vegetation composites.
- District risk prioritization formula weighing NDVI anomaly (40%), rainfall deficit (25%), heat stress (15%), weather alerts (10%), and active case density (10%).
- Deep-dive district reports featuring composite risk gauges, 12-point MODIS NDVI time-series curves against 10-year historical baselines, Open-Meteo 5-day synoptic forecast strips, and institutional briefings.

### Layer 3: Field-Scale Registry & Sentinel-2 Parcel Diagnostics (`/farmers`, `/farmers/new`, `/farmers/:id`)
- Field-level polygon boundary drawing using Leaflet satellite tile overlays.
- Real-time geodesic area calculation (`hectares` and `acres`) and Sentinel-2 10 m pixel count validation (`pixelCount10m`), flagging plots below 0.10 ha as `TOO_SMALL` to avoid mixed-pixel errors.
- Bi-spectral parcel time-series (NDVI for green biomass, NDWI/NDMI for canopy moisture content) with automated cloud masking (cloud cover > 40% filtered out).
- Diagnostic stress attribution classifying root cause as `WATER`, `POSSIBLE_NUTRIENT`, `MIXED`, or `UNKNOWN`.

### Layer 4: Soil Health Card Reader & Safeguards (`/soil-cards`, `/soil-cards/new`, `/soil-cards/:id`)
- 5-step digitizer supporting both drag-and-drop Gemini 1.5 Flash Vision OCR and manual tabular input.
- Extraction of 12 standard ICAR soil parameters: Nitrogen (N), Phosphorus (P), Potassium (K), pH, Electrical Conductivity (EC), Organic Carbon (OC), Sulphur (S), Zinc (Zn), Iron (Fe), Copper (Cu), Manganese (Mn), and Boron (B).
- Algorithmic plausibility checks flagging `OUT_OF_RANGE`, `DECIMAL_SHIFT_SUSPECTED`, and `UNIT_MISMATCH`.
- Fertilizer bag conversion engine converting kg/ha lab advice into 50 kg or 45 kg commercial bags per acre and total bags required for the farmer's specific plot size.

### Layer 5: Advisory Composer & Multilingual Outreach (`/advisories`)
- Contextual advisory drafting in regional vernacular languages (Marathi, Hindi, Punjabi) with character budget management (GSM-7 vs. UCS-2 SMS segment calculation).
- Rain-deferral safeguard automatically warning officers to defer nitrogenous fertilizer top-dressing if 48-hour forecast rain exceeds 15 mm.
- Deterministic regex numeric preservation check verifying that all chemical doses, dates, and KVK telephone numbers match identically between the English text and regional script.

### Layer 6: Institutional Approval Gate & Separation of Duties (`/approvals`)
- Two-person rule enforcement: an officer cannot approve an advisory or Soil Health Card SMS that they drafted.
- Live dispatch integration via Twilio or mock gateway provider.
- Full delivery reach tracking distinguishing gateway transmission (`SENT`), handset delivery (`DELIVERED`), and verified farmer confirmation (`ACKNOWLEDGED`).

### Layer 7: 21-Day Satellite Follow-Up & Ground Intervention (`/follow-up`, `/field-support`)
- Post-advisory automated 21-day Sentinel-2 trajectory watch evaluating delta NDVI and recovery slope per day.
- Outcome categorization: `RECOVERING`, `NOT_RECOVERING`, `DETERIORATING`, or `INSUFFICIENT_DATA`.
- Mandatory human verification gate: even if satellite data shows positive recovery, cases cannot auto-close without an official verification via telephone, SMS reply, or field visit.
- Field Support Queue (`/field-support`): automated P1–P3 task dispatch sending KVK experts and extension workers to physically inspect deteriorating or cloud-occluded parcels.

---

## Remote Sensing & Upstream Telemetry Engines

KrishiMitra integrates with four upstream agrometeorological and satellite data providers:

1. **Copernicus Data Space Ecosystem (CDSE) Sentinel-2 L2A**:
   - Queries European Space Agency (ESA) Sentinel-2 multispectral passes via the CDSE Statistical API.
   - Computes parcel-boundary mean, standard deviation, and valid pixel counts across Band 4 (Red), Band 8 (NIR), and Band 11 (SWIR).
   - Generates normalized difference vegetation index ($\text{NDVI} = \frac{\text{B08} - \text{B04}}{\text{B08} + \text{B04}}$) and normalized difference moisture index ($\text{NDMI} = \frac{\text{B08} - \text{B11}}{\text{B08} + \text{B11}}$).

2. **NASA GIBS & ORNL DAAC MODIS Terra (MOD13Q1)**:
   - 250 m spatial resolution, 8-day composite vegetation indices.
   - Provides regional macro vegetation baselines and anomaly calculations across 25 agricultural districts.

3. **Open-Meteo High-Resolution Gridded Agrometeorology**:
   - Fetches hourly and daily synoptic surface weather at parcel coordinates.
   - Computes daily maximum/minimum temperature, precipitation sum, probability of precipitation, wind speed at 10 m, and reference evapotranspiration ($\text{ET}_0$) via FAO-56 Penman-Monteith methodology.

4. **NASA POWER Agroclimatology**:
   - Provides 7-day surface weather baseline observations, root-zone soil wetness index (`GWETROOT`), and thermal anomaly metrics.

---

## Multi-Agent Diagnostic Reasoning

The core intelligence layer runs an asynchronous multi-agent diagnostic pipeline:

- **Satellite Scout Agent**: Evaluates optical pass validity, cloud occlusion percentages, pixel counts against physical sensor resolution limits, and computes vegetation/moisture trajectory anomalies.
- **Weather Watch Agent**: Detects heatwaves, dry spells, unseasonal rainfall, and high wind risks using synoptic threshold rules.
- **Crop Risk Analyst Agent**: Synthesizes remote sensing data, crop phenological stages, and weather anomalies to calculate weighted composite risk scores and formulate root-cause explanations.
- **Field Monitor Agent**: Tracks post-advisory parcel trajectories, flags cases exceeding the 21-day window without improvement, and creates prioritized tasks for ground extension teams.

---

## Soil Health Card OCR & Dosage Engine

The Soil Health Card digitizer extracts, verifies, and converts chemical parameters:

### Deterministic Safeguards
- **Decimal Shift Detection**: Laboratory cards frequently print values with faint or missing decimal points (e.g., pH `72` instead of `7.2`, or Electrical Conductivity `18` instead of `1.8`). The engine detects out-of-range values against ICAR agronomical bounds and provides single-click divisor corrections.
- **Unit Mismatch Guard**: Flags when micronutrients printed in parts per million (ppm or mg/kg) are erroneously recorded as kg/ha.
- **Card Expiration Warning**: Highlights Soil Health Cards older than 3 years with an agronomic staleness warning.

### Commercial Fertilizer Conversion
Laboratory recommendations in kg/ha of pure nutrients (N, P, K) are converted into commercial fertilizer products commonly available in Indian cooperative societies:
- **Urea** (46% N) — standard 45 kg bag
- **DAP** (18% N, 46% $P_2O_5$) — standard 50 kg bag
- **MOP** (60% $K_2O$) — standard 50 kg bag
- **NPK 10:26:26** and **SSP** (Single Super Phosphate)
- Converts dosage to exact `bags/acre` rounded to the nearest half-bag, and calculates total bags required for the farmer's registered parcel acreage.

---

## Outbound Outreach & Two-Person Approval Gate

To maintain institutional trust and prevent ungrounded AI dissemination:

1. **Numeric Integrity Verifier**:
   - Extracts all numbers (`/\d+(?:\.\d+)?/g`) from the draft English advisory and the regional translation (Marathi, Devanagari numerals, Gurmukhi numerals, or Arabic numerals).
   - Blocks submission if a dosage, contact number, or calendar date was altered or dropped during LLM translation.
2. **Separation of Duties (Two-Person Rule)**:
   - Enforced cryptographically at both frontend and backend layers.
   - If an Agriculture Department Officer drafts an advisory, the system prevents that same officer from approving it (`403 SEPARATION_OF_DUTIES`). A second officer must review and sign off.
3. **SMS Encoding & Segment Calculation**:
   - Automatically detects GSM-7 vs. UCS-2 character sets.
   - Displays character counts and multi-part SMS concatenation costs (160/153 characters for GSM-7; 70/67 characters for regional unicode UCS-2).

---

## 21-Day Post-Advisory Recovery & Ground Intervention

Advisories initiate a closed monitoring loop:

1. **Baseline Ingestion**: At advisory dispatch, the parcel's baseline NDVI, sowing date, and crop stage are locked into an active `Case`.
2. **Satellite Surveillance Window**: Subsequent Sentinel-2 passes over 21 days are evaluated for positive recovery slope ($\Delta \text{NDVI} \ge +0.05$).
3. **Human Verification Gate**: When recovery is detected, the case transitions to `RECOVERING_PENDING_VERIFICATION`. An extension worker or officer must confirm recovery through farmer contact before the case can be formally closed.
4. **Ground Support Escalation**: Parcels flagged as `DETERIORATING` or hampered by persistent cloud cover (`INSUFFICIENT_DATA`) trigger prioritized Field Support Tasks (`P1`, `P2`, `P3`) dispatched to local KVK agronomists.

---

## Cryptographic SHA-256 Audit Trail

All system activities are recorded in a tamper-evident audit ledger:

- **Hash Formula**:
  $$\text{hash} = \text{SHA-256}(\text{prevHash} \parallel \text{layer} \parallel \text{action} \parallel \text{actor} \parallel \text{entityId} \parallel \text{summary})[:16]$$
- **Audit Layers**:
  - `DATA_PROVENANCE`: Upstream satellite pass ingestion and weather observations.
  - `ANALYSIS`: Multi-agent diagnostic scoring and stress attributions.
  - `HUMAN_VERIFICATION`: Ground boundary checks, telephone calls, and farmer replies.
  - `APPROVAL`: Officer approvals, rejections, and separation-of-duties sign-offs.
  - `OUTREACH`: Advisory generation, gateway dispatch, and acknowledgement events.
  - `FIELD_ACTION`: KVK field visit logs, soil sampling, and physical observations.
  - `OUTCOME`: Case closures, re-openings, and 21-day trajectory evaluations.
- **Cryptographic Verification**:
  - Built-in verification endpoint (`GET /api/audit/verify-chain`) verifies mathematical integrity across all sequential events and detects broken links.
  - Supports CSV audit export and printable official case dossiers (`/audit/report/:caseId`).

---

## Role-Based Access Control & Separation of Duties

The system defines four distinct institutional personas:

| Role Identifier | Role Title | Core Responsibilities | Key Permissions |
|---|---|---|---|
| `DEPT_OFFICER` | Agriculture Department Officer | Institutional oversight, advisory approvals, case closure sign-off | `message.approve`, `message.send`, `case.close`, `task.assign`, `scan.run` |
| `EXTENSION_WORKER` | Block Extension Worker | Ground farmer registration, boundary polygon drawing, delivery acknowledgments | `farmer.register`, `boundary.verify`, `soil.create`, `message.acknowledge` |
| `KVK_EXPERT` | KVK Agronomist | Crop diagnosis, technical fertilizer reviews, complex field inspection visits | `farmer.analyze`, `soil.confirm`, `task.visit`, `case.verify` |
| `LOCAL_REP` | Village Representative | Local farmer contact, SMS delivery verification, feedback logging | `message.acknowledge`, `task.visit`, `case.verify` |

---

## Triple-Skin Cultural Design System

KrishiMitra includes a custom triple-skin design system tailored for government departments and field workers:

1. **Mitti Almanac**:
   - Palette: Terracotta, dark clay soil, and olive accents (`--fp-primary: #B4532A`, `--fp-accent: #6B7F2A`).
   - Typography: Fraunces serif display, Work Sans body, IBM Plex Mono tabular numbers.
   - Aesthetic: Traditional agricultural almanac with ruled lines, small-caps headers, and tactile contrast.
2. **Haryali Canopy**:
   - Palette: Deep forest green, chlorophyll mint, and lime accents (`--fp-primary: #1E6B3C`, `--fp-accent: #7FB800`).
   - Typography: Space Grotesk display, IBM Plex Sans body, JetBrains Mono data.
   - Aesthetic: Satellite mission control with glass-morphic panels, contour line overlays, and real-time pulse indicators.
3. **Sarson Sunrise**:
   - Palette: Mustard yellow, warm gold, and aubergine (`--fp-primary: #5B2A72`, `--fp-accent: #F2A900`).
   - Typography: Baloo 2 display, Nunito body, DM Mono numbers.
   - Aesthetic: Warm, accessible, village-first layout with rounded cards, rolling hill SVGs, and high readability.

---

## Project Structure

```
python-polycule/
├── backend/
│   ├── app/
│   │   ├── api/               # FastAPI route controllers
│   │   │   ├── demo.py        # Demo fast-forward and scenario triggers
│   │   │   ├── followups.py   # 21-day follow-up evaluation endpoints
│   │   │   ├── frontend_bridge.py # Comprehensive frontend bridge router
│   │   │   ├── health.py      # Health and data source status checks
│   │   │   ├── inspections.py # Field support tasks and visit outcome logging
│   │   │   ├── interventions.py # Advisory drafting, approvals, and dispatch
│   │   │   ├── pilot.py       # Pilot district benchmarks and cell metrics
│   │   │   ├── registry.py    # Farmer and parcel management
│   │   │   ├── risk.py        # Crop risk analysis and multi-agent scan
│   │   │   ├── satellite.py   # Sentinel-2 & MODIS observation routes
│   │   │   ├── soil.py        # Soil Health Card OCR and dosage routes
│   │   │   └── weather.py     # Weather observations and forecast routes
│   │   ├── ml/                # Machine learning models and evaluation artifacts
│   │   ├── models/            # SQLAlchemy database models
│   │   ├── pilot/             # Pilot district configurations and cropland masks
│   │   ├── providers/         # Live API clients (Copernicus CDSE, Open-Meteo, MODIS)
│   │   ├── rules/             # Deterministic agronomic and safeguard rules
│   │   ├── schemas/           # Pydantic v2 data contracts and validation schemas
│   │   ├── services/          # Multi-agent orchestrator, Gemini OCR & translation
│   │   ├── utils/             # Geodesic math, normalization, and provenance helpers
│   │   ├── config.py          # Application settings and environment management
│   │   ├── database.py        # Database engine and session management
│   │   └── main.py            # FastAPI entry point with CORS and error handlers
│   ├── data/                  # Cropland masks, seed fixtures, and demo datasets
│   ├── tests/                 # Comprehensive Pytest test suite (115 passing tests)
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Backend environment template
│   └── pytest.ini             # Test runner configuration
│
├── frontend/
│   ├── src/
│   │   ├── api/               # Typed API client, contract schemas, and SSE handlers
│   │   ├── auth/              # Role context, persona definitions, and permission matrix
│   │   ├── components/        # Reusable UI widgets and domain components
│   │   │   ├── domain/        # Maps, charts, risk gauges, audit timeline, SMS preview
│   │   │   ├── layout/        # Mitti, Haryali, and Sarson layouts, topbar, navigation
│   │   │   └── ui/            # Buttons, cards, badges, modal, drawer, inputs
│   │   ├── lib/               # Formatting, geodesic calculations, SMS & soil utilities
│   │   ├── mocks/             # In-memory mock store and seed data for offline use
│   │   ├── pages/             # All 18 feature screens (Overview, Early Warning, etc.)
│   │   ├── theme/             # Design concepts, CSS variables, and theme provider
│   │   ├── App.tsx            # Application routing configuration
│   │   ├── index.css          # Tailwind CSS directives and token mappings
│   │   └── main.tsx           # React DOM client entrypoint
│   ├── package.json           # Frontend dependencies
│   ├── vite.config.ts         # Vite bundler configuration
│   └── tsconfig.json          # TypeScript compiler options
│
├── docs/                      # Technical specifications and architecture guides
└── README.md                  # Comprehensive root documentation (this file)
```

---

## API Reference

### Core Endpoints Summary

| Method | Path | Description | Access Role |
|---|---|---|---|
| `GET` | `/health` | Server status and provider connectivity check | Public |
| `GET` | `/api/meta/data-sources` | Status of upstream satellite, weather, and AI providers | Public |
| `GET` | `/api/overview` | Aggregated command center KPIs, funnel stats, and alerts | All |
| `GET` | `/api/districts` | 25-district risk leaderboard with MODIS anomalies | All |
| `GET` | `/api/districts/{id}/report` | Deep-dive district agrometeorological diagnostic report | All |
| `POST` | `/api/districts/scan` | Trigger multi-agent priority scan across all districts | `DEPT_OFFICER` |
| `GET` | `/api/farmers` | List registered farmers with parcel details and filters | All |
| `POST` | `/api/farmers` | Register farmer and store field parcel polygon | `EXTENSION_WORKER`, `KVK_EXPERT` |
| `GET` | `/api/farmers/{id}` | Detailed farmer record, Sentinel-2 passes, and linked cards | All |
| `POST` | `/api/farmers/{id}/analyze` | Execute live Sentinel-2 multispectral pass analysis | All |
| `POST` | `/api/farmers/{id}/boundary/verify` | Verify or dispute parcel boundary polygon | `EXTENSION_WORKER`, `KVK_EXPERT` |
| `GET` | `/api/soil-cards` | List all digitized Soil Health Cards | All |
| `POST` | `/api/soil-cards/ocr` | Upload photo for Gemini 1.5 Flash Vision OCR extraction | `EXTENSION_WORKER`, `KVK_EXPERT` |
| `POST` | `/api/soil-cards/manual` | Manually enter 12 ICAR soil parameters | `EXTENSION_WORKER`, `KVK_EXPERT` |
| `PATCH` | `/api/soil-cards/{id}` | Correct or confirm flagged soil parameters | `EXTENSION_WORKER`, `KVK_EXPERT` |
| `POST` | `/api/soil-cards/{id}/confirm` | Confirm card parameters after resolving blocking flags | `KVK_EXPERT` |
| `POST` | `/api/advisories/generate` | Generate contextual advisory SMS in regional language | `DEPT_OFFICER`, `EXTENSION_WORKER`, `KVK_EXPERT` |
| `GET` | `/api/messages` | List outbound advisories with status filtering | All |
| `POST` | `/api/messages/{id}/approve` | Approve draft message (enforces separation of duties) | `DEPT_OFFICER` |
| `POST` | `/api/messages/{id}/reject` | Reject draft message with explanation | `DEPT_OFFICER` |
| `POST` | `/api/messages/{id}/send` | Dispatch approved message via SMS gateway | `DEPT_OFFICER` |
| `POST` | `/api/messages/{id}/acknowledge` | Log farmer acknowledgment (SMS reply, call, visit) | All |
| `GET` | `/api/follow-ups` | List active 21-day post-advisory monitoring cases | All |
| `POST` | `/api/cases/{id}/verify` | Submit human verification of crop recovery | All |
| `POST` | `/api/cases/{id}/close` | Formally close case (must differ from verifier) | `DEPT_OFFICER` |
| `GET` | `/api/field-support` | List escalated field inspection tasks | All |
| `POST` | `/api/field-support/{id}/assign` | Assign extension worker or agronomist to task | `DEPT_OFFICER` |
| `POST` | `/api/field-support/{id}/visit` | Log on-ground physical visit findings and actions | `KVK_EXPERT`, `LOCAL_REP` |
| `GET` | `/api/audit` | Query cryptographic audit trail by layer or entity | All |
| `GET` | `/api/audit/verify-chain` | Verify cryptographic SHA-256 chain integrity | All |
| `GET` | `/api/audit/export.csv` | Download full audit ledger as CSV | All |
| `GET` | `/api/reports/case/{id}` | Generate official printable government dossier | All |

---

## Local Quickstart & Installation

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** and **npm**

---

### 1. Backend Setup

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Environment Configuration:
   The repository includes pre-configured environment credentials in `backend/.env` with active Copernicus Data Space Ecosystem (CDSE) client credentials and Google Gemini API keys. To configure custom credentials, copy the template:
   ```bash
   cp .env.example .env
   ```

5. Start the FastAPI application server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   - API Server: `http://127.0.0.1:8000`
   - Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

1. Open a second terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Environment Configuration:
   Verify that `frontend/.env` contains:
   ```env
   VITE_USE_MOCKS=false
   VITE_API_BASE=http://127.0.0.1:8000
   ```
   *(Set `VITE_USE_MOCKS=true` if running offline without the Python backend).*

4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   - Web Application: `http://localhost:5173`

---

## Verification & Test Suite

### Backend Test Suite
The backend includes a comprehensive Pytest test suite covering risk scoring, satellite queries, weather normalization, soil safeguards, and evidence validation:

```bash
cd backend
pytest -v
```
**Test Results**: 115 passed tests across all test modules.

### Frontend Compilation & Quality Checks
Run TypeScript type-checking and production bundling:

```bash
cd frontend
npm run build
```
**Build Output**: Zero TypeScript errors; production bundle created in `dist/`.

---

## Team & Authors

- **Hardik Khurana**
- **Aryan Kumar**
- **Arihant Kapkoti**
- **Divisha Agarwal**
- **Agamya Jain**

- **Hardik Khurana**
- **Aryan Kumar**
- **Arihant Kapkoti**
- **Divisha Agarwal**
- **Agamya Jain**

