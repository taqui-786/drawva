import { CanvasItem, CANVAS_SIZE } from "./types";
import { createTextBoxItem } from "./textTool";
import { createShapeItem } from "./shapes";
import { createStrokeItem } from "./strokes";

export interface WriteTextCommand {
  tool: "write_text";
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  color?: string;
  maxWidth?: number;
}

export interface DrawFormulaCommand {
  tool: "draw_formula";
  x: number;
  y: number;
  latex: string;
  fontSize?: number;
  color?: string;
}

export interface PlotFunctionCommand {
  tool: "plot_function";
  x: number;
  y: number;
  w: number;
  h: number;
  expression: string;
  color?: string;
}

export interface HtmlWidgetCommand {
  tool: "html_widget";
  pluginId: string;
  title: string;
  html: string;
  x: number;
  y: number;
  w: number;
  h: number;
  refreshSeconds?: number;
}

export interface DiagramSourceCommand {
  tool: "diagram_source";
  pluginId: string;
  title: string;
  sourceFormat: string;
  diagramKind?: string;
  source: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawPrimitiveCommand {
  tool: "draw";
  shapeType: "rect" | "ellipse" | "arrow" | "line" | "pen";
  x: number;
  y: number;
  w: number;
  h: number;
  points?: Array<{ x: number; y: number; pressure?: number }>;
  color?: string;
  strokeWidth?: number;
}

export type CanvasCommand =
  | WriteTextCommand
  | DrawFormulaCommand
  | PlotFunctionCommand
  | HtmlWidgetCommand
  | DiagramSourceCommand
  | DrawPrimitiveCommand;

export interface ValidationResult {
  valid: boolean;
  command?: CanvasCommand;
  reason?: string;
}

export function validateCommand(rawCmd: Record<string, unknown>): ValidationResult {
  if (!rawCmd || typeof rawCmd !== "object") {
    return { valid: false, reason: "Command must be an object" };
  }

  const tool = (rawCmd.tool || rawCmd.type || rawCmd.name) as string;
  if (!tool || typeof tool !== "string") {
    return { valid: false, reason: "Missing or invalid tool property" };
  }

  if (tool === "write_text") {
    if (typeof rawCmd.text !== "string" || !rawCmd.text.trim()) {
      return { valid: false, reason: "write_text requires non-empty string 'text'" };
    }
    if (rawCmd.text.length > 2000) {
      return { valid: false, reason: "write_text exceeds maximum 2000 characters" };
    }
    const fontSize = Math.max(8, Math.min(2000, Number(rawCmd.fontSize) || 24));
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));
    const maxWidth = Math.max(fontSize * 3, Math.min(CANVAS_SIZE, Number(rawCmd.maxWidth) || 400));

