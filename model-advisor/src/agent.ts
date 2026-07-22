/**
 * LLM agent: scores catalog models for a user prompt.
 * Prefer REST (CF_AI_TOKEN on PriyaCF) when available — reliable Workers AI.
 * Binding is secondary. Prefer structured result.response over truncated content.
 */

import { CATALOG, type Capability } from "./catalog";

export const AGENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface AgentModelScore {
  id: string;
  quality: number;
  rationale: string;
}

export interface AgentOutput {
  taskType: string;
  taskSummary: string;
  estInputTokens: number;
  estOutputTokens: number;
  models: AgentModelScore[];
  scoringSource: "llm" | "heuristic";
}

export interface AgentEnv {
  AI?: Ai;
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
}

function catalogForPrompt(): string {
  // Compact list — full ids for text/code; modality tags for the rest
  return CATALOG.map(
    (m) => `- ${m.id} | ${m.modality} | ${m.name} | ${m.blurb}`,
  ).join("\n");
}

function systemPrompt(): string {
  return `You score AI models for a user task across the full Workers AI + commercial catalog.
Catalog (id | modality | name | blurb):
${catalogForPrompt()}

Rules:
- Penalize modality mismatch hard (e.g. image models for pure coding get low quality).
- Boost code models for coding, embedding models for RAG/search, ASR for transcription, TTS for speech, translation models for translate, vision for image understanding, image-gen for generate/draw.
- Respect context windows vs estInputTokens.

Return ONLY one minified JSON object (no markdown) with keys:
taskType (string), taskSummary (string), estInputTokens (int), estOutputTokens (int),
models (array of {id, quality 0-100, rationale}).
You MUST include an entry for EVERY catalog id listed above.
No cost/speed fields. Double quotes only. Keep rationales short.`;
}

function repairJsonText(text: string): string {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

function extractJson(text: string): unknown {
  const cleaned = repairJsonText(text);
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("no JSON object in output");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return JSON.parse(repairJsonText(slice));
        }
      }
    }
  }
  throw new Error("unbalanced JSON object in output");
}

function coerceModelPayload(payload: unknown): unknown {
  if (payload == null) return null;
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.models) || o.taskType != null) return o;
    if (o.response != null) return coerceModelPayload(o.response);
    if (o.result != null) return coerceModelPayload(o.result);
    return o;
  }
  if (typeof payload === "string") {
    const t = payload.trim();
    if (!t) return null;
    try {
      return extractJson(t);
    } catch {
      try {
        return JSON.parse(repairJsonText(t));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type AiRunResult = {
  response?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
};

function pickBestPayload(result: AiRunResult | null | undefined): unknown {
  if (!result) return null;

  const resp = result.response;
  if (resp && typeof resp === "object") {
    const coerced = coerceModelPayload(resp);
    if (coerced && typeof coerced === "object" && Array.isArray((coerced as { models?: unknown }).models)) {
      return coerced;
    }
  }

  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    const fromContent = coerceModelPayload(content);
    if (fromContent) return fromContent;
  }
  if (content && typeof content === "object") {
    const fromObj = coerceModelPayload(content);
    if (fromObj) return fromObj;
  }

  if (typeof resp === "string" && resp.trim()) return coerceModelPayload(resp);
  if (resp && typeof resp === "object") return coerceModelPayload(resp);
  return null;
}

function looksLikeAgentJson(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  return Array.isArray(o.models) && o.models.length >= 3;
}

async function callViaRest(env: AgentEnv, messages: unknown): Promise<unknown> {
  if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) throw new Error("REST creds missing");
    const body = { messages, max_tokens: 8000, temperature: 0.1 };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${AGENT_MODEL}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_AI_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await r.json()) as {
    success?: boolean;
    errors?: Array<{ message: string }>;
    result?: AiRunResult;
  };
  if (!data.success) {
    throw new Error(data.errors?.map((e) => e.message).join("; ") || `REST inference failed (${r.status})`);
  }
  const picked = pickBestPayload(data.result);
  if (picked && looksLikeAgentJson(picked)) return picked;
  if (picked) return picked;
  throw new Error("REST returned no usable agent JSON");
}

