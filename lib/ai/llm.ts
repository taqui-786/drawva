/**
 * One-shot LLM text calls for the non-agent routes (`canvas/refine`,
 * `plugins/author`).
 *
 * The agent loop does NOT come through here: it runs on the DeepSeek harness
 * (`lib/ai/dsh/*`), which owns the session log, tool registry, streaming, and
 * compaction. This module is the small remainder — a single prompt in, text
 * out, over plain `fetch` with retries and a hard timeout.
 */
import { PROVIDER_INFOS, type ProviderType } from "./provider";

export const LLM_MAX_RETRIES = 2;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmConfig {
  kind: "openai-compat" | "anthropic";
  url: string;
  headers: Record<string, string>;
  model: string;
  timeoutMs?: number;
  providerType: ProviderType;
}

export function resolveLlmConfig(options: {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}): LlmConfig {
  const providerType = options.providerType || "custom";
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey || !model) throw new Error("Missing API key or model.");
  const cleanBaseUrl = options.baseUrl?.trim().replace(/\/+$/, "") || PROVIDER_INFOS[providerType]?.defaultBaseUrl || "";
  if (providerType === "custom" && !cleanBaseUrl) throw new Error("Custom provider requires a Base URL.");

  if (providerType === "anthropic" && !isOpenAiCompatOverride(cleanBaseUrl)) {
    const url = cleanBaseUrl.includes("/v1/messages")
      ? cleanBaseUrl
      : `${cleanBaseUrl || "https://api.anthropic.com"}/v1/messages`;
    return {
      kind: "anthropic",
      url,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      model,
      timeoutMs: options.timeoutMs,
      providerType,
    };
  }

  const effectiveBaseUrl =
    cleanBaseUrl ||
    (providerType === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "") ||
    (providerType === "openai" ? "https://api.openai.com/v1" : "");
  if (!effectiveBaseUrl) throw new Error(`Missing baseUrl for provider ${providerType}.`);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (effectiveBaseUrl.includes("agentrouter.org")) {
    // ponytail: single header quirk kept — AgentRouter rejects non-CLI user agents.
    headers["user-agent"] = "claude-cli/0.2.29 (external, cli)";
  }
  if (effectiveBaseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://drawva.app";
    headers["X-Title"] = "Drawva";
  }
  return {
    kind: "openai-compat",
    url: `${effectiveBaseUrl}/chat/completions`,
    headers,
    model,
    timeoutMs: options.timeoutMs,
    providerType,
  };
}

function isOpenAiCompatOverride(baseUrl: string): boolean {
  return baseUrl.includes("/v1") || baseUrl.includes("openrouter.ai") || baseUrl.includes("agentrouter.org");
}

// ---------------------------------------------------------------------------
// Error classification (routes map these onto user-facing messages)
// ---------------------------------------------------------------------------

export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const rec = err as Record<string, unknown>;
  const status = Number(rec.status || rec.statusCode || 0);
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("capacity") ||
    msg.includes("resource_exhausted")
  );
}

export function isFatalAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const rec = err as Record<string, unknown>;
  const status = Number(rec.status || rec.statusCode || 0);
  return (
    status === 401 ||
    status === 403 ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("unauthorized") ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key")
  );
}

export class LlmHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmHttpError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function timeoutSignal(
  timeoutMs: number | undefined,
  outer: AbortSignal | undefined
): { signal: AbortSignal | undefined; done: () => void } {
  if (!timeoutMs) return { signal: outer, done: () => {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`Provider request timed out after ${timeoutMs}ms.`)), timeoutMs);
  if (outer) {
    if (outer.aborted) {
      clearTimeout(timer);
      ctrl.abort(outer.reason);
    } else {
      outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
  }
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const headerMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
  if (Number.isFinite(headerMs) && headerMs > 0) return Math.min(headerMs, 10_000);
  return Math.min(500 * 2 ** attempt, 4000);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw signal.reason;
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (attempt < LLM_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, null)));
        continue;
      }
      throw err;
    }
    if (res.ok) return res;
    const retryAfter = res.headers.get("retry-after");
    const message = await readErrorBody(res);
    const err = new LlmHttpError(res.status, message);
    if (isFatalAuthError(err) || signal?.aborted) throw err;
    lastErr = err;
    if ((res.status === 429 || res.status >= 500) && attempt < LLM_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, retryDelayMs(attempt, retryAfter)));
      continue;
    }
    throw err;
  }
  throw lastErr instanceof Error ? lastErr : new Error("Provider request failed.");
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      if (typeof parsed.error === "string") return parsed.error;
      if (parsed.error?.message) return parsed.error.message;
    } catch {}
    return text.trim().slice(0, 500) || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function splitDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (match) return { mediaType: match[1], data: match[2] };
  return { mediaType: "image/png", data: dataUrl };
}

// ---------------------------------------------------------------------------
// One-shot completion (refine / plugin author — text only, no tools)
// ---------------------------------------------------------------------------

export async function completeLlmText(
  config: LlmConfig,
  options: { system?: string; prompt: string; images?: string[]; maxOutputTokens?: number; signal?: AbortSignal }
): Promise<{ text: string; usage: TokenUsage }> {
  const { signal: timeoutSig, done } = timeoutSignal(config.timeoutMs, options.signal);
  try {
    if (config.kind === "anthropic") {
      const body: Record<string, unknown> = {
        model: config.model,
        ...(options.system ? { system: options.system } : {}),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: options.prompt },
              ...(options.images || []).map((dataUrl) => {
                const part = splitDataUrl(dataUrl);
                return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
              }),
            ],
          },
        ],
        max_tokens: options.maxOutputTokens ?? 1024,
        stream: false,
      };
      const res = await postJson(config.url, config.headers, body, timeoutSig);
      const payload = (await res.json()) as {
        content?: { type?: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (payload.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
      return {
        text,
        usage: { inputTokens: payload.usage?.input_tokens || 0, outputTokens: payload.usage?.output_tokens || 0 },
      };
    }
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        ...(options.system ? [{ role: "system", content: options.system }] : []),
        {
          role: "user",
          content: [
            { type: "text", text: options.prompt },
            ...(options.images || []).map((dataUrl) => ({ type: "image_url", image_url: { url: dataUrl } })),
          ],
        },
      ],
      max_tokens: options.maxOutputTokens ?? 1024,
      stream: false,
    };
    const res = await postJson(config.url, config.headers, body, timeoutSig);
    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: payload.choices?.[0]?.message?.content || "",
      usage: { inputTokens: payload.usage?.prompt_tokens || 0, outputTokens: payload.usage?.completion_tokens || 0 },
    };
  } finally {
    done();
  }
}
