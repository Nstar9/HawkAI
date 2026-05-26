# HawkAI

> **Autonomous KYC/AML Intelligence Terminal** — researches any company, person, or fund and produces a structured financial crime risk report in under 90 seconds.


**Live backend:** `https://hawkai-backend-pnkbbvfuoa-uc.a.run.app` — Google Cloud Run · us-central1

---

## What It Does

You type a name. HawkAI does the rest.

A multi-agent pipeline autonomously searches the web, stores a structured entity profile in MongoDB Atlas, runs 768-dimensional vector similarity search to surface connected entities, classifies risk signals across 8 categories (sanctions, fraud, regulatory, litigation, governance, financial, reputational, other), and synthesizes a scored risk report — all streamed live to a Bloomberg Terminal-style UI.

**Investigators get:**
- Risk score (0–100) with CRITICAL / HIGH / MEDIUM / LOW classification
- Ranked risk signal cards with confidence scores and source links
- Executive summary, key findings, and recommended actions
- Correlated entity graph (entities that cluster near the subject in vector space)
- Live event feed showing every agent action in real-time

---

## Architecture

```
                        ┌──────────────────────────────────┐
                        │   HawkAI Bloomberg Terminal UI    │
                        │   Next.js 14 · TypeScript         │
                        │   JetBrains Mono · amber palette  │
                        └───────────┬──────────────┬────────┘
                                    │ POST          │ SSE
                                    │ /investigate  │ live events
                        ┌───────────▼──────────────┴────────┐
                        │         FastAPI Backend            │
                        │    /api/v1/* · SSE streaming       │
                        └───────────────┬───────────────────┘
                                        │
                        ┌───────────────▼───────────────────┐
                        │       ScoutOrchestrator            │
                        │   Google ADK SequentialAgent      │
                        └──────────┬──────────────┬─────────┘
                                   │              │
           ┌───────────────────────▼──┐  ┌────────▼────────────────────────┐
           │      ResearchAgent       │  │      IntelligenceAgent          │
           │    ADK LlmAgent          │  │      ADK LlmAgent               │
           │    google_search tool    │  │   MongoDB MCP + custom tools    │
           │    Gemini 2.0 Flash      │  │      Gemini 2.0 Flash           │
           └──────────────────────────┘  └──────────┬──────────────────────┘
                                                     │
                                  ┌──────────────────┤
                                  │  extract_and_store_entity       → upsert to Atlas
                                  │  run_vector_similarity_search   → find related entities
                                  │  aggregate                      → fetch correlated signals
                                  │  classify_and_store_signals     → write risk signals
                                  │  synthesize_risk_report         → scored final report
                                  └──────────────────┬─────────────────────────────────
                                                     │
                        ┌────────────────────────────▼───────────────────────────┐
                        │                  MongoDB Atlas M0                      │
                        │   investigations · entities · risk_signals             │
                        │   Vector Search Index (768-dim cosine,                 │
                        │   gemini-embedding-001) · $vectorSearch aggregation    │
                        └────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|---|---|
| **SequentialAgent** (not parallel) | ADK constraint: `google_search` cannot share a session with MongoDB MCP tools. Two agents, one pipeline. |
| **MongoDB MCP Server** | IntelligenceAgent uses `npx mongodb-mcp-server` — gives the LLM direct, schema-aware Atlas access with zero glue code |
| **SSE streaming** | Every agent step, tool call, and text token is pushed live — no polling, investigators see every decision in real-time |
| **768-dim embeddings** | `gemini-embedding-001` produces 768-dim vectors; Atlas Vector Search index matches exactly |
| **Server-rendered initial state** | Next.js server components pre-fetch investigation data — zero loading spinners on first page load |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | **Google ADK 2.0** (`google-adk==2.0.0`) |
| LLM | **Gemini 2.0 Flash** (Google AI Studio) |
| Embeddings | **gemini-embedding-001** (768-dim) |
| Web Research | Google Search (ADK built-in grounding tool) |
| Database | **MongoDB Atlas M0** (free tier) |
| Agent ↔ DB Bridge | **MongoDB MCP Server** (`npx mongodb-mcp-server`) |
| Vector Search | MongoDB Atlas Vector Search (`$vectorSearch`) |
| Backend API | **FastAPI** + `asyncio` + SSE streaming |
| Frontend | **Next.js 14** + TypeScript + App Router |
| UI Design | Bloomberg Terminal aesthetic — JetBrains Mono, amber-on-ink palette |
| Deployment | Docker Compose · Google Cloud Run ready |

---

## Quick Start

### Prerequisites

- **Google AI Studio API Key** (free) → [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **MongoDB Atlas M0 cluster** (free) → [mongodb.com/atlas](https://mongodb.com/atlas)
- Docker + Docker Compose, **OR** Python 3.11+ and Node.js 20+

### 1 — Clone and configure

```bash
git clone https://github.com/Nstar9/HawkAI.git
cd HawkAI

cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in two values:

```env
GOOGLE_API_KEY=your-google-ai-studio-api-key
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/hawkai
```

### 2 — Create the Atlas Vector Search index

In Atlas UI → your cluster → **Atlas Search** → **Create Search Index** → **JSON Editor**:

- **Database**: `hawkai` · **Collection**: `entities` · **Index name**: `entity_vector_index`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "entity_type" },
    { "type": "filter", "path": "risk_level" }
  ]
}
```

### 3 — Start with Docker (recommended)

```bash
docker-compose up --build
```

**Or** run locally without Docker:

```bash
# Terminal 1 — Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 4 — Seed demo data (optional but recommended)

```bash
cd backend
python ../scripts/seed_demo.py
```

Open **http://localhost:3000**

---

## Demo Investigations

Three pre-seeded scenarios covering the full risk spectrum:

| Entity | Type | Risk | What It Demonstrates |
|---|---|---|---|
| **Meridian Trade Solutions Ltd** | Company | CRITICAL | BVI shell company, SEC co-location, $4.2M routed to sanctioned jurisdictions |
| **Alpine Capital Partners LLC** | Fund | HIGH | Prior SEC enforcement action, lapsed Form ADV, pending investor lawsuits |
| **Shopify Inc** | Company | LOW | Publicly listed, regulated, clean — system correctly clears benign entities |

---

## Project Structure

