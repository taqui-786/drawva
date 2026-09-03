import type { ProviderType, ReasoningEffort } from "./provider";

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
  | "inside_target"
  | "target_box"
  | "at_target"
  | "match_sketch"
  | "overlay"
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

import type { ModelTier } from "./tiers";
import type { PluginMetadata, PluginDescriptor } from "../plugins/registry";
export type { PluginMetadata, PluginDescriptor };


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
  tier?: ModelTier;
  reasoningEffort?: ReasoningEffort;
  enabledPlugins?: PluginDescriptor[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * Largest single-step input count. A turn's `inputTokens` is the sum over
   * steps — every step resends the system prompt and the full conversation — so
   * the total scales with step count, not with how big the context ever got.
   */
  peakInputTokens?: number;
  /** Number of billed model round trips the turn made. */
  billedSteps?: number;
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
  toolCall?: { id?: string; name: string; args: Record<string, unknown> };
  attempts: number;
  requestId: string;
  providerId?: string;
  tokenUsage?: TokenUsage;
  debug?: AiDebugInfo;
}

export type AgentReply = AiReply;

export interface AiLogStep {
  stepNumber: number;
  tool?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  summary?: string;
  text?: string;
  durationMs?: number;
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
  /** Plugin contracts injected into the server-side system prompt for the turn. */
  injectedPlugins?: string[];
  tokenUsage?: TokenUsage;
  /**
   * Revision-counter movement during the turn, attributed to the caller frame
   * that bumped it. `total` far exceeding the successful mutation count means
   * content-neutral bumps are inflating the counter.
   */
  revisionBumps?: { total: number; byCaller: Record<string, number> };
  steps?: AiLogStep[];
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

export interface SceneJson {
  items: { kind: string; x: number; y: number; w: number; h: number; title?: string }[];
  count: number;
}

export type AgentEvent =
  | { type: "provider_start"; provider: string }
  | { type: "provider_failed"; provider: string; error: string }
  | { type: "provider_done"; provider: string };
