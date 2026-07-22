# Prompt City

**3D model comparison city** powered by Cloudflare. Enter a prompt → every catalog model becomes a building scored on **cost**, **speed**, **quality**, and **tokens**.

| | |
|--|--|
| **Live app** | https://model-advisor.hnimonkar-individual-account.workers.dev/ |
| **Repo** | https://github.com/himanshu-nimonkar/prompt-city |
| **Stack** | React Three Fiber · Workers · Workers AI · D1 · (optional) AI Gateway |

> **Access note:** If the live URL shows a Cloudflare login wall, your account’s Zero Trust Access is protecting `*.workers.dev`. Add a **Bypass / Everyone** policy (or disable that Access app). Details in [DEPLOY.md](./DEPLOY.md).

---

## What you see

| Metric | Building encoding |
|--------|-------------------|
| **Cost** | Tower **height** + orange **$** badge |
| **Quality** | Tower **width** + glow + **blue Q** bar |
| **Speed** | **Green** neon edges + **S** bar (or real ms when live) |
| **Tokens** | **Purple** roof beam/rings + **T** bar |

Buildings sit on **city lots only** (never on roads). Sidebar/HUD show numeric metrics and data provenance (`live` / `history` / `estimate`).

---

## How scoring works (honest data sources)

```
POST /api/analyze { prompt }
        │
        ├─1─ D1 cache (full llm + measured results only)
        │
        ├─2─ Workers AI agent → quality 0–100 for ALL catalog models
        │         (+ task type, token estimates)
        │
        ├─3─ Live fan-out (real wall-clock)
        │         • top ~8 chat @cf/* models (text)
        │         • + embeddings when task looks like RAG/search
        │         • + image models when task looks like image-gen
        │         → latency ms, tokens, $ (price × tokens)
        │
        ├─4─ History blend
        │         • D1 model_runs from prior probes
        │         • AI Gateway logs (if CF_AIG_GATEWAY configured)
        │
        └─5─ Rank → store → JSON for the SPA
```

### What is “real” vs estimated

| Field | Real when… | Otherwise |
|-------|------------|-----------|
| **Latency / speed** | `metricsSource: "live"` or `"history"` | Catalog latency class |
| **Tokens** | Live usage (or measured embed/image proxy) | Agent estimate |
| **Cost ($)** | Live/history tokens × catalog $/1M | Estimate tokens × catalog $/1M |
| **Quality** | Always model judgment (LLM or heuristic) | — not a lab leaderboard |
| **Catalog membership** | Workers AI account model list | + commercial comps |

Prices in `catalog.ts` are **curated approximations** (same class of estimate AI Gateway uses for cost display)—not a Cloudflare invoice export.

Response fields to inspect in DevTools:

- `scoringSource`: `llm` | `heuristic`
- `measurementMode`: `live` | `live+history` | `history` | `estimate`
- `liveMeasured` / `liveAttempted`
- per result: `metricsSource`, `latencyMs`, `via`

---

## Repo layout

```
prompt-city/
  src/                      # React + R3F SPA
  public/                   # static assets
  model-advisor/            # Cloudflare Worker API
    src/
      index.ts              # routes
      agent.ts              # quality / task routing (Workers AI)
      measure.ts            # live fan-out (chat/embed/image)
      gatewayLogs.ts        # optional AI Gateway history
      historyMetrics.ts     # D1 aggregates
      rank.ts               # blend + rank
      catalog.ts            # 70+ models
      db.ts
    schema.sql
    scripts/smoke-test.mjs
  scripts/deploy.sh
  DEPLOY.md
```

---

## Local development

### Backend

```bash
cd model-advisor
npm install
cp .dev.vars.example .dev.vars   # set CF_ACCOUNT_ID + CF_AI_TOKEN
npx wrangler d1 execute model-advisor-db --local --file=./schema.sql
npm run dev                      # http://127.0.0.1:8787
```

### Frontend

```bash
# repo root
npm install
npm run dev                      # http://localhost:5173  (proxies /api → 8787)
```

First analyze can take **up to ~2 minutes** (agent + live probes).

### Smoke tests

```bash
# with API running on 8787
cd model-advisor && node scripts/smoke-test.mjs
# or
API_BASE=https://model-advisor.hnimonkar-individual-account.workers.dev node scripts/smoke-test.mjs
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `OK` |
| `GET` | `/api/catalog` | Full model catalog |
| `POST` | `/api/analyze` | Score + optional live measure |
| `GET` | `/api/history?limit=20` | Recent analyses |
| `GET` | `/api/metrics/models` | Aggregated live-run stats |

### `POST /api/analyze`

```json
{
  "prompt": "Write a TypeScript retry helper",
  "liveLimit": 8,
  "skipLive": false
}
```

Returns ranked `results[]` plus `measurementMode`, `live[]`, etc. Unknown fields are safe for older UIs.

---

## Deploy

```bash
cd model-advisor
npx wrangler login
npx wrangler secret put CF_AI_TOKEN
# optional AI Gateway:
# npx wrangler secret put CF_AIG_GATEWAY
# npx wrangler secret put CF_AIG_TOKEN
npm run db:remote
npx wrangler deploy

cd ..
VITE_API_BASE="" npm run build
# SPA is bundled via Worker assets (model-advisor wrangler assets → ../dist)
cd model-advisor && npx wrangler deploy
```

Or: `./scripts/deploy.sh` (see [DEPLOY.md](./DEPLOY.md)).

### Optional env / secrets

| Name | Purpose |
|------|---------|
| `CF_ACCOUNT_ID` | Workers AI REST account |
| `CF_AI_TOKEN` | API token (Workers AI) |
| `CF_AIG_ACCOUNT_ID` | Gateway account (defaults to AI account) |
| `CF_AIG_GATEWAY` | Gateway name → live calls log + history pull |
| `CF_AIG_TOKEN` | Gateway auth if enabled |

---

## Tech stack

**Frontend:** React 19, TypeScript, Vite, React Three Fiber, Drei, Three.js, Rapier, Tailwind  

**Backend:** Cloudflare Workers, Workers AI, D1, Workers Static Assets, Wrangler, optional AI Gateway / Pages  

---

## Product / roadmap ideas (backend-only)

- Raise live fan-out further / parallel modality suites  
- ASR/TTS probes when task matches  
- LLM-as-judge on live text samples  
- KV-backed live price table  
- Cron nightly warm probes  
- Provider keys on Gateway for commercial live calls  
- SSE progress events (needs FE later)

---

## License

Hackathon / demo project unless otherwise noted.
