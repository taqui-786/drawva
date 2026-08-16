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
  atlasImage: string;
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
  focusInset?: string;
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
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
  spatialPlan?: string;
  commands: unknown[];
  attempts: number;
  requestId: string;
  providerId?: string;
  tokenUsage?: TokenUsage;
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
    spatialPlan?: string;
    commands?: unknown[];
    rejected?: string[];
    raw?: unknown;
  };
}

export interface ModelReply {
  intent: AiIntent;
  message?: string;
  observedText?: string;
  spatialPlan?: string;
  commands: unknown[];
  tokenUsage?: TokenUsage;
}

export interface SceneJson {
  items: { kind: string; x: number; y: number; w: number; h: number; title?: string }[];
  count: number;
}

export type AgentEvent =
  | { type: "provider_start"; provider: string }
  | { type: "provider_failed"; provider: string; error: string }
  | { type: "provider_done"; provider: string };
