/**
 * Model capabilities detection for Drawva.
 * Identifies whether an AI model supports:
 *  1. Vision (canvas image perception)
 *  2. Reasoning / Thinking (chain-of-thought effort configuration)
 *
 * Uses API-provided metadata when available (e.g. OpenRouter architecture/input_modalities),
 * combined with comprehensive heuristics for all major AI providers.
 */

export interface ModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  status?: "verified_vision" | "verified_no_vision" | "unknown";
}

/**
 * Checks if a model supports visual/image inputs (canvas screenshots).
 */
export function isVisionModel(
  modelId: string,
  metadata?: Record<string, unknown>
): boolean {
  if (!modelId) return false;

  // 1. Check API metadata object if provided (OpenRouter, Ollama, etc.)
  if (metadata && typeof metadata === "object") {
    const arch = metadata.architecture as Record<string, unknown> | undefined;
    const inputMods = Array.isArray(arch?.input_modalities)
      ? (arch.input_modalities as unknown[]).map(String)
      : Array.isArray(metadata.input_modalities)
      ? (metadata.input_modalities as unknown[]).map(String)
      : null;

    if (inputMods) {
      const hasImage = inputMods.some((m) => m.toLowerCase().includes("image"));
      if (hasImage) return true;
    }

    if (typeof metadata.modality === "string" && metadata.modality.includes("image")) {
      return true;
    }

    if (
      metadata.supports_image === true ||
      metadata.supports_vision === true ||
      metadata.vision === true
    ) {
      return true;
    }

    if (
      metadata.supports_image === false ||
      metadata.supports_vision === false ||
      metadata.vision === false
    ) {
      return false;
    }
  }

  const id = modelId.toLowerCase();

  // 2. Explicit non-vision models (text-only models that cannot process canvas drawings)
  if (
    id.includes("gpt-3.5") ||
    id.includes("text-davinci") ||
    id.includes("o1-mini") ||
    id.includes("o3-mini") ||
    (id.startsWith("gpt-4") &&
      !id.includes("4o") &&
      !id.includes("turbo") &&
      !id.includes("vision")) ||
    id.includes("claude-2") ||
    id.includes("claude-instant") ||
    id.includes("llama-3.1-") ||
    id.includes("llama-3.3-") ||
    id.includes("llama-2-") ||
    id.includes("deepseek-chat") ||
    id.includes("deepseek-coder") ||
    (id.includes("deepseek-r1") && !id.includes("vl")) ||
    (id.includes("qwen-2.5") && !id.includes("vl")) ||
    (id.includes("mistral") && !id.includes("pixtral"))
  ) {
    return false;
  }

  // 3. Known Vision model families
  return (
    id.includes("vision") ||
    id.includes("-vl") ||
    id.includes("vl-") ||
    id.includes("gpt-4o") ||
    id.includes("gpt-4-turbo") ||
    (id.startsWith("o1") && !id.includes("mini")) ||
    (id.startsWith("o3") && !id.includes("mini")) ||
    id.startsWith("o4") ||
    id.includes("claude-3") ||
    id.includes("claude-4") ||
    id.includes("gemini") ||
    id.includes("pixtral") ||
    id.includes("llava") ||
    id.includes("neva") ||
    id.includes("molmo") ||
    id.includes("paligemma") ||
    id.includes("fuyu") ||
    id.includes("cogvlm") ||
    id.includes("internvl") ||
    id.includes("deepseek-vl") ||
    id.includes("phi-3-vision") ||
    id.includes("phi-3.5-vision") ||
    id.includes("qwen-vl") ||
    id.includes("minicpm") ||
    id.includes("idefics") ||
    id.includes("reka")
  );
}

/**
 * Checks if a model supports reasoning/thinking depth controls.
 */
export function isReasoningModel(
  modelId: string,
  metadata?: Record<string, unknown>
): boolean {
  if (!modelId) return false;

  // 1. Check API metadata object if provided (OpenRouter reasoning/supported_parameters)
  if (metadata && typeof metadata === "object") {
    if (metadata.reasoning && typeof metadata.reasoning === "object") {
      return true;
    }
    if (Array.isArray(metadata.supported_parameters)) {
      const params = metadata.supported_parameters.map((p) => String(p).toLowerCase());
      if (params.includes("reasoning") || params.includes("include_reasoning")) {
        return true;
      }
    }
    if (metadata.supports_reasoning === true) {
      return true;
    }
    if (metadata.supports_reasoning === false) {
      return false;
    }
  }

  const id = modelId.toLowerCase();

  // 2. Known Reasoning model patterns
  // OpenAI: o1, o3, o4, gpt-5 (except gpt-5-chat)
  if (
    /^(openai\/)?o[134]([-_]|\b)/i.test(id) ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4")
  ) {
    return true;
  }
  if (id.startsWith("gpt-5") && !id.includes("chat")) {
    return true;
  }

  // Anthropic: Claude 3.7 Sonnet, Claude 4
  if (id.includes("claude-3-7") || id.includes("claude-3.7") || id.includes("claude-4")) {
    return true;
  }

  // Google: Gemini Thinking models & Gemini 2.5 Pro
  if (id.includes("thinking") || id.includes("gemini-2.5-pro")) {
    return true;
  }

  // Open-source: DeepSeek R1, QwQ, reasoning variants
  if (
    id.includes("deepseek-r1") ||
    id.includes("qwq") ||
    id.includes("reasoning") ||
    id.includes("reasoner")
  ) {
    return true;
  }

  return false;
}

/**
 * Returns full capability descriptor for a model.
 */
export function getModelCapabilities(
  modelId: string,
  metadata?: Record<string, unknown>
): ModelCapabilities {
  const vision = isVisionModel(modelId, metadata);
  const reasoning = isReasoningModel(modelId, metadata);
  return {
    vision,
    reasoning,
    status: vision ? "verified_vision" : "unknown",
  };
}

// ponytail: static family table, good enough for compaction triggers; swap for
// provider `context_length` metadata if small models start over/under-compacting.
const CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  [/^gpt-5/, 400_000],
  [/^gpt-4\.1/, 1_000_000],
  [/^o[134]/, 200_000],
  [/gpt-4o|gpt-4-turbo|chatgpt/, 128_000],
  [/claude/, 200_000],
  [/gemini-1\.5-pro/, 1_000_000],
  [/gemini/, 1_000_000],
  [/deepseek/, 64_000],
  [/llama-3\.[13]|qwq|mistral|mixtral|kimi|minimax/i, 128_000],
  [/grok/, 131_000],
];

const DEFAULT_CONTEXT_WINDOW = 128_000;

export function contextWindowForModel(modelId: string): number {
  const id = String(modelId || "").toLowerCase();
  for (const [pattern, window] of CONTEXT_WINDOWS) {
    if (pattern.test(id)) return window;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Token pressure that triggers history compaction: 62.5% of the model's
 * context window (mirrors the 100k/160k policy of comparable agent loops).
 */
export function compactionTriggerTokens(modelId: string): number {
  return Math.max(4_000, Math.round(contextWindowForModel(modelId) * 0.625));
}
