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
  placement?: string;
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
  placement?: string;
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

export const PLACE_GAP = 40;
const SLIDE_GAP = 24;
const TELEPORT_PX = 280;

type Box = { x: number; y: number; w: number; h: number };
type Side = "below" | "right" | "left" | "top";

function overlaps(a: Box, b: Box, pad = 24): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}

function viewOverlapRatio(box: Box, view?: Box): number {
  if (!view) return 1;
  const ix = Math.max(0, Math.min(box.x + box.w, view.x + view.w) - Math.max(box.x, view.x));
  const iy = Math.max(0, Math.min(box.y + box.h, view.y + view.h) - Math.max(box.y, view.y));
  return (ix * iy) / Math.max(1, box.w * box.h);
}

function slotFor(anchor: Box, w: number, h: number, dir: Side, gap = PLACE_GAP): { x: number; y: number } {
  if (dir === "right") return { x: Math.round(anchor.x + anchor.w + gap), y: Math.round(anchor.y) };
  if (dir === "left") return { x: Math.round(anchor.x - w - gap), y: Math.round(anchor.y) };
  if (dir === "top") return { x: Math.round(anchor.x), y: Math.round(anchor.y - h - gap) };
  return { x: Math.round(anchor.x), y: Math.round(anchor.y + anchor.h + gap) };
}

function sideOrder(preferred: string): Side[] {
  if (preferred === "right") return ["right", "below", "left", "top"];
  if (preferred === "left") return ["left", "below", "right", "top"];
  if (preferred === "top") return ["top", "below", "right", "left"];
  return ["below", "right", "left", "top"];
}

/** Slide along the free axis to clear blockers instead of jumping to a distant side. */
function slideClear(box: Box, dir: Side, blockers: Box[]): Box | null {
  const next: Box = { ...box };
  const alongX = dir === "below" || dir === "top";
  for (let step = 0; step < 10; step++) {
    const hit = blockers.find((b) => overlaps(next, b));
    if (!hit) return next;
    if (alongX) {
      const right = hit.x + hit.w + SLIDE_GAP;
      const left = hit.x - next.w - SLIDE_GAP;
      next.x = Math.round(Math.abs(right - box.x) <= Math.abs(left - box.x) ? right : left);
    } else {
      const down = hit.y + hit.h + SLIDE_GAP;
      const up = hit.y - next.h - SLIDE_GAP;
      next.y = Math.round(Math.abs(down - box.y) <= Math.abs(up - box.y) ? down : up);
    }
    next.x = clampNum(next.x, 0, SIZE - next.w);
    next.y = clampNum(next.y, 0, SIZE - next.h);
    if (overlaps(next, hit, 0)) return null;
  }
  return blockers.some((b) => overlaps(next, b)) ? null : next;
}

function staysOnSide(box: Box, intended: { x: number; y: number }, dir: Side): boolean {
  // Clamping to the canvas must not drag the widget off the requested side.
  // Sliding along the free axis (x when below/top, y when left/right) is allowed.
  if (dir === "below" || dir === "top") return Math.abs(box.y - intended.y) <= TELEPORT_PX;
  return Math.abs(box.x - intended.x) <= TELEPORT_PX;
}

function roomOnSide(
  anchor: Box,
  w: number,
  h: number,
  dir: Side,
  view?: Box,
  items?: Box[]
): number {
  const p = slotFor(anchor, w, h, dir);
  const box = { x: clampNum(p.x, 0, SIZE - w), y: clampNum(p.y, 0, SIZE - h), w, h };
  if (!staysOnSide(box, p, dir)) return -1;
  const cleared = slideClear(box, dir, items || []);
  if (!cleared || !staysOnSide(cleared, p, dir)) return -1;
  return viewOverlapRatio(cleared, view);
}

