/**
 * Full Workers AI catalog (account listing) + a few commercial comps.
 * modality drives task fit + which models are live-measured.
 */

export type Capability =
  | "reasoning"
  | "coding"
  | "creative"
  | "summarization"
  | "multilingual"
  | "instructionFollowing";

export type LatencyClass = "fast" | "medium" | "slow";

export type Modality =
  | "text"
  | "code"
  | "vision"
  | "image"
  | "audio"
  | "speech"
  | "embedding"
  | "classify"
  | "translate"
  | "other";

export interface Model {
  id: string;
  name: string;
  provider: string;
  kind: "cloudflare" | "commercial";
  modality: Modality;
  /** Whether we can live-call with chat messages for measurement. */
  liveChat: boolean;
  caps: Record<Capability, number>;
  priceIn: number;
  priceOut: number;
  latency: LatencyClass;
  context: number;
  vision: boolean;
  tools: boolean;
  blurb: string;
}

export const SPEED_SCORE: Record<LatencyClass, number> = {
  fast: 1.0,
  medium: 0.6,
  slow: 0.3,
};

type PartialModel = Omit<Model, "caps" | "priceIn" | "priceOut" | "latency" | "context" | "vision" | "tools" | "liveChat" | "kind" | "provider"> &
  Partial<Pick<Model, "caps" | "priceIn" | "priceOut" | "latency" | "context" | "vision" | "tools" | "liveChat" | "kind" | "provider">>;

const BASE_CAPS: Record<Capability, number> = {
  reasoning: 0.55,
  coding: 0.5,
  creative: 0.55,
  summarization: 0.6,
  multilingual: 0.55,
  instructionFollowing: 0.6,
};

function m(p: PartialModel): Model {
  const modality = p.modality;
  const liveChat = p.liveChat ?? (modality === "text" || modality === "code" || modality === "vision");
  const caps = { ...BASE_CAPS, ...(p.caps ?? {}) };
  // modality priors
  if (modality === "code") caps.coding = Math.max(caps.coding, 0.82);
  if (modality === "image") caps.creative = Math.max(caps.creative, 0.8);
  if (modality === "embedding") {
    caps.summarization = Math.max(caps.summarization, 0.7);
    caps.reasoning = Math.min(caps.reasoning, 0.45);
  }
  if (modality === "audio" || modality === "speech") caps.multilingual = Math.max(caps.multilingual, 0.7);
  if (modality === "translate") caps.multilingual = Math.max(caps.multilingual, 0.9);

  const provider =
    p.provider ??
    (p.id.includes("meta") || p.id.includes("llama")
      ? "Cloudflare / Meta"
      : p.id.includes("qwen") || p.id.includes("qwq")
        ? "Cloudflare / Qwen"
        : p.id.includes("mistral")
          ? "Cloudflare / Mistral"
          : p.id.includes("google") || p.id.includes("gemma")
            ? "Cloudflare / Google"
            : p.id.includes("openai") || p.id.includes("whisper") || p.id.includes("gpt-oss")
              ? "Cloudflare / OpenAI"
              : p.id.includes("deepgram")
                ? "Cloudflare / Deepgram"
                : p.id.includes("stability") || p.id.includes("runway") || p.id.includes("black-forest") || p.id.includes("flux") || p.id.includes("leonardo") || p.id.includes("lykon") || p.id.includes("bytedance")
                  ? "Cloudflare / Image"
                  : p.id.includes("baai") || p.id.includes("bge")
                    ? "Cloudflare / BAAI"
                    : "Cloudflare");

  return {
    id: p.id,
    name: p.name,
    provider,
    kind: p.kind ?? "cloudflare",
    modality,
    liveChat,
    caps,
    priceIn: p.priceIn ?? (liveChat ? 0.35 : 0.1),
    priceOut: p.priceOut ?? (liveChat ? 0.8 : 0.1),
    latency: p.latency ?? (modality === "image" ? "slow" : modality === "embedding" ? "fast" : "medium"),
    context: p.context ?? (liveChat ? 16000 : 8192),
    vision: p.vision ?? (modality === "vision" || modality === "image"),
    tools: p.tools ?? liveChat,
    blurb: p.blurb,
  };
}

