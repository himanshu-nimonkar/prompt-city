/**
 * Pull recent AI Gateway request logs and aggregate latency/tokens/cost by model.
 * Optional: requires CF_AI_TOKEN (or CF_AIG_TOKEN) with AI Gateway read access.
 */

import type { HistoryAgg } from "./historyMetrics";

export interface GatewayEnv {
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
  CF_AIG_ACCOUNT_ID?: string;
  CF_AIG_GATEWAY?: string;
  CF_AIG_TOKEN?: string;
}

interface GatewayLogRow {
  model?: string;
  provider?: string;
  duration?: number;
  request_type?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost?: number;
  success?: boolean;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

function normalizeModelId(raw: string): string {
  let id = raw.trim();
  // workers-ai/@cf/... or workers-ai:@cf/...
  id = id.replace(/^workers-ai[/:]/i, "");
  id = id.replace(/^workers_ai[/:]/i, "");
  if (!id.startsWith("@") && id.includes("/meta/")) id = `@cf/${id.replace(/^cf\//, "")}`;
  if (id.startsWith("cf/")) id = `@${id}`;
  return id;
}

/**
 * Fetch recent gateway logs and return per-model aggregates compatible with HistoryAgg.
 */
export async function fetchGatewayHistory(
  env: GatewayEnv,
  opts: { limit?: number } = {},
): Promise<Map<string, HistoryAgg>> {
  const account = env.CF_AIG_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  const gateway = env.CF_AIG_GATEWAY;
  const token = env.CF_AIG_TOKEN || env.CF_AI_TOKEN;
  const out = new Map<string, HistoryAgg>();
  if (!account || !gateway || !token) return out;

  const limit = opts.limit ?? 100;
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai-gateway/gateways/${encodeURIComponent(gateway)}/logs`,
  );
  url.searchParams.set("per_page", String(Math.min(100, limit)));
  url.searchParams.set("page", "1");
  // last 7 days if API supports
  url.searchParams.set("start_date", new Date(Date.now() - 7 * 864e5).toISOString());
  url.searchParams.set("end_date", new Date().toISOString());

  try {
    const r = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });
    const data = (await r.json()) as {
      success?: boolean;
      result?: GatewayLogRow[] | { logs?: GatewayLogRow[] };
      errors?: Array<{ message: string }>;
    };
    if (!r.ok || data.success === false) {
      console.error("gateway logs fetch failed", data.errors ?? r.status);
      return out;
    }
    const rows: GatewayLogRow[] = Array.isArray(data.result)
      ? data.result
      : Array.isArray((data.result as { logs?: GatewayLogRow[] })?.logs)
        ? ((data.result as { logs: GatewayLogRow[] }).logs)
        : [];

    type Acc = {
      samples: number;
      lat: number;
      cost: number;
      tok: number;
      ok: number;
    };
    const acc = new Map<string, Acc>();
    for (const row of rows) {
      const raw = row.model || (row.metadata?.model as string) || "";
      if (!raw) continue;
      const id = normalizeModelId(String(raw));
      const a = acc.get(id) ?? { samples: 0, lat: 0, cost: 0, tok: 0, ok: 0 };
      a.samples += 1;
      a.lat += Number(row.duration ?? 0);
      a.cost += Number(row.cost ?? 0);
      a.tok += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0);
      if (row.success !== false) a.ok += 1;
      acc.set(id, a);
    }
    for (const [modelId, a] of acc) {
      if (a.samples < 1) continue;
      out.set(modelId, {
        modelId,
        samples: a.samples,
        avgLatencyMs: a.lat / a.samples,
        avgCostUsd: a.cost / a.samples,
        avgTokens: a.tok / a.samples,
        successRate: a.ok / a.samples,
      });
    }
  } catch (err) {
    console.error("gateway logs error", err);
  }
  return out;
}

/** Merge gateway aggregates into D1 history map (gateway wins on more samples). */
export function mergeHistory(
  base: Map<string, HistoryAgg>,
  extra: Map<string, HistoryAgg>,
): Map<string, HistoryAgg> {
  const out = new Map(base);
  for (const [id, a] of extra) {
    const b = out.get(id);
    if (!b || a.samples >= b.samples) out.set(id, a);
    else {
      // weighted blend
      const n = b.samples + a.samples;
      out.set(id, {
        modelId: id,
        samples: n,
        avgLatencyMs: (b.avgLatencyMs * b.samples + a.avgLatencyMs * a.samples) / n,
        avgCostUsd: (b.avgCostUsd * b.samples + a.avgCostUsd * a.samples) / n,
        avgTokens: (b.avgTokens * b.samples + a.avgTokens * a.samples) / n,
        successRate: (b.successRate * b.samples + a.successRate * a.samples) / n,
      });
    }
  }
  return out;
}