/** Prefer the LLM side; if none, pick the roomiest nearby empty side. */
function pickPreferredSide(
  requested: string,
  anchor: Box,
  w: number,
  h: number,
  view?: Box,
  items?: Box[],
  fallback: Side = "below"
): Side {
  if (requested === "right" || requested === "left" || requested === "top" || requested === "below") {
    return requested;
  }
  let best: Side = fallback;
  let bestScore = -1;
  for (const dir of ["below", "right", "left", "top"] as Side[]) {
    const score = roomOnSide(anchor, w, h, dir, view, items);
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return bestScore >= 0 ? best : fallback;
}

/**
 * Sit the widget against the user's ink. Overflowing the viewport is allowed
 * (the user can pan). Jumping across the canvas or covering the anchor is not.
 */
export function placeAroundAnchor(
  anchor: Box,
  w: number,
  h: number,
  view?: Box,
  items?: Box[],
  preferred = "below"
): { x: number; y: number } {
  const order = sideOrder(preferred);
  const blockers = (items || []).filter(
    (it) => Math.abs(it.x - anchor.x) > 2 || Math.abs(it.y - anchor.y) > 2
  );
  let best: Box | null = null;
  let bestScore = -1;
  for (const dir of order) {
    const intended = slotFor(anchor, w, h, dir);
    const raw: Box = {
      x: clampNum(intended.x, 0, SIZE - w),
      y: clampNum(intended.y, 0, SIZE - h),
      w,
      h,
    };
    if (!staysOnSide(raw, intended, dir)) continue;
    const cleared = slideClear(raw, dir, blockers);
    if (!cleared || !staysOnSide(cleared, intended, dir)) continue;
    const visible = viewOverlapRatio(cleared, view);
    const score = visible + (dir === order[0] ? 0.2 : 0) - (dir === "top" ? 0.05 : 0);
    if (dir === order[0] && visible >= 0.15) return { x: cleared.x, y: cleared.y };
    if (score > bestScore) {
      bestScore = score;
      best = cleared;
    }
  }
  if (best) return { x: best.x, y: best.y };
  const fallback = slotFor(anchor, w, h, order[0]);
  return { x: clampNum(fallback.x, 0, SIZE - w), y: clampNum(fallback.y, 0, SIZE - h) };
}

function occupancy(
  changedBox?: { x: number; y: number; w: number; h: number },
  sceneItems?: Array<{ x: number; y: number; w: number; h: number }>
): Array<{ x: number; y: number; w: number; h: number }> {
  const items = [...(sceneItems || [])];
  if (changedBox && changedBox.w > 4 && changedBox.h > 4) items.push(changedBox);
  return items;
}

function inferTextPlacement(placement: string, text: string): string {
  if (placement === "right" || placement === "left" || placement === "top" || placement === "below") {
    return placement;
  }
  const chars = Array.from(String(text).replace(/\s/g, "")).length;
  if (chars > 0 && chars <= 8) return "right";
  return "";
}

function placeContent(
  placement: string,
  sample: string,
  w: number,
  h: number,
  ctx: CommandValidationContext
): { x: number; y: number } {
  const blockers = occupancy(ctx.changedBox, ctx.sceneItems);
  const anchor = placementAnchor(ctx.changedBox, ctx.visibleRect);
  if (anchor) {
    const preferred = pickPreferredSide(
      inferTextPlacement(placement, sample),
      anchor,
      w,
      h,
      ctx.visibleRect,
      blockers,
      "below"
    );
    return placeAroundAnchor(anchor, w, h, ctx.visibleRect, blockers, preferred);
  }
  if (ctx.visibleRect) return placeInVisible(ctx.visibleRect, w, h, blockers);
  return { x: 1000, y: 1000 };
}

const MIN_WIDGET_WIDTH = 240;
const MIN_WIDGET_HEIGHT = 160;
const DEFAULT_WIDGET_WIDTH = 720;
const DEFAULT_WIDGET_HEIGHT = 480;
const MAX_WIDGET_WIDTH = 2800;
const MAX_WIDGET_HEIGHT = 4500;

function placementAnchor(
  changedBox: Box | undefined,
  visibleRect?: Box
): Box | null {
  if (!changedBox || changedBox.w < 4 || changedBox.h < 4) return null;
  const vw = Math.max(visibleRect?.w ?? 2000, 1);
  const vh = Math.max(visibleRect?.h ?? 1200, 1);
  // Full-viewport dumps are not a handwriting box — don't sit the widget
  // thousands of pixels below the whole capture.
  if (changedBox.w >= vw * 0.8 && changedBox.h >= vh * 0.8) return null;
  return changedBox;
}

function placeInVisible(view: Box, w: number, h: number, blockers: Box[]): { x: number; y: number } {
  const hint: Box = {
    x: Math.round(view.x + 48),
    y: Math.round(view.y + Math.min(220, view.h * 0.22)),
    w: Math.max(80, Math.min(w, Math.round(view.w * 0.35))),
    h: 36,
  };
  return placeAroundAnchor(hint, w, h, view, blockers, "below");
}

export function fitWidgetGeometry(
  cmd: { x?: unknown; y?: unknown; w?: unknown; h?: unknown; placement?: unknown; title?: unknown },
  visibleRect?: Box,
  changedBox?: Box,
  reposition = true,
  widgetEditBox?: Box,
  sceneItems?: Array<{ kind: string; x: number; y: number; w: number; h: number; title?: string }>
): Box | null {
  const placement = String(cmd.placement || "").toLowerCase();

  // Refinement mode: snap to the target widget's box
  if (!reposition || placement === "in_place") {
    let targetBox = widgetEditBox;
    if ((!targetBox || targetBox.w <= 0 || targetBox.h <= 0) && Array.isArray(sceneItems) && sceneItems.length > 0) {
      const widgetItems = sceneItems.filter((i) => i.kind === "diagram" || i.kind === "html");
      if (widgetItems.length > 0) {
        const cmdTitle = typeof cmd.title === "string" ? cmd.title.toLowerCase().trim() : "";
        if (cmdTitle) {
          const matched = widgetItems.find(
            (w) => w.title && (cmdTitle.includes(w.title.toLowerCase()) || w.title.toLowerCase().includes(cmdTitle))
          );
          if (matched) targetBox = matched;
        }
        if (!targetBox && changedBox && (changedBox.w > 0 || changedBox.h > 0)) {
          let closest = widgetItems[0];
          let minD = Infinity;
          for (const wItem of widgetItems) {
            const d = Math.hypot(
              wItem.x + wItem.w / 2 - (changedBox.x + changedBox.w / 2),
              wItem.y + wItem.h / 2 - (changedBox.y + changedBox.h / 2)
            );
            if (d < minD) {
              minD = d;
              closest = wItem;
            }
          }
          targetBox = closest;
        } else if (!targetBox) {
          targetBox = widgetItems[0];
        }
      }
    }
    if (targetBox && targetBox.w > 0 && targetBox.h > 0) {
      return {
        x: Math.round(targetBox.x),
        y: Math.round(targetBox.y),
        w: Math.round(targetBox.w),
        h: Math.round(targetBox.h),
      };
    }
  }

  const viewportW = Math.max(visibleRect?.w ?? 2000, 1);
  const viewportH = Math.max(visibleRect?.h ?? 1200, 1);
  const maxW = Math.min(MAX_WIDGET_WIDTH, Math.max(1800, Math.round(viewportW * 0.95)));
  const maxH = Math.min(MAX_WIDGET_HEIGHT, Math.max(1400, Math.round(viewportH * 0.95)));

  let rawW = Number(cmd.w);
  let rawH = Number(cmd.h);

  if (!Number.isFinite(rawW) || rawW <= 0) rawW = DEFAULT_WIDGET_WIDTH;
  if (!Number.isFinite(rawH) || rawH <= 0) rawH = DEFAULT_WIDGET_HEIGHT;

  if (rawW < MIN_WIDGET_WIDTH || rawH < MIN_WIDGET_HEIGHT) {
    const scale = Math.max(MIN_WIDGET_WIDTH / Math.max(1, rawW), MIN_WIDGET_HEIGHT / Math.max(1, rawH));
    rawW = Math.ceil(rawW * scale);
    rawH = Math.ceil(rawH * scale);
  }

  const sketchW = changedBox?.w ?? 0;
  const sketchH = changedBox?.h ?? 0;
  const anchor = placementAnchor(changedBox, visibleRect);
  const matchSketch = placement === "match_sketch" || placement === "in_place";
  if (!matchSketch && anchor && Math.abs(rawW - sketchW) < 48 && Math.abs(rawH - sketchH) < 48) {
    // Model copied the handwriting box instead of sizing the applet.
    rawW = DEFAULT_WIDGET_WIDTH;
    rawH = DEFAULT_WIDGET_HEIGHT;
  }
  if (anchor && matchSketch) {
    rawW = Math.max(rawW, Math.round(sketchW));
    rawH = Math.max(rawH, Math.round(sketchH));
  }

  const w = clampNum(rawW, MIN_WIDGET_WIDTH, maxW);
  const h = clampNum(rawH, MIN_WIDGET_HEIGHT, maxH);

  const blockers = occupancy(changedBox, sceneItems);

  let x: number;
  let y: number;

  if (placement === "match_sketch" && anchor && changedBox) {
    x = Math.round(changedBox.x);
    y = Math.round(changedBox.y);
  } else if (anchor && changedBox) {
    const preferred = pickPreferredSide(placement, changedBox, w, h, visibleRect, blockers, "below");
    const near = placeAroundAnchor(changedBox, w, h, visibleRect, blockers, preferred);
    x = near.x;
    y = near.y;
  } else if (visibleRect) {
    const near = placeInVisible(visibleRect, w, h, blockers);
    x = near.x;
    y = near.y;
  } else {
    x = clampNum(Number(cmd.x), 0, SIZE - w);
    y = clampNum(Number(cmd.y), 0, SIZE - h);
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

      const lines = Math.min(8, Math.max(2, text.split("\n").length + 1));
      const blockH = Math.round(fontSize * lineHeight * lines);
      const near = placeContent(placement, text, maxWidth, blockH, ctx);
      let x = near.x;
      let y = near.y;

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

      const formulaH = Math.round(fontSize * 1.8);
      const near = placeContent(placement, latex, estimatedWidth, formulaH, ctx);
      let x = near.x;
      let y = near.y;

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
      // Standalone HTML applets sit beside/below ink — never on top of the handwriting.
      if (placement === "match_sketch") {
        c.placement = "below";
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
        ...(typeof c.placement === "string" ? { placement: c.placement } : {}),
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
        ...(typeof c.placement === "string" ? { placement: c.placement } : {}),
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
