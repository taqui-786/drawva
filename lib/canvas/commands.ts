import { SIZE } from "./constants";
import { extractHtmlDimensions } from "./widgets";

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
  pluginId: string;
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
  sceneItems?: Array<{ kind: string; x: number; y: number; w: number; h: number }>;
}

const isFiniteNum = n as (v: unknown, min?: number, max?: number) => boolean;

function matchedFontSize(
  value: unknown,
  scale: number,
  changedBoxHeight?: number
): number {
  const screenReadable = Math.round(28 / Math.max(0.05, Math.min(3, scale)));
  let size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    if (changedBoxHeight && changedBoxHeight > 40) {
      size = Math.max(24, Math.min(180, Math.round(changedBoxHeight * 0.6)));
    } else {
      size = screenReadable;
    }
  }
  return Math.max(16, Math.min(240, Math.max(size, screenReadable)));
}

function matchedTextFontSize(
  value: unknown,
  text: string,
  scale: number,
  changedBoxHeight?: number
): number {
  const characters = Array.from(String(text).replace(/\s/g, "")).length;
  if (characters < 10) {
    return matchedFontSize(value, scale, changedBoxHeight);
  }
  const screenReadable = Math.round(20 / Math.max(0.05, Math.min(2.5, scale)));
  let size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    size = screenReadable;
  }
  return Math.max(14, Math.min(100, Math.max(size, screenReadable)));
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 16
): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}

function inView(
  box: { x: number; y: number; w: number; h: number },
  view?: { x: number; y: number; w: number; h: number }
): boolean {
  if (!view) return true;
  return box.x >= view.x && box.y >= view.y && box.x + box.w <= view.x + view.w && box.y + box.h <= view.y + view.h;
}

/** below → right → left → top. Last resort is below even if it overflows the view. */
function placeAroundAnchor(
  anchor: { x: number; y: number; w: number; h: number },
  w: number,
  h: number,
  view?: { x: number; y: number; w: number; h: number },
  items?: Array<{ x: number; y: number; w: number; h: number }>,
  preferred = "below"
): { x: number; y: number } {
  const gap = 24;
  const cx = anchor.x + anchor.w / 2;
  const alignedX = clampNum(cx - w / 2, 0, SIZE - w);
  const slots: Record<string, { x: number; y: number }> = {
    below: { x: alignedX, y: Math.round(anchor.y + anchor.h + gap) },
    right: { x: Math.round(anchor.x + anchor.w + gap), y: Math.round(anchor.y) },
    left: { x: Math.round(anchor.x - w - gap), y: Math.round(anchor.y) },
    top: { x: alignedX, y: Math.round(anchor.y - h - gap) },
  };
  const order =
    preferred === "right"
      ? ["right", "below", "left", "top"]
      : preferred === "left"
        ? ["left", "below", "right", "top"]
        : preferred === "top"
          ? ["top", "below", "right", "left"]
          : ["below", "right", "left", "top"];
  const blockers = (items || []).filter(
    (it) => Math.abs(it.x - anchor.x) > 2 || Math.abs(it.y - anchor.y) > 2
  );
  for (const dir of order) {
    const p = slots[dir];
    const box = {
      x: clampNum(p.x, 0, SIZE - w),
      y: clampNum(p.y, 0, SIZE - h),
      w,
      h,
    };
    if (!inView(box, view)) continue;
    if (blockers.some((it) => overlaps(box, it))) continue;
    return { x: box.x, y: box.y };
  }
  return slots.below;
}

const MIN_WIDGET_WIDTH = 240;
const MIN_WIDGET_HEIGHT = 160;
const DEFAULT_WIDGET_WIDTH = 540;
const DEFAULT_WIDGET_HEIGHT = 360;
const MAX_WIDGET_WIDTH = 2800;
const MAX_WIDGET_HEIGHT = 4500;

