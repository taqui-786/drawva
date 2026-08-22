import { SIZE } from "./constants";
import {
  fitWidgetGeometry as sanitizeWidgetGeometry,
  DEFAULT_WIDGET_WIDTH,
  DEFAULT_WIDGET_HEIGHT,
} from "@/lib/ai/geometry";

export const MAX_COMMANDS = 16;
export const AI_TEXT_MAX_LENGTH = 800;
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
  placement?: string;
  targetBox?: { x: number; y: number; w: number; h: number };
}

export interface DrawFormulaCommand {
  tool: "draw_formula";
  x: number;
  y: number;
  latex: string;
  fontSize: number;
  color: string;
  placement?: string;
  targetBox?: { x: number; y: number; w: number; h: number };
}

export interface PlotFunctionCommand {
  tool: "plot_function";
  x: number;
  y: number;
  w: number;
  h: number;
  expression: string;
  color: string;
  placement?: string;
  targetBox?: { x: number; y: number; w: number; h: number };
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
  widgetGeometry?: { max?: { w?: number; h?: number } } | null;
}

const isFiniteNum = n as (v: unknown, min?: number, max?: number) => boolean;

function matchedFontSize(
  value: unknown,
  scale: number,
  changedBoxHeight?: number
): number {
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 0.25;
  const screenReadable = Math.round(42 / Math.max(0.03, Math.min(3, effectiveScale)));
  let size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    if (changedBoxHeight && changedBoxHeight > 40) {
      size = Math.max(24, Math.min(650, Math.round(changedBoxHeight * 0.75)));
    } else {
      size = screenReadable;
    }
  }
  return Math.max(24, Math.min(650, Math.max(size, screenReadable)));
}

function matchedTextFontSize(
  value: unknown,
  text: string,
  scale: number,
  changedBoxHeight?: number
): number {
  const size = matchedFontSize(value, scale, changedBoxHeight);
  const characters = Array.from(String(text).replace(/\s/g, "")).length;
  return characters < 10 ? size : Math.max(24, Math.round(size * 0.5));
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

/** Breathing room between the user's ink and a new AI item. Tight enough to stay related, wide enough not to kiss the handwriting. */
export const PLACE_GAP = 48;
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
    // If the preferred primary side is valid and clears obstacles on the canvas,
    // honor it directly without jumping to another side (infinite canvas allows panning).
    if (dir === order[0]) {
      return { x: cleared.x, y: cleared.y };
    }
    const score = visible + (dir === order[0] ? 0.2 : 0) - (dir === "top" ? 0.05 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = cleared;
    }
  }
  if (best) return { x: best.x, y: best.y };
  const fallback = slotFor(anchor, w, h, order[0]);
  return { x: clampNum(fallback.x, 0, SIZE - w), y: clampNum(fallback.y, 0, SIZE - h) };
}

function isViewportDump(box: Box, view?: Box): boolean {
  if (!view) return false;
  const vw = Math.max(view.w, 1);
  const vh = Math.max(view.h, 1);
  return box.w >= vw * 0.8 && box.h >= vh * 0.8;
}

function occupancy(
  changedBox?: { x: number; y: number; w: number; h: number },
  sceneItems?: Array<{ x: number; y: number; w: number; h: number }>,
  visibleRect?: Box
): Array<{ x: number; y: number; w: number; h: number }> {
  const items = [...(sceneItems || [])];
  // A full-viewport capture is not occupancy — treating it as a blocker
  // makes every nearby slot look taken and dumps the widget on top of older work.
  if (changedBox && changedBox.w > 4 && changedBox.h > 4 && !isViewportDump(changedBox, visibleRect)) {
    items.push(changedBox);
  }
  return items;
}

