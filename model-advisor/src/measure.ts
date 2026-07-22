/**
 * Live measurement: run candidate models and record wall-clock latency,
 * tokens, and $ for THIS prompt.
 *
 * Supports:
 *  - chat text models (messages)
 *  - embeddings (text batch)
 *  - image generation (prompt → image)
 *
 * Routing: AI Gateway → Workers AI REST → env.AI binding
 */

import { CATALOG, type Model, type Modality } from "./catalog";

export interface MeasureEnv {
  AI?: Ai;
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
  CF_AIG_ACCOUNT_ID?: string;
  CF_AIG_GATEWAY?: string;
  CF_AIG_TOKEN?: string;
}

export interface LiveMeasurement {
  modelId: string;
  ok: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  sample?: string;
  error?: string;
  via: "ai-gateway" | "workers-ai-rest" | "workers-ai-binding" | "skipped";
  modality?: Modality;
}

const PROBE_SYSTEM =
  "You are a concise assistant. Answer the user task briefly and correctly. Max ~80 words.";

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function costFor(model: Model, inTok: number, outTok: number): number {
  return (model.priceIn * inTok + model.priceOut * outTok) / 1_000_000;
}

function extractText(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data !== "object") return String(data);
  const o = data as Record<string, unknown>;
  if (typeof o.response === "string") return o.response;
  if (o.response && typeof o.response === "object") {
    const r = o.response as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
  }
  const choices = o.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: string }).text) : ""))
      .join("");
  }
  if (typeof o.result === "string") return o.result;
  if (o.result && typeof o.result === "object") {
    const r = o.result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
  }
  return "";
}

function extractUsage(data: unknown): { input: number; output: number } | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const usage = (o.usage ?? (o.result as Record<string, unknown> | undefined)?.usage) as
    | Record<string, number>
    | undefined;
  if (!usage) return null;
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0);
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0);
  if (!input && !output) return null;
  return { input: Math.max(0, input), output: Math.max(0, output) };
}

async function restRun(env: MeasureEnv, modelId: string, body: unknown): Promise<unknown> {
  if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) throw new Error("REST creds missing");
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${modelId}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CF_AI_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!(data as { success?: boolean }).success) {
    const errs = (data as { errors?: Array<{ message: string }> }).errors;
    throw new Error(errs?.map((e) => e.message).join("; ") || `REST ${r.status}`);
  }
  return (data as { result?: unknown }).result ?? data;
}

async function bindingRun(env: MeasureEnv, modelId: string, body: unknown): Promise<unknown> {
  if (!env.AI) throw new Error("AI binding missing");
  return env.AI.run(modelId as keyof AiModels, body as never);
}

