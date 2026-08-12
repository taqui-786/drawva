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
  /** Provider id the user pinned (see lib/ai/model.ts). Falls back when absent/auto. */
  preferredModel?: string;
}

export interface AiReply {
  intent: AiIntent;
  message?: string;
  observedText?: string;
  /** Raw model commands — validate before applying. */
  commands: unknown[];
  attempts: number;
  requestId: string;
  /** Provider id that actually generated this reply (after any fallbacks). */
  providerId?: string;
}

/** Zod-validated model output before command normalization. */
export interface ModelReply {
  intent: AiIntent;
  message?: string;
  observedText?: string;
  commands: unknown[];
}

export interface SceneJson {
  items: { kind: string; x: number; y: number; w: number; h: number; title?: string }[];
  count: number;
}

/** Progressive pipeline events streamed to the client for live fallback UI. */
export type AgentEvent =
  | { type: "provider_start"; providerId: string; provider: string; attempt: number }
  | { type: "provider_failed"; providerId: string; provider: string; error: string }
  | { type: "provider_retry"; providerId: string; provider: string }
  | { type: "provider_done"; providerId: string; provider: string };
