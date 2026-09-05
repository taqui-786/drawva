import { createHash } from "node:crypto";
import type { CredentialRef } from "@deepseek-ai/dsh-credentials";
import { PROVIDER_INFOS, type ProviderType, type ReasoningEffort } from "../provider";

export interface ConnectionProfile {
  route: string;
  model: string;
  reasoningEffort?: string;
  maxTokens: number;
}

export function routeForConnection(connectionId: string, model?: string): string {
  const seed = model && !connectionId.includes(model) ? `${connectionId}:${model}` : connectionId;
  const hash = createHash("sha256").update(String(seed)).digest("hex").slice(0, 12);
  return `drawva-${hash}`;
}

function effectiveBaseUrl(providerType: ProviderType, baseUrl?: string): string {
  const clean = baseUrl?.trim().replace(/\/+$/, "");
  if (clean) return clean;
  if (providerType === "nvidia") return "https://integrate.api.nvidia.com/v1";
  if (providerType === "openai") return "https://api.openai.com/v1";
  return PROVIDER_INFOS[providerType]?.defaultBaseUrl || "";
}

function piAiReasoningEffort(model: string, isAnthropicRoute: boolean, effort: ReasoningEffort | undefined): string | undefined {
  if (!effort || effort === "default") return undefined;
  const lower = model.toLowerCase();
  const reasoningModel =
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.includes("deepseek-r1") ||
    lower.includes("qwq") ||
    (lower.startsWith("gpt-5") && !lower.includes("chat"));
  if (!isAnthropicRoute && !reasoningModel) return undefined;
  return effort;
}

export function buildConnectionProfile(options: {
  connectionId: string;
  providerType: ProviderType;
  baseUrl?: string;
  model: string;
  effort?: ReasoningEffort;
  credential: CredentialRef;
}): { settingsPatch: Record<string, unknown>; profile: ConnectionProfile } {
  const providerType = options.providerType || "custom";
  const model = options.model.trim();
  if (!model) throw new Error("Missing model.");
  const baseUrl = effectiveBaseUrl(providerType, options.baseUrl);
  if (!baseUrl) throw new Error(`Missing baseUrl for provider ${providerType}.`);

  if (providerType === "anthropic" && !baseUrl.includes("/v1") && !baseUrl.includes("openrouter.ai") && !baseUrl.includes("agentrouter.org")) {
    return {
      settingsPatch: {
        providers: {
          anthropic: {
            apiKeyEnv: String(options.credential),
            ...(baseUrl !== "https://api.anthropic.com" ? { baseURL: baseUrl } : {}),
          },
        },
      },
      profile: {
        route: "anthropic",
        model,
        reasoningEffort: piAiReasoningEffort(model, true, options.effort),
        maxTokens: 8192,
      },
    };
  }

  const route = routeForConnection(options.connectionId, model);
  const headers: Record<string, string> = {};
  if (baseUrl.includes("agentrouter.org")) headers["user-agent"] = "claude-cli/0.2.29 (external, cli)";
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://drawva.app";
    headers["X-Title"] = "Drawva";
  }
  return {
    settingsPatch: {
      providers: {
        [route]: {
          displayName: PROVIDER_INFOS[providerType]?.name || route,
          api: "openai-completions",
          baseURL: baseUrl,
          apiKeyEnv: String(options.credential),
          models: [
            {
              id: model,
              input: ["text", "image"],
              contextWindow: 160_000,
              maxTokens: 8192,
            },
          ],
          defaultInput: ["text", "image"],
          ...(Object.keys(headers).length ? { headers } : {}),
        },
      },
    },
    profile: {
      route,
      model,
      reasoningEffort: piAiReasoningEffort(model, false, options.effort),
      maxTokens: 8192,
    },
  };
}
