export interface ModelMetrics {
  /** 0–100 display score; higher = more expensive */
  cost: number;
  /** 0–100, higher = faster */
  speed: number;
  /** 0–100, higher = better quality for this prompt */
  quality: number;
  /** estimated tokens for this prompt run */
  tokens: number;
  /** display helpers */
  costLabel: string;
  speedLabel: string;
  qualityLabel: string;
  tokensLabel: string;
  /** raw backend values */
  estCostUsd: number;
  speedScore: number;
  overall: number;
  rank: number;
  rationale: string;
  latencyMs?: number;
  metricsSource?: 'live' | 'history' | 'estimate';
  measured?: boolean;
  via?: string;
}

export interface BuildingData {
  id: string;
  name: string;
  shortName: string;
  position: [number, number, number];
  height: number;
  width: number;
  depth: number;
  color: string;
  latency: number;
  requests: number;
  tokens: number;
  provider: string;
  modelType: 'text' | 'image' | 'audio' | 'embedding' | 'code' | 'vision' | 'speech' | 'other';
  kind?: 'cloudflare' | 'commercial';
  /** filled after user submits a prompt */
  metrics?: ModelMetrics;
}

export type BuildingFilter = 'all' | 'text' | 'image' | 'embedding' | 'live';

export type MetricKey = 'cost' | 'speed' | 'quality' | 'tokens';

export interface RoadData {
  start: [number, number];
  end: [number, number];
  width: number;
}

export interface AnalysisMeta {
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
}
