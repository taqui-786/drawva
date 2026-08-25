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
      const thinkingConfig =
        reasoningEffort === "low"
          ? { type: "enabled" as const, budget_tokens: 2048 }
          : reasoningEffort === "medium"
          ? { type: "enabled" as const, budget_tokens: 4096 }
          : reasoningEffort === "high"
          ? { type: "enabled" as const, budget_tokens: 8192 }
          : reasoningEffort === "max"
          ? { type: "enabled" as const, budget_tokens: 16384 }
          : undefined;

      return new ChatAnthropic({
        model,
        apiKey,
        temperature: thinkingConfig?.type === "enabled" ? 1 : temperature,
        maxRetries: 0,
        ...(thinkingConfig && model.includes("claude-3-7") ? { thinking: thinkingConfig } : {}),
        clientOptions: {
          timeout: timeoutMs,
          ...(cleanBaseUrl ? { baseURL: cleanBaseUrl } : {}),
        },
      }) as unknown as BaseChatModel;
    }
    case "gemini": {
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
      }) as unknown as BaseChatModel;
    }
    case "nvidia": {
      const effectiveBaseUrl = cleanBaseUrl || "https://integrate.api.nvidia.com/v1";
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: effectiveBaseUrl },
        temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        modelKwargs: openAiReasoningEffort ? { reasoning_effort: openAiReasoningEffort } : undefined,
      }) as unknown as BaseChatModel;
    }
    case "groq": {
      if (cleanBaseUrl && cleanBaseUrl !== "https://api.groq.com/openai/v1") {
        return new ChatOpenAI({
          model,
          apiKey,
          configuration: { baseURL: cleanBaseUrl },
          temperature,
          timeout: timeoutMs,
          maxRetries: 0,
          modelKwargs: openAiReasoningEffort ? { reasoning_effort: openAiReasoningEffort } : undefined,
        }) as unknown as BaseChatModel;
      }
      return new ChatGroq({
        model,
        apiKey,
        temperature,
        maxRetries: 0,
      }) as unknown as BaseChatModel;
    }
    case "openai": {
      const effectiveBaseUrl = cleanBaseUrl || "https://api.openai.com/v1";
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: effectiveBaseUrl },
        temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        modelKwargs: openAiReasoningEffort ? { reasoning_effort: openAiReasoningEffort } : undefined,
      }) as unknown as BaseChatModel;
    }
    case "custom":
    default: {
      if (!cleanBaseUrl) {
        throw new Error("Missing baseUrl for custom provider.");
      }
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: cleanBaseUrl },
        temperature,
        timeout: timeoutMs,
        maxRetries: 0,
        modelKwargs: openAiReasoningEffort ? { reasoning_effort: openAiReasoningEffort } : undefined,
      }) as unknown as BaseChatModel;
    }
  }
}
