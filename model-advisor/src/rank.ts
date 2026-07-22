/**
 * Deterministic ranking from:
 *  - LLM quality scores (subjective)
 *  - Live measurements and/or D1 history (latency, tokens, $)
 *  - Catalog fallbacks when a model was not live-measured
 */

import { CATALOG, SPEED_SCORE, getModel } from "./catalog";
import type { AgentOutput } from "./agent";
import type { LiveMeasurement } from "./measure";
import type { HistoryAgg } from "./historyMetrics";

export interface RankedModel {
  modelId: string;
  name: string;
  provider: string;
  kind: "cloudflare" | "commercial";
  quality: number;
  speedScore: number;
  estCostUsd: number;
  estTokens: number;
  overall: number;
  rank: number;
  rationale: string;
  /** Wall-clock ms when live-measured or from history. */
  latencyMs?: number;
  /** Whether cost/speed/tokens came from a live call, history, or catalog estimate. */
  metricsSource: "live" | "history" | "estimate";
  measured?: boolean;
  liveOk?: boolean;
  liveError?: string;
  via?: string;
}

export interface Weights {
  quality: number;
  cost: number;
  speed: number;
}

const DEFAULT_WEIGHTS: Weights = { quality: 0.55, cost: 0.25, speed: 0.2 };

function latencyToSpeedScore(ms: number): number {
  // 200ms → ~1.0, 800ms → ~0.6, 2500ms → ~0.25, 6000ms+ → ~0.1
  if (ms <= 0) return 0.5;
  const score = 1 - Math.min(0.9, Math.log10(Math.max(ms, 50) / 50) / 2.4);
  return Math.max(0.05, Math.min(1, score));
}

export function rankModels(
  agent: AgentOutput,
  opts: {
    live?: LiveMeasurement[];
    history?: Map<string, HistoryAgg>;
    weights?: Weights;
  } = {},
): RankedModel[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const liveById = new Map((opts.live ?? []).map((m) => [m.modelId, m]));
  const history = opts.history ?? new Map<string, HistoryAgg>();
  const inTok = agent.estInputTokens;
  const outTok = agent.estOutputTokens;

  const qualityById = new Map(agent.models.map((m) => [m.id, m]));

  // Score every catalog model (quality may be missing → use blurb baseline)
  const rows = CATALOG.map((cat) => {
    const q = qualityById.get(cat.id);
    const quality = q?.quality ?? Math.round(cat.caps.instructionFollowing * 100);
    const rationale = q?.rationale ?? cat.blurb;

    const live = liveById.get(cat.id);
    const hist = history.get(cat.id);

    let estCostUsd = (cat.priceIn * inTok + cat.priceOut * outTok) / 1_000_000;
    let estTokens = inTok + outTok;
    let speedScore = SPEED_SCORE[cat.latency];
    let latencyMs: number | undefined;
    let metricsSource: RankedModel["metricsSource"] = "estimate";
    let measured = false;
    let liveOk: boolean | undefined;
    let liveError: string | undefined;
    let via: string | undefined;

    if (live?.ok) {
      estCostUsd = live.costUsd;
      estTokens = live.totalTokens;
      latencyMs = live.latencyMs;
      speedScore = latencyToSpeedScore(live.latencyMs);
      metricsSource = "live";
      measured = true;
      liveOk = true;
      via = live.via;
    } else if (hist && hist.samples >= 2 && hist.avgLatencyMs > 0) {
      // Blend history into estimates (real past traffic on this worker)
      estCostUsd = hist.avgCostUsd > 0 ? hist.avgCostUsd : estCostUsd;
      estTokens = hist.avgTokens > 0 ? Math.round(hist.avgTokens) : estTokens;
      latencyMs = hist.avgLatencyMs;
      speedScore = latencyToSpeedScore(hist.avgLatencyMs);
      metricsSource = "history";
      via = `history:n=${hist.samples}`;
    } else if (live && !live.ok) {
      liveOk = false;
      liveError = live.error;
      via = live.via;
      measured = true;
    }

    return {
      cat,
      quality,
      rationale,
      estCostUsd,
      estTokens,
      speedScore,
      latencyMs,
      metricsSource,
      measured,
      liveOk,
      liveError,
      via,
    };
  });

  if (rows.length === 0) return [];

  const costs = rows.map((r) => Math.max(r.estCostUsd, 1e-9));
  const minLog = Math.log10(Math.min(...costs));
  const maxLog = Math.log10(Math.max(...costs));
  const costScore = (c: number): number =>
    maxLog === minLog ? 1 : 1 - (Math.log10(Math.max(c, 1e-9)) - minLog) / (maxLog - minLog);

  return rows
    .map((r) => {
      const overall =
        100 *
        (weights.quality * (r.quality / 100) +
          weights.cost * costScore(r.estCostUsd) +
          weights.speed * r.speedScore);
      return {
        modelId: r.cat.id,
        name: r.cat.name,
        provider: r.cat.provider,
        kind: r.cat.kind,
        quality: r.quality,
        speedScore: Math.round(r.speedScore * 1000) / 1000,
        estCostUsd: r.estCostUsd,
        estTokens: r.estTokens,
        overall: Math.round(overall * 10) / 10,
        rank: 0,
        rationale: r.rationale,
        latencyMs: r.latencyMs,
        metricsSource: r.metricsSource,
        measured: r.measured,
        liveOk: r.liveOk,
        liveError: r.liveError,
        via: r.via,
      };
    })
    .sort((a, b) => b.overall - a.overall)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export const CATALOG_SIZE = CATALOG.length;