async function callViaBinding(env: AgentEnv, messages: unknown): Promise<unknown> {
  if (!env.AI) throw new Error("AI binding missing");
  const body = { messages, max_tokens: 8000, temperature: 0.1 };
  const res = (await env.AI.run(AGENT_MODEL as keyof AiModels, body as never)) as AiRunResult;
  const picked = pickBestPayload(res);
  if (picked && looksLikeAgentJson(picked)) return picked;
  if (picked) return picked;
  throw new Error("AI binding returned no usable agent JSON");
}

/** REST first (token points at PriyaCF with Workers AI), then binding. */
async function callModel(env: AgentEnv, messages: unknown): Promise<unknown> {
  const errors: string[] = [];

  if (env.CF_ACCOUNT_ID && env.CF_AI_TOKEN) {
    try {
      return await callViaRest(env, messages);
    } catch (err) {
      errors.push(`rest: ${(err as Error).message}`);
      console.error("callViaRest failed", err);
    }
  }

  if (env.AI) {
    try {
      return await callViaBinding(env, messages);
    } catch (err) {
      errors.push(`binding: ${(err as Error).message}`);
      console.error("callViaBinding failed", err);
    }
  }

  throw new Error(errors.join(" | ") || "no AI path available");
}

type Detected = {
  taskType: string;
  cap: Capability;
  summary: string;
  /** Preferred modalities get a boost; others get a penalty. */
  prefer: Set<string>;
};

function detectTask(prompt: string): Detected {
  const p = prompt.toLowerCase();
  if (/transcri|speech-to-text|asr|whisper|podcast audio|voice note/.test(p)) {
    return { taskType: "speech-to-text", cap: "multilingual", summary: "Speech recognition / transcription task.", prefer: new Set(["audio"]) };
  }
  if (/text-to-speech|tts|speak this|read aloud|voiceover/.test(p)) {
    return { taskType: "text-to-speech", cap: "creative", summary: "Text-to-speech task.", prefer: new Set(["speech"]) };
  }
  if (/image-to-text|describe (this |the )?image|caption|vision|what's in (the|this) (photo|picture|image)/.test(p)) {
    return { taskType: "vision", cap: "summarization", summary: "Image understanding / captioning task.", prefer: new Set(["vision"]) };
  }
  if (/generate (an |a )?image|draw |render |text-to-image|sdxl|flux|logo art|hero image/.test(p)) {
    return { taskType: "image-generation", cap: "creative", summary: "Image generation task.", prefer: new Set(["image"]) };
  }
  if (/embed|vector|similarity|semantic search|rag index/.test(p)) {
    return { taskType: "embedding", cap: "summarization", summary: "Embedding / retrieval task.", prefer: new Set(["embedding"]) };
  }
  if (/rerank|ranking passages|classify sentiment|label this|categorize/.test(p)) {
    return { taskType: "classification", cap: "instructionFollowing", summary: "Classification / rerank task.", prefer: new Set(["classify", "text"]) };
  }
  if (/translat|multilingual|spanish|french|german|japanese|chinese|hindi|indic/.test(p)) {
    return { taskType: "translation", cap: "multilingual", summary: "Translation or multilingual task.", prefer: new Set(["translate", "text"]) };
  }
  if (/code|typescript|python|bug|refactor|api client|programming|sql|function\b/.test(p)) {
    return { taskType: "coding", cap: "coding", summary: "Software/engineering coding task.", prefer: new Set(["code", "text"]) };
  }
  if (/summar|tldr|digest|condense/.test(p)) {
    return { taskType: "summarization", cap: "summarization", summary: "Summarization task.", prefer: new Set(["text"]) };
  }
  if (/story|poem|creative|marketing copy|slogan/.test(p)) {
    return { taskType: "creative-writing", cap: "creative", summary: "Creative writing task.", prefer: new Set(["text"]) };
  }
  if (/reason|math|proof|plan|analy|logic|chain of thought/.test(p)) {
    return { taskType: "reasoning", cap: "reasoning", summary: "Reasoning / analysis task.", prefer: new Set(["text", "code"]) };
  }
  return { taskType: "chat", cap: "instructionFollowing", summary: "General chat / instruction-following task.", prefer: new Set(["text", "code", "vision"]) };
}