async function gatewayChat(
  env: MeasureEnv,
  modelId: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<unknown> {
  const account = env.CF_AIG_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  const gateway = env.CF_AIG_GATEWAY;
  if (!account || !gateway) throw new Error("AI Gateway not configured");
  const url = `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/compat/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  if (env.CF_AI_TOKEN) headers.authorization = `Bearer ${env.CF_AI_TOKEN}`;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: `workers-ai/${modelId}`,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg =
      (data as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ||
      (data as { error?: { message?: string } })?.error?.message ||
      `Gateway HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

function okResult(
  model: Model,
  t0: number,
  data: unknown,
  via: LiveMeasurement["via"],
  fallbackIn: number,
  fallbackOut: number,
  sample?: string,
): LiveMeasurement {
  const usage = extractUsage(data);
  const inputTokens = usage?.input || fallbackIn;
  const outputTokens = usage?.output || fallbackOut;
  return {
    modelId: model.id,
    ok: true,
    latencyMs: Date.now() - t0,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: costFor(model, inputTokens, outputTokens),
    sample: sample?.slice(0, 240),
    via,
    modality: model.modality,
  };
}

async function runChat(env: MeasureEnv, model: Model, prompt: string, maxTokens: number): Promise<LiveMeasurement> {
  const messages = [
    { role: "system", content: PROBE_SYSTEM },
    { role: "user", content: prompt.slice(0, 4000) },
  ];
  const t0 = Date.now();
  const errors: string[] = [];
  const paths: Array<() => Promise<{ data: unknown; via: LiveMeasurement["via"] }>> = [];
  if (env.CF_AIG_GATEWAY) {
    paths.push(async () => ({ data: await gatewayChat(env, model.id, messages, maxTokens), via: "ai-gateway" }));
  }
  if (env.CF_ACCOUNT_ID && env.CF_AI_TOKEN) {
    paths.push(async () => ({
      data: await restRun(env, model.id, { messages, max_tokens: maxTokens, temperature: 0.2 }),
      via: "workers-ai-rest",
    }));
  }
  if (env.AI) {
    paths.push(async () => ({
      data: await bindingRun(env, model.id, { messages, max_tokens: maxTokens, temperature: 0.2 }),
      via: "workers-ai-binding",
    }));
  }
  if (!paths.length) {
    return {
      modelId: model.id,
      ok: false,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      error: "no AI credentials",
      via: "skipped",
      modality: model.modality,
    };
  }
  for (const p of paths) {
    try {
      const { data, via } = await p();
      const text = extractText(data);
      return okResult(
        model,
        t0,
        data,
        via,
        estimateTokensFromText(PROBE_SYSTEM + prompt),
        estimateTokensFromText(text || "ok"),
        text,
      );
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return {
    modelId: model.id,
    ok: false,
    latencyMs: Date.now() - t0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    error: errors.join(" | ").slice(0, 300),
    via: "skipped",
    modality: model.modality,
  };
}

async function runEmbedding(env: MeasureEnv, model: Model, prompt: string): Promise<LiveMeasurement> {
  const text = prompt.slice(0, 1500) || "hello world";
  const body = { text: [text] };
  const t0 = Date.now();
  const errors: string[] = [];
  const tryRun = async (fn: () => Promise<unknown>, via: LiveMeasurement["via"]) => {
    const data = await fn();
    // embeddings usually return vectors; count dims as proxy for work
    let dims = 0;
    const root = data as Record<string, unknown>;
    const dataArr = (root.data ?? root) as unknown;
    if (Array.isArray(dataArr) && Array.isArray(dataArr[0])) dims = (dataArr[0] as unknown[]).length;
    else if (Array.isArray((root as { data?: unknown[] }).data)) {
      const first = (root as { data: Array<{ embedding?: unknown[] }> }).data[0];
      dims = first?.embedding?.length ?? 0;
    }
    const inTok = estimateTokensFromText(text);
    return okResult(model, t0, data, via, inTok, Math.max(1, Math.round(dims / 64)), `embed dims≈${dims}`);
  };
  try {
    if (env.CF_ACCOUNT_ID && env.CF_AI_TOKEN) return await tryRun(() => restRun(env, model.id, body), "workers-ai-rest");
  } catch (e) {
    errors.push((e as Error).message);
  }
  try {
    if (env.AI) return await tryRun(() => bindingRun(env, model.id, body), "workers-ai-binding");
  } catch (e) {
    errors.push((e as Error).message);
  }
  return {
    modelId: model.id,
    ok: false,
    latencyMs: Date.now() - t0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    error: errors.join(" | ").slice(0, 300) || "embed probe failed",
    via: "skipped",
    modality: "embedding",
  };
}

async function runImage(env: MeasureEnv, model: Model, prompt: string): Promise<LiveMeasurement> {
  // Keep image gens small/fast for probing
  const body = {
    prompt: prompt.slice(0, 400) || "a simple blue square logo",
    num_steps: 4,
  };
  const t0 = Date.now();
  const errors: string[] = [];
  const finish = (via: LiveMeasurement["via"]) => {
    const inTok = estimateTokensFromText(String(body.prompt));
    // image models: treat one image as fixed "output work"
    const outTok = 256;
    return {
      modelId: model.id,
      ok: true,
      latencyMs: Date.now() - t0,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
      costUsd: costFor(model, inTok, outTok),
      sample: "image-ok",
      via,
      modality: "image" as const,
    };
  };
  try {
    if (env.CF_ACCOUNT_ID && env.CF_AI_TOKEN) {
      await restRun(env, model.id, body);
      return finish("workers-ai-rest");
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  try {
    if (env.AI) {
      await bindingRun(env, model.id, body);
      return finish("workers-ai-binding");
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  return {
    modelId: model.id,
    ok: false,
    latencyMs: Date.now() - t0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    error: errors.join(" | ").slice(0, 300) || "image probe failed",
    via: "skipped",
    modality: "image",
  };
}

async function runOne(env: MeasureEnv, model: Model, prompt: string, maxTokens: number): Promise<LiveMeasurement> {
  if (model.modality === "embedding") return runEmbedding(env, model, prompt);
  if (model.modality === "image") return runImage(env, model, prompt);
  if (model.liveChat) return runChat(env, model, prompt, maxTokens);
  return {
    modelId: model.id,
    ok: false,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    error: `modality ${model.modality} not live-probed`,
    via: "skipped",
    modality: model.modality,
  };
}

export interface MeasureOptions {
  /** Max chat models to live-call. */
  limit?: number;
  preferIds?: string[];
  maxTokens?: number;
  /** Also probe embeddings / images when task fits. */
  includeEmbeddings?: boolean;
  includeImages?: boolean;
  embedLimit?: number;
  imageLimit?: number;
  taskType?: string;
}

function pickByPreference(models: Model[], prefer: Set<string>, limit: number): Model[] {
  const sorted = [...models].sort((a, b) => {
    const ap = prefer.has(a.id) ? 0 : 1;
    const bp = prefer.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.priceOut - b.priceOut;
  });
  return sorted.slice(0, Math.max(0, Math.min(limit, sorted.length)));
}

/** Live-call Workers AI models for this prompt (chat + optional embed/image). */
export async function measureModelsLive(
  env: MeasureEnv,
  prompt: string,
  opts: MeasureOptions = {},
): Promise<LiveMeasurement[]> {
  const limit = opts.limit ?? 8;
  const maxTokens = opts.maxTokens ?? 160;
  const prefer = new Set(opts.preferIds ?? []);
  const task = (opts.taskType || "").toLowerCase();

  const wantEmbed =
    opts.includeEmbeddings !== false &&
    (opts.includeEmbeddings === true || /embed|rag|vector|similarity|search/.test(task + " " + prompt.toLowerCase()));
  const wantImage =
    opts.includeImages !== false &&
    (opts.includeImages === true ||
      /image-generation|generate.*image|draw |hero image|text-to-image|flux|sdxl/.test(task + " " + prompt.toLowerCase()));

  const chatModels = CATALOG.filter((m) => m.kind === "cloudflare" && m.liveChat);
  const selected = pickByPreference(chatModels, prefer, limit);

  if (wantEmbed) {
    const embeds = CATALOG.filter((m) => m.kind === "cloudflare" && m.modality === "embedding");
    selected.push(...pickByPreference(embeds, prefer, opts.embedLimit ?? 2));
  }
  if (wantImage) {
    // Prefer fast image models
    const images = CATALOG.filter((m) => m.kind === "cloudflare" && m.modality === "image");
    const fastFirst = [...images].sort((a, b) => {
      const ar = a.latency === "fast" ? 0 : a.latency === "medium" ? 1 : 2;
      const br = b.latency === "fast" ? 0 : b.latency === "medium" ? 1 : 2;
      return ar - br || a.priceOut - b.priceOut;
    });
    selected.push(...fastFirst.slice(0, opts.imageLimit ?? 2));
  }

  // de-dupe
  const seen = new Set<string>();
  const unique = selected.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

  const out: LiveMeasurement[] = [];
  const queue = [...unique];
  const concurrency = Math.min(4, Math.max(1, queue.length));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const m = queue.shift();
        if (!m) break;
        out.push(await runOne(env, m, prompt, maxTokens));
      }
    }),
  );
  return out;
}
