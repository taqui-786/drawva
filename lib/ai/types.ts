import type { ProviderType } from "./provider";

export interface AiBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AiIntent =
  | "none"
  | "hint"
  | "continue"
  | "explain"
  | "plot"
  | "correct"
  | "erase"
  | "answer"
  | "typeset";

export interface WidgetEditContext {
  id: string;
  pluginId: string;
  widgetType: "html_widget" | "diagram_source";
  title?: string;
  sourceFormat?: string;
  source?: string;
  html?: string;
  box: AiBox;
}

export interface AiRequest {
  requestId: string;
  atlasImage: string; // WebP data URL ≤2048px
  visibleRect: AiBox;
  captureRect: AiBox;
  sourceRect: AiBox;
  changedBox: AiBox;
  imageSize: { w: number; h: number };
  userPrompt?: string;
  scene?: string;
  trigger: "manual" | "user_paused";
  uiTheme?: string;
  widgetEdit?: WidgetEditContext;
  /** Magnified 2x crop of recent handwriting for high-precision OCR/LaTeX. */
  focusInset?: string;
  /** Provider type (openai, anthropic, gemini, nvidia, custom). */
  providerType?: ProviderType;
  /** Provider base URL (OpenAI-compatible), sent per request by the client. */
  baseUrl?: string;
  /** Provider API key, sent per request by the client. Never logged. */
  apiKey?: string;
  /** Model id the user picked (see lib/ai/provider.ts). */
  model?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiDebugInfo {
  systemPrompt: string;
  userPromptText: string;
  model: string;
  rawResponse?: unknown;
}

export interface AiReply {
  intent: AiIntent;
  message?: string;
  observedText?: string;
  /** Raw model commands — validate before applying. */
  commands: unknown[];
  attempts: number;
  requestId: string;
  /** Provider id that actually generated this reply. */
  providerId?: string;
  /** Token usage for this request. */
  tokenUsage?: TokenUsage;
  /** Debug and inspection log data. */
  debug?: AiDebugInfo;
}

export interface AiLogEntry {
  timestamp: number;
  requestId: string;
  model: string;
  providerType?: ProviderType;
  attempts: number;
  status: "success" | "error";
  errorMessage?: string;
  atlasImage: string;
  focusInset?: string;
  systemPrompt: string;
  userPromptText: string;
  userPromptRaw?: string;
  sceneJson?: string;
  tokenUsage?: TokenUsage;
  response?: {
    intent?: AiIntent;
    message?: string;
    observedText?: string;
    commands?: unknown[];
    rejected?: string[];
    raw?: unknown;
  };
}

/** Zod-validated model output before command normalization. */
export interface ModelReply {
  intent: AiIntent;
  message?: string;
  observedText?: string;
  commands: unknown[];
  tokenUsage?: TokenUsage;
}

export interface SceneJson {
  items: { kind: string; x: number; y: number; w: number; h: number; title?: string }[];
  count: number;
}

/** Result payload streamed to the client during generation. */
export type AgentEvent =
  | { type: "provider_start"; provider: string }
  | { type: "provider_failed"; provider: string; error: string }
  | { type: "provider_done"; provider: string };
