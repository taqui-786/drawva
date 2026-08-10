// ============================================================
// Drawva AI System — Types & Request/Response Contract
// Defined in public/canvas-build-plan/07-AI-LANGCHAIN-MIMO.md
// ============================================================

import type { CanvasCommand, CanvasItem, Rect } from "@/lib/canvas/types";

export type AiIntent =
  | "none"
  | "answer"
  | "explain"
  | "hint"
  | "plot"
  | "continue"
  | "flowchart"
  | "refine"
  | "plantuml"
  | "smiles"
  | "vegalite"
  | "circuit"
  | "widget"
  | "app"
  | "game";

export type AiUserAction =
  | "auto"
  | "answer"
  | "explain"
  | "hint"
  | "plot"
  | "continue"
  | "flowchart"
  | "refine"
  | "plantuml"
  | "smiles"
  | "vegalite"
  | "circuit"
  | "widget"
  | "app"
  | "game";

export interface WidgetEditContext {
  mode: "replace";
  widgetType?: "diagram_source" | "html_widget";
  pluginId?: string;
  title?: string;
  instructionMode?: "handwriting" | "prompt";
  box?: Rect;
  diagramKind?: string;
  sourceFormat?: string;
  frameworkVersion?: string;
  source?: string;
  copyText?: string;
  copyLabel?: string;
}

export interface SceneJson {
  items: CanvasItem[];
}

export interface AiRequest {
  atlasImage: string; // base64 dataURL PNG/WebP of visible canvas region (or "")
  atlasRect?: Rect & { scale?: number };
  scene: SceneJson;
  latestInput?: { text: string; box?: Rect };
  userAction: AiUserAction;
  userPrompt?: string;
  enabledPlugins?: string[];
  canvasSize: { w: number; h: number };
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  widgetEditTargetId?: string;
  widgetEditContext?: WidgetEditContext;
}

export interface AiReply {
  intent: AiIntent;
  message?: string;
  commands: CanvasCommand[];
  attempts?: number;
}