export function heuristicAgent(prompt: string): AgentOutput {
  const { taskType, cap, summary, prefer } = detectTask(prompt);
  const words = Math.max(1, prompt.trim().split(/\s+/).filter(Boolean).length);
  const estInputTokens = Math.max(8, Math.round(words * 1.4 + 40));
  const estOutputTokens =
    taskType === "coding" ? 700 : taskType === "summarization" ? 350 : taskType === "image-generation" ? 0 : 500;

  return {
    taskType,
    taskSummary: summary,
    estInputTokens,
    estOutputTokens,
    scoringSource: "heuristic",
    models: CATALOG.map((mod) => {
      let base = mod.caps[cap] * 100;
      if (prefer.has(mod.modality)) base += 18;
      else if (mod.modality === "other") base -= 25;
      else base -= 22;
      const contextPenalty =
        mod.liveChat && estInputTokens > mod.context ? 35 : mod.liveChat && estInputTokens > mod.context * 0.7 ? 12 : 0;
      let h = 0;
      for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
      const jitter = ((Math.abs(h) + mod.id.length * 17) % 9) - 4;
      const quality = Math.max(3, Math.min(98, Math.round(base - contextPenalty + (mod.tools ? 2 : 0) + jitter)));
      return {
        id: mod.id,
        quality,
        rationale: `Heuristic ${taskType}/${mod.modality}: ${mod.blurb}`,
      };
    }),
  };
}

function normalizeAgent(parsed: unknown, prompt: string): AgentOutput | null {
  const coerced = coerceModelPayload(parsed);
  if (!coerced || typeof coerced !== "object") return null;
  const o = coerced as Record<string, unknown>;
  const models = Array.isArray(o.models) ? (o.models as Record<string, unknown>[]) : [];
  const cleaned = models
    .filter((m) => typeof m.id === "string")
    .map((m) => ({
      id: String(m.id),
      quality: Math.max(0, Math.min(100, Number(m.quality) || 0)),
      rationale: String(m.rationale ?? "scored by Workers AI"),
    }))
    // drop heuristic fillers if LLM mixed them
    .filter((m) => !m.rationale.startsWith("Heuristic"));

  if (cleaned.length < 3) return null;

  const byId = new Map(cleaned.map((m) => [m.id, m]));
  const fb = heuristicAgent(prompt);
  // Only fill missing catalog ids; mark filled ones clearly
  for (const m of fb.models) {
    if (!byId.has(m.id)) {
      byId.set(m.id, {
        ...m,
        rationale: `Catalog fill (no LLM score): ${m.rationale.replace(/^Heuristic\s+\w+\s+fit\s*\(/, "").replace(/\)$/, "")}`,
      });
    }
  }

  return {
    taskType: String(o.taskType ?? fb.taskType),
    taskSummary: String(o.taskSummary ?? fb.taskSummary),
    estInputTokens: Math.max(0, Number(o.estInputTokens) || fb.estInputTokens),
    estOutputTokens: Math.max(0, Number(o.estOutputTokens) || fb.estOutputTokens),
    scoringSource: "llm",
    models: [...byId.values()],
  };
}

export async function runAgent(env: AgentEnv, prompt: string): Promise<AgentOutput> {
  try {
    const payload = await callModel(env, [
      { role: "system", content: systemPrompt() },
      { role: "user", content: `Task:\n${prompt}\n\nJSON only.` },
    ]);

    const normalized = normalizeAgent(payload, prompt);
    if (normalized) return normalized;
    console.error("runAgent could not normalize payload");
  } catch (err) {
    console.error("runAgent LLM path failed, using heuristic", err);
  }

  return heuristicAgent(prompt);
}
