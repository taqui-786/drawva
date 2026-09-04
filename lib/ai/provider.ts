export type ProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "nvidia"
  | "groq"
  | "openrouter"
  | "deepinfra"
  | "opencode_zen"
  | "opencode_go"
  | "mistral"
  | "together"
  | "cerebras"
  | "xai"
  | "perplexity"
  | "ollama"
  | "lmstudio"
  | "custom";

export interface CustomModel {
  id: string;
  name: string;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  customModels?: CustomModel[];
  /** Friendly name for a saved custom endpoint (e.g. "router" from https://router.bynara.id/v1). */
  customName?: string;
}

export interface TokenUsageRecord {
  id: string;
  timestamp: number;
  providerType: ProviderType;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  intent?: string;
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  defaultBaseUrl?: string;
  defaultModels: string[];
}

export const PROVIDER_INFOS: Record<ProviderType, ProviderInfo> = {
  openai: {
    type: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  anthropic: {
    type: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
  },
  gemini: {
    type: "gemini",
    name: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
  },
  groq: {
    type: "groq",
    name: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModels: [
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
  },
  nvidia: {
    type: "nvidia",
    name: "NVIDIA NIM",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModels: [
      "nvidia/neva-22b",
      "meta/llama-3.2-11b-vision-instruct",
      "meta/llama-3.2-90b-vision-instruct",
      "mistralai/pixtral-12b",
    ],
  },
  openrouter: {
    type: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModels: [
      "google/gemini-2.0-flash-001",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "meta-llama/llama-3.2-11b-vision-instruct",
    ],
  },
  deepinfra: {
    type: "deepinfra",
    name: "DeepInfra",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
    defaultModels: [
      "meta-llama/Llama-3.2-11B-Vision-Instruct",
      "meta-llama/Llama-3.2-90B-Vision-Instruct",
      "Qwen/Qwen2.5-VL-72B-Instruct",
    ],
  },
  opencode_zen: {
    type: "opencode_zen",
    name: "OpenCode Zen",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    defaultModels: [
      "claude-3-7-sonnet",
      "gpt-4o",
      "gemini-2.0-flash",
    ],
  },
  opencode_go: {
    type: "opencode_go",
    name: "OpenCode Go",
    defaultBaseUrl: "https://opencode.ai/go/v1",
    defaultModels: [
      "gpt-4o-mini",
      "claude-3-5-haiku",
      "gemini-2.0-flash",
    ],
  },
  mistral: {
    type: "mistral",
    name: "Mistral AI",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModels: [
      "pixtral-12b-2409",
      "pixtral-large-latest",
      "mistral-large-latest",
    ],
  },
  together: {
    type: "together",
    name: "Together AI",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultModels: [
      "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
      "Qwen/Qwen2.5-VL-72B-Instruct",
    ],
  },
  cerebras: {
    type: "cerebras",
    name: "Cerebras",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    defaultModels: [
      "llama-3.3-70b",
      "llama3.1-8b",
    ],
  },
  xai: {
    type: "xai",
    name: "xAI (Grok)",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModels: [
      "grok-2-vision-1212",
      "grok-2-1212",
    ],
  },
  perplexity: {
    type: "perplexity",
    name: "Perplexity",
    defaultBaseUrl: "https://api.perplexity.ai",
    defaultModels: [
      "sonar-pro",
      "sonar",
      "sonar-reasoning",
    ],
  },
  ollama: {
    type: "ollama",
    name: "Ollama (Local)",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModels: [
      "llama3.2-vision",
      "llava",
      "qwen2.5-coder",
    ],
  },
  lmstudio: {
    type: "lmstudio",
    name: "LM Studio (Local)",
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModels: [
      "default",
    ],
  },
  custom: {
    type: "custom",
    name: "Custom Endpoint",
    defaultModels: [],
  },
};

export type ReasoningEffort = "default" | "low" | "medium" | "high" | "max";

export const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: "default", label: "Auto", description: "Default model reasoning behavior" },
  { value: "low", label: "Low", description: "Light reasoning for simple tasks" },
  { value: "medium", label: "Medium", description: "Balanced depth and speed" },
  { value: "high", label: "High", description: "Deep reasoning for complex math/diagrams" },
  { value: "max", label: "Max", description: "Maximum budget for difficult derivations" },
];

import {
  getModelCapabilities,
  type ModelCapabilities,
} from "./capabilities";

const PROVIDER_KEY = "drawva.aiProvider";
const MODELS_KEY = "drawva.aiModels";
const MODEL_KEY = "drawva.aiModel";
const MODEL_CAPABILITIES_KEY = "drawva.aiModelCapabilities";
const REASONING_EFFORT_KEY = "drawva.aiReasoningEffort";
const WEB_SEARCH_KEY = "drawva.aiWebSearch";
const AUTOSAVE_KEY = "drawva.autosaveEnabled";

export function getAutosaveEnabled(): boolean {
  return read<boolean>(AUTOSAVE_KEY, true) !== false;
}

export function setAutosaveEnabled(enabled: boolean): void {
  write(AUTOSAVE_KEY, enabled);
  notify();
}

export function getWebSearchEnabled(): boolean {
  return read<boolean>(WEB_SEARCH_KEY, true) !== false;
}

