import { SIZE } from "./constants";

export const MAX_COMMANDS = 16;
export const AI_TEXT_MAX_LENGTH = 1000;
export const MAX_WIDGET_HTML_LENGTH = 200_000;
export const MAX_WIDGET_COPY_TEXT_LENGTH = 16_000;
export const MAX_DIAGRAM_SOURCE_BYTES = 100 * 1024;
export const MAX_PLOT_PIXELS_TOTAL = 12_000_000;
export const MAX_PLOT_PIXELS_SINGLE = 8_000_000;

export const DIAGRAM_SOURCE_FORMATS = new Set([
  "mermaid",
  "dot",
  "bpmn-xml",
  "vega-lite",
  "geojson",
  "smiles",
  "cytoscape-json",
]);

export type DiagramFormat = (typeof DIAGRAM_SOURCE_FORMATS extends Set<infer T> ? T : never);

export function n(value: unknown, min = 0, max = SIZE): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export interface WriteTextCommand {
  tool: "write_text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  color: string;
}

export interface DrawFormulaCommand {
  tool: "draw_formula";
  x: number;
  y: number;
  latex: string;
  fontSize: number;
  color: string;
}

export interface PlotFunctionCommand {
  tool: "plot_function";
  x: number;
  y: number;
  w: number;
  h: number;
  expression: string;
  color: string;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface DrawCommand {
  tool: "draw";
  points: DrawPoint[];
  size: number;
  color: string;
}

export interface EraseCommand {
  tool: "erase";
  mode: "path" | "rect";
  points?: [number, number][];
  size?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface HtmlWidgetCommand {
  tool: "html_widget";
  pluginId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  refreshSeconds: number;
  html: string;
  diagramKind?: string;
  sourceFormat?: string;
  frameworkVersion?: string;
  copyText?: string;
  copyLabel?: string;
}

export interface DiagramSourceCommand {
  tool: "diagram_source";
  widgetType: "diagram_source";
  pluginId: "flowchart";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  refreshSeconds: 0;
  sourceFormat: DiagramFormat;
  source: string;
  diagramKind?: string;
}

export type CanvasCommand =
  | WriteTextCommand
  | DrawFormulaCommand
  | PlotFunctionCommand
  | DrawCommand
  | EraseCommand
  | HtmlWidgetCommand
  | DiagramSourceCommand;

export interface ValidationResult {
  command: CanvasCommand;
  reason?: string;
}

export interface CommandValidationContext {
  aiColor: string;
  scale: number;
  widgetSlots: number;
  plugins: Set<string>;
  visibleRect?: { x: number; y: number; w: number; h: number };
  changedBox?: { x: number; y: number; w: number; h: number };
  keepPosition?: boolean;
  /** Original widget box — used in refinement mode to snap placement back to the existing widget. */
  widgetEditBox?: { x: number; y: number; w: number; h: number };
}

const isFiniteNum = n as (v: unknown, min?: number, max?: number) => boolean;

function matchedFontSize(
  value: unknown,
  scale: number,
  changedBoxHeight?: number
): number {
  const screenReadable = 42 / Math.max(0.03, scale);
  let size = Number(value);
  if (!Number.isFinite(size) || size < 90) {
    if (changedBoxHeight && changedBoxHeight > 40) {
      size = Math.max(120, Math.min(450, Math.round(changedBoxHeight * 0.75)));
    } else {
      size = 160;
    }
  }
  return Math.max(48, Math.min(650, Math.max(size, screenReadable)));
}

function matchedTextFontSize(
  value: unknown,
  text: string,
  scale: number,
  changedBoxHeight?: number
): number {
  const size = matchedFontSize(value, scale, changedBoxHeight);
  const characters = Array.from(String(text).replace(/\s/g, "")).length;
  return characters < 10 ? size : Math.max(24, size * 0.5);
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

const MIN_WIDGET_WIDTH = 480;
const MIN_WIDGET_HEIGHT = 240;
const DEFAULT_WIDGET_WIDTH = 620;
const DEFAULT_WIDGET_HEIGHT = 420;
const MAX_WIDGET_WIDTH = 2800;
const MAX_WIDGET_HEIGHT = 4500;

function fitWidgetGeometry(
  cmd: { x?: unknown; y?: unknown; w?: unknown; h?: unknown },
  visibleRect?: { x: number; y: number; w: number; h: number },
  changedBox?: { x: number; y: number; w: number; h: number },
  reposition = true,
  widgetEditBox?: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } | null {
  // Refinement mode: snap to the original widget's box — ignore whatever the AI returned.
  if (!reposition && widgetEditBox && widgetEditBox.w > 0 && widgetEditBox.h > 0) {
    return {
      x: Math.round(widgetEditBox.x),
      y: Math.round(widgetEditBox.y),
      w: Math.round(widgetEditBox.w),
      h: Math.round(widgetEditBox.h),
    };
  }
  if (
    !isFiniteNum(cmd.x) ||
    !isFiniteNum(cmd.y) ||
    !isFiniteNum(cmd.w) ||
    !isFiniteNum(cmd.h)
  ) {
    return null;
  }
  const viewportW = Math.max(visibleRect?.w ?? 2000, 1);
  const viewportH = Math.max(visibleRect?.h ?? 1200, 1);

  let x = Math.round(cmd.x as number);
  let y = Math.round(cmd.y as number);
  let rawW = Math.round(cmd.w as number);
  let rawH = Math.round(cmd.h as number);

  if (rawW <= 0 || rawH <= 0) {
    rawW = DEFAULT_WIDGET_WIDTH;
    rawH = DEFAULT_WIDGET_HEIGHT;
  } else if (rawW < MIN_WIDGET_WIDTH || rawH < MIN_WIDGET_HEIGHT) {
    const scale = Math.max(MIN_WIDGET_WIDTH / Math.max(1, rawW), MIN_WIDGET_HEIGHT / Math.max(1, rawH));
    rawW = Math.ceil(rawW * scale);
    rawH = Math.ceil(rawH * scale);
  }

  // If the user drew a reasonably-sized sketch, honour that footprint.
  // A "sketch-sized" box is one that is smaller than ~60% of the viewport —
  // anything larger is likely a full-canvas selection, not a hand-drawn sketch.
  const sketchW = changedBox?.w ?? 0;
  const sketchH = changedBox?.h ?? 0;
  const isSketch = sketchW > 0 && sketchH > 0 && sketchW < viewportW * 0.6 && sketchH < viewportH * 0.6;
  if (isSketch) {
    rawW = Math.max(rawW, Math.round(sketchW));
    rawH = Math.max(rawH, Math.round(sketchH));
  }

  const maxW = Math.min(MAX_WIDGET_WIDTH, Math.max(1800, Math.round(viewportW * 0.95)));
  const maxH = Math.min(MAX_WIDGET_HEIGHT, Math.max(1400, Math.round(viewportH * 0.95)));

  const w = clampNum(rawW, MIN_WIDGET_WIDTH, maxW);
  const h = clampNum(rawH, MIN_WIDGET_HEIGHT, maxH);

  if (reposition && changedBox && changedBox.w > 0 && changedBox.h > 0 && changedBox.w < SIZE * 0.9) {
    const gap = 24;
    y = Math.round(changedBox.y + changedBox.h + gap);
    const centerX = changedBox.x + changedBox.w / 2;
    x = clampNum(Math.round(centerX - w / 2), 0, Math.max(0, SIZE - w));
  }

  x = Math.max(0, Math.min(SIZE - w, x));
  y = Math.max(0, Math.min(SIZE - h, y));
  return { x, y, w, h };
}

export function validateCommand(
  raw: unknown,
  ctx: CommandValidationContext
): CanvasCommand | null {
  if (!raw || typeof raw !== "object") {
    logReject("not-an-object");
    return null;
  }
  const c = raw as Record<string, unknown>;
  const tool = String(c.tool || c.type || c.name || "");

  switch (tool) {
    case "write_text": {
      if (!n(c.x) || !n(c.y) || typeof c.text !== "string" || !Number.isFinite(c.maxWidth)) return fail("write_text.bad-basic");
      const text = (c.text as string).slice(0, AI_TEXT_MAX_LENGTH);
      const fontSize = matchedTextFontSize(c.fontSize, text, ctx.scale, ctx.changedBox?.h);
      const maxWidth = Math.max(fontSize, Math.min(SIZE - (c.x as number), c.maxWidth as number));
      const lineHeight = Math.max(1, Math.min(2.2, Number(c.lineHeight) || 1.35));
      if (maxWidth < fontSize) return fail("write_text.maxWidth");
      const y = Math.min(c.y as number, Math.max(0, SIZE - fontSize * lineHeight * 2));
      return {
        tool: "write_text",
        x: c.x as number,
        y,
        text,
        fontSize: Math.round(fontSize),
        maxWidth: Math.round(maxWidth),
        lineHeight,
        color: ctx.aiColor,
      };
    }
    case "draw_formula": {
      if (!n(c.x) || !n(c.y) || typeof c.latex !== "string") return fail("draw_formula.bad-basic");
      const latex = (c.latex as string).slice(0, 500);
      const fontSize = matchedFontSize(c.fontSize, ctx.scale, ctx.changedBox?.h);
      const estimatedWidth = Math.min(5000, Math.max(fontSize, latex.length * fontSize * 0.72));
      return {
        tool: "draw_formula",
        x: Math.min(c.x as number, Math.max(0, SIZE - estimatedWidth)),
        y: Math.min(c.y as number, Math.max(0, SIZE - fontSize * 1.8)),
        latex,
        fontSize: Math.round(fontSize),
        color: ctx.aiColor,
      };
    }
    case "plot_function":
      if (
        !n(c.x) ||
        !n(c.y) ||
        !n(c.w, 240, 6000) ||
        !n(c.h, 180, 6000) ||
        (c.w as number) * (c.h as number) > MAX_PLOT_PIXELS_SINGLE ||
        Math.max((c.w as number) / (c.h as number), (c.h as number) / (c.w as number)) > 6 ||
        (c.x as number) + (c.w as number) > SIZE ||
        (c.y as number) + (c.h as number) > SIZE ||
        typeof c.expression !== "string" ||
        (c.expression as string).length > 180
      ) {
        return fail("plot_function.bad-basic");
      }
      return {
        tool: "plot_function",
        x: c.x as number,
        y: c.y as number,
        w: c.w as number,
        h: c.h as number,
        expression: c.expression as string,
        color: ctx.aiColor,
      };
    case "html_widget": {
      const pluginId = typeof c.pluginId === "string" && c.pluginId.trim() ? c.pluginId.trim() : "general";
      const allowCopy = pluginId !== "image-search";
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim() : "";
      const sourceFormat = typeof c.sourceFormat === "string" ? (c.sourceFormat as string).trim() : "";
      const frameworkVersion = typeof c.frameworkVersion === "string" ? (c.frameworkVersion as string).trim() : "";
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox);
      if (
        ctx.widgetSlots <= 0 ||
        typeof c.title !== "string" ||
        !(c.title as string).trim() ||
        (c.title as string).length > 120 ||
        !validWidgetRefreshSeconds(c.refreshSeconds ?? 0) ||
        typeof c.html !== "string" ||
        !(c.html as string).trim() ||
        (c.html as string).length > MAX_WIDGET_HTML_LENGTH ||
        diagramKind.length > 80 ||
        sourceFormat.length > 80 ||
        frameworkVersion.length > 120 ||
        (allowCopy && c.copyText !== undefined && (typeof c.copyText !== "string" || !(c.copyText as string).trim() || (c.copyText as string).length > MAX_WIDGET_COPY_TEXT_LENGTH)) ||
        (allowCopy && c.copyLabel !== undefined && (typeof c.copyLabel !== "string" || !(c.copyLabel as string).trim() || (c.copyLabel as string).length > 80)) ||
        !geometry
      ) {
        return fail("html_widget.invalid");
      }
      const out: HtmlWidgetCommand = {
        tool: "html_widget",
        pluginId,
        x: Math.round(geometry.x),
        y: Math.round(geometry.y),
        w: Math.round(geometry.w),
        h: Math.round(geometry.h),
        title: (c.title as string).trim(),
        refreshSeconds: Math.round(Number(c.refreshSeconds ?? 0)),
        html: c.html as string,
      };
      if (diagramKind) out.diagramKind = diagramKind;
      if (sourceFormat) out.sourceFormat = sourceFormat;
      if (frameworkVersion) out.frameworkVersion = frameworkVersion;
      if (allowCopy && typeof c.copyText === "string") {
        out.copyText = (c.copyText as string).trim();
        out.copyLabel = String(c.copyLabel || (sourceFormat ? `Copy ${sourceFormat}` : "Copy source")).trim();
      }
      return out;
    }
    case "diagram_source": {
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox);
      const sourceFormat = canonicalDiagramFormat(c.sourceFormat);
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim() : "";
      if (
        ctx.widgetSlots <= 0 ||
        !geometry ||
        typeof c.title !== "string" ||
        !(c.title as string).trim() ||
        (c.title as string).length > 120 ||
        !sourceFormat ||
        !diagramSourceFits(c.source) ||
        diagramKind.length > 80
      ) {
        return fail("diagram_source.invalid");
      }
      return {
        tool: "diagram_source",
        widgetType: "diagram_source",
        pluginId: "flowchart",
        x: Math.round(geometry.x),
        y: Math.round(geometry.y),
        w: Math.round(geometry.w),
        h: Math.round(geometry.h),
        title: (c.title as string).trim(),
        refreshSeconds: 0,
        sourceFormat,
        source: c.source as string,
        ...(diagramKind ? { diagramKind } : {}),
      };
    }
    case "erase": {
      if (c.mode === "path") {
        if (
          !Array.isArray(c.points) ||
          (c.points as unknown[]).length < 1 ||
          (c.points as unknown[]).length > 200 ||
          !(c.points as unknown[]).every((p) => isPoint(p))
        ) {
          return fail("erase.path.bad");
        }
        const size = Math.max(2, Math.min(300, Number(c.size) || 80));
        const xs = (c.points as [number, number][]).map((p) => p[0]);
        const ys = (c.points as [number, number][]).map((p) => p[1]);
        if (Math.max(...xs) - Math.min(...xs) > 3000 || Math.max(...ys) - Math.min(...ys) > 3000) return fail("erase.path.span");
        return { tool: "erase", mode: "path", points: c.points as [number, number][], size };
      }
      if (!n(c.x) || !n(c.y) || !n(c.w, 1, 2000) || !n(c.h, 1, 2000) || (c.x as number) + (c.w as number) > SIZE || (c.y as number) + (c.h as number) > SIZE) {
        return fail("erase.rect.bad");
      }
      return { tool: "erase", mode: "rect", x: c.x as number, y: c.y as number, w: c.w as number, h: c.h as number };
    }
    case "draw": {
      const pts = Array.isArray(c.points) ? (c.points as unknown[]) : [];
      const points: DrawPoint[] = [];
      for (const p of pts) {
        const x = isPointPair(p) ? p[0] : (p as { x: number })?.x;
        const y = isPointPair(p) ? p[1] : (p as { y: number })?.y;
        if (!isFiniteNum(x) || !isFiniteNum(y)) return fail("draw.bad");
        points.push({ x, y });
      }
      if (points.length < 2 || points.length > 600 || !isFiniteNum(c.size, 1, 1600)) {
        return fail("draw.bad");
      }
      return {
        tool: "draw",
        points,
        size: Number(c.size),
        color: ctx.aiColor,
      };
    }
    default:
      return fail(`unknown-tool:${tool}`);
  }

