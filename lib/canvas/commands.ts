// ============================================================
// Drawva Canvas Engine — CanvasCommand types + validator + executor
// AI-ready contract. No AI calls now — executor is called from
// UI only. Future LangChain agent will emit these same types.
// ============================================================

import type { CanvasCommand } from "./types";

// ── Validation ─────────────────────────────────────────────

const ALLOWED_TOOLS = new Set([
  "write_text",
  "draw_formula",
  "plot_function",
  "draw",
  "erase",
  "html_widget",
  "diagram_source",
]);

const MAX_TEXT_LENGTH = 10_000;
const MAX_HTML_LENGTH = 100_000;
const MAX_COORD = 20_000;
const MAX_SIZE = 20_000;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateCommand(cmd: unknown): ValidationResult {
  if (!cmd || typeof cmd !== "object") {
    return { ok: false, reason: "command is not an object" };
  }

  const c = cmd as Record<string, unknown>;

  if (!c.tool || typeof c.tool !== "string") {
    return { ok: false, reason: "missing or invalid tool field" };
  }

  if (!ALLOWED_TOOLS.has(c.tool)) {
    return { ok: false, reason: `unknown tool: ${c.tool}` };
  }

  // Coordinate checks
  for (const field of ["x", "y", "w", "h"] as const) {
    if (field in c) {
      const val = c[field];
      if (typeof val !== "number" || !isFinite(val)) {
        return { ok: false, reason: `${field} is not a finite number` };
      }
      if (["x", "y"].includes(field) && (val < -1000 || val > MAX_COORD + 1000)) {
        return { ok: false, reason: `${field} out of canvas bounds` };
      }
      if (["w", "h"].includes(field) && (val <= 0 || val > MAX_SIZE)) {
        return { ok: false, reason: `${field} must be positive and ≤ ${MAX_SIZE}` };
      }
    }
  }

  // Tool-specific checks
  switch (c.tool) {
    case "write_text": {
      if (typeof c.text !== "string") return { ok: false, reason: "text must be a string" };
      if (c.text.length > MAX_TEXT_LENGTH) return { ok: false, reason: "text too long" };
      if (typeof c.fontSize !== "number" || c.fontSize <= 0 || c.fontSize > 500) {
        return { ok: false, reason: "fontSize must be 1..500" };
      }
      break;
    }
    case "draw_formula": {
      if (typeof c.latex !== "string" || c.latex.length === 0) {
        return { ok: false, reason: "latex must be a non-empty string" };
      }
      if (c.latex.length > MAX_TEXT_LENGTH) return { ok: false, reason: "latex too long" };
      break;
    }
    case "html_widget": {
      if (typeof c.html !== "string") return { ok: false, reason: "html must be a string" };
      if (c.html.length > MAX_HTML_LENGTH) return { ok: false, reason: "html too long (>100kb)" };
      if (typeof c.title !== "string") return { ok: false, reason: "title must be a string" };
      break;
    }
    case "diagram_source": {
      if (typeof c.source !== "string" || c.source.length === 0) {
        return { ok: false, reason: "source must be non-empty" };
      }
      if (typeof c.sourceFormat !== "string") {
        return { ok: false, reason: "sourceFormat must be a string" };
      }
      break;
    }
    case "erase": {
      if (c.mode !== "rect") return { ok: false, reason: "erase mode must be 'rect'" };
      break;
    }
  }

  return { ok: true };
}

// ── Executor (stub — called from UI / debug panel only) ────

export type CommandExecutorCallbacks = {
  addTextItem: (x: number, y: number, text: string, fontSize: number) => void;
  addShapeItem: (type: "rect" | "ellipse", x: number, y: number, w: number, h: number) => void;
  eraseRect: (x: number, y: number, w: number, h: number) => void;
  addDraftWidget: (x: number, y: number, w: number, h: number, title: string, html: string) => void;
};

export class CommandExecutor {
  private callbacks: CommandExecutorCallbacks;

  constructor(callbacks: CommandExecutorCallbacks) {
    this.callbacks = callbacks;
  }

  execute(cmd: unknown): boolean {
    const result = validateCommand(cmd);
    if (!result.ok) {
      console.warn("[CommandExecutor] Rejected command:", result.reason, cmd);
      return false;
    }

    const c = cmd as CanvasCommand;

    try {
      switch (c.tool) {
        case "write_text":
          this.callbacks.addTextItem(c.x, c.y, c.text, c.fontSize);
          break;
        case "draw_formula":
          // Stub: treat as text until KaTeX is added
          this.callbacks.addTextItem(c.x, c.y, c.latex, c.fontSize);
          break;
        case "plot_function":
          // Stub: placeholder text until math evaluator is added
          this.callbacks.addTextItem(c.x, c.y, `f(x) = ${c.expression}`, 18);
          break;
        case "erase":
          this.callbacks.eraseRect(c.x, c.y, c.w, c.h);
          break;
        case "html_widget":
          this.callbacks.addDraftWidget(c.x, c.y, c.w, c.h, c.title, c.html);
          break;
        case "diagram_source":
          // Stub: placeholder until Mermaid renderer is wired
          this.callbacks.addDraftWidget(
            c.x, c.y, c.w, c.h,
            c.title,
            `<pre>${c.source}</pre>`
          );
          break;
        case "draw":
          // Stub: reserved for future rasterized draw commands
          console.info("[CommandExecutor] 'draw' command stubbed");
          break;
      }
      return true;
    } catch (err) {
      console.error("[CommandExecutor] Error executing command:", err, c);
      return false;
    }
  }

  /** Execute a batch of commands. Returns count of successful ones. */
  executeBatch(cmds: unknown[]): number {
    if (!Array.isArray(cmds)) return 0;
    let count = 0;
    for (const cmd of cmds) {
      if (this.execute(cmd)) count++;
    }
    return count;
  }
}

