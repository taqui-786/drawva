// ============================================================
// Drawva AI — Model Factory
// The user configures a single OpenAI-compatible provider
// (base URL + API key) from the Settings dialog. This module
// owns nothing but the mapping to a LangChain ChatOpenAI.
// ============================================================

import { ChatOpenAI } from "@langchain/openai";

/** Total attempts per request (initial + `MAX_RETRIES - 1` retries). */
export const MAX_RETRIES = 3;

export interface CreateChatModelOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Millisecond request timeout. */
  timeoutMs?: number;
  /** Sampling temperature for structured JSON generation. */
  temperature?: number;
}

export function createChatModel({
  baseUrl,
  apiKey,
  model,
  timeoutMs = 60_000,
  temperature = 0.2,
}: CreateChatModelOptions): ChatOpenAI {
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing baseUrl, apiKey, or model for provider.");
  }
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: { baseURL: baseUrl },
    temperature,
    timeout: timeoutMs,
    maxRetries: 1, // LangChain retries are bypassed; the agent owns retries.
  });
}