export function setWebSearchEnabled(enabled: boolean): void {
  write(WEB_SEARCH_KEY, enabled);
  notify();
}

export function getReasoningEffort(): ReasoningEffort {
  const val = read<string>(REASONING_EFFORT_KEY, "default");
  if (REASONING_EFFORT_OPTIONS.some((opt) => opt.value === val)) {
    return val as ReasoningEffort;
  }
  return "default";
}

export function setReasoningEffort(effort: ReasoningEffort): void {
  write(REASONING_EFFORT_KEY, effort);
  notify();
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) return;
    window.localStorage.setItem(key, raw);
  } catch {}
}

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

export function getProviderConfig(): ProviderConfig | null {
  const raw = read<Record<string, unknown> | null>(PROVIDER_KEY, null);
  if (!raw) return null;

  if (!raw.type) {
    const legacyBaseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";
    const legacyApiKey = typeof raw.apiKey === "string" ? raw.apiKey : "";
    if (legacyApiKey) {
      const migrated: ProviderConfig = {
        type: "custom",
        baseUrl: legacyBaseUrl,
        apiKey: legacyApiKey,
      };
      setProviderConfig(migrated);
      return migrated;
    }
    return null;
  }

  return raw as unknown as ProviderConfig;
}

export function setProviderConfig(config: ProviderConfig | null): void {
  if (config) write(PROVIDER_KEY, config);
  else if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(PROVIDER_KEY);
    } catch {}
  }
  notify();
}

export function isProviderConfigured(): boolean {
  const cfg = getProviderConfig();
  if (!cfg) return false;
  if (!cfg.apiKey) return false;
  if (cfg.type === "custom") {
    return Boolean(cfg.baseUrl?.trim());
  }
  return true;
}

export function getCachedModels(): string[] {
  return read<string[]>(MODELS_KEY, []);
}

export function setCachedModels(models: string[]): void {
  write(MODELS_KEY, Array.isArray(models) ? models : []);
  notify();
}

export function getActiveModel(): string | null {
  return read<string | null>(MODEL_KEY, null);
}

export function setActiveModel(model: string | null): void {
  if (model) write(MODEL_KEY, model);
  else if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(MODEL_KEY);
    } catch {}
  }
  notify();
}

export function getCachedModelCapabilities(): Record<string, ModelCapabilities> {
  return read<Record<string, ModelCapabilities>>(MODEL_CAPABILITIES_KEY, {});
}

export function setCachedModelCapabilities(
  caps: Record<string, ModelCapabilities>,
  shouldNotify = true
): void {
  const current = getCachedModelCapabilities();
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(caps || {});
  if (
    currentKeys.length === nextKeys.length &&
    nextKeys.every(
      (k) =>
        current[k]?.vision === caps[k]?.vision &&
        current[k]?.reasoning === caps[k]?.reasoning &&
        current[k]?.status === caps[k]?.status
    )
  ) {
    return;
  }
  write(MODEL_CAPABILITIES_KEY, caps || {});
  if (shouldNotify) {
    notify();
  }
}

export function getModelCapabilitiesCached(modelId: string): ModelCapabilities {
  if (!modelId) return { vision: false, reasoning: false, status: "unknown" };
  const cached = getCachedModelCapabilities();
  if (cached[modelId]) {
    return cached[modelId];
  }
  return getModelCapabilities(modelId);
}

/** Storage key prefix for named custom endpoints inside the saved-credentials map. */
export const CUSTOM_PROVIDER_KEY_PREFIX = "custom:";

export function customStorageKey(name: string): string {
  return `${CUSTOM_PROVIDER_KEY_PREFIX}${name.toLowerCase()}`;
}

export function isCustomProviderKey(key: string): boolean {
  return key.startsWith(CUSTOM_PROVIDER_KEY_PREFIX);
}

export function getCustomNameFromKey(key: string): string {
  return key.slice(CUSTOM_PROVIDER_KEY_PREFIX.length);
}

/**
 * Derive a short friendly name from an OpenAI-compatible base URL.
 * e.g. https://router.bynara.id/v1 -> "router", https://api.example.com/v1 -> "example".
 */
export function deriveCustomProviderName(baseUrl: string): string {
  try {
    const hostname = new URL(baseUrl.trim()).hostname.toLowerCase();
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length === 0) return "custom";
    // Skip leading www.
    const meaningful = parts[0] === "www" ? parts.slice(1) : parts;
    if (meaningful.length === 0) return "custom";
    // router.bynara.id -> router, api.example.com -> example (skip generic api?)
    const GENERIC = new Set(["api", "openai", "v1", "gateway", "proxy"]);
    if (meaningful.length >= 3) {
      const first = meaningful[0];
      if (!GENERIC.has(first)) return sanitizeCustomName(first);
      return sanitizeCustomName(meaningful[1] || first);
    }
    const candidate = meaningful[0];
    if (GENERIC.has(candidate) && meaningful.length > 1) {
      return sanitizeCustomName(meaningful[1] || candidate);
    }
    return sanitizeCustomName(candidate);
  } catch {
    return "custom";
  }
}

function sanitizeCustomName(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 32);
  return cleaned || "custom";
}