    return {
      valid: true,
      command: {
        tool: "write_text",
        x,
        y,
        text: rawCmd.text,
        fontSize,
        color: typeof rawCmd.color === "string" ? rawCmd.color : "#1e293b",
        maxWidth,
      },
    };
  }

  if (tool === "draw_formula") {
    if (typeof rawCmd.latex !== "string" || !rawCmd.latex.trim()) {
      return { valid: false, reason: "draw_formula requires non-empty 'latex' string" };
    }
    if (rawCmd.latex.length > 512) {
      return { valid: false, reason: "draw_formula exceeds max 512 characters" };
    }
    const fontSize = Math.max(12, Math.min(300, Number(rawCmd.fontSize) || 28));
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));

    return {
      valid: true,
      command: {
        tool: "draw_formula",
        x,
        y,
        latex: rawCmd.latex.trim(),
        fontSize,
        color: typeof rawCmd.color === "string" ? rawCmd.color : "#1e293b",
      },
    };
  }

  if (tool === "plot_function") {
    if (typeof rawCmd.expression !== "string" || !rawCmd.expression.trim()) {
      return { valid: false, reason: "plot_function requires 'expression' string" };
    }
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));
    const w = Math.max(100, Math.min(2000, Number(rawCmd.w) || 400));
    const h = Math.max(100, Math.min(2000, Number(rawCmd.h) || 300));

    return {
      valid: true,
      command: {
        tool: "plot_function",
        x,
        y,
        w,
        h,
        expression: rawCmd.expression.trim(),
        color: typeof rawCmd.color === "string" ? rawCmd.color : "#2563eb",
      },
    };
  }

  if (tool === "html_widget") {
    if (typeof rawCmd.html !== "string" || !rawCmd.html.trim()) {
      return { valid: false, reason: "html_widget requires 'html' string" };
    }
    if (rawCmd.html.length > 200000) {
      return { valid: false, reason: "html_widget exceeds 200KB limit" };
    }
    const pluginId = typeof rawCmd.pluginId === "string" ? rawCmd.pluginId : "custom-widget";
    const title = typeof rawCmd.title === "string" && rawCmd.title.trim() ? rawCmd.title.trim() : "Widget";
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));
    const w = Math.max(300, Math.min(2000, Number(rawCmd.w) || 600));
    const h = Math.max(200, Math.min(2000, Number(rawCmd.h) || 400));

    return {
      valid: true,
      command: {
        tool: "html_widget",
        pluginId,
        title,
        html: rawCmd.html,
        x,
        y,
        w,
        h,
        refreshSeconds: Number(rawCmd.refreshSeconds) || 0,
      },
    };
  }

  if (tool === "diagram_source") {
    if (typeof rawCmd.source !== "string" || !rawCmd.source.trim()) {
      return { valid: false, reason: "diagram_source requires 'source' string" };
    }
    if (rawCmd.source.length > 100000) {
      return { valid: false, reason: "diagram_source exceeds 100KB limit" };
    }
    const pluginId = typeof rawCmd.pluginId === "string" ? rawCmd.pluginId : "flowchart";
    const title = typeof rawCmd.title === "string" && rawCmd.title.trim() ? rawCmd.title.trim() : "Diagram";
    const sourceFormat = typeof rawCmd.sourceFormat === "string" ? rawCmd.sourceFormat : "mermaid";
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));
    const w = Math.max(300, Math.min(2000, Number(rawCmd.w) || 600));
    const h = Math.max(200, Math.min(2000, Number(rawCmd.h) || 400));

    return {
      valid: true,
      command: {
        tool: "diagram_source",
        pluginId,
        title,
        sourceFormat,
        diagramKind: typeof rawCmd.diagramKind === "string" ? rawCmd.diagramKind : "flowchart",
        source: rawCmd.source,
        x,
        y,
        w,
        h,
      },
    };
  }

  if (tool === "draw") {
    const shapeType = (rawCmd.shapeType || rawCmd.primitiveType || "rect") as "rect" | "ellipse" | "arrow" | "line" | "pen";
    const x = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.x) || 0));
    const y = Math.max(0, Math.min(CANVAS_SIZE, Number(rawCmd.y) || 0));
    const w = Number(rawCmd.w) || 100;
    const h = Number(rawCmd.h) || 100;

    return {
      valid: true,
      command: {
        tool: "draw",
        shapeType,
        x,
        y,
        w,
        h,
        points: Array.isArray(rawCmd.points) ? (rawCmd.points as Array<{ x: number; y: number; pressure?: number }>) : undefined,
        color: typeof rawCmd.color === "string" ? rawCmd.color : "#1e293b",
        strokeWidth: Number(rawCmd.strokeWidth) || 3,
      },
    };
  }

  return { valid: false, reason: `Unknown command tool: "${tool}"` };
}

export function commandToCanvasItem(cmd: CanvasCommand, generateId: (prefix: string) => string): CanvasItem | null {
  if (cmd.tool === "write_text") {
    return createTextBoxItem(
      generateId("text"),
      cmd.x,
      cmd.y,
      cmd.text,
      cmd.fontSize || 24,
      cmd.color || "#1e293b",
      cmd.maxWidth || 400
    );
  }

  if (cmd.tool === "draw") {
    if (cmd.shapeType === "pen" && cmd.points && cmd.points.length > 0) {
      return createStrokeItem(
        generateId("stroke"),
        "pen",
        cmd.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure || 0.5 })),
        cmd.color || "#1e293b",
        cmd.strokeWidth || 3
      );
    }
    return createShapeItem(
      generateId("shape"),
      cmd.shapeType as "rect" | "ellipse" | "arrow" | "line",
      { x: cmd.x, y: cmd.y },
      { x: cmd.x + cmd.w, y: cmd.y + cmd.h },
      cmd.color || "#1e293b",
      cmd.strokeWidth || 3
    );
  }

  if (cmd.tool === "html_widget" || cmd.tool === "diagram_source") {
    return {
      id: generateId("widget"),
      kind: "widget",
      widgetType: cmd.tool,
      pluginId: cmd.pluginId,
      x: cmd.x,
      y: cmd.y,
      w: cmd.w,
      h: cmd.h,
      contentW: cmd.w,
      contentH: cmd.h,
      title: cmd.title,
      refreshSeconds: cmd.tool === "html_widget" ? cmd.refreshSeconds || 0 : 0,
      html: cmd.tool === "html_widget" ? cmd.html : undefined,
      source: cmd.tool === "diagram_source" ? cmd.source : undefined,
      sourceFormat: cmd.tool === "diagram_source" ? cmd.sourceFormat : undefined,
      diagramKind: cmd.tool === "diagram_source" ? cmd.diagramKind : undefined,
    };
  }

  if (cmd.tool === "draw_formula") {
    return {
      id: generateId("formula"),
      kind: "formula",
      x: cmd.x,
      y: cmd.y,
      w: 300,
      h: 80,
      latex: cmd.latex,
      fontSize: cmd.fontSize || 28,
      color: cmd.color || "#1e293b",
    };
  }

  if (cmd.tool === "plot_function") {
    return {
      id: generateId("plot"),
      kind: "plot",
      x: cmd.x,
      y: cmd.y,
      w: cmd.w,
      h: cmd.h,
      expression: cmd.expression,
      color: cmd.color || "#2563eb",
    };
  }

  return null;
}
