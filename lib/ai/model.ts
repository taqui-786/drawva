import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { streamText } from "ai";
import type { ProviderType, ReasoningEffort } from "./provider";

export const MAX_RETRIES = 3;

export type LanguageModel = Parameters<typeof streamText>[0]["model"];

export interface CreateChatModelOptions {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey: string;
  model: string;
  /** Provider request timeout, enforced at the fetch layer for every provider. */
  timeoutMs?: number;
}

/**
 * Wrap fetch with a hard timeout. An existing caller signal (abort) is chained
 * into the same controller so both cancellation sources work.
 */
function withTimeoutFetch(timeoutMs?: number): typeof fetch | undefined {
  if (!timeoutMs) return undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`Provider request timed out after ${timeoutMs}ms.`)), timeoutMs);
    const onAbort = () => ctrl.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onAbort);
    }
  };
}

export function isReasoningModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.includes("deepseek-r1") ||
    lower.includes("qwq") ||
    (lower.startsWith("gpt-5") && !lower.includes("chat"))
  );
}

function anthropicSupportsThinking(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return /claude[-_.]?(3[-_.]?7|3\.7|4|sonnet-4|opus-4)/.test(lower);
}

function geminiSupportsThinking(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes("gemini-2") || lower.includes("gemini-3");
}

const ANTHROPIC_THINKING_BUDGET: Record<Exclude<ReasoningEffort, "default">, number> = {
  low: 2048,
  medium: 6144,
  high: 12288,
  max: 24576,
};

const GEMINI_THINKING_BUDGET: Record<Exclude<ReasoningEffort, "default">, number> = {
  low: 512,
  medium: 4096,
  high: 12288,
  max: 24576,
};

const OPENAI_EFFORT: Record<Exclude<ReasoningEffort, "default">, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
  max: "high",
};

/**
 * Per-provider-family reasoning-effort mapping. Returns providerOptions for
 * streamText/generateText, or {} when the effort is default or the model
 * family cannot take the parameter (sending it anyway would 400).
 */
export function reasoningProviderOptions(
  providerType: ProviderType,
  modelId: string,
  effort?: ReasoningEffort
): Record<string, unknown> {
  if (!effort || effort === "default") return {};
  const lower = modelId.toLowerCase();
  if (providerType === "anthropic") {
    if (!anthropicSupportsThinking(modelId)) return {};
    return {
      anthropic: { thinking: { type: "enabled", budgetTokens: ANTHROPIC_THINKING_BUDGET[effort] } },
    };
  }
  if (providerType === "gemini" && !lower.includes("/")) {
    if (!geminiSupportsThinking(modelId)) return {};
    return {
      google: { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET[effort] } },
    };
  }
  // OpenAI + OpenAI-compatible endpoints (openai, groq, nvidia, custom, gemini-compat).
  if (isReasoningModelId(modelId)) {
    return { openai: { reasoningEffort: OPENAI_EFFORT[effort] } };
  }
  return {};
}

/** Output-token ceiling that leaves headroom for reasoning models. */
export function maxOutputTokensFor(providerType: ProviderType, modelId: string, effort?: ReasoningEffort): number {
  // ponytail: flat caps; move to a per-model output-limit table if a provider 400s.
  if (providerType === "anthropic" && effort && effort !== "default" && anthropicSupportsThinking(modelId)) {
    return 32768;
  }
  return 8192;
}

export function createChatModel({
  providerType = "custom",
  baseUrl,
  apiKey,
  model,
  timeoutMs,
}: CreateChatModelOptions): LanguageModel {
  if (!apiKey || !model) {
    throw new Error("Missing apiKey or model for provider.");
  }

  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : undefined;
  const timedFetch = withTimeoutFetch(timeoutMs);

  switch (providerType) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: cleanBaseUrl,
        fetch: timedFetch,
        headers: {
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });

      return anthropic(model);
    }

    case "gemini": {
      if (cleanBaseUrl && cleanBaseUrl !== "https://generativelanguage.googleapis.com/v1beta/openai") {
        const customGemini = createOpenAI({
          apiKey,
          baseURL: cleanBaseUrl,
          fetch: timedFetch,
        });
        return customGemini.chat(model);
      }

      const google = createGoogleGenerativeAI({
        apiKey,
        baseURL: cleanBaseUrl,
        fetch: timedFetch,
      });

      return google(model);
    }

    case "nvidia": {
      const effectiveBaseUrl = cleanBaseUrl || "https://integrate.api.nvidia.com/v1";
      const nvidia = createOpenAI({
        apiKey,
        baseURL: effectiveBaseUrl,
        fetch: timedFetch,
      });
      return nvidia.chat(model);
    }

    case "groq": {
      if (cleanBaseUrl && cleanBaseUrl !== "https://api.groq.com/openai/v1") {
        const customGroq = createOpenAI({
          apiKey,
          baseURL: cleanBaseUrl,
          fetch: timedFetch,
        });
        return customGroq.chat(model);
      }
      const groq = createGroq({
        apiKey,
        baseURL: cleanBaseUrl,
        fetch: timedFetch,
      });
      return groq(model);
    }

    case "openai": {
      const effectiveBaseUrl = cleanBaseUrl || "https://api.openai.com/v1";
      const openai = createOpenAI({
        apiKey,
        baseURL: effectiveBaseUrl,
        fetch: timedFetch,
      });
      return openai.chat(model);
    }

    case "custom":
    default: {
      if (!cleanBaseUrl) {
        throw new Error("Missing baseUrl for custom provider.");
      }
      const isAgentRouter = cleanBaseUrl.includes("agentrouter.org");

      const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (isAgentRouter) {
          headers.set("user-agent", "claude-cli/0.2.29 (external, cli)");
          headers.set("User-Agent", "claude-cli/0.2.29 (external, cli)");
          headers.set("X-Stainless-Lang", "js");
          headers.set("X-Stainless-Package-Version", "0.2.29");
          headers.set("X-Stainless-OS", "MacOS");
          headers.set("X-Stainless-Arch", "arm64");
          headers.set("X-Stainless-Runtime", "node");
          headers.set("X-Stainless-Runtime-Version", "v20.10.0");
        }
        const res = await (timedFetch ?? fetch)(input, { ...init, headers });
        const ctype = res.headers.get("content-type") || "";
        if (!res.ok) {
          if (!ctype.includes("application/json")) {
            const bodyText = await res.text();
            const msg = bodyText.trim() || res.statusText || `HTTP ${res.status}`;
            const errPayload = JSON.stringify({
              error: {
                message: msg,
                type: "provider_error",
                code: res.status,
              },
            });
            const newHeaders = new Headers(res.headers);
            newHeaders.set("content-type", "application/json; charset=utf-8");
            return new Response(errPayload, {
              status: res.status,
              statusText: res.statusText,
              headers: newHeaders,
            });
          }
        } else if (ctype.includes("text/plain")) {
          const body = await res.text();
          const newHeaders = new Headers(res.headers);
          newHeaders.set("content-type", "application/json; charset=utf-8");
          return new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers: newHeaders,
          });
        }
        return res;
      };

      const custom = createOpenAI({
        apiKey,
        baseURL: cleanBaseUrl,
        fetch: customFetch,
      });

      return custom.chat(model);
    }
  }
}

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
