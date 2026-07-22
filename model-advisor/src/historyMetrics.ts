/**
 * Aggregate real measurement history from D1 model_runs.
 * Blends past latency/cost/tokens into ranking when available.
 */

export interface HistoryAgg {
  modelId: string;
  samples: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  avgTokens: number;
  successRate: number;
}

export async function getModelHistoryAggregates(
  db: D1Database,
  lookbackMs = 1000 * 60 * 60 * 24 * 14,
): Promise<Map<string, HistoryAgg>> {
  const since = Date.now() - lookbackMs;
  const { results } = await db
    .prepare(
      `SELECT model_id as modelId,
              COUNT(*) as samples,
              AVG(latency_ms) as avgLatencyMs,
              AVG(cost_usd) as avgCostUsd,
              AVG(total_tokens) as avgTokens,
              AVG(CASE WHEN ok = 1 THEN 1.0 ELSE 0.0 END) as successRate
       FROM model_runs
       WHERE created_at >= ?
       GROUP BY model_id`,
    )
    .bind(since)
    .all<{
      modelId: string;
      samples: number;
      avgLatencyMs: number;
      avgCostUsd: number;
      avgTokens: number;
      successRate: number;
    }>();

  const map = new Map<string, HistoryAgg>();
  for (const r of results ?? []) {
    map.set(r.modelId, {
      modelId: r.modelId,
      samples: Number(r.samples) || 0,
      avgLatencyMs: Number(r.avgLatencyMs) || 0,
      avgCostUsd: Number(r.avgCostUsd) || 0,
      avgTokens: Number(r.avgTokens) || 0,
      successRate: Number(r.successRate) || 0,
    });
  }
  return map;
}

export async function saveModelRuns(
  db: D1Database,
  analysisId: string,
  runs: Array<{
    modelId: string;
    ok: boolean;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    via: string;
    error?: string;
  }>,
): Promise<void> {
  if (runs.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO model_runs
      (id, analysis_id, model_id, ok, latency_ms, input_tokens, output_tokens, total_tokens, cost_usd, via, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const batch = runs.map((r) =>
    stmt.bind(
      crypto.randomUUID(),
      analysisId,
      r.modelId,
      r.ok ? 1 : 0,
      r.latencyMs,
      r.inputTokens,
      r.outputTokens,
      r.totalTokens,
      r.costUsd,
      r.via,
      r.error ?? null,
      Date.now(),
    ),
  );
  await db.batch(batch);
}
