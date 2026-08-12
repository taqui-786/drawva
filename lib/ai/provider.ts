// ============================================================
// Drawva AI — client-side provider configuration storage.
// Safe-SSR localStorage helpers for the user-configured LLM
// provider (base URL + API key), fetched model list, and the
// active model selection. Keys mirror the old drawva.aiModel.
// ============================================================

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

const PROVIDER_KEY = "drawva.aiProvider";
const MODELS_KEY = "drawva.aiModels";
const MODEL_KEY = "drawva.aiModel";

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

/** Broadcast a change so other tabs / the header select stay in sync. */
function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

export function getProviderConfig(): ProviderConfig | null {
  return read<ProviderConfig | null>(PROVIDER_KEY, null);
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
  return Boolean(cfg?.baseUrl && cfg.apiKey);
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