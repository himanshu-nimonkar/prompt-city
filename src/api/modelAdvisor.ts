/** Client for model-advisor Worker (proxied via Vite in dev). */

export interface RankedModel {
  modelId: string;
  name: string;
  provider: string;
  kind: 'cloudflare' | 'commercial';
  quality: number;
  speedScore: number;
  estCostUsd: number;
  estTokens: number;
  overall: number;
  rank: number;
  rationale: string;
  latencyMs?: number;
  metricsSource?: 'live' | 'history' | 'estimate';
  measured?: boolean;
  liveOk?: boolean;
  liveError?: string;
  via?: string;
}

export interface AnalyzeResponse {
  analysisId: string;
  taskType: string;
  taskSummary: string;
  estInputTokens: number;
  estOutputTokens: number;
  scoringSource?: 'llm' | 'heuristic';
  measurementMode?: 'live' | 'live+history' | 'history' | 'estimate';
  liveMeasured?: number;
  liveAttempted?: number;
  cacheHit: boolean;
  results: RankedModel[];
  live?: Array<{
    modelId: string;
    ok: boolean;
    latencyMs: number;
    totalTokens: number;
    costUsd: number;
    via: string;
    error?: string;
  }>;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  kind: 'cloudflare' | 'commercial';
  latency: 'fast' | 'medium' | 'slow';
  context: number;
  blurb: string;
}

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function analyzePrompt(prompt: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AnalyzeResponse;
}

export async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch(`${BASE}/api/catalog`);
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as CatalogModel[];
}