  function fail(reason: string): null {
    logReject(reason);
    return null;
  }
}

function isPoint(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && n(v[0]) && n(v[1]);
}

function isPointPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

function validWidgetRefreshSeconds(value: unknown): boolean {
  return value === 0 || (typeof value === "number" && Number.isFinite(value) && value >= 60 && value <= 86400);
}

export function canonicalDiagramFormat(value: unknown): DiagramFormat | "" {
  const format = String(value || "").trim().toLowerCase();
  return (DIAGRAM_SOURCE_FORMATS as Set<string>).has(format)
    ? (format as DiagramFormat)
    : "";
}

export function diagramSourceFits(value: unknown): boolean {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    new TextEncoder().encode(value).length <= MAX_DIAGRAM_SOURCE_BYTES
  );
}

export function validateCommands(
  rawCmds: unknown[],
  ctx: CommandValidationContext
): { commands: CanvasCommand[]; rejected: string[] } {
  const rejected: string[] = [];
  const validated: CanvasCommand[] = [];
  if (!Array.isArray(rawCmds)) return { commands: [], rejected: ["not-array"] };
  const acceptedTools = new Set(["write_text", "draw_formula", "plot_function", "draw", "erase"]);
  if (ctx.plugins.size) acceptedTools.add("html_widget");
  if (ctx.plugins.has("flowchart")) acceptedTools.add("diagram_source");

  let widgetSlots = ctx.widgetSlots;
  for (const raw of rawCmds.slice(0, MAX_COMMANDS)) {
    const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const tool = String(c?.tool || c?.type || c?.name || "");
    if (!c || !acceptedTools.has(tool)) {
      rejected.push(`not-allowed:${tool}`);
      continue;
    }
    const cmd = validateCommand(c, { ...ctx, widgetSlots });
    if (!cmd) {
      continue;
    }
    if (cmd.tool === "html_widget" || cmd.tool === "diagram_source") widgetSlots--;
    validated.push(cmd);
  }

  const widgets = validated.filter((x) => x.tool === "html_widget" || x.tool === "diagram_source");
  if (widgets.length) return { commands: [widgets[0]], rejected };
  return { commands: validated, rejected };
}

export function logReject(reason: string): void {
  void reason;
}