/** Workers AI models from account listing + commercial comps. */
export const CATALOG: Model[] = [
  // ---- Text generation (live-measurable) ----
  m({ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B Fast", modality: "text", priceIn: 0.29, priceOut: 2.25, latency: "medium", context: 24000, caps: { reasoning: 0.78, coding: 0.74, creative: 0.72, summarization: 0.8, multilingual: 0.78, instructionFollowing: 0.8 }, blurb: "Strong general edge LLM; default quality baseline." }),
  m({ id: "@cf/meta/llama-3.1-8b-instruct-fp8", name: "Llama 3.1 8B FP8", modality: "text", priceIn: 0.028, priceOut: 0.21, latency: "fast", context: 8000, caps: { reasoning: 0.5, coding: 0.48, creative: 0.55, summarization: 0.66, multilingual: 0.6, instructionFollowing: 0.62 }, blurb: "Tiny fast chat model for simple tasks." }),
  m({ id: "@cf/meta/llama-3.1-8b-instruct-fast", name: "Llama 3.1 8B Fast", modality: "text", priceIn: 0.028, priceOut: 0.21, latency: "fast", context: 8000, caps: { reasoning: 0.52, coding: 0.5, creative: 0.55, summarization: 0.66, multilingual: 0.6, instructionFollowing: 0.64 }, blurb: "Fast cheap Workers AI chat." }),
  m({ id: "@cf/meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B", modality: "text", priceIn: 0.015, priceOut: 0.12, latency: "fast", context: 8000, caps: { reasoning: 0.35, coding: 0.32, creative: 0.4, summarization: 0.5, multilingual: 0.45, instructionFollowing: 0.48 }, blurb: "Ultra-small instruct model." }),
  m({ id: "@cf/meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B", modality: "text", priceIn: 0.02, priceOut: 0.15, latency: "fast", context: 8000, caps: { reasoning: 0.42, coding: 0.4, creative: 0.48, summarization: 0.55, multilingual: 0.5, instructionFollowing: 0.55 }, blurb: "Small efficient instruct model." }),
  m({ id: "@cf/meta/llama-3.2-11b-vision-instruct", name: "Llama 3.2 11B Vision", modality: "vision", priceIn: 0.05, priceOut: 0.4, latency: "medium", context: 16000, vision: true, caps: { reasoning: 0.62, coding: 0.55, creative: 0.6, summarization: 0.68, multilingual: 0.62, instructionFollowing: 0.68 }, blurb: "Multimodal Llama with vision." }),
  m({ id: "@cf/meta/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B", modality: "text", priceIn: 0.2, priceOut: 0.9, latency: "medium", context: 32000, caps: { reasoning: 0.8, coding: 0.78, creative: 0.74, summarization: 0.78, multilingual: 0.76, instructionFollowing: 0.82 }, blurb: "Newer Llama 4 scout instruct." }),
  m({ id: "@cf/meta/llama-guard-3-8b", name: "Llama Guard 3 8B", modality: "text", priceIn: 0.03, priceOut: 0.2, latency: "fast", context: 8000, caps: { reasoning: 0.55, coding: 0.3, creative: 0.25, summarization: 0.5, multilingual: 0.5, instructionFollowing: 0.75 }, blurb: "Safety / moderation classifier LLM." }),
  m({ id: "@cf/qwen/qwen2.5-coder-32b-instruct", name: "Qwen2.5 Coder 32B", modality: "code", priceIn: 0.66, priceOut: 1.0, latency: "medium", context: 32000, caps: { reasoning: 0.7, coding: 0.88, creative: 0.55, summarization: 0.66, multilingual: 0.66, instructionFollowing: 0.74 }, blurb: "Code-specialized edge model." }),
  m({ id: "@cf/qwen/qwen3-30b-a3b-fp8", name: "Qwen3 30B A3B", modality: "text", priceIn: 0.4, priceOut: 1.2, latency: "medium", context: 32000, caps: { reasoning: 0.8, coding: 0.78, creative: 0.72, summarization: 0.76, multilingual: 0.8, instructionFollowing: 0.8 }, blurb: "Strong Qwen3 MoE-style instruct." }),
  m({ id: "@cf/qwen/qwq-32b", name: "QwQ 32B", modality: "text", priceIn: 0.5, priceOut: 1.4, latency: "slow", context: 32000, caps: { reasoning: 0.9, coding: 0.8, creative: 0.65, summarization: 0.72, multilingual: 0.7, instructionFollowing: 0.82 }, blurb: "Reasoning-oriented Qwen variant." }),
  m({ id: "@cf/mistralai/mistral-small-3.1-24b-instruct", name: "Mistral Small 3.1 24B", modality: "text", priceIn: 0.35, priceOut: 0.56, latency: "fast", context: 32000, vision: true, caps: { reasoning: 0.66, coding: 0.62, creative: 0.66, summarization: 0.74, multilingual: 0.82, instructionFollowing: 0.72 }, blurb: "Efficient multilingual all-rounder." }),
  m({ id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", name: "DeepSeek R1 Distill 32B", modality: "text", priceIn: 0.5, priceOut: 1.5, latency: "slow", context: 32000, caps: { reasoning: 0.92, coding: 0.85, creative: 0.6, summarization: 0.7, multilingual: 0.68, instructionFollowing: 0.8 }, blurb: "Distilled reasoning model." }),
  m({ id: "@cf/openai/gpt-oss-120b", name: "GPT-OSS 120B", modality: "text", priceIn: 0.8, priceOut: 2.5, latency: "slow", context: 32000, caps: { reasoning: 0.88, coding: 0.86, creative: 0.82, summarization: 0.84, multilingual: 0.8, instructionFollowing: 0.88 }, blurb: "Large open GPT-class model on Workers AI." }),
  m({ id: "@cf/openai/gpt-oss-20b", name: "GPT-OSS 20B", modality: "text", priceIn: 0.25, priceOut: 0.9, latency: "medium", context: 16000, caps: { reasoning: 0.72, coding: 0.72, creative: 0.7, summarization: 0.72, multilingual: 0.7, instructionFollowing: 0.75 }, blurb: "Mid-size open GPT-class model." }),
  m({ id: "@cf/google/gemma-4-26b-a4b-it", name: "Gemma 4 26B", modality: "text", priceIn: 0.3, priceOut: 0.9, latency: "medium", context: 16000, caps: { reasoning: 0.74, coding: 0.7, creative: 0.72, summarization: 0.74, multilingual: 0.72, instructionFollowing: 0.76 }, blurb: "Google Gemma instruct on the edge." }),
  m({ id: "@cf/google/gemma-7b-it-lora", name: "Gemma 7B LoRA", modality: "text", priceIn: 0.05, priceOut: 0.25, latency: "fast", context: 8000, liveChat: true, caps: { reasoning: 0.55, coding: 0.52, creative: 0.58, summarization: 0.6, multilingual: 0.55, instructionFollowing: 0.62 }, blurb: "Gemma 7B with LoRA adapters." }),
  m({ id: "@cf/google/gemma-2b-it-lora", name: "Gemma 2B LoRA", modality: "text", priceIn: 0.02, priceOut: 0.12, latency: "fast", context: 8000, liveChat: true, caps: { reasoning: 0.4, coding: 0.38, creative: 0.45, summarization: 0.5, multilingual: 0.45, instructionFollowing: 0.5 }, blurb: "Tiny Gemma LoRA." }),
  m({ id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it", name: "SEA-LION Gemma 27B", modality: "text", priceIn: 0.35, priceOut: 1.0, latency: "medium", context: 16000, caps: { reasoning: 0.7, coding: 0.62, creative: 0.68, summarization: 0.72, multilingual: 0.9, instructionFollowing: 0.74 }, blurb: "SEA multilingual specialist." }),
  m({ id: "@cf/moonshotai/kimi-k2.6", name: "Kimi K2.6", modality: "text", priceIn: 0.45, priceOut: 1.3, latency: "medium", context: 64000, caps: { reasoning: 0.84, coding: 0.78, creative: 0.8, summarization: 0.82, multilingual: 0.85, instructionFollowing: 0.84 }, blurb: "Long-context Kimi instruct." }),
  m({ id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code", modality: "code", priceIn: 0.5, priceOut: 1.4, latency: "medium", context: 64000, caps: { reasoning: 0.8, coding: 0.9, creative: 0.6, summarization: 0.7, multilingual: 0.75, instructionFollowing: 0.82 }, blurb: "Kimi code-specialized." }),
  m({ id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash", modality: "text", priceIn: 0.15, priceOut: 0.5, latency: "fast", context: 16000, caps: { reasoning: 0.7, coding: 0.68, creative: 0.68, summarization: 0.72, multilingual: 0.78, instructionFollowing: 0.74 }, blurb: "Fast GLM flash model." }),
  m({ id: "@cf/zai-org/glm-5.2", name: "GLM 5.2", modality: "text", priceIn: 0.4, priceOut: 1.2, latency: "medium", context: 32000, caps: { reasoning: 0.82, coding: 0.8, creative: 0.76, summarization: 0.8, multilingual: 0.82, instructionFollowing: 0.84 }, blurb: "Strong GLM general model." }),
  m({ id: "@cf/nvidia/nemotron-3-120b-a12b", name: "Nemotron 3 120B", modality: "text", priceIn: 0.9, priceOut: 2.8, latency: "slow", context: 32000, caps: { reasoning: 0.9, coding: 0.88, creative: 0.78, summarization: 0.82, multilingual: 0.78, instructionFollowing: 0.88 }, blurb: "Large NVIDIA Nemotron instruct." }),
  m({ id: "@cf/ibm-granite/granite-4.0-h-micro", name: "Granite 4.0 Micro", modality: "text", priceIn: 0.04, priceOut: 0.2, latency: "fast", context: 8000, caps: { reasoning: 0.55, coding: 0.58, creative: 0.5, summarization: 0.6, multilingual: 0.55, instructionFollowing: 0.65 }, blurb: "IBM Granite micro instruct." }),
  m({ id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", name: "Mistral 7B LoRA", modality: "text", priceIn: 0.04, priceOut: 0.22, latency: "fast", context: 8000, liveChat: true, caps: { reasoning: 0.58, coding: 0.55, creative: 0.58, summarization: 0.62, multilingual: 0.7, instructionFollowing: 0.65 }, blurb: "Mistral 7B with LoRA." }),
  m({ id: "@cf/meta-llama/llama-2-7b-chat-hf-lora", name: "Llama 2 7B Chat LoRA", modality: "text", priceIn: 0.03, priceOut: 0.18, latency: "fast", context: 4000, liveChat: true, caps: { reasoning: 0.48, coding: 0.45, creative: 0.5, summarization: 0.55, multilingual: 0.5, instructionFollowing: 0.55 }, blurb: "Legacy Llama 2 chat LoRA." }),

  // ---- Embeddings ----
  m({ id: "@cf/baai/bge-m3", name: "BGE-M3", modality: "embedding", priceIn: 0.01, priceOut: 0.01, latency: "fast", liveChat: false, caps: { reasoning: 0.3, coding: 0.25, creative: 0.2, summarization: 0.75, multilingual: 0.9, instructionFollowing: 0.4 }, blurb: "Multilingual embedding workhorse." }),
  m({ id: "@cf/baai/bge-small-en-v1.5", name: "BGE Small EN", modality: "embedding", priceIn: 0.005, priceOut: 0.005, latency: "fast", liveChat: false, blurb: "Small English embeddings." }),
  m({ id: "@cf/baai/bge-base-en-v1.5", name: "BGE Base EN", modality: "embedding", priceIn: 0.008, priceOut: 0.008, latency: "fast", liveChat: false, blurb: "Base English embeddings." }),
  m({ id: "@cf/baai/bge-large-en-v1.5", name: "BGE Large EN", modality: "embedding", priceIn: 0.015, priceOut: 0.015, latency: "fast", liveChat: false, blurb: "Large English embeddings." }),
  m({ id: "@cf/qwen/qwen3-embedding-0.6b", name: "Qwen3 Embedding 0.6B", modality: "embedding", priceIn: 0.01, priceOut: 0.01, latency: "fast", liveChat: false, blurb: "Qwen embedding model." }),
  m({ id: "@cf/google/embeddinggemma-300m", name: "EmbeddingGemma 300M", modality: "embedding", priceIn: 0.008, priceOut: 0.008, latency: "fast", liveChat: false, blurb: "Gemma embedding model." }),
  m({ id: "@cf/pfnet/plamo-embedding-1b", name: "PLaMo Embedding 1B", modality: "embedding", priceIn: 0.012, priceOut: 0.012, latency: "fast", liveChat: false, blurb: "PLaMo embeddings." }),

  // ---- Classification / rerank ----
  m({ id: "@cf/huggingface/distilbert-sst-2-int8", name: "DistilBERT SST-2", modality: "classify", priceIn: 0.005, priceOut: 0.005, latency: "fast", liveChat: false, blurb: "Sentiment classification." }),
  m({ id: "@cf/baai/bge-reranker-base", name: "BGE Reranker Base", modality: "classify", priceIn: 0.01, priceOut: 0.01, latency: "fast", liveChat: false, blurb: "Passage reranker." }),
  m({ id: "@cf/microsoft/resnet-50", name: "ResNet-50", modality: "classify", priceIn: 0.01, priceOut: 0.01, latency: "fast", liveChat: false, vision: true, blurb: "Image classification CNN." }),

  // ---- Translation ----
  m({ id: "@cf/meta/m2m100-1.2b", name: "M2M100 1.2B", modality: "translate", priceIn: 0.02, priceOut: 0.02, latency: "fast", liveChat: false, caps: { reasoning: 0.4, coding: 0.2, creative: 0.4, summarization: 0.5, multilingual: 0.95, instructionFollowing: 0.55 }, blurb: "Many-to-many translation." }),
  m({ id: "@cf/ai4bharat/indictrans2-en-indic-1B", name: "IndicTrans2 EN→Indic", modality: "translate", priceIn: 0.02, priceOut: 0.02, latency: "fast", liveChat: false, caps: { reasoning: 0.4, coding: 0.2, creative: 0.35, summarization: 0.45, multilingual: 0.92, instructionFollowing: 0.5 }, blurb: "English to Indic translation." }),

  // ---- Image generation ----
  m({ id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 Schnell", modality: "image", priceIn: 0.0, priceOut: 0.003, latency: "medium", liveChat: false, blurb: "Fast FLUX image gen." }),
  m({ id: "@cf/black-forest-labs/flux-2-dev", name: "FLUX.2 Dev", modality: "image", priceIn: 0.0, priceOut: 0.008, latency: "slow", liveChat: false, blurb: "Higher quality FLUX.2." }),
  m({ id: "@cf/black-forest-labs/flux-2-klein-4b", name: "FLUX.2 Klein 4B", modality: "image", priceIn: 0.0, priceOut: 0.004, latency: "medium", liveChat: false, blurb: "Compact FLUX.2 Klein." }),
  m({ id: "@cf/black-forest-labs/flux-2-klein-9b", name: "FLUX.2 Klein 9B", modality: "image", priceIn: 0.0, priceOut: 0.006, latency: "medium", liveChat: false, blurb: "Larger FLUX.2 Klein." }),
  m({ id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", name: "SDXL Base 1.0", modality: "image", priceIn: 0.0, priceOut: 0.005, latency: "slow", liveChat: false, blurb: "Stable Diffusion XL base." }),
  m({ id: "@cf/bytedance/stable-diffusion-xl-lightning", name: "SDXL Lightning", modality: "image", priceIn: 0.0, priceOut: 0.003, latency: "fast", liveChat: false, blurb: "Fast SDXL Lightning." }),
  m({ id: "@cf/lykon/dreamshaper-8-lcm", name: "DreamShaper 8 LCM", modality: "image", priceIn: 0.0, priceOut: 0.003, latency: "fast", liveChat: false, blurb: "DreamShaper LCM images." }),
  m({ id: "@cf/leonardo/phoenix-1.0", name: "Leonardo Phoenix 1.0", modality: "image", priceIn: 0.0, priceOut: 0.007, latency: "medium", liveChat: false, blurb: "Leonardo Phoenix image model." }),
  m({ id: "@cf/leonardo/lucid-origin", name: "Leonardo Lucid Origin", modality: "image", priceIn: 0.0, priceOut: 0.007, latency: "medium", liveChat: false, blurb: "Leonardo Lucid Origin." }),
  m({ id: "@cf/runwayml/stable-diffusion-v1-5-img2img", name: "SD 1.5 Img2Img", modality: "image", priceIn: 0.0, priceOut: 0.003, latency: "medium", liveChat: false, blurb: "SD 1.5 image-to-image." }),
  m({ id: "@cf/runwayml/stable-diffusion-v1-5-inpainting", name: "SD 1.5 Inpainting", modality: "image", priceIn: 0.0, priceOut: 0.003, latency: "medium", liveChat: false, blurb: "SD 1.5 inpainting." }),

  // ---- Vision / image-to-text ----
  m({ id: "@cf/llava-hf/llava-1.5-7b-hf", name: "LLaVA 1.5 7B", modality: "vision", priceIn: 0.05, priceOut: 0.3, latency: "medium", liveChat: false, vision: true, blurb: "Image-to-text vision LLM." }),
  m({ id: "@cf/moondream/moondream3.1-9B-A2B", name: "Moondream 3.1", modality: "vision", priceIn: 0.04, priceOut: 0.25, latency: "medium", liveChat: false, vision: true, blurb: "Compact vision-language model." }),

  // ---- Audio / speech ----
  m({ id: "@cf/openai/whisper", name: "Whisper", modality: "audio", priceIn: 0.0005, priceOut: 0.0005, latency: "medium", liveChat: false, blurb: "Speech-to-text Whisper." }),
  m({ id: "@cf/openai/whisper-tiny-en", name: "Whisper Tiny EN", modality: "audio", priceIn: 0.0002, priceOut: 0.0002, latency: "fast", liveChat: false, blurb: "Tiny English STT." }),
  m({ id: "@cf/openai/whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", modality: "audio", priceIn: 0.0008, priceOut: 0.0008, latency: "medium", liveChat: false, blurb: "High quality STT turbo." }),
  m({ id: "@cf/deepgram/nova-3", name: "Deepgram Nova 3", modality: "audio", priceIn: 0.0006, priceOut: 0.0006, latency: "fast", liveChat: false, blurb: "Deepgram STT Nova 3." }),
  m({ id: "@cf/deepgram/flux", name: "Deepgram Flux", modality: "audio", priceIn: 0.0005, priceOut: 0.0005, latency: "fast", liveChat: false, blurb: "Deepgram Flux STT." }),
  m({ id: "@cf/deepgram/aura-1", name: "Deepgram Aura 1", modality: "speech", priceIn: 0.001, priceOut: 0.001, latency: "fast", liveChat: false, blurb: "TTS Aura 1." }),
  m({ id: "@cf/deepgram/aura-2-en", name: "Deepgram Aura 2 EN", modality: "speech", priceIn: 0.0012, priceOut: 0.0012, latency: "fast", liveChat: false, blurb: "English TTS Aura 2." }),
  m({ id: "@cf/deepgram/aura-2-es", name: "Deepgram Aura 2 ES", modality: "speech", priceIn: 0.0012, priceOut: 0.0012, latency: "fast", liveChat: false, blurb: "Spanish TTS Aura 2." }),
  m({ id: "@cf/myshell-ai/melotts", name: "MeloTTS", modality: "speech", priceIn: 0.0008, priceOut: 0.0008, latency: "fast", liveChat: false, blurb: "Melo text-to-speech." }),

  // ---- Other ----
  m({ id: "@cf/pipecat-ai/smart-turn-v2", name: "Smart Turn v2", modality: "other", priceIn: 0.001, priceOut: 0.001, latency: "fast", liveChat: false, blurb: "Turn detection utility model." }),

  // ---- Commercial comps (estimate only unless Gateway keys) ----
  m({ id: "anthropic/claude-opus-4", name: "Claude Opus 4", provider: "Anthropic", kind: "commercial", modality: "text", liveChat: false, priceIn: 15, priceOut: 75, latency: "slow", context: 200000, vision: true, caps: { reasoning: 0.97, coding: 0.95, creative: 0.92, summarization: 0.92, multilingual: 0.86, instructionFollowing: 0.95 }, blurb: "Top-tier commercial reasoning/coding." }),
  m({ id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", kind: "commercial", modality: "text", liveChat: false, priceIn: 3, priceOut: 15, latency: "medium", context: 200000, vision: true, caps: { reasoning: 0.9, coding: 0.9, creative: 0.88, summarization: 0.9, multilingual: 0.84, instructionFollowing: 0.92 }, blurb: "High-end value commercial model." }),
  m({ id: "anthropic/claude-haiku-3.5", name: "Claude Haiku 3.5", provider: "Anthropic", kind: "commercial", modality: "text", liveChat: false, priceIn: 0.8, priceOut: 4, latency: "fast", context: 200000, vision: true, caps: { reasoning: 0.68, coding: 0.7, creative: 0.7, summarization: 0.82, multilingual: 0.76, instructionFollowing: 0.82 }, blurb: "Fast cheap commercial model." }),
  m({ id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", kind: "commercial", modality: "text", liveChat: false, priceIn: 2.5, priceOut: 10, latency: "medium", context: 128000, vision: true, caps: { reasoning: 0.88, coding: 0.86, creative: 0.9, summarization: 0.88, multilingual: 0.9, instructionFollowing: 0.9 }, blurb: "OpenAI multimodal flagship." }),
  m({ id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", kind: "commercial", modality: "text", liveChat: false, priceIn: 0.15, priceOut: 0.6, latency: "fast", context: 128000, vision: true, caps: { reasoning: 0.66, coding: 0.68, creative: 0.74, summarization: 0.82, multilingual: 0.8, instructionFollowing: 0.82 }, blurb: "Cheap OpenAI workhorse." }),
  m({ id: "openai/o3", name: "o3 (reasoning)", provider: "OpenAI", kind: "commercial", modality: "text", liveChat: false, priceIn: 10, priceOut: 40, latency: "slow", context: 200000, vision: true, caps: { reasoning: 0.98, coding: 0.92, creative: 0.78, summarization: 0.84, multilingual: 0.82, instructionFollowing: 0.9 }, blurb: "OpenAI deliberate reasoning." }),
  m({ id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", kind: "commercial", modality: "text", liveChat: false, priceIn: 1.25, priceOut: 10, latency: "medium", context: 1000000, vision: true, caps: { reasoning: 0.93, coding: 0.9, creative: 0.86, summarization: 0.92, multilingual: 0.9, instructionFollowing: 0.9 }, blurb: "Long-context Gemini Pro." }),
  m({ id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", kind: "commercial", modality: "text", liveChat: false, priceIn: 0.3, priceOut: 2.5, latency: "fast", context: 1000000, vision: true, caps: { reasoning: 0.78, coding: 0.76, creative: 0.78, summarization: 0.88, multilingual: 0.88, instructionFollowing: 0.84 }, blurb: "Fast long-context Gemini." }),
  m({ id: "mistral/mistral-large", name: "Mistral Large", provider: "Mistral", kind: "commercial", modality: "text", liveChat: false, priceIn: 2, priceOut: 6, latency: "medium", context: 128000, caps: { reasoning: 0.82, coding: 0.8, creative: 0.8, summarization: 0.82, multilingual: 0.9, instructionFollowing: 0.84 }, blurb: "Commercial Mistral Large." }),
];

export const getModel = (id: string): Model | undefined => CATALOG.find((m) => m.id === id);

export const blendedPrice = (m: Model): number => m.priceIn * 0.25 + m.priceOut * 0.75;

export const LIVE_CHAT_MODELS = CATALOG.filter((m) => m.kind === "cloudflare" && m.liveChat);

export const CATALOG_BY_MODALITY = () => {
  const map = new Map<Modality, Model[]>();
  for (const model of CATALOG) {
    const list = map.get(model.modality) ?? [];
    list.push(model);
    map.set(model.modality, list);
  }
  return map;
};
