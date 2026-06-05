# HawkAI

> **Autonomous KYC/AML Intelligence Terminal** — researches any company, person, or fund and produces a structured financial crime risk report in under 4 minutes, powered by Google ADK + Gemini + MongoDB Atlas.

**Live demo:** [hawk-ai-flax.vercel.app](https://hawk-ai-flax.vercel.app) · **API:** [hawkai-backend-pnkbbvfuoa-uc.a.run.app](https://hawkai-backend-pnkbbvfuoa-uc.a.run.app/api/v1/health)

---

## The Problem

Financial crime costs the global economy **$2 trillion+ every year**. Yet the tools to fight it are locked behind Bloomberg Terminal licenses that cost $24,000/year — inaccessible to 99% of compliance teams at community banks, fintech startups, and financial regulators.

A compliance officer manually screening a single counterparty spends **2–4 days and $100+** per entity. HawkAI does it autonomously in **under 4 minutes for fractions of a cent**.

---

## What It Does

Type a name. HawkAI does the rest.

A multi-agent pipeline autonomously searches the web for compliance intelligence, extracts a structured entity profile, runs 768-dimensional vector similarity search to surface connected entities, classifies risk signals across 8 categories, and synthesizes a scored risk report — all streamed live to a Bloomberg Terminal-style UI.

**Investigators get:**
- Risk score (0–100) with CRITICAL / HIGH / MEDIUM / LOW classification
- 5–7 specific findings, each citing verifiable facts (dollar amounts, dates, regulatory bodies)
- Compliance recommendations in PRIMARY ACTION / MONITORING / PERIODIC REVIEW structure
- Analyst confidence score (0–100%)
- Risk breakdown by category with visual bars
- Entity correlation matrix using 768-dim vector embeddings
- Live event feed showing every agent action in real-time
- PDF export of any report with one click

> ⚠️ **KYC/AML compliance screening only** — scores reflect regulatory enforcement history and adverse findings, not investment grade or creditworthiness.

---

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │    HawkAI Bloomberg Terminal UI       │
                    │    Next.js 14 · TypeScript            │
                    │    JetBrains Mono · amber palette     │
                    └──────────────┬───────────────────────┘
                                   │ POST + SSE streaming
                    ┌──────────────▼───────────────────────┐
                    │         FastAPI Backend               │
                    │    /api/v1/* · SSE · Cloud Run        │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │       ScoutOrchestrator               │
                    │   Google ADK SequentialAgent          │
                    └──────────┬───────────────────────────┘
                               │
         ┌─────────────────────▼──┐  ┌──────────────────────────────────┐
         │    ResearchAgent        │  │       IntelligenceAgent          │
         │  gemini-3.5-flash       │  │       gemini-3.5-flash           │
         │  google_search (live)   │  │  + gemini-2.5-pro for synthesis  │
         │  2 targeted searches    │  │  5 custom async Python tools     │
         └─────────────────────── ┘  └──────────────┬───────────────────┘
                                                     │
                                  ┌──────────────────┤
                                  │  extract_and_store_entity
                                  │  run_vector_similarity_search → $vectorSearch
                                  │  find_correlated_entities     → Motor async
                                  │  classify_and_store_signals   → gemini-2.5-pro
                                  │  synthesize_risk_report       → gemini-2.5-pro
                                  └──────────────────┬──────────────────────────
                                                     │
                    ┌────────────────────────────────▼──────────────────────────┐
                    │                   MongoDB Atlas M0                        │
                    │   investigations · entities · risk_signals                │
                    │   Vector Search Index (768-dim cosine, gemini-embedding-001) │
                    └────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|---|---|
| **SequentialAgent** | ADK constraint: `google_search` cannot share a session with database tools. Two agents, one pipeline. |
| **Custom async tools** (not MCP Server) | `mongodb-mcp-server` spawns a stdio subprocess that reliably crashes in Cloud Run serverless (no guaranteed child process lifecycle). Our Motor async tools provide identical Atlas access with better reliability and zero subprocess overhead. |
| **Tiered Gemini models** | `gemini-3.5-flash` for agent orchestration (fast, live search, tool calling); `gemini-2.5-pro` for signal classification + report synthesis (highest output quality). |
| **Person disambiguation** | Optional `context` field (company, role, country, year) passed with person investigations to identify the correct individual among common names. |
| **Evidence-weighted scoring** | 60% max-severity floor + 40% weighted signal average + breadth bonus. One CRITICAL signal guarantees a CRITICAL (75+) score. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | **Google ADK 2.0** |
| Agent Model | **Gemini 3.5 Flash** (live Google Search + tool calling) |
| Synthesis Model | **Gemini 2.5 Pro** (signal classification + report generation) |
| Embeddings | **gemini-embedding-001** (768-dim) |
| Web Research | Google Search grounding (ADK built-in, live OSINT) |
| Database | **MongoDB Atlas M0** |
| Vector Search | MongoDB Atlas `$vectorSearch` (cosine, 768-dim) |
| Backend | **FastAPI** + asyncio + SSE streaming |
| Frontend | **Next.js 14** + TypeScript + App Router |
| UI | Bloomberg Terminal — JetBrains Mono, amber-on-ink |
| Deployment | **Google Cloud Run** · us-central1 |

---

## Quick Start

### Prerequisites
- Google AI Studio API Key (paid tier, ~$5 sufficient) → [aistudio.google.com](https://aistudio.google.com/apikey)
- MongoDB Atlas M0 (free) → [mongodb.com/atlas](https://mongodb.com/atlas)
- Docker + Docker Compose, **or** Python 3.12+ / Node.js 22+

### 1 — Clone & configure
```bash
git clone https://github.com/Nstar9/HawkAI.git && cd HawkAI
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
GOOGLE_API_KEY=your-google-ai-studio-key
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hawkai
GEMINI_MODEL=gemini-3.5-flash
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
# open http://localhost:3000
```

---

## Demo Investigations

| Entity | Type | Score | Level |
|---|---|---|---|
| Sam Bankman-Fried | PERSON | 93 | CRITICAL |
| JPMorgan Chase | COMPANY | 91 | CRITICAL |
| Celsius Network | COMPANY | ~88 | CRITICAL |
| FTX Ventures | FUND | ~85 | CRITICAL |
| Meta Inc | COMPANY | 42 | MEDIUM |
| Tesla Inc | COMPANY | 35 | MEDIUM |
| BlackRock Inc | COMPANY | ~8 | LOW |
| Berkshire Hathaway | COMPANY | ~5 | LOW |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health — returns model config |
| `POST` | `/api/v1/investigations` | Start investigation |
| `GET` | `/api/v1/investigations` | List investigations |
| `GET` | `/api/v1/investigations/{id}` | Get by ID |
| `GET` | `/api/v1/investigations/{id}/stream` | **SSE** real-time events |
| `DELETE` | `/api/v1/investigations/failed` | Clean up failures |
| `GET` | `/api/v1/watchlists` | AML watchlist patterns |
| `GET` | `/api/v1/signals` | All signals across investigations |
| `GET` | `/api/v1/entities` | Entity profiles |
| `POST` | `/api/v1/entities/{id}/notes` | Add analyst note |

---

## Environment Variables

```env
GOOGLE_API_KEY=           # Google AI Studio (paid tier)
MONGODB_URI=              # Atlas connection string
GEMINI_MODEL=gemini-3.5-flash
SYNTHESIS_MODEL=gemini-2.5-pro
EMBEDDING_MODEL=gemini-embedding-001
MONGODB_DATABASE=hawkai
DISABLE_GOOGLE_SEARCH=false
```

---

## License

MIT
