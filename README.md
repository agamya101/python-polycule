# KrishiMitra (FarmPulse360) 🌾🛰️
> **Autonomous Multi-Agent Crop Risk Intelligence, Remote Sensing & Early Warning System**

KrishiMitra combines **Copernicus Sentinel-2 (10 m)** multispectral imagery, **NASA GIBS MODIS (250 m)** vegetation composites, **Open-Meteo High-Resolution Gridded Agrometeorology**, and **Google Gemini Flash AI** to provide continuous, authentic crop risk monitoring, automated Soil Health Card OCR diagnostics, and hyper-local vernacular advisories for smallholder farmers and agriculture department officials.

---

## 🏛️ Architecture & Project Structure

The project is structured as a monorepo containing the FastAPI Python backend and the React Vite web frontend:

```
python-polycule/
├── backend/                   # FastAPI Python Agrometeorological & Remote Sensing Server
│   ├── app/
│   │   ├── api/               # API Routers & Frontend Bridge Endpoints
│   │   ├── clients/           # Copernicus CDSE, Open-Meteo, & NASA GIBS API Clients
│   │   ├── services/          # Multi-Agent Orchestrator, Gemini Flash Translation & OCR
│   │   └── models/            # Pydantic Schemas & Data Contracts
│   ├── data/                  # Cropland masks, field fixtures & seed datasets
│   ├── tests/                 # Comprehensive Pytest Verification Suite (115 passing tests)
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Environment template (Copernicus & Gemini keys)
│   └── README.md
├── frontend/                  # React 19 + TypeScript + Vite + Tailwind CSS Web Application
│   ├── src/
│   │   ├── api/               # Typed client & API contracts
│   │   ├── components/        # UI components & domain visualizations (RiskGauge, Maps, etc.)
│   │   ├── pages/             # District Reports, Early Warning, Farmers, Soil Cards, Overview
│   │   └── theme/             # Triple-skin design system (Mitti, Haryali, Sarson)
│   ├── package.json           # Frontend dependencies
│   ├── .env.example           # Frontend environment configuration
│   └── README.md
├── docs/                      # Technical specifications & implementation guides
└── README.md                  # Root documentation (this file)
```

---

## 🚀 Quickstart: Running Locally

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** and **npm**

---

### 1. Backend Setup

1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   * **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     ```
   * **macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and provide your credentials:
   * `SENTINEL_CLIENT_ID` & `SENTINEL_CLIENT_SECRET`: Your Copernicus Data Space Ecosystem (CDSE) credentials.
   * `GEMINI_API_KEY`: Your Google Gemini API key (for vernacular SMS generation & Soil Card OCR).

5. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   * The backend API will be available at: **`http://127.0.0.1:8000`**
   * Interactive Swagger API docs: **`http://127.0.0.1:8000/docs`**

6. *(Optional)* Run the automated test suite:
   ```bash
   pytest -q
   # Result: 115 passed
   ```

---

### 2. Frontend Setup

1. Open a second terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Ensure `.env` contains:
   ```env
   VITE_USE_MOCKS=false
   VITE_API_BASE=http://127.0.0.1:8000
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   * Open **`http://localhost:5173`** in your browser.

---

## 🛰️ Key Features & Live Integrations

* **Authentic Sentinel-2 Multispectral Passes**:
  Queries European Space Agency Copernicus Sentinel-2 L2A via CDSE Statistical API to compute parcel-boundary NDVI & NDWI trajectories.
* **Hyper-Local Agrometeorology**:
  High-resolution surface weather and 5-day synoptic forecast fetched live from Open-Meteo.
* **Multi-Agent Diagnostic Reasoning**:
  Orchestrates Satellite Scout, Weather Watch, Crop Risk Analyst, and Field Monitor agents to derive transparent, auditable risk scores.
* **Soil Health Card Multimodal OCR**:
  Extracts 12 soil parameters (N, P, K, pH, EC, Organic Carbon, Micro-nutrients) using Gemini Flash Vision.
* **Vernacular Agronomic Advisories**:
  Generates contextualized advisory SMS in regional languages (Marathi, Hindi, Punjabi) adhering to strict character budgets with zero fabrication.
* **Separation of Duties & Audit Trail**:
  Enforces role-based permissions (Agriculture Department Officer, Extension Worker, KVK Agronomist, Village Rep) with immutable event logging.

---

## 👥 Team
Hardik Khurana, Aryan Kumar, Arihant Kapkoti, Divisha Agarwal, Agamya Jain
