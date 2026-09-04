
export interface RegistryModelDetails {
  id: string;
  name?: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
  reasoning?: {
    mandatory?: boolean;
    default_enabled?: boolean;
    supported_efforts?: string[];
    default_effort?: string;
  } | null;
}

export interface ModelCapabilityResult {
  vision: boolean;
  reasoning: boolean;
  status: "verified_vision" | "verified_no_vision" | "unknown";
  source: "registry" | "provider" | "heuristic";
}

let cachedRegistry: Map<string, RegistryModelDetails> | null = null;
let lastFetchTime = 0;
const REGISTRY_CACHE_TTL_MS = 15 * 60 * 1000;

export async function getOpenRouterModelRegistry(): Promise<Map<string, RegistryModelDetails>> {
  const now = Date.now();
  if (cachedRegistry && now - lastFetchTime < REGISTRY_CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = (await res.json()) as { data?: RegistryModelDetails[] };
      if (Array.isArray(data.data)) {
        const map = new Map<string, RegistryModelDetails>();
        for (const item of data.data) {
          if (item && typeof item.id === "string") {
            map.set(item.id.toLowerCase(), item);
          }
        }
        cachedRegistry = map;
        lastFetchTime = now;
        return map;
      }
    }
  } catch (err) {
    console.warn("[ModelRegistry] Could not refresh OpenRouter registry:", err);
  }

  return cachedRegistry || new Map();
}

export async function inspectModelCapabilities(
  modelId: string,
  rawMeta?: Record<string, unknown>
): Promise<ModelCapabilityResult> {
  if (!modelId) {
    return {
      vision: false,
      reasoning: false,
      status: "unknown",
      source: "heuristic",
    };
  }

  const normId = modelId.toLowerCase().trim();

  if (rawMeta && typeof rawMeta === "object") {
    const arch = rawMeta.architecture as Record<string, unknown> | undefined;
    const inputMods = Array.isArray(arch?.input_modalities)
      ? (arch.input_modalities as unknown[]).map(String)
      : Array.isArray(rawMeta.input_modalities)
      ? (rawMeta.input_modalities as unknown[]).map(String)
      : null;

    if (inputMods) {
      const hasImage = inputMods.some((m) => m.toLowerCase().includes("image"));
      const hasReasoning =
        Boolean(rawMeta.reasoning) ||
        (Array.isArray(rawMeta.supported_parameters) &&
          (rawMeta.supported_parameters as unknown[]).some((p) =>
            String(p).toLowerCase().includes("reasoning")
          ));

      return {
        vision: hasImage,
        reasoning: hasReasoning,
        status: hasImage ? "verified_vision" : "verified_no_vision",
        source: "provider",
      };
    }
  }

  const registry = await getOpenRouterModelRegistry();
  const entry =
    registry.get(normId) ||
    registry.get(normId.replace(/:free$/, "")) ||
    [...registry.values()].find((m) => m.id.toLowerCase().endsWith(normId) || normId.endsWith(m.id.toLowerCase()));

  if (entry) {
    const inputs = entry.architecture?.input_modalities || [];
    const hasImage = Array.isArray(inputs) && inputs.some((m) => String(m).toLowerCase().includes("image"));
    const hasReasoning =
      Boolean(entry.reasoning) ||
      (Array.isArray(entry.supported_parameters) &&
        entry.supported_parameters.some((p) => String(p).toLowerCase().includes("reasoning")));

    return {
      vision: hasImage,
      reasoning: hasReasoning,
      status: hasImage ? "verified_vision" : "verified_no_vision",
      source: "registry",
    };
  }

  const isReasoning =
    normId.startsWith("o1") ||
    normId.startsWith("o3") ||
    normId.startsWith("o4") ||
    normId.includes("claude-3-7") ||
    normId.includes("claude-3.7") ||
    normId.includes("claude-4") ||
    normId.includes("thinking") ||
    normId.includes("gemini-2.5") ||
    normId.includes("deepseek-r1") ||
    normId.includes("qwq") ||
    normId.includes("reasoning");

  const isDefiniteTextOnly =
    normId.includes("gpt-3.5") ||
    normId.includes("text-davinci") ||
    normId.includes("o1-mini") ||
    normId.includes("o3-mini") ||
    (normId.startsWith("gpt-4") &&
      !normId.includes("4o") &&
      !normId.includes("turbo") &&
      !normId.includes("vision")) ||
    normId.includes("claude-2") ||
    normId.includes("claude-instant") ||
    normId.includes("llama-3.1-") ||
    normId.includes("llama-3.3-") ||
    normId.includes("deepseek-chat") ||
    normId.includes("deepseek-coder");

  if (isDefiniteTextOnly) {
    return {
      vision: false,
      reasoning: isReasoning,
      status: "verified_no_vision",
      source: "heuristic",
    };
  }

  const isKnownVision =
    normId.includes("vision") ||
    normId.includes("-vl") ||
    normId.includes("vl-") ||
    normId.includes("gpt-4o") ||
    normId.includes("gpt-4-turbo") ||
    normId.includes("claude-3") ||
    normId.includes("gemini") ||
    normId.includes("pixtral") ||
    normId.includes("llava") ||
    normId.includes("neva") ||
    normId.includes("molmo") ||
    normId.includes("paligemma");

  if (isKnownVision) {
    return {
      vision: true,
      reasoning: isReasoning,
      status: "verified_vision",
      source: "heuristic",
    };
  }

  return {
    vision: false,
    reasoning: isReasoning,
    status: "unknown",
    source: "heuristic",
  };
}