function fitWidgetGeometry(
  cmd: { x?: unknown; y?: unknown; w?: unknown; h?: unknown; placement?: unknown },
  visibleRect?: { x: number; y: number; w: number; h: number },
  changedBox?: { x: number; y: number; w: number; h: number },
  reposition = true,
  widgetEditBox?: { x: number; y: number; w: number; h: number },
  sceneItems?: Array<{ kind: string; x: number; y: number; w: number; h: number }>
): { x: number; y: number; w: number; h: number } | null {
  const placement = String(cmd.placement || "").toLowerCase();

  // Refinement mode: snap to the original widget's box — ignore whatever the AI returned.
  if ((!reposition || placement === "in_place") && widgetEditBox && widgetEditBox.w > 0 && widgetEditBox.h > 0) {
    return {
      x: Math.round(widgetEditBox.x),
      y: Math.round(widgetEditBox.y),
      w: Math.round(widgetEditBox.w),
      h: Math.round(widgetEditBox.h),
    };
  }

  const viewportW = Math.max(visibleRect?.w ?? 2000, 1);
  const viewportH = Math.max(visibleRect?.h ?? 1200, 1);

  let rawW = Number(cmd.w);
  let rawH = Number(cmd.h);

  if (!Number.isFinite(rawW) || rawW <= 0) rawW = DEFAULT_WIDGET_WIDTH;
  if (!Number.isFinite(rawH) || rawH <= 0) rawH = DEFAULT_WIDGET_HEIGHT;

  if (rawW < MIN_WIDGET_WIDTH || rawH < MIN_WIDGET_HEIGHT) {
    const scale = Math.max(MIN_WIDGET_WIDTH / Math.max(1, rawW), MIN_WIDGET_HEIGHT / Math.max(1, rawH));
    rawW = Math.ceil(rawW * scale);
    rawH = Math.ceil(rawH * scale);
  }

  // Anchor even on a single text line (h≈22). Ignore full-viewport dumps.
  const sketchW = changedBox?.w ?? 0;
  const sketchH = changedBox?.h ?? 0;
  const hasAnchor = sketchW > 8 && sketchH > 8 && sketchW < viewportW * 0.85 && sketchH < viewportH * 0.85;
  const matchSketch = placement === "match_sketch" || placement === "in_place";
  if (!matchSketch) {
    const copiesInk = hasAnchor && Math.abs(rawW - sketchW) < 48 && Math.abs(rawH - sketchH) < 48;
    const huge = rawW > Math.max(1400, viewportW * 0.75) || rawH > Math.max(1000, viewportH * 0.75);
    if (copiesInk || huge) {
      rawW = DEFAULT_WIDGET_WIDTH;
      rawH = DEFAULT_WIDGET_HEIGHT;
    }
  }
  if (hasAnchor && matchSketch) {
    rawW = Math.max(rawW, Math.round(sketchW));
    rawH = Math.max(rawH, Math.round(sketchH));
  }

  const maxW = Math.min(MAX_WIDGET_WIDTH, Math.max(1800, Math.round(viewportW * 0.95)));
  const maxH = Math.min(MAX_WIDGET_HEIGHT, Math.max(1400, Math.round(viewportH * 0.95)));

  const w = clampNum(rawW, MIN_WIDGET_WIDTH, maxW);
  const h = clampNum(rawH, MIN_WIDGET_HEIGHT, maxH);

  let x = Number(cmd.x);
  let y = Number(cmd.y);

  const hasValidExplicitCoords =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x < SIZE - w &&
    y < SIZE - h &&
    (!visibleRect || (x >= visibleRect.x - 500 && x <= visibleRect.x + visibleRect.w + 500 && y >= visibleRect.y - 500 && y <= visibleRect.y + visibleRect.h + 500));

  if (placement === "match_sketch" && hasAnchor && changedBox) {
    x = Math.round(changedBox.x);
    y = Math.round(changedBox.y);
  } else if (hasAnchor && changedBox && (placement === "below" || placement === "right" || placement === "left" || placement === "top" || reposition || !hasValidExplicitCoords)) {
    const near = placeAroundAnchor(
      changedBox,
      w,
      h,
      visibleRect,
      sceneItems,
      placement === "right" || placement === "left" || placement === "top" ? placement : "below"
    );
    x = near.x;
    y = near.y;
  } else if (placement === "below" || reposition || !hasValidExplicitCoords) {
    if (visibleRect) {
      x = clampNum(Math.round(visibleRect.x + visibleRect.w / 2 - w / 2), 0, Math.max(0, SIZE - w));
      y = clampNum(Math.round(visibleRect.y + visibleRect.h / 2 - h / 2), 0, Math.max(0, SIZE - h));
    } else {
      x = Math.round(Number.isFinite(x) ? x : 1000);
      y = Math.round(Number.isFinite(y) ? y : 1000);
    }
  }

  x = Math.max(0, Math.min(SIZE - w, Math.round(x)));
  y = Math.max(0, Math.min(SIZE - h, Math.round(y)));

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
  const placement = String(c.placement || "").toLowerCase();

  switch (tool) {
    case "write_text": {
      if (typeof c.text !== "string" || !c.text.trim()) return fail("write_text.empty");
      const text = (c.text as string).slice(0, AI_TEXT_MAX_LENGTH);
      const fontSize = matchedTextFontSize(c.fontSize, text, ctx.scale, ctx.changedBox?.h);
      const lineHeight = Math.max(1, Math.min(2.2, Number(c.lineHeight) || 1.35));

      const screenMaxWidth = 650;
      const worldScreenMaxWidth = Math.round(screenMaxWidth / Math.max(0.05, ctx.scale));
      const minCharsWidth = Math.round(fontSize * 28);
      let calculatedMaxWidth = Math.max(minCharsWidth, worldScreenMaxWidth);

      if (ctx.changedBox && ctx.changedBox.w > 40) {
        calculatedMaxWidth = Math.max(calculatedMaxWidth, Math.round(ctx.changedBox.w));
      }

      if (Number.isFinite(Number(c.maxWidth)) && Number(c.maxWidth) >= minCharsWidth) {
        calculatedMaxWidth = Math.max(calculatedMaxWidth, Number(c.maxWidth));
      }

      const viewportW = ctx.visibleRect?.w ?? 2000;
      const maxWidth = Math.max(
        280,
        Math.min(Math.round(viewportW * 0.9), Math.min(3200, calculatedMaxWidth))
      );

      let x = Number(c.x);
      let y = Number(c.y);
      const hasValidCoords =
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= 0 &&
        y >= 0 &&
        x < SIZE &&
        y < SIZE &&
        (!ctx.visibleRect ||
          (x >= ctx.visibleRect.x - 300 &&
            x <= ctx.visibleRect.x + ctx.visibleRect.w + 300));

      if (ctx.changedBox && ctx.changedBox.w > 0 && ctx.changedBox.h > 0) {
        if (placement === "right") {
          x = Math.round(ctx.changedBox.x + ctx.changedBox.w + 32);
          y = Math.round(ctx.changedBox.y);
        } else if (placement === "left") {
          x = Math.round(ctx.changedBox.x - maxWidth - 32);
          y = Math.round(ctx.changedBox.y);
        } else if (placement === "top") {
          x = Math.round(ctx.changedBox.x);
          y = Math.round(ctx.changedBox.y - fontSize * lineHeight * 3 - 24);
        } else {
          x = Math.round(ctx.changedBox.x);
          y = Math.round(ctx.changedBox.y + ctx.changedBox.h + 24);
        }
      } else if (!hasValidCoords) {
        if (ctx.visibleRect) {
          x = Math.round(ctx.visibleRect.x + ctx.visibleRect.w / 2 - maxWidth / 2);
          y = Math.round(ctx.visibleRect.y + ctx.visibleRect.h / 2 - 100);
        } else {
          x = 1000;
          y = 1000;
        }
      }

      x = Math.max(0, Math.min(SIZE - maxWidth, Math.round(x)));
      y = Math.max(0, Math.min(SIZE - fontSize * lineHeight * 2, Math.round(y)));

      return {
        tool: "write_text",
        x,
        y,
        text,
        fontSize: Math.round(fontSize),
        maxWidth: Math.round(maxWidth),
        lineHeight,
        color: ctx.aiColor,
      };
    }
    case "draw_formula": {
      if (typeof c.latex !== "string" || !c.latex.trim()) return fail("draw_formula.empty");
      const latex = (c.latex as string).slice(0, 500);
      const fontSize = matchedFontSize(c.fontSize, ctx.scale, ctx.changedBox?.h);
      const estimatedWidth = Math.min(5000, Math.max(fontSize * 2, latex.length * fontSize * 0.72));

      let x = Number(c.x);
      let y = Number(c.y);
      const hasValidCoords =
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= 0 &&
        y >= 0 &&
        x < SIZE &&
        y < SIZE &&
        (!ctx.visibleRect || (x >= ctx.visibleRect.x - 300 && x <= ctx.visibleRect.x + ctx.visibleRect.w + 300));

      if (placement === "right" && ctx.changedBox && ctx.changedBox.w > 0) {
        x = Math.round(ctx.changedBox.x + ctx.changedBox.w + 32);
        y = Math.round(ctx.changedBox.y);
      } else if (placement === "left" && ctx.changedBox && ctx.changedBox.w > 0) {
        x = Math.round(ctx.changedBox.x - estimatedWidth - 32);
        y = Math.round(ctx.changedBox.y);
      } else if (placement === "top" && ctx.changedBox && ctx.changedBox.h > 0) {
        x = Math.round(ctx.changedBox.x);
        y = Math.round(ctx.changedBox.y - fontSize * 1.8 - 24);
      } else if (!hasValidCoords || placement === "below") {
        if (ctx.changedBox && ctx.changedBox.w > 0 && ctx.changedBox.h > 0) {
          x = Math.round(ctx.changedBox.x);
          y = Math.round(ctx.changedBox.y + ctx.changedBox.h + 24);
        } else if (ctx.visibleRect) {
          x = Math.round(ctx.visibleRect.x + 80);
          y = Math.round(ctx.visibleRect.y + 80);
        } else {
          x = Number.isFinite(x) ? Math.round(x) : 1000;
          y = Number.isFinite(y) ? Math.round(y) : 1000;
        }
      }

      x = Math.max(0, Math.min(SIZE - estimatedWidth, Math.round(x)));
      y = Math.max(0, Math.min(SIZE - fontSize * 1.8, Math.round(y)));

      return {
        tool: "draw_formula",
        x,
        y,
        latex,
        fontSize: Math.round(fontSize),
        color: ctx.aiColor,
      };
    }
    case "plot_function": {
      if (typeof c.expression !== "string" || !(c.expression as string).trim() || (c.expression as string).length > 180) {
        return fail("plot_function.bad-expr");
      }
      const geom = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems);
      if (!geom) return fail("plot_function.bad-geom");

      return {
        tool: "plot_function",
        x: geom.x,
        y: geom.y,
        w: geom.w,
        h: geom.h,
        expression: (c.expression as string).trim(),
        color: ctx.aiColor,
      };
    }
    case "html_widget": {
      const pluginId = typeof c.pluginId === "string" && c.pluginId.trim() ? c.pluginId.trim() : "general";
      const allowCopy = pluginId !== "image-search";
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim() : "";
      const sourceFormat = typeof c.sourceFormat === "string" ? (c.sourceFormat as string).trim() : "";
      const frameworkVersion = typeof c.frameworkVersion === "string" ? (c.frameworkVersion as string).trim() : "";
      const estimated = typeof c.html === "string" ? extractHtmlDimensions(c.html) : null;
      if (estimated && String(c.placement || "").toLowerCase() !== "match_sketch") {
        c.w = estimated.width;
        c.h = estimated.height;
      }
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems);
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
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems);
      const rawFormat = typeof c.sourceFormat === "string" ? c.sourceFormat : "";
      const rawSource = typeof c.source === "string" ? c.source : "";
      const rawTitle = typeof c.title === "string" ? c.title : "";
      let sourceFormat = canonicalDiagramFormat(rawFormat);
      if (!sourceFormat || sourceFormat === "mermaid") {
        if (
          /smiles|molecule|chemical|c1ccccc1|aspirin|c@/i.test(rawTitle) ||
          (/^[A-Za-z0-9@+\-\[\]\(\)\\\/%=#$]+$/.test(rawSource.trim()) &&
            !/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|digraph|subgraph)/i.test(rawSource.trim()) &&
            (/[cCnNoOpPsS]/.test(rawSource) && (rawSource.includes("=") || rawSource.includes("(") || rawSource.includes("1") || rawSource.includes("@"))))
        ) {
          sourceFormat = "smiles";
        }
      }
      if (!sourceFormat) {
        sourceFormat = "mermaid";
      }
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim() : "";
      if (
        ctx.widgetSlots <= 0 ||
        !geometry ||
        typeof c.title !== "string" ||
        !(c.title as string).trim() ||
        (c.title as string).length > 120 ||
        !diagramSourceFits(c.source) ||
        diagramKind.length > 80
      ) {
        return fail("diagram_source.invalid");
      }
      return {
        tool: "diagram_source",
        widgetType: "diagram_source",
        pluginId: typeof c.pluginId === "string" && c.pluginId.trim() ? c.pluginId.trim() : sourceFormat,
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
  if ((DIAGRAM_SOURCE_FORMATS as Set<string>).has(format)) {
    return format as DiagramFormat;
  }
  const aliasMap: Record<string, DiagramFormat> = {
    flowchart: "mermaid",
    sequence: "mermaid",
    sequencediagram: "mermaid",
    graph: "mermaid",
    graphviz: "dot",
    "graphviz-dot": "dot",
    "graphviz dot": "dot",
    bpmn: "bpmn-xml",
    bpmn2: "bpmn-xml",
    "bpmn-2.0-xml": "bpmn-xml",
    vegalite: "vega-lite",
    "vega-lite-json": "vega-lite",
    vega: "vega-lite",
    chart: "vega-lite",
    "geo-json": "geojson",
    map: "geojson",
    chemical: "smiles",
    chemistry: "smiles",
    molecule: "smiles",
    molecular: "smiles",
    cytoscape: "cytoscape-json",
    "cytoscape-elements-json": "cytoscape-json",
    network: "cytoscape-json",
  };
  return aliasMap[format] || "";
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
