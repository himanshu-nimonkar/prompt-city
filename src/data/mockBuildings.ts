import type { BuildingData, ModelMetrics } from '../types';
import type { RankedModel } from '../api/modelAdvisor';

/** Distinct colorful facade palette. */
const FACADE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
  '#84cc16', '#0ea5e9', '#a855f7', '#fb7185', '#34d399',
  '#fbbf24', '#60a5fa', '#c084fc', '#4ade80', '#f472b6',
];

/** Catalog-aligned stubs used before / while analysis runs. */
const models = [
  { name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', short: 'Llama 3.3 70B', provider: 'Cloudflare / Meta', type: 'text' as const, latency: 200, kind: 'cloudflare' as const },
  { name: '@cf/meta/llama-3.1-8b-instruct-fast', short: 'Llama 3.1 8B', provider: 'Cloudflare / Meta', type: 'text' as const, latency: 80, kind: 'cloudflare' as const },
  { name: '@cf/qwen/qwen2.5-coder-32b-instruct', short: 'Qwen2.5 Coder', provider: 'Cloudflare / Qwen', type: 'text' as const, latency: 180, kind: 'cloudflare' as const },
  { name: '@cf/mistralai/mistral-small-3.1-24b-instruct', short: 'Mistral Small', provider: 'Cloudflare / Mistral', type: 'text' as const, latency: 100, kind: 'cloudflare' as const },
  { name: 'anthropic/claude-opus-4', short: 'Claude Opus 4', provider: 'Anthropic', type: 'text' as const, latency: 400, kind: 'commercial' as const },
  { name: 'anthropic/claude-sonnet-4', short: 'Claude Sonnet 4', provider: 'Anthropic', type: 'text' as const, latency: 220, kind: 'commercial' as const },
  { name: 'anthropic/claude-haiku-3.5', short: 'Claude Haiku 3.5', provider: 'Anthropic', type: 'text' as const, latency: 90, kind: 'commercial' as const },
  { name: 'openai/gpt-4o', short: 'GPT-4o', provider: 'OpenAI', type: 'text' as const, latency: 200, kind: 'commercial' as const },
  { name: 'openai/gpt-4o-mini', short: 'GPT-4o mini', provider: 'OpenAI', type: 'text' as const, latency: 80, kind: 'commercial' as const },
  { name: 'openai/o3', short: 'o3', provider: 'OpenAI', type: 'text' as const, latency: 450, kind: 'commercial' as const },
  { name: 'google/gemini-2.5-pro', short: 'Gemini 2.5 Pro', provider: 'Google', type: 'text' as const, latency: 250, kind: 'commercial' as const },
  { name: 'google/gemini-2.5-flash', short: 'Gemini 2.5 Flash', provider: 'Google', type: 'text' as const, latency: 90, kind: 'commercial' as const },
  { name: 'mistral/mistral-large', short: 'Mistral Large', provider: 'Mistral', type: 'text' as const, latency: 200, kind: 'commercial' as const },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function shortNameFrom(name: string, id: string): string {
  if (name.length <= 22) return name.replace(/\s*\(Workers AI\)\s*/i, '').trim();
  const bare = name.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (bare.length <= 22) return bare;
  const tail = id.split('/').pop() ?? id;
  return tail.length <= 22 ? tail : `${tail.slice(0, 20)}…`;
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(1)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function speedLabelFromScore(speedScore: number, latencyMs?: number): string {
  if (latencyMs != null && latencyMs > 0) {
    if (latencyMs < 400) return `${Math.round(latencyMs)}ms`;
    if (latencyMs < 1500) return `${(latencyMs / 1000).toFixed(1)}s`;
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }
  if (speedScore >= 0.9) return 'fast';
  if (speedScore >= 0.5) return 'medium';
  return 'slow';
}

function latencyMsFromScore(speedScore: number, latencyMs?: number): number {
  if (latencyMs != null && latencyMs > 0) return Math.round(latencyMs);
  if (speedScore >= 0.9) return 80;
  if (speedScore >= 0.5) return 200;
  return 420;
}

/**
 * Backend → UI metrics.
 * cost score is relative expense (higher = costlier) so tall buildings = expensive.
 */
export function rankedToMetrics(results: RankedModel[]): Record<string, ModelMetrics> {
  if (results.length === 0) return {};

  const costs = results.map((r) => Math.max(r.estCostUsd, 1e-12));
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const logMin = Math.log10(minC);
  const logMax = Math.log10(maxC);
  const costNorm = (c: number) => {
    if (logMax === logMin) return 50;
    return clamp(((Math.log10(Math.max(c, 1e-12)) - logMin) / (logMax - logMin)) * 100);
  };

  const out: Record<string, ModelMetrics> = {};
  for (const r of results) {
    const cost = Math.round(costNorm(r.estCostUsd));
    const speed = Math.round(clamp(r.speedScore * 100));
    const quality = Math.round(clamp(r.quality));
    const srcTag =
      r.metricsSource === 'live' ? ' · live' : r.metricsSource === 'history' ? ' · hist' : '';
    out[r.modelId] = {
      cost,
      speed,
      quality,
      tokens: r.estTokens,
      costLabel: `${formatUsd(r.estCostUsd)}${srcTag}`,
      speedLabel: speedLabelFromScore(r.speedScore, r.latencyMs),
      qualityLabel: `${quality}/100`,
      tokensLabel: formatTokens(r.estTokens),
      estCostUsd: r.estCostUsd,
      speedScore: r.speedScore,
      overall: r.overall,
      rank: r.rank,
      rationale: r.rationale,
      latencyMs: r.latencyMs,
      metricsSource: r.metricsSource,
      measured: r.measured,
      via: r.via,
    };
  }
  return out;
}

/**
 * Metric encoding on a skyscraper (high contrast):
 * - HEIGHT  → cost (power curve so cheap vs expensive is obvious)
 * - WIDTH   → quality (fatter = better)
 * - GLOW    → quality
 * - STRIPE  → speed
 * - RINGS   → token usage
 * - FACE BARS → quality / speed / tokens
 */
export function applyMetricsToBuildings(
  buildings: BuildingData[],
  scores: Record<string, ModelMetrics>,
): BuildingData[] {
  return buildings.map((b) => {
    const m = scores[b.name];
    if (!m) return { ...b, metrics: undefined };

    // Dramatic height spread: ~8 (cheapest) → ~62 (priciest)
    const costT = Math.pow(m.cost / 100, 0.85);
    const height = 8 + costT * 54;

    // Quality fattens the tower
    const qT = m.quality / 100;
    const width = Math.round((2.2 + qT * 2.4) * 10) / 10;
    const depth = Math.round(width * (0.78 + (m.speed / 100) * 0.18) * 10) / 10;

    // Speed tint on facade (green-fast / red-slow)
    const t = m.speed / 100;
    const base = {
      r: parseInt(b.color.slice(1, 3), 16),
      g: parseInt(b.color.slice(3, 5), 16),
      b: parseInt(b.color.slice(5, 7), 16),
    };
    const r = Math.round(base.r * 0.35 + 255 * (1 - t) * 0.55);
    const g = Math.round(base.g * 0.35 + (40 + 200 * t) * 0.55);
    const bl = Math.round(base.b * 0.4 + 30 * (1 - t));
    const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;

    return {
      ...b,
      height: Math.round(Math.min(height, 64) * 10) / 10,
      width,
      depth,
      color,
      latency: latencyMsFromScore(m.speedScore, m.latencyMs),
      tokens: m.tokens,
      metrics: m,
    };
  });
}

/**
 * Building lots only — same grid as City.tsx roads (BLOCK=18).
 * Roads sit on multiples of BLOCK; lots are inset inside each block.
 */
const CITY_BLOCK = 18;
const CITY_HALF = 80; // matches ~CITY_SIZE/2 used in City.tsx
const ROAD_CLEAR = 3.6; // keep footprints off road + sidewalk
const LOT_PAD = 2.8;

function buildLotSlots(count: number, seed = 42): [number, number][] {
  const rand = seededRandom(seed);
  const slots: [number, number][] = [];

  for (let bx = -CITY_HALF; bx < CITY_HALF; bx += CITY_BLOCK) {
    for (let bz = -CITY_HALF; bz < CITY_HALF; bz += CITY_BLOCK) {
      const cx = bx + CITY_BLOCK / 2;
      const cz = bz + CITY_BLOCK / 2;
      // usable lot size inside the block (away from roads on all 4 sides)
      const lotHalf = CITY_BLOCK / 2 - ROAD_CLEAR - LOT_PAD;
      if (lotHalf < 2) continue;
      // 4 corner lots + center (never on the road grid lines)
      const offsets: [number, number][] = [
        [-lotHalf * 0.55, -lotHalf * 0.55],
        [lotHalf * 0.55, -lotHalf * 0.55],
        [-lotHalf * 0.55, lotHalf * 0.55],
        [lotHalf * 0.55, lotHalf * 0.55],
        [0, 0],
      ];
      for (const [ox, oz] of offsets) {
        slots.push([cx + ox, cz + oz]);
      }
    }
  }

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
  }

  // If we somehow need more slots than lots, spiral inside lots only (no roads).
  while (slots.length < count) {
    const base = slots[slots.length % Math.max(1, slots.length)] ?? [0, 0];
    slots.push([base[0] + (rand() - 0.5) * 1.2, base[1] + (rand() - 0.5) * 1.2]);
  }
  return slots;
}

export function buildingsFromResults(results: RankedModel[]): BuildingData[] {
  const rand = seededRandom(42);
  const slots = buildLotSlots(Math.max(results.length, 16));
  const scores = rankedToMetrics(results);

  return results.map((r, i) => {
    const [x, z] = slots[i % slots.length];
    const stub = models.find((m) => m.name === r.modelId);
    const baseWidth = r.kind === 'cloudflare' ? 2.4 : 2.8;
    const width = Math.min(3.4, baseWidth + rand() * 0.5);
    const depth = Math.min(3.2, width * (0.72 + rand() * 0.25));
    // tiny jitter but stay inside lot (<< ROAD_CLEAR)
    const jx = (rand() - 0.5) * 0.35;
    const jz = (rand() - 0.5) * 0.35;
    const id = r.modelId.toLowerCase();
    const modelType: BuildingData['modelType'] = /embed|bge-|plamo-embedding|embeddinggemma/.test(id)
      ? 'embedding'
      : /flux|stable-diffusion|dreamshaper|leonardo|sdxl|img2img|inpaint|phoenix|lucid/.test(id)
        ? 'image'
        : /whisper|nova-3|deepgram\/flux|asr/.test(id)
          ? 'audio'
          : /aura|melotts|tts/.test(id)
            ? 'speech'
            : /coder|kimi-k2\.7-code/.test(id)
              ? 'code'
              : /llava|moondream|vision|resnet/.test(id)
                ? 'vision'
                : 'text';
    const stubBuilding: BuildingData = {
      id: `building-${i}`,
      name: r.modelId,
      shortName: shortNameFrom(r.name, r.modelId),
      position: [x + jx, 0, z + jz],
      height: 8,
      width: Math.round(width * 10) / 10,
      depth: Math.round(depth * 10) / 10,
      color: FACADE_COLORS[i % FACADE_COLORS.length],
      latency: stub?.latency ?? 200,
      requests: Math.max(1, 100 - r.rank * 3) * 100_000,
      tokens: r.estTokens,
      provider: r.provider,
      modelType,
      kind: r.kind,
    };
    return applyMetricsToBuildings([stubBuilding], scores)[0];
  });
}

export function generateBuildings(): BuildingData[] {
  const rand = seededRandom(42);
  const slots = buildLotSlots(Math.max(models.length, 16));

  return models.map((m, i) => {
    const [x, z] = slots[i % slots.length];
    const tier = i % 5;
    const height = 8 + tier * 1.2 + rand() * 2;
    const baseWidth = m.kind === 'cloudflare' ? 2.4 : 2.8;
    const width = Math.min(3.4, baseWidth + rand() * 0.5);
    const depth = Math.min(3.2, width * (0.72 + rand() * 0.25));

    return {
      id: `building-${i}`,
      name: m.name,
      shortName: m.short,
      position: [x + (rand() - 0.5) * 0.35, 0, z + (rand() - 0.5) * 0.35] as [number, number, number],
      height: Math.round(height * 10) / 10,
      width: Math.round(width * 10) / 10,
      depth: Math.round(depth * 10) / 10,
      color: FACADE_COLORS[i % FACADE_COLORS.length],
      latency: m.latency,
      requests: 1_000_000,
      tokens: 0,
      provider: m.provider,
      modelType: m.type,
      kind: m.kind,
    };
  });
}

export const BUILDINGS = generateBuildings();