```
HawkAI/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app + router
│   │   ├── config.py                  # Pydantic settings (reads .env)
│   │   ├── agent/
│   │   │   ├── orchestrator.py        # ScoutOrchestrator (SequentialAgent)
│   │   │   ├── research_agent.py      # ResearchAgent — google_search
│   │   │   ├── intelligence_agent.py  # IntelligenceAgent — MongoDB MCP + tools
│   │   │   ├── prompts.py             # System prompts for each agent
│   │   │   └── tools/
│   │   │       ├── entity_tools.py    # extract_and_store_entity
│   │   │       ├── vector_tools.py    # run_vector_similarity_search + aggregate
│   │   │       └── risk_tools.py      # classify_and_store_signals + synthesize_risk_report
│   │   ├── api/
│   │   │   └── routes.py              # REST + SSE endpoints (/api/v1/*)
│   │   ├── schemas/                   # API request/response schemas
│   │   └── services/
│   │       ├── investigation_service.py
│   │       └── mongodb_service.py     # Motor async client
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example                   # Copy to .env — never commit .env
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css            # Terminal design system (--hk-* CSS vars)
│   │   │   ├── layout.tsx             # JetBrains Mono font setup
│   │   │   ├── page.tsx               # Home — server-renders TerminalHome
│   │   │   └── investigations/[id]/
│   │   │       └── page.tsx           # Detail — server-renders InvestigationDetail
│   │   ├── components/terminal/       # Bloomberg Terminal UI components
│   │   │   ├── TerminalHome.tsx       # Main orchestrator — SSE loop + state
│   │   │   ├── InvestigationDetail.tsx # Live detail view + SVG risk gauge
│   │   │   ├── Pipeline.tsx           # 6-step animated pipeline display
│   │   │   ├── DossierTable.tsx       # Investigation grid with risk filtering
│   │   │   ├── RightRail.tsx          # Live event queue + network stats
│   │   │   ├── LeftNav.tsx            # Recent investigations + storage card
│   │   │   ├── QueryBar.tsx           # Entity search input (cmd+K / cmd+Enter)
│   │   │   ├── TopBar.tsx             # Live UTC clock + system status
│   │   │   ├── StatusBar.tsx          # Pipeline queue + security info
│   │   │   └── atoms.tsx              # Label, Dot, Level, Chip, Logo
│   │   └── lib/
│   │       ├── api.ts                 # Fetch client + SSE EventSource
│   │       └── types.ts               # Shared TypeScript types
│   └── package.json
│
├── scripts/
│   └── seed_demo.py                   # Seeds 3 demo investigations + entities
├── docker-compose.yml
└── .env.example
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/investigations` | Start a new investigation |
| `GET` | `/api/v1/investigations` | List investigations (latest first) |
| `GET` | `/api/v1/investigations/{id}` | Get investigation by ID |
| `GET` | `/api/v1/investigations/{id}/stream` | **SSE stream** — real-time pipeline events |
| `GET` | `/api/v1/entities` | List stored entity profiles |
| `GET` | `/api/v1/entities/{id}` | Get entity by ID |
| `POST` | `/api/v1/entities/{id}/notes` | Add analyst note to entity |

### SSE Event Types

| Event | Payload | When it fires |
|---|---|---|
| `snapshot` | `Investigation` | Any state update — full object |
| `step` | `{name, status, message}` | Pipeline step starts / completes |
| `tool_call` | `{tool, args}` | Agent about to call a tool |
| `agent_text` | `{agent, text}` | Agent reasoning / text output |
| `investigation_completed` | `Investigation` | Final completed state |
| `done` | `{}` | Stream closing — investigation finished |
| `error` | `{message}` | Pipeline error |

---

## How the Agent Pipeline Works

**Step 1 — ResearchAgent** receives the entity name and type. Uses Google Search (ADK's built-in grounding tool) to gather OSINT from news, company registries, regulatory filings, legal databases, and sanctions lists. Outputs a structured research brief.

**Step 2 — IntelligenceAgent** takes the research brief and runs the full intelligence workflow via five sequential tool calls:

1. `extract_and_store_entity` — parses structured entity fields, generates a 768-dim embedding via `gemini-embedding-001`, upserts into MongoDB `entities` collection
2. `run_vector_similarity_search` — `$vectorSearch` against Atlas finds top-K similar entities, surfacing hidden networks and patterns
3. `aggregate` — fetches existing risk signals from correlated entities
4. `classify_and_store_signals` — classifies risk signals across 8 categories with severity and confidence scores, writes to `risk_signals` collection
5. `synthesize_risk_report` — produces final risk score (0–100), risk level, executive summary, key findings, and recommended actions

**Throughout** — every event is pushed over SSE to the frontend the moment it happens. The 6-step pipeline display and live event queue advance in real-time.

---

## Environment Variables

```env
# backend/.env — copy from backend/.env.example

# Required
GOOGLE_API_KEY=                      # Google AI Studio API key
MONGODB_URI=                         # MongoDB Atlas connection string

# Optional — defaults work for development
GEMINI_MODEL=gemini-2.0-flash        # LLM for agent reasoning
EMBEDDING_MODEL=gemini-embedding-001 # 768-dim embeddings
MONGODB_DATABASE=hawkai
GOOGLE_GENAI_USE_VERTEXAI=false
CORS_ORIGINS=["http://localhost:3000"]
DEBUG=false
```


---

## License

MIT — see [LICENSE](LICENSE)
