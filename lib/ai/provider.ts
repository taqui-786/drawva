export type ProviderType = "openai" | "anthropic" | "gemini" | "nvidia" | "groq" | "custom";

export interface CustomModel {
  id: string;
  name: string;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  customModels?: CustomModel[];
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

const PROVIDER_KEY = "drawva.aiProvider";
const MODELS_KEY = "drawva.aiModels";
const MODEL_KEY = "drawva.aiModel";
const REASONING_EFFORT_KEY = "drawva.aiReasoningEffort";
const TOKEN_USAGE_KEY = "drawva.tokenUsage";
const PLUGINS_KEY = "drawva.enabledPlugins";

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

export const DEFAULT_ENABLED_PLUGINS = [
  "general",
  "flowchart",
  "weather",
  "stocks",
  "earthquakes",
  "exchange-rates",
  "github-pulse",
  "image-search",
  "natural-events",
  "space-weather",
  "tech-news",
];

export function getEnabledPlugins(): string[] {
  return read<string[]>(PLUGINS_KEY, DEFAULT_ENABLED_PLUGINS);
}

export function setEnabledPlugins(pluginIds: string[]): void {
  write(PLUGINS_KEY, Array.isArray(pluginIds) ? pluginIds : DEFAULT_ENABLED_PLUGINS);
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
  if (!cfg || !cfg.apiKey) return false;
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

export function getTokenUsageHistory(): TokenUsageRecord[] {
  return read<TokenUsageRecord[]>(TOKEN_USAGE_KEY, []);
}

export function addTokenUsageRecord(record: Omit<TokenUsageRecord, "id" | "timestamp">): TokenUsageRecord {
  const history = getTokenUsageHistory();
  const fullRecord: TokenUsageRecord = {
    ...record,
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  const updated = [fullRecord, ...history].slice(0, 200);
  write(TOKEN_USAGE_KEY, updated);
  notify();
  return fullRecord;
}

export function clearTokenUsageHistory(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(TOKEN_USAGE_KEY);
    } catch {}
  }
  notify();
}