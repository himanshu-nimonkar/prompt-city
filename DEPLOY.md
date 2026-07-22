# Deploy & public access

## Architecture

| Piece | Product | URL |
|-------|---------|-----|
| App + API | Workers + Workers AI + D1 + Static Assets | `https://model-advisor.<subdomain>.workers.dev` |
| Optional FE | Pages | `https://prompt-city.pages.dev` |

Flow: browser → Worker SPA → `POST /api/analyze` (same origin) → quality agent + live measures + history → D1 → ranked JSON → 3D city.

## Make the URL public

If only you can open the site (others hit Cloudflare Access):

1. https://one.dash.cloudflare.com → **hnimonkar-individual-account**
2. **Access → Applications**
3. Open the app that includes `*.hnimonkar-individual-account.workers.dev`
4. **Policies → Add policy**
   - Action: **Bypass**
   - Include: **Everyone**
   - Put it at the **top**
5. Or delete/disable that Access application domain
6. Verify in **incognito**:
   - https://model-advisor.hnimonkar-individual-account.workers.dev/
   - `curl -sI …/health` should be **200**, not **302** to `cloudflareaccess.com`

## One-time setup

```bash
cd model-advisor
npx wrangler login
npx wrangler secret put CF_AI_TOKEN
# optional:
# npx wrangler secret put CF_AIG_GATEWAY
# npx wrangler secret put CF_AIG_TOKEN
npx wrangler d1 execute model-advisor-db --remote --file=./schema.sql
```

## Deploy both

```bash
# from repo root
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Or:

```bash
cd model-advisor && npx wrangler deploy
cd .. && VITE_API_BASE="" npm run build
cd model-advisor && npx wrangler deploy   # refresh assets
```

## Verify live measurement

```bash
curl -s -X POST "$API/api/analyze" \
  -H 'content-type: application/json' \
  -d '{"prompt":"Write TypeScript retries","liveLimit":6}' \
| jq '{scoringSource,measurementMode,liveMeasured,liveAttempted,n:(.results|length),top:.results[0]}'
```

Expect `measurementMode` of `live` or `live+history` and `liveMeasured > 0` when credentials work.

## AI Gateway (optional but recommended)

1. Dashboard → AI → AI Gateway → create gateway e.g. `prompt-city`
2. Set secrets `CF_AIG_GATEWAY=prompt-city` (and token if auth on)
3. Live chat calls can route through Gateway (logged)
4. `gatewayLogs.ts` pulls recent logs into history blend when token allows read access
