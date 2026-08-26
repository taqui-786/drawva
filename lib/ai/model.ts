import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ProviderType, ReasoningEffort } from "./provider";
import { AI_TIMEOUT_MS } from "./prompts";

export const MAX_RETRIES = 3;

export interface CreateChatModelOptions {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
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

export function createChatModel({
  providerType = "custom",
  baseUrl,
  apiKey,
  model,
  timeoutMs = AI_TIMEOUT_MS,
  temperature = 0.2,
  reasoningEffort = "default",
}: CreateChatModelOptions): BaseChatModel {
  if (!apiKey || !model) {
    throw new Error("Missing apiKey or model for provider.");
  }

  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : undefined;

  const openAiReasoningEffort =
    reasoningEffort === "low"
      ? "low"
      : reasoningEffort === "medium"
      ? "medium"
      : reasoningEffort === "high" || reasoningEffort === "max"
      ? "high"
      : undefined;

  switch (providerType) {
    case "anthropic": {
      const isThinkingModel =
        model.includes("3-7") ||
        model.includes("3.7") ||
        model.includes("claude-4");

      const thinkingBudget =
        reasoningEffort === "low"
          ? 2048
          : reasoningEffort === "medium"
          ? 4096
          : reasoningEffort === "high"
          ? 8192
          : reasoningEffort === "max"
          ? 16384
          : undefined;

      const thinkingConfig =
        isThinkingModel && thinkingBudget
          ? { type: "enabled" as const, budget_tokens: thinkingBudget }
          : undefined;

      // Anthropic strictly requires max_tokens to be strictly greater than thinking.budget_tokens
      const maxTokens = thinkingConfig
        ? Math.max(8192, thinkingConfig.budget_tokens + 4096)
        : 4096;

      return new ChatAnthropic({
        model,
        apiKey,
        maxTokens,
        temperature: thinkingConfig?.type === "enabled" ? 1 : temperature,
        maxRetries: 0,
        ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
        clientOptions: {
          timeout: timeoutMs,
          ...(cleanBaseUrl ? { baseURL: cleanBaseUrl } : {}),
        },
      }) as unknown as BaseChatModel;
    }
    case "gemini": {
      const geminiThinkingBudget =
        reasoningEffort === "low"
          ? 1024
          : reasoningEffort === "medium"
          ? 4096
          : reasoningEffort === "high"
          ? 8192
          : reasoningEffort === "max"
          ? 16384
          : undefined;

      if (cleanBaseUrl && cleanBaseUrl !== "https://generativelanguage.googleapis.com/v1beta/openai") {
        return new ChatOpenAI({
          model,
          apiKey,
          configuration: { baseURL: cleanBaseUrl },
          temperature,
          timeout: timeoutMs,
          maxRetries: 0,
        }) as unknown as BaseChatModel;
      }
      return new ChatGoogleGenerativeAI({
        model,
        apiKey,
        temperature,
        maxRetries: 0,
        ...(geminiThinkingBudget ? { thinkingConfig: { thinkingBudget: geminiThinkingBudget } } : {}),
      }) as unknown as BaseChatModel;
    }
    case "nvidia": {
      const effectiveBaseUrl = cleanBaseUrl || "https://integrate.api.nvidia.com/v1";
      const isReasoning = isReasoningModelId(model);
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: effectiveBaseUrl },
        temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        ...(openAiReasoningEffort && isReasoning
          ? { modelKwargs: { reasoning_effort: openAiReasoningEffort } }
          : {}),
      }) as unknown as BaseChatModel;
    }
    case "groq": {
      const isReasoning = isReasoningModelId(model);
      if (cleanBaseUrl && cleanBaseUrl !== "https://api.groq.com/openai/v1") {
        return new ChatOpenAI({
          model,
          apiKey,
          configuration: { baseURL: cleanBaseUrl },
          temperature,
          timeout: timeoutMs,
          maxRetries: 0,
          ...(openAiReasoningEffort && isReasoning
            ? { modelKwargs: { reasoning_effort: openAiReasoningEffort } }
            : {}),
        }) as unknown as BaseChatModel;
      }
      return new ChatGroq({
        model,
        apiKey,
        temperature,
        maxRetries: 0,
        ...(openAiReasoningEffort && isReasoning
          ? { modelKwargs: { reasoning_effort: openAiReasoningEffort } }
          : {}),
      }) as unknown as BaseChatModel;
    }
    case "openai": {
      const effectiveBaseUrl = cleanBaseUrl || "https://api.openai.com/v1";
      const isReasoning = isReasoningModelId(model);
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: effectiveBaseUrl },
        temperature: isReasoning ? 1 : temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        // Only inject reasoning params if it is an o-series/reasoning model;
        // passing reasoning_effort to gpt-4o/gpt-4o-mini triggers HTTP 400 Unsupported parameter
        ...(openAiReasoningEffort && isReasoning
          ? {
              reasoning: { effort: openAiReasoningEffort },
              modelKwargs: { reasoning_effort: openAiReasoningEffort },
            }
          : {}),
      }) as unknown as BaseChatModel;
    }
    case "custom":
    default: {
      if (!cleanBaseUrl) {
        throw new Error("Missing baseUrl for custom provider.");
      }
      const isReasoning = isReasoningModelId(model);
      const isOpenRouter = cleanBaseUrl.includes("openrouter.ai");

      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: cleanBaseUrl },
        temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        ...(openAiReasoningEffort && (isReasoning || isOpenRouter)
          ? {
              modelKwargs: {
                ...(isReasoning ? { reasoning_effort: openAiReasoningEffort } : {}),
                ...(isOpenRouter ? { extra_body: { reasoning: { effort: openAiReasoningEffort } } } : {}),
              },
            }
          : {}),
      }) as unknown as BaseChatModel;
    }
  }
}
