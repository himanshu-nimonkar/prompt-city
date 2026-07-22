/**
 * Model Arena — backend API on Cloudflare Workers.
 *
 * Flow:
 *   prompt
 *   → D1 cache (llm+measured only)
 *   → Workers AI agent (quality + task routing)
 *   → live fan-out measure top Workers AI models (latency/tokens/$)
 *   → blend D1 model_runs history
 *   → rank → store → return
 */

import { CATALOG } from "./catalog";
import { runAgent, heuristicAgent } from "./agent";
import { rankModels } from "./rank";
import { measureModelsLive, type LiveMeasurement } from "./measure";
import { getModelHistoryAggregates, saveModelRuns } from "./historyMetrics";
import { fetchGatewayHistory, mergeHistory } from "./gatewayLogs";
import { hashPrompt, getCached, saveAnalysis, getHistory } from "./db";

interface Env {
  AI: Ai;
  DB: D1Database;
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
  CF_AIG_ACCOUNT_ID?: string;
  CF_AIG_GATEWAY?: string;
  CF_AIG_TOKEN?: string;
  ASSETS?: Fetcher;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });

const errorJson = (message: string, status: number): Response => json({ error: message }, status);

interface AnalyzeBody {
  prompt?: unknown;
  /** Skip live fan-out (debug). */
  skipLive?: unknown;
  /** How many Workers AI models to live-call (1–6). */
  liveLimit?: unknown;
}

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return errorJson("invalid JSON body", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return errorJson("prompt is required", 400);
  if (prompt.length > 8000) return errorJson("prompt too long (max 8000 chars)", 400);
  // Edge: whitespace-only already trimmed; very short prompts still allowed (min 1 char after trim).

  const skipLive = body.skipLive === true;
  const liveLimitRaw = Number(body.liveLimit);
  // Default 8 chat probes (+ auto embed/image) for more real data.
  const liveLimit = Number.isFinite(liveLimitRaw)
    ? Math.min(12, Math.max(1, Math.floor(liveLimitRaw)))
    : 8;
  const promptHash = await hashPrompt(prompt);

  // 1. Cache — only reuse real llm runs with a full-size result set.
  try {
    const cached = (await getCached(env.DB, promptHash)) as Record<string, unknown> | null;
    const cachedResults = Array.isArray(cached?.results) ? (cached!.results as unknown[]) : [];
    if (
      cached &&
      cached.scoringSource === "llm" &&
      cachedResults.length >= Math.floor(CATALOG.length * 0.8) &&
      (cached.measurementMode === "live" ||
        cached.measurementMode === "live+history" ||
        cached.measurementMode === "history")
    ) {
      return json({ ...cached, cacheHit: true });
    }
  } catch (err) {
    console.error("getCached failed", err);
  }

  // 2. Quality / task routing via LLM agent.
  let agent;
  try {
    agent = await runAgent(env, prompt);
  } catch (err) {
    return errorJson(`agent failed: ${(err as Error).message}`, 502);
  }

  // Ensure agent always produced a model list covering catalog (defensive).
  if (!agent.models.length) {
    agent = heuristicAgent(prompt);
  }

  // 3. Live fan-out: more chat models + modality probes (embed/image when relevant).
  const qualitySorted = [...agent.models].sort((a, b) => b.quality - a.quality).map((m) => m.id);
  let live: LiveMeasurement[] = [];
  if (!skipLive) {
    try {
      live = await measureModelsLive(env, prompt, {
        limit: liveLimit,
        preferIds: qualitySorted,
        maxTokens: Math.min(180, Math.max(64, Math.round((agent.estOutputTokens || 200) * 0.3) || 100)),
        includeEmbeddings: true,
        includeImages: true,
        embedLimit: 2,
        imageLimit: 2,
        taskType: agent.taskType,
      });
    } catch (err) {
      console.error("live measure failed", err);
      live = [];
    }
  }

  // 4. Historical aggregates: D1 model_runs + optional AI Gateway logs.
  let history = new Map();
  try {
    history = await getModelHistoryAggregates(env.DB);
  } catch (err) {
    console.error("history aggregate failed", err);
  }
  try {
    const gw = await fetchGatewayHistory(env);
    if (gw.size) history = mergeHistory(history, gw);
  } catch (err) {
    console.error("gateway history failed", err);
  }

  // 5. Rank with quality (LLM) + cost/speed/tokens (live/history/estimate).
  const results = rankModels(agent, { live, history });
  if (results.length === 0) return errorJson("no models could be scored", 502);

  const liveOk = live.filter((m) => m.ok).length;
  const measurementMode =
    liveOk > 0 && history.size > 0 ? "live+history" : liveOk > 0 ? "live" : history.size > 0 ? "history" : "estimate";

  const analysisId = crypto.randomUUID();
  const response = {
    analysisId,
    taskType: agent.taskType,
    taskSummary: agent.taskSummary,
    estInputTokens: agent.estInputTokens,
    estOutputTokens: agent.estOutputTokens,
    scoringSource: agent.scoringSource,
    measurementMode,
    liveMeasured: liveOk,
    liveAttempted: live.length,
    cacheHit: false,
    results,
    live: live.map((m) => ({
      modelId: m.modelId,
      ok: m.ok,
      latencyMs: m.latencyMs,
      totalTokens: m.totalTokens,
      costUsd: m.costUsd,
      via: m.via,
      error: m.error,
    })),
  };

  // 6. Persist.
  if (agent.scoringSource === "llm" || liveOk > 0) {
    try {
      await saveAnalysis(env.DB, {
        id: analysisId,
        promptHash,
        prompt,
        taskType: agent.taskType,
        response,
      });
    } catch (err) {
      console.error("saveAnalysis failed", err);
    }
  }
  if (live.length > 0) {
    try {
      await saveModelRuns(
        env.DB,
        analysisId,
        live.map((m) => ({
          modelId: m.modelId,
          ok: m.ok,
          latencyMs: m.latencyMs,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          totalTokens: m.totalTokens,
          costUsd: m.costUsd,
          via: m.via,
          error: m.error,
        })),
      );
    } catch (err) {
      console.error("saveModelRuns failed", err);
    }
  }

  return json(response);
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/health") {
      return new Response("OK", { headers: CORS });
    }

    if (pathname === "/api/catalog" && request.method === "GET") {
      return json(CATALOG);
    }

    if (pathname === "/api/history" && request.method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
      try {
        return json(await getHistory(env.DB, limit));
      } catch (err) {
        return errorJson(`history failed: ${(err as Error).message}`, 500);
      }
    }

    if (pathname === "/api/metrics/models" && request.method === "GET") {
      try {
        const agg = await getModelHistoryAggregates(env.DB);
        return json([...agg.values()].sort((a, b) => b.samples - a.samples));
      } catch (err) {
        return errorJson(`metrics failed: ${(err as Error).message}`, 500);
      }
    }

    if (pathname === "/api/analyze" && request.method === "POST") {
      return handleAnalyze(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return errorJson("not found", 404);
  },
} satisfies ExportedHandler<Env>;