function inferTextPlacement(placement: string, text: string): string {
  if (
    placement === "right" ||
    placement === "left" ||
    placement === "top" ||
    placement === "below" ||
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch"
  ) {
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
  ctx: CommandValidationContext,
  explicitCoord?: { x?: unknown; y?: unknown; targetBox?: unknown }
): { x: number; y: number } {
  const targetBox = (explicitCoord?.targetBox && typeof explicitCoord.targetBox === "object"
    ? explicitCoord.targetBox
    : null) as Record<string, unknown> | null;
  const rawX = Number(targetBox && typeof targetBox.x === "number" ? targetBox.x : explicitCoord?.x);
  const rawY = Number(targetBox && typeof targetBox.y === "number" ? targetBox.y : explicitCoord?.y);
  const isTargetPlacement =
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch" ||
    placement === "custom";
  const isRelativeSide =
    placement === "below" ||
    placement === "right" ||
    placement === "left" ||
    placement === "top";

  if (Number.isFinite(rawX) && Number.isFinite(rawY) && (isTargetPlacement || !isRelativeSide)) {
    return {
      x: clampNum(rawX, 0, SIZE - w),
      y: clampNum(rawY, 0, SIZE - h),
    };
  }

  const blockers = occupancy(ctx.changedBox, ctx.sceneItems, ctx.visibleRect);
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

function placementAnchor(
  changedBox: Box | undefined,
  visibleRect?: Box
): Box | null {
  if (!changedBox || changedBox.w < 4 || changedBox.h < 4) return null;
  const vw = Math.max(visibleRect?.w ?? 2000, 1);
  const vh = Math.max(visibleRect?.h ?? 1200, 1);
  // Full-viewport dumps are not a handwriting box — don't sit the widget
  // thousands of pixels below the whole capture.
  if (isViewportDump(changedBox, visibleRect || { x: 0, y: 0, w: vw, h: vh })) return null;
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

function uniqueSceneWidgetByTitle(
  title: unknown,
  widgetItems: Array<{ kind: string; x: number; y: number; w: number; h: number; title?: string }>
): { kind: string; x: number; y: number; w: number; h: number; title?: string } | null {
  const cmdTitle = typeof title === "string" ? title.toLowerCase().trim() : "";
  if (!cmdTitle || widgetItems.length === 0) return null;
  const matched = widgetItems.filter((w) => {
    const wTitle = (w.title || "").toLowerCase().trim();
    return wTitle.length > 0 && (cmdTitle.includes(wTitle) || wTitle.includes(cmdTitle));
  });
  return matched.length === 1 ? matched[0] : null;
}

export function fitWidgetGeometry(
  cmd: {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
    placement?: unknown;
    title?: unknown;
    targetBox?: unknown;
  },
  visibleRect?: Box,
  changedBox?: Box,
  reposition = true,
  widgetEditBox?: Box,
  sceneItems?: Array<{ kind: string; x: number; y: number; w: number; h: number; title?: string }>,
  widgetGeometry?: { max?: { w?: number; h?: number } } | null
): Box | null {
  const placement = String(cmd.placement || "").toLowerCase();
  const targetBox = (cmd.targetBox && typeof cmd.targetBox === "object"
    ? cmd.targetBox
    : null) as Record<string, unknown> | null;

  const rawCmdX = targetBox && typeof targetBox.x === "number" ? targetBox.x : cmd.x;
  const rawCmdY = targetBox && typeof targetBox.y === "number" ? targetBox.y : cmd.y;
  const rawCmdW = targetBox && typeof targetBox.w === "number" ? targetBox.w : cmd.w;
  const rawCmdH = targetBox && typeof targetBox.h === "number" ? targetBox.h : cmd.h;

  const hasExplicitCoords = Number.isFinite(Number(rawCmdX)) && Number.isFinite(Number(rawCmdY));
  const isTargetPlacement =
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch";
  const isRelativeSide =
    placement === "below" ||
    placement === "right" ||
    placement === "left" ||
    placement === "top";

  // Refinement mode: snap to the widget the model actually edited.
  const snapInPlace = placement === "in_place" || (!reposition && !isRelativeSide && !isTargetPlacement && !hasExplicitCoords);
  if (snapInPlace) {
    let target = widgetEditBox;
    const widgetItems = Array.isArray(sceneItems)
      ? sceneItems.filter((i) => i.kind === "diagram" || i.kind === "html")
      : [];
    const titled = uniqueSceneWidgetByTitle(cmd.title, widgetItems);
    if (titled && (reposition || !target || target.w <= 0 || target.h <= 0)) {
      target = titled;
    }
    if ((!target || target.w <= 0 || target.h <= 0) && widgetItems.length > 0) {
      if (changedBox && (changedBox.w > 0 || changedBox.h > 0)) {
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
        target = closest;
      } else {
        target = widgetItems[0];
      }
    }
    if (target && target.w > 0 && target.h > 0) {
      return sanitizeWidgetGeometry(
        {
          x: Math.round(target.x),
          y: Math.round(target.y),
          w: Math.round(target.w),
          h: Math.round(target.h),
        },
        widgetGeometry
      );
    }
  }

  let rawW = Number(rawCmdW);
  let rawH = Number(rawCmdH);

  // If explicit coordinates were supplied
  if (hasExplicitCoords) {
    if (!Number.isFinite(rawW) || rawW <= 0) rawW = DEFAULT_WIDGET_WIDTH;
    if (!Number.isFinite(rawH) || rawH <= 0) rawH = DEFAULT_WIDGET_HEIGHT;
    return sanitizeWidgetGeometry(
      {
        x: Number(rawCmdX),
        y: Number(rawCmdY),
        w: rawW,
        h: rawH,
      },
      widgetGeometry
    );
  }

  const anchor = placementAnchor(changedBox, visibleRect);

  // If user requested targeting the drawn container/sketch
  if (isTargetPlacement && anchor && changedBox) {
    const pad = 12;
    const w = Math.max(160, Math.round(changedBox.w - pad * 2));
    const h = Math.max(120, Math.round(changedBox.h - pad * 2));
    return sanitizeWidgetGeometry(
      {
        x: Math.round(changedBox.x + pad),
        y: Math.round(changedBox.y + pad),
        w,
        h,
      },
      widgetGeometry
    );
  }

  // Calculate adaptive size if not explicitly provided or if default huge
  if (!Number.isFinite(rawW) || rawW <= 0 || rawW > 1600) {
    const baseW = anchor && anchor.w > 60 ? anchor.w * 1.25 : DEFAULT_WIDGET_WIDTH;
    rawW = Math.max(360, Math.min(960, Math.round(baseW)));
  }
  if (!Number.isFinite(rawH) || rawH <= 0 || rawH > 1200) {
    const baseH = anchor && anchor.h > 60 ? anchor.h * 1.25 : DEFAULT_WIDGET_HEIGHT;
    rawH = Math.max(240, Math.min(640, Math.round(baseH)));
  }

  const w = rawW;
  const h = rawH;
  const blockers = occupancy(changedBox, sceneItems, visibleRect);

  let x: number;
  let y: number;

  if (anchor && changedBox) {
    const preferred = pickPreferredSide(placement, changedBox, w, h, visibleRect, blockers, "below");
    const near = placeAroundAnchor(changedBox, w, h, visibleRect, blockers, preferred);
    x = near.x;
    y = near.y;
  } else if (visibleRect) {
    const near = placeInVisible(visibleRect, w, h, blockers);
    x = near.x;
    y = near.y;
  } else {
    x = 1000;
    y = 1000;
  }

  return sanitizeWidgetGeometry({ x, y, w, h }, widgetGeometry);
}

export function validateCommand(
  raw: unknown,
  ctx: CommandValidationContext,
  onReject?: (reason: string) => void
): CanvasCommand | null {
  if (!raw || typeof raw !== "object") {
    const reason = "not-an-object";
    logReject(reason);
    if (onReject) onReject(reason);
    return null;
  }
  const c = raw as Record<string, unknown>;
  const rawTool = String(c.tool || c.type || c.name || c.kind || "").trim().toLowerCase().replace(/[-_]/g, "");
  let tool = String(c.tool || c.type || c.name || c.kind || "").trim().toLowerCase();
  if (rawTool === "htmlwidget" || rawTool === "html" || rawTool === "widget" || rawTool === "svg" || rawTool === "applet") {
    tool = "html_widget";
  } else if (rawTool === "writetext" || rawTool === "text") {
    tool = "write_text";
  } else if (rawTool === "drawformula" || rawTool === "formula" || rawTool === "latex" || rawTool === "math") {
    tool = "draw_formula";
  } else if (rawTool === "plotfunction" || rawTool === "plot" || rawTool === "functionplot") {
    tool = "plot_function";
  } else if (rawTool === "diagramsource" || rawTool === "diagram" || rawTool === "mermaid") {
    tool = "diagram_source";
  } else if (rawTool === "draw" || rawTool === "sketch" || rawTool === "drawpoints") {
    tool = "draw";
  } else if (rawTool === "erase" || rawTool === "eraser") {
    tool = "erase";
  }

  const placement = String(c.placement || "").toLowerCase();

  switch (tool) {
    case "write_text": {
      const rawText = typeof c.text === "string" ? c.text : typeof c.content === "string" ? c.content : typeof c.message === "string" ? c.message : typeof c.value === "string" ? c.value : "";
      if (!rawText.trim()) return fail("write_text.empty");
      const text = rawText.slice(0, AI_TEXT_MAX_LENGTH);
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
      const near = placeContent(placement, text, maxWidth, blockH, ctx, { x: c.x, y: c.y, targetBox: c.targetBox });
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
      const rawLatex = typeof c.latex === "string" ? c.latex : typeof c.formula === "string" ? c.formula : typeof c.equation === "string" ? c.equation : typeof c.math === "string" ? c.math : typeof c.text === "string" ? c.text : typeof c.content === "string" ? c.content : "";
      if (!rawLatex.trim()) return fail("draw_formula.empty");
      const latex = rawLatex.slice(0, 500);
      const fontSize = matchedFontSize(c.fontSize, ctx.scale, ctx.changedBox?.h);
      const estimatedWidth = Math.min(5000, Math.max(fontSize * 2, latex.length * fontSize * 0.72));

      const formulaH = Math.round(fontSize * 1.8);
      const near = placeContent(placement, latex, estimatedWidth, formulaH, ctx, { x: c.x, y: c.y, targetBox: c.targetBox });
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
      const rawExpr = typeof c.expression === "string" ? c.expression : typeof c.expr === "string" ? c.expr : typeof c.fn === "string" ? c.fn : typeof c.formula === "string" ? c.formula : typeof c.equation === "string" ? c.equation : "";
      if (!rawExpr.trim() || rawExpr.length > 180) {
        return fail("plot_function.bad-expr");
      }
      const geom = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry);
      if (!geom) return fail("plot_function.bad-geom");

      return {
        tool: "plot_function",
        x: geom.x,
        y: geom.y,
        w: geom.w,
        h: geom.h,
        expression: rawExpr.trim(),
        color: ctx.aiColor,
      };
    }
    case "html_widget": {
      const rawPluginId = typeof c.pluginId === "string" && c.pluginId.trim() ? c.pluginId.trim() : "general";
      const pluginId = canonicalPluginId(rawPluginId);
      if (pluginId !== "general" && ctx.plugins && !ctx.plugins.has(pluginId)) {
        return fail(`html_widget.plugin-disabled:${pluginId}`);
      }
      const allowCopy = pluginId !== "image-search";
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim().slice(0, 80) : "";
      const sourceFormat = typeof c.sourceFormat === "string" ? (c.sourceFormat as string).trim().slice(0, 80) : "";
      const frameworkVersion = typeof c.frameworkVersion === "string" ? (c.frameworkVersion as string).trim().slice(0, 120) : "";
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry);
      const rawTitle = typeof c.title === "string" ? (c.title as string).trim().slice(0, 120) : "";
      const title = rawTitle || diagramKind || (sourceFormat ? `${sourceFormat} Diagram` : "Visual Widget");
      const refreshSeconds = Number.isFinite(Number(c.refreshSeconds)) ? Math.max(0, Math.min(86400, Math.round(Number(c.refreshSeconds)))) : 0;

      const rawHtml = typeof c.html === "string"
        ? c.html
        : typeof c.content === "string"
        ? c.content
        : typeof c.code === "string"
        ? c.code
        : typeof c.body === "string"
        ? c.body
        : typeof c.source === "string"
        ? c.source
        : typeof c.svg === "string"
        ? c.svg
        : typeof c.template === "string"
        ? c.template
        : "";
      const html = rawHtml.trim();

      const rawCopyText = typeof c.copyText === "string" ? c.copyText : "";

      if (
        ctx.widgetSlots <= 0 ||
        !html ||
        html.length > MAX_WIDGET_HTML_LENGTH ||
        (allowCopy && c.copyText !== undefined && (!rawCopyText.trim() || rawCopyText.length > MAX_WIDGET_COPY_TEXT_LENGTH)) ||
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
        title,
        refreshSeconds,
        html,
        ...(typeof c.placement === "string" ? { placement: c.placement } : {}),
      };
      if (diagramKind) out.diagramKind = diagramKind;
      if (sourceFormat) out.sourceFormat = sourceFormat;
      if (frameworkVersion) out.frameworkVersion = frameworkVersion;
      if (allowCopy && rawCopyText.trim()) {
        out.copyText = rawCopyText.trim();
        out.copyLabel = String(c.copyLabel || (sourceFormat ? `Copy ${sourceFormat}` : "Copy source")).trim().slice(0, 80);
      }
      return out;
    }
    case "diagram_source": {
      if (ctx.plugins && !ctx.plugins.has("flowchart")) {
        return fail("diagram_source.plugin-disabled");
      }
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry);
      const rawFormat = typeof c.sourceFormat === "string" ? c.sourceFormat : "";
      const rawSource = typeof c.source === "string"
        ? c.source
        : typeof c.code === "string"
        ? c.code
        : typeof c.content === "string"
        ? c.content
        : typeof c.diagram === "string"
        ? c.diagram
        : typeof c.text === "string"
        ? c.text
        : "";
      const source = rawSource.trim();
      const rawTitle = typeof c.title === "string" ? (c.title as string).trim().slice(0, 120) : "";
      let sourceFormat = canonicalDiagramFormat(rawFormat);
      if (!sourceFormat || sourceFormat === "mermaid") {
        if (
          /smiles|molecule|chemical|c1ccccc1|aspirin|c@/i.test(rawTitle) ||
          (/^[A-Za-z0-9@+\-\[\]\(\)\\\/%=#$]+$/.test(source) &&
            !/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|digraph|subgraph)/i.test(source) &&
            (/[cCnNoOpPsS]/.test(source) && (source.includes("=") || source.includes("(") || source.includes("1") || source.includes("@"))))
        ) {
          sourceFormat = "smiles";
        }
      }
      if (!sourceFormat) {
        sourceFormat = "mermaid";
      }
      const diagramKind = typeof c.diagramKind === "string" ? (c.diagramKind as string).trim().slice(0, 80) : "";
      const title = rawTitle || diagramKind || `${sourceFormat.toUpperCase()} Diagram`;
      if (
        ctx.widgetSlots <= 0 ||
        !geometry ||
        !source ||
        !diagramSourceFits(source)
      ) {
        return fail("diagram_source.invalid");
      }
      return {
        tool: "diagram_source",
        widgetType: "diagram_source",
        pluginId: typeof c.pluginId === "string" && c.pluginId.trim() ? canonicalPluginId(c.pluginId.trim()) : sourceFormat,
        x: Math.round(geometry.x),
        y: Math.round(geometry.y),
        w: Math.round(geometry.w),
        h: Math.round(geometry.h),
        title,
        refreshSeconds: 0,
        sourceFormat,
        source,
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
    if (onReject) onReject(reason);
    return null;
  }
}

function isPoint(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && n(v[0]) && n(v[1]);
}

function isPointPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

export function canonicalPluginId(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return "general";
  const aliasMap: Record<string, string> = {
    general: "general",
    "general-html": "general",
    generalhtml: "general",
    html: "general",
    "html-widget": "general",
    htmlwidget: "general",
    custom: "general",
    svg: "general",
    default: "general",
    flowchart: "flowchart",
    diagram: "flowchart",
    diagrams: "flowchart",
    mermaid: "flowchart",
    dot: "flowchart",
    bpmn: "flowchart",
    "bpmn-xml": "flowchart",
    vega: "flowchart",
    "vega-lite": "flowchart",
    geojson: "flowchart",
    cytoscape: "flowchart",
    "cytoscape-json": "flowchart",
    smiles: "flowchart",
    "tech-news": "tech-news",
    technews: "tech-news",
    "hacker-news": "tech-news",
    hackernews: "tech-news",
    hn: "tech-news",
    news: "tech-news",
    earthquakes: "earthquakes",
    earthquake: "earthquakes",
    "exchange-rates": "exchange-rates",
    "exchange-rate": "exchange-rates",
    exchangerates: "exchange-rates",
    currency: "exchange-rates",
    forex: "exchange-rates",
    "github-pulse": "github-pulse",
    github: "github-pulse",
    githubpulse: "github-pulse",
    "image-search": "image-search",
    image: "image-search",
    images: "image-search",
    imagesearch: "image-search",
    "natural-events": "natural-events",
    "natural-event": "natural-events",
    naturalevents: "natural-events",
    "space-weather": "space-weather",
    spaceweather: "space-weather",
    stocks: "stocks",
    stock: "stocks",
    weather: "weather",
  };
  return aliasMap[raw] || raw;
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

export function canonicalToolName(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/[-_]/g, "");
  if (raw === "htmlwidget" || raw === "html" || raw === "widget" || raw === "svg" || raw === "applet") {
    return "html_widget";
  }
  if (raw === "writetext" || raw === "text" || raw === "write") {
    return "write_text";
  }
  if (raw === "drawformula" || raw === "formula" || raw === "latex" || raw === "math") {
    return "draw_formula";
  }
  if (raw === "plotfunction" || raw === "plot" || raw === "functionplot") {
    return "plot_function";
  }
  if (raw === "diagramsource" || raw === "diagram" || raw === "mermaid") {
    return "diagram_source";
  }
  if (raw === "draw" || raw === "sketch" || raw === "drawpoints") {
    return "draw";
  }
  if (raw === "erase" || raw === "eraser") {
    return "erase";
  }
  return String(value || "").trim().toLowerCase();
}

export function validateCommands(
  rawCmds: unknown[],
  ctx: CommandValidationContext,
  onReject?: (reason: string) => void
): { commands: CanvasCommand[]; rejected: string[] } {
  const rejected: string[] = [];
  const reportReject = (reason: string) => {
    rejected.push(reason);
    if (onReject) onReject(reason);
  };
  const validated: CanvasCommand[] = [];
  if (!Array.isArray(rawCmds)) return { commands: [], rejected: ["not-array"] };
  const acceptedTools = new Set(["write_text", "draw_formula", "plot_function", "draw", "erase"]);
  acceptedTools.add("html_widget"); // General HTML is mandatory and always enabled
  if (ctx.plugins.has("flowchart") || ctx.plugins.size === 0) acceptedTools.add("diagram_source");

  let widgetSlots = ctx.widgetSlots;
  for (const raw of rawCmds.slice(0, MAX_COMMANDS)) {
    const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const tool = canonicalToolName(c?.tool || c?.type || c?.name || c?.kind);
    if (!c || !acceptedTools.has(tool)) {
      reportReject(`not-allowed:${tool}`);
      continue;
    }
    const cmd = validateCommand(c, { ...ctx, widgetSlots }, reportReject);
    if (!cmd) {
      continue;
    }
    if (cmd.tool === "html_widget" || cmd.tool === "diagram_source") widgetSlots--;
    validated.push(cmd);
  }

  let hasWidget = false;
  const filtered: CanvasCommand[] = [];
  for (const cmd of validated) {
    if (cmd.tool === "html_widget" || cmd.tool === "diagram_source") {
      if (!hasWidget) {
        filtered.push(cmd);
        hasWidget = true;
      } else {
        reportReject("max-1-widget-per-reply");
      }
    } else {
      filtered.push(cmd);
    }
  }
  return { commands: filtered, rejected };
}

export function logReject(reason: string): void {
  void reason;
}
