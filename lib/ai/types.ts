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

export type PlacementMode =
  | "in_place"
  | "match_sketch"
  | "below"
  | "right"
  | "left"
  | "top"
  | "custom";

export interface FocusInsetMeta {
  sourceRect: AiBox;
  imageRect: AiBox;
  imageScale: number;
  purpose: string;
}

export interface LatestInputMeta {
  globalRect: AiBox;
  imageRect: AiBox;
}

export interface WidgetGeometryHint {
  basis: string;
  min: { w: number; h: number };
  max: { w: number; h: number };
  sizingPolicy: string;
}

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
  imageScale?: number;
  latestInput?: LatestInputMeta | null;
  userPrompt?: string;
  scene?: string;
  trigger: "manual" | "user_paused";
  uiTheme?: string;
  widgetEdit?: WidgetEditContext;
  /** True only for the explicit Refine control. Nearby widgetEdit is context, not a freeze. */
  keepPosition?: boolean;
  focusInset?: FocusInsetMeta | null;
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
  focusInset?: FocusInsetMeta | null;
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
