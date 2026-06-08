# HawkAI

> **Autonomous KYC/AML Intelligence Terminal** — research any company, person, or fund and receive a structured financial crime risk report in under 4 minutes, powered by Google ADK · Gemini · MongoDB Atlas.

**Live demo:** [hawk-ai-flax.vercel.app](https://hawk-ai-flax.vercel.app)  
**Backend health:** [hawkai-backend-46616099912.us-central1.run.app/api/v1/health](https://hawkai-backend-46616099912.us-central1.run.app/api/v1/health)

---

## The Problem

Financial crime costs the global economy **$2 trillion+ per year**. Yet the tools to fight it are locked behind Bloomberg Terminal licenses at $24,000/year — inaccessible to 99% of compliance teams at community banks, fintech startups, and financial regulators.

A compliance officer manually screening a single counterparty spends **2–4 days and $100+** per entity. HawkAI does it autonomously in **under 4 minutes for fractions of a cent**.

---

## What It Does

Type a name. HawkAI does the rest.

A multi-agent pipeline autonomously searches the web for compliance intelligence, extracts a structured entity profile, runs 768-dimensional vector similarity search to surface correlated entities, classifies risk signals across 8 categories, and synthesizes a scored risk report — all streamed live to a Bloomberg Terminal-style UI.

### Investigators get

- **Risk score (0–100)** with CRITICAL / HIGH / MEDIUM / LOW classification
- **Confidence score** (0–100%) reflecting source quality and coverage
- **5–7 specific findings**, each citing verifiable facts (dollar amounts, dates, regulatory bodies)
- **Compliance recommendations** in PRIMARY ACTION / MONITORING / PERIODIC REVIEW structure
- **Risk breakdown by category** — GOVERNANCE · FRAUD · SANCTIONS · FINANCIAL · REGULATORY · LITIGATION · REPUTATION
- **Entity Relationship Network** — force-directed graph showing risk correlations across all investigated entities, connected by shared signal categories
- **Batch screening** — comma-separate multiple names to queue simultaneous investigations
- **Watchlist alerts** — star any entity; get a live badge count when watched entities hit HIGH/CRITICAL risk
- **Live event feed** showing every agent action, tool call, and pipeline step in real time
- **PDF export** — full multi-page report with one click
- **Light / dark mode** — persisted to localStorage
- **Analyst notes** — add and store observations against any entity profile

> ⚠️ **KYC/AML compliance screening only.** Scores reflect regulatory enforcement history and adverse findings, not investment grade or creditworthiness.

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │      HawkAI Bloomberg Terminal UI         │
                    │   Next.js 14 · TypeScript · App Router    │
                    │   JetBrains Mono · amber-on-ink palette   │
                    └──────────────┬───────────────────────────┘
                                   │  REST + SSE streaming
                    ┌──────────────▼───────────────────────────┐
                    │           FastAPI Backend                  │
                    │     /api/v1/* · SSE · Google Cloud Run     │
                    │        min-instances=1 (no cold start)     │
                    └──────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────┐
                    │          ScoutOrchestrator                 │
                    │      Google ADK SequentialAgent            │
                    └──────────┬────────────────────────────────┘
                               │
         ┌─────────────────────▼──┐  ┌───────────────────────────────────┐
         │     ResearchAgent       │  │        IntelligenceAgent           │
         │   gemini-2.5-flash      │  │        gemini-2.5-flash            │
         │   google_search (live)  │  │  + gemini-2.5-pro for synthesis    │
         │   2 targeted searches   │  │  7 custom async Python tools       │
         └────────────────────────┘  └──────────────┬────────────────────┘
                                                     │
                                  ┌──────────────────┤
                                  │  lookup_entity_via_mcp        → MongoDB MCP Server (ADK MCPToolset)
                                  │  check_ofac_sanctions         → MongoDB MCP Server → sanctions_lists (17,557 SDN entries)
                                  │  extract_and_store_entity     → Motor async upsert
                                  │  run_vector_similarity_search → $vectorSearch aggregation
                                  │  find_correlated_entities     → Motor async find
                                  │  classify_and_store_signals   → gemini-2.5-pro + Motor
                                  │  synthesize_risk_report       → gemini-2.5-pro + Motor
                                  └──────────────────┬──────────────────
                                                     │
                    ┌────────────────────────────────▼──────────────────────┐
                    │                   MongoDB Atlas M0                     │
                    │   investigations · entities · risk_signals             │
                    │   sanctions_lists (OFAC SDN — 17,557 entries)          │
                    │   Vector Search Index (768-dim cosine)                 │
                    │   gemini-embedding-001 embeddings                      │
                    └────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|---|---|
| **SequentialAgent** | ADK constraint: `google_search` cannot share a session with database tools. Two agents, one pipeline. |
| **MongoDB MCP Server + Motor dual-driver** | Two MCP tools run on every investigation: `lookup_entity_via_mcp` checks for existing profiles; `check_ofac_sanctions` screens against the pre-loaded OFAC SDN list (17,557 US Treasury sanctioned entities). Both use ADK MCPToolset + pre-installed `mongodb-mcp-server`. Motor handles all writes for atomic guarantees in Cloud Run's serverless environment. |
| **Tiered Gemini models** | `gemini-2.5-flash` for agent orchestration (fast, live search, tool calling); `gemini-2.5-pro` for signal classification + report synthesis (highest output quality). |
| **Person disambiguation** | Optional `context` field (company, role, country, year) sent with person investigations to identify the right individual among common names. |
| **Evidence-weighted scoring** | 60% max-severity floor + 40% weighted signal average + signal-breadth bonus. One CRITICAL signal guarantees a CRITICAL (75+) score. |
| **Force-directed entity graph** | Pure JavaScript simulation (Coulomb repulsion + Hooke springs + center gravity), 250 synchronous iterations — no D3 dependency, stable layout before first render. |
| **SSE streaming** | Every agent event (tool call, step, text, snapshot) is pushed to the frontend as it happens — the UI never waits on a response body. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | **Google ADK 2.0** (SequentialAgent) |
| Agent Model | **Gemini 2.5 Flash** — live Google Search + tool calling |
| Synthesis Model | **Gemini 2.5 Pro** — signal classification + report generation |
| Embeddings | **gemini-embedding-001** (768-dim) |
| Web Research | Google Search grounding (ADK built-in, live OSINT) |
| Database | **MongoDB Atlas M0** (free tier) |
| DB Protocol | **MongoDB MCP Server** (`mongodb-mcp-server`) via ADK MCPToolset — entity lookup + OFAC SDN screening |
| DB Driver | **Motor async driver** — writes, vector search, signal storage |
| Vector Search | MongoDB Atlas `$vectorSearch` (cosine, 768-dim) |
| Backend | **FastAPI** + asyncio + SSE |
| Frontend | **Next.js 14** + TypeScript + App Router |
| UI | Bloomberg Terminal-style — JetBrains Mono, amber phosphor palette |
| Deployment | **Google Cloud Run** (us-central1) + **Vercel** |

---

## Features In Depth

### Entity Risk Report
Every report includes an executive summary, key findings numbered with category tags (FRAUD · SANCTIONS · GOVERNANCE…), recommendations split by action type, and a risk breakdown sidebar with full category names and signal counts. Reports are exportable to PDF with one click.

### Entity Relationship Network (Correlations tab)
Force-directed SVG graph connecting every investigated entity. Nodes are sized by risk score, colored by risk level (CRITICAL → red, HIGH → orange, MEDIUM → amber, LOW → green). Edges represent shared risk signal categories. Hover any node for a score/level tooltip; click to open the full report. Edge labels show the shared signal types on hover.

### Batch Screening
Comma-separate names in the query field: `Binance, Tether, Circle`. A `⇶ BATCH · 3 ENTITIES` indicator appears. All investigations are created simultaneously and the pipeline streams the first one; the rest populate the dossier table as they complete in the background.

### Watchlist Alerts
Star (★) any row in the dossier table. If a watched entity completes with HIGH or CRITICAL risk, a red badge appears on the WATCHLISTS nav item and the Watchlists view shows an ACTIVE ALERTS section at the top with one-click cards to open each flagged report.

### Live Pipeline
Every pipeline step, tool call, and agent output is streamed in real time to the terminal feed and the live queue panel. Nothing is polled — pure SSE.

---

## Screenshots

| Dossier Table | Investigation Report |
|---|---|
| ![Dossier](docs/screenshots/dossier.png) | ![Report](docs/screenshots/report_ftx.png) |

| Entity Risk Network | Risk Signals |
|---|---|
| ![Correlations](docs/screenshots/correlations.png) | ![Signals](docs/screenshots/signals.png) |

---

## Quick Start

### Prerequisites
- Google AI Studio API Key (paid tier) → [aistudio.google.com](https://aistudio.google.com/apikey)
- MongoDB Atlas M0 cluster (free) → [mongodb.com/atlas](https://mongodb.com/atlas)
- Docker + Docker Compose, **or** Python 3.12+ / Node 22+

### 1 — Clone & configure
```bash
git clone https://github.com/Nstar9/HawkAI.git && cd HawkAI
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
GOOGLE_API_KEY=your-google-ai-studio-key
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hawkai
GEMINI_MODEL=gemini-2.5-flash
SYNTHESIS_MODEL=gemini-2.5-pro
```

### 2 — Atlas Vector Search index
In Atlas UI → **Atlas Search** → **Create Index** → **JSON Editor**, collection `entities`:
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "entity_type" },
    { "type": "filter", "path": "risk_level" }
  ]
}
```

### 3 — Run
```bash
docker-compose up --build
# → http://localhost:3000
```

---

## Demo Investigations

Verified live scores from the deployed system:

| Entity | Type | Score | Level | Notable Signals |
|---|---|---|---|---|
| FTX | COMPANY | ~84 | CRITICAL | Founder convicted on 7 counts, 25-year sentence, CFTC $12.7B consent order, Chapter 11 |
| Sam Bankman-Fried | PERSON | ~81 | CRITICAL | Wire fraud, securities fraud, money laundering — SDNY Docket 22-CR-00673 |
| Tornado Cash | COMPANY | ~82 | CRITICAL | OFAC-sanctioned, $7B+ laundered including for DPRK hackers |
| Vanguard | COMPANY | ~77 | HIGH | $146M SEC settlement (Jan 2025), regulatory enforcement history |
| Meta Inc | COMPANY | ~55 | HIGH | FTC consent orders, Cambridge Analytica, $5B privacy fine |
| Tesla Inc | COMPANY | ~48 | MEDIUM | Musk SEC securities violations, civil settlement, shareholder litigation |
| Fidelity Investments | COMPANY | ~28 | MEDIUM | Routine regulatory filings, no material enforcement history |
| BlackRock Inc | COMPANY | ~8 | LOW | Clean — world's largest asset manager, standard regulatory disclosures |

> **Score interpretation:** 0–21 LOW (standard onboarding) · 22–51 MEDIUM (enhanced monitoring) · 52–79 HIGH (escalate for review) · 80–100 CRITICAL (reject / file SAR)
>
> Scores are KYC/AML compliance signals — not investment advice and not legal verdicts.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health — returns model config |
| `POST` | `/api/v1/investigations` | Start a new investigation |
| `GET` | `/api/v1/investigations` | List all investigations |
| `GET` | `/api/v1/investigations/{id}` | Get investigation by ID |
| `DELETE` | `/api/v1/investigations/{id}` | Delete investigation + all its signals |
| `GET` | `/api/v1/investigations/{id}/stream` | **SSE** real-time event stream |
| `DELETE` | `/api/v1/investigations/failed` | Bulk-delete all failed investigations |
| `GET` | `/api/v1/watchlists` | AML watchlist patterns |
| `GET` | `/api/v1/signals` | All risk signals across investigations |
| `GET` | `/api/v1/entities` | Entity profiles |
| `POST` | `/api/v1/entities/{id}/notes` | Add analyst note to entity |

---

## Environment Variables

```env
GOOGLE_API_KEY=           # Google AI Studio key (paid tier required for Search grounding)
MONGODB_URI=              # Atlas connection string (mongodb+srv://...)
MONGODB_DATABASE=hawkai
GEMINI_MODEL=gemini-2.5-flash
SYNTHESIS_MODEL=gemini-2.5-pro
EMBEDDING_MODEL=gemini-embedding-001
DISABLE_GOOGLE_SEARCH=false
```

---

## License

MIT
