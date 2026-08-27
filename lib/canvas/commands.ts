import { SIZE } from "./constants";
import {
  fitWidgetGeometry as sanitizeWidgetGeometry,
  DEFAULT_WIDGET_WIDTH,
  DEFAULT_WIDGET_HEIGHT,
} from "@/lib/ai/geometry";
import {
  type AnimationScene,
  normalizeAnimationScene,
} from "./animation";
import { sampleSvgPath } from "./svgPath";

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
  targetId?: string;
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
  targetId?: string;
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
  targetId?: string;
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
  targetId?: string;
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
  targetId?: string;
}

export interface AnimateSceneCommand {
  tool: "animate_scene";
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
  loop: boolean;
  objects: unknown[];
  motions: unknown[];
  scene: AnimationScene;
  placement?: string;
  targetId?: string;
}

export type CanvasCommand =
  | WriteTextCommand
  | DrawFormulaCommand
  | PlotFunctionCommand
  | AnimateSceneCommand
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
  sceneItems?: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>;
  widgetGeometry?: { max?: { w?: number; h?: number } } | null;
  /** Shared per-reply accumulator enforcing MAX_PLOT_PIXELS_TOTAL across plots. */
  plotBudget?: { used: number };
  spatialPlan?: string;
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
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 0.25;
  const modelSize = Number(value);
  const longForm = Array.from(String(text).replace(/\s/g, "")).length >= 10;
  if (Number.isFinite(modelSize) && modelSize > 0) {
    // Honor the model's size for body copy. Only bump if it would be unreadably
    // small on screen (~18px). Do not floor to the 42px short-answer size —
    // that turns a compact notes column into a viewport-wide slab.
    const minWorld = Math.round((longForm ? 18 : 32) / Math.max(0.03, Math.min(3, effectiveScale)));
    return Math.max(24, Math.min(650, Math.max(Math.round(modelSize), minWorld)));
  }
  const size = matchedFontSize(value, scale, changedBoxHeight);
  return longForm ? Math.max(24, Math.round(size * 0.5)) : size;
}

function textColumnWidth(
  rawWidth: unknown,
  fontSize: number,
  scale: number,
  viewportW: number
): number {
  const cap = Math.max(280, Math.min(3200, Math.round(Math.max(1, viewportW) * 0.9)));
  const modelW = Number(rawWidth);
  if (Number.isFinite(modelW) && modelW >= 280) {
    return clampNum(modelW, 280, cap);
  }
  const fallback = Math.max(Math.round(fontSize * 18), Math.round(650 / Math.max(0.05, scale)));
  return clampNum(fallback, 280, cap);
}

function textContentBox(
  text: string,
  fontSize: number,
  lineHeight: number,
  maxWidth: number
): { w: number; h: number } {
  const avgChar = Math.max(8, fontSize * 0.55);
  const lines = String(text).split("\n");
  let longest = 1;
  for (const line of lines) longest = Math.max(longest, Array.from(line).length);
  const unwound = Math.ceil(longest * avgChar);
  const w = Math.max(fontSize * 2, Math.min(maxWidth, unwound || maxWidth));
  const wrapLines = lines.reduce((n, line) => {
    const chars = Math.max(1, Array.from(line).length);
    return n + Math.max(1, Math.ceil((chars * avgChar) / Math.max(1, w)));
  }, 0);
  const h = Math.round(fontSize * lineHeight * Math.min(16, Math.max(1, wrapLines)));
  return { w: Math.round(w), h };
}

/** Model x,y is usable when it sits in/near the current work area, not a y=0 dump. */
function coordsNearWork(x: number, y: number, ctx: CommandValidationContext): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > SIZE || y > SIZE) return false;
  const view = ctx.visibleRect || ctx.changedBox;
  if (!view || view.w < 4 || view.h < 4) return true;
  const padX = Math.max(view.w * 0.5, 800);
  const padY = Math.max(view.h * 0.5, 800);
  return (
    x >= view.x - padX &&
    x <= view.x + view.w + padX &&
    y >= view.y - padY &&
    y <= view.y + view.h + padY
  );
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

/** Fraction of `box` that lies inside `outer`. */
function containmentRatio(box: Box, outer: Box): number {
  const ix = Math.max(0, Math.min(box.x + box.w, outer.x + outer.w) - Math.max(box.x, outer.x));
  const iy = Math.max(0, Math.min(box.y + box.h, outer.y + outer.h) - Math.max(box.y, outer.y));
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

  // x,y from the model are the spatial plan. Placement is only a fallback when
  // coords are missing or dumped at the origin. Never throw away a point that
  // already sits in the current work area just because placement says "right".
  if (Number.isFinite(rawX) && Number.isFinite(rawY) && (isTargetPlacement || !isRelativeSide || coordsNearWork(rawX, rawY, ctx))) {
    return rescueCollision(
      {
        x: clampNum(rawX, 0, SIZE - w),
        y: clampNum(rawY, 0, SIZE - h),
        w,
        h,
      },
      placement,
      ctx,
      !ctx.keepPosition,
      false
    );
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

/**
 * Model-supplied coordinates sometimes land on top of the fresh ink or an item
 * placed earlier in the same reply. Slide the box to the nearest clear side
 * instead of rendering over the writing. Only genuine intersections trigger —
 * tight-anchor replies like writing "5" right after "3+2=" must stay put.
 *
 * `allowInsideAnchor` marks visual widget commands (html_widget, diagrams,
 * animations, plots): users legitimately target those INTO a drawn container,
 * so a placement substantially inside the fresh-ink bbox is intentional and is
 * kept. Plain text/formula never gets this exemption — text overlapping the
 * ink bbox means it sits on handwriting or an arrow and must be evicted.
 */
function rescueCollision(
  box: Box,
  placement: string,
  source: Pick<CommandValidationContext, "changedBox" | "visibleRect" | "sceneItems">,
  allowMove: boolean,
  allowInsideAnchor: boolean
): Box {
  const anchor = placementAnchor(source.changedBox, source.visibleRect);
  if (!allowMove || !anchor) return box;
  if (
    placement === "in_place" ||
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch"
  ) {
    return box;
  }
  if (!overlaps(box, anchor, 4)) return box;
  if (allowInsideAnchor && containmentRatio(box, anchor) >= 0.6) return box;
  const blockers = occupancy(source.changedBox, source.sceneItems, source.visibleRect);
  const preferred = pickPreferredSide(placement, anchor, box.w, box.h, source.visibleRect, blockers, "below");
  const near = placeAroundAnchor(anchor, box.w, box.h, source.visibleRect, blockers, preferred);
  return {
    x: clampNum(near.x, 0, SIZE - box.w),
    y: clampNum(near.y, 0, SIZE - box.h),
    w: box.w,
    h: box.h,
  };
}

function uniqueSceneWidgetByTitle(
  title: unknown,
  widgetItems: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>
): { id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string } | null {
  const cmdTitle = typeof title === "string" ? title.toLowerCase().trim() : "";
  if (!cmdTitle || widgetItems.length === 0) return null;
  const matched = widgetItems.filter((w) => {
    const wTitle = (w.title || "").toLowerCase().trim();
    return wTitle.length > 0 && (cmdTitle.includes(wTitle) || wTitle.includes(cmdTitle));
  });
  return matched.length === 1 ? matched[0] : null;
}

function findSceneWidgetMatch(
  cmd: { title?: unknown; targetId?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown },
  sceneWidgets: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>,
  changedBox?: Box
): { id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string } | null {
  if (sceneWidgets.length === 0) return null;

  // 1. Match by explicit targetId
  const targetId = typeof cmd.targetId === "string" ? cmd.targetId.trim() : "";
  if (targetId) {
    const byId = sceneWidgets.find((w) => w.id === targetId);
    if (byId) return byId;
  }

  // 2. Match by unique title
  const titled = uniqueSceneWidgetByTitle(cmd.title, sceneWidgets);
  if (titled) return titled;

  // 3. Match by spatial overlap (IoU / Center proximity)
  const cx = Number(cmd.x);
  const cy = Number(cmd.y);
  const cw = Number(cmd.w) || DEFAULT_WIDGET_WIDTH;
  const ch = Number(cmd.h) || DEFAULT_WIDGET_HEIGHT;
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    const cmdBox: Box = { x: cx, y: cy, w: cw, h: ch };
    let bestOverlap: { id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string } | null = null;
    let maxIoU = 0;
    for (const w of sceneWidgets) {
      const ix = Math.max(0, Math.min(cmdBox.x + cmdBox.w, w.x + w.w) - Math.max(cmdBox.x, w.x));
      const iy = Math.max(0, Math.min(cmdBox.y + cmdBox.h, w.y + w.h) - Math.max(cmdBox.y, w.y));
      const intersection = ix * iy;
      const union = cmdBox.w * cmdBox.h + w.w * w.h - intersection;
      const iou = union > 0 ? intersection / union : 0;
      const centerDist = Math.hypot(cmdBox.x + cmdBox.w / 2 - (w.x + w.w / 2), cmdBox.y + cmdBox.h / 2 - (w.y + w.h / 2));
      if (iou >= 0.35 || (centerDist < 200 && iou > 0.1)) {
        if (iou > maxIoU) {
          maxIoU = iou;
          bestOverlap = w;
        }
      }
    }
    if (bestOverlap) return bestOverlap;
  }

  // 4. Proximity to changedBox if only 1 widget exists
  if (sceneWidgets.length === 1 && changedBox && (changedBox.w > 0 || changedBox.h > 0)) {
    const w = sceneWidgets[0];
    const dist = Math.hypot(w.x + w.w / 2 - (changedBox.x + changedBox.w / 2), w.y + w.h / 2 - (changedBox.y + changedBox.h / 2));
    if (dist < 800) return w;
  }

  return null;
}

export function fitWidgetGeometry(
  cmd: {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
    placement?: unknown;
    targetId?: unknown;
    title?: unknown;
    targetBox?: unknown;
  },
  visibleRect?: Box,
  changedBox?: Box,
  reposition = true,
  widgetEditBox?: Box,
  sceneItems?: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>,
  widgetGeometry?: { max?: { w?: number; h?: number } } | null,
  spatialPlan?: string
): Box | null {
  const placement = String(cmd.placement || "").toLowerCase();
  const planSaysReplace = typeof spatialPlan === "string" && /\b(replace|in[-_]place|refine|update|modify|convert|functional)\b/i.test(spatialPlan);
  const widgetItems = Array.isArray(sceneItems)
    ? sceneItems.filter((i) => i.kind === "diagram" || i.kind === "html")
    : [];
  const matchedTarget = findSceneWidgetMatch(cmd, widgetItems, changedBox);

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

  // Refinement mode: snap to the widget the model actually edited or targeted
  const snapInPlace =
    placement === "in_place" ||
    (planSaysReplace && (matchedTarget !== null || widgetEditBox !== undefined)) ||
    (!reposition && !isRelativeSide && !isTargetPlacement && !hasExplicitCoords);

  if (snapInPlace) {
    let target = matchedTarget || widgetEditBox;
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
      cmd.placement = "in_place";
      const targetId = ("id" in target && typeof (target as { id?: unknown }).id === "string") ? (target as { id: string }).id : undefined;
      if (targetId && !cmd.targetId) cmd.targetId = targetId;
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
    const box = sanitizeWidgetGeometry(
      {
        x: Number(rawCmdX),
        y: Number(rawCmdY),
        w: rawW,
        h: rawH,
      },
      widgetGeometry
    );
    if (!box) return null;
    return rescueCollision(box, placement, { changedBox, visibleRect, sceneItems }, reposition && !snapInPlace, true);
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

const PLOT_MIN_W = 240;
const PLOT_MIN_H = 180;
const PLOT_MAX_W = 6000;
const PLOT_MAX_H = 6000;
const PLOT_DEFAULT_W = 1200;
const PLOT_DEFAULT_H = 800;

/**
 * Plot-specific geometry. The prompt promises min 240x180, aspect 1:6..6:1 and
 * per-reply pixel budgets; the generic widget geometry would clamp to 300x200
 * instead and never check aspect or pixels.
 */
function fitPlotGeometry(c: Record<string, unknown>, ctx: CommandValidationContext): Box | null {
  const targetBox = (c.targetBox && typeof c.targetBox === "object"
    ? c.targetBox
    : null) as Record<string, unknown> | null;
  const rawX = Number(targetBox && typeof targetBox.x === "number" ? targetBox.x : c.x);
  const rawY = Number(targetBox && typeof targetBox.y === "number" ? targetBox.y : c.y);
  let w = Number(targetBox && typeof targetBox.w === "number" ? targetBox.w : c.w);
  let h = Number(targetBox && typeof targetBox.h === "number" ? targetBox.h : c.h);
  if (!Number.isFinite(w) || w <= 0) w = PLOT_DEFAULT_W;
  if (!Number.isFinite(h) || h <= 0) h = PLOT_DEFAULT_H;

  w = clampNum(w, PLOT_MIN_W, PLOT_MAX_W);
  h = clampNum(h, PLOT_MIN_H, PLOT_MAX_H);
  if (w / h > 6) w = Math.min(PLOT_MAX_W, Math.floor(h * 6));
  if (h / w > 6) h = Math.min(PLOT_MAX_H, Math.floor(w * 6));
  if (w * h > MAX_PLOT_PIXELS_SINGLE) {
    const scale = Math.sqrt(MAX_PLOT_PIXELS_SINGLE / (w * h));
    w = Math.max(PLOT_MIN_W, Math.floor(w * scale));
    h = Math.max(PLOT_MIN_H, Math.floor(h * scale));
  }
  if (ctx.plotBudget) {
    const remaining = MAX_PLOT_PIXELS_TOTAL - ctx.plotBudget.used;
    if (w * h > remaining) {
      if (remaining < PLOT_MIN_W * PLOT_MIN_H) return null;
      const scale = Math.sqrt(remaining / (w * h));
      w = Math.max(PLOT_MIN_W, Math.floor(w * scale));
      h = Math.max(PLOT_MIN_H, Math.floor(h * scale));
      if (w * h > remaining) return null;
    }
    ctx.plotBudget.used += w * h;
  }

  const blockers = occupancy(ctx.changedBox, ctx.sceneItems, ctx.visibleRect);
  let x: number;
  let y: number;
  if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
    const rescued = rescueCollision(
      { x: clampNum(rawX, 0, SIZE - w), y: clampNum(rawY, 0, SIZE - h), w, h },
      String(c.placement || "").toLowerCase(),
      ctx,
      true,
      true
    );
    x = rescued.x;
    y = rescued.y;
  } else {
    const anchor = placementAnchor(ctx.changedBox, ctx.visibleRect);
    if (anchor) {
      const preferred = pickPreferredSide(
        String(c.placement || "").toLowerCase(),
        anchor,
        w,
        h,
        ctx.visibleRect,
        blockers,
        "below"
      );
      const near = placeAroundAnchor(anchor, w, h, ctx.visibleRect, blockers, preferred);
      x = near.x;
      y = near.y;
    } else if (ctx.visibleRect) {
      const near = placeInVisible(ctx.visibleRect, w, h, blockers);
      x = near.x;
      y = near.y;
    } else {
      x = 1000;
      y = 1000;
    }
    x = clampNum(x, 0, SIZE - w);
    y = clampNum(y, 0, SIZE - h);
  }
  return { x, y, w, h };
}

/**
 * Recursively extracts an HTML or SVG string from arbitrary model JSON structures.
 */
export function extractHtmlOrSvg(input: unknown, depth = 0): string {
  if (depth > 6 || input === null || input === undefined) return "";
  if (typeof input === "string") {
    let s = input.trim();
    if (!s) return "";
    if (s.startsWith("```")) {
      s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```$/, "").trim();
    } else {
      const fenceMatch = s.match(/```(?:html|svg|xml)?\s*([\s\S]*?)```/i);
      if (fenceMatch && fenceMatch[1].trim()) {
        s = fenceMatch[1].trim();
      }
    }
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try {
        const parsed = JSON.parse(s);
        const extracted = extractHtmlOrSvg(parsed, depth + 1);
        if (extracted) return extracted;
      } catch {}
    }
    return s;
  }
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const priorityKeys = [
      "svg",
      "html",
      "code",
      "content",
      "body",
      "source",
      "template",
      "markup",
      "data",
      "value",
      "spec",
      "params",
      "props",
      "args",
      "input",
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractHtmlOrSvg(rec[key], depth + 1);
        if (res) return res;
      }
    }
    for (const val of Object.values(rec)) {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (
          trimmed.includes("<svg") ||
          trimmed.includes("<html") ||
          trimmed.includes("<!DOCTYPE") ||
          trimmed.includes("<div") ||
          trimmed.includes("<canvas") ||
          trimmed.includes("<style") ||
          trimmed.includes("<script")
        ) {
          return trimmed;
        }
      }
    }
  }
  return "";
}

/**
 * Recursively extracts plain text / markdown from strings, arrays, or objects.
 */
export function extractText(input: unknown, depth = 0): string {
  if (depth > 6 || input === null || input === undefined) return "";
  if (typeof input === "string") {
    return input.trim();
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => extractText(item, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const priorityKeys = [
      "text",
      "content",
      "message",
      "markdown",
      "value",
      "theory",
      "explanation",
      "description",
      "summary",
      "body",
      "answer",
      "response",
      "data",
      "params",
      "args",
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractText(rec[key], depth + 1);
        if (res) return res;
      }
    }
    for (const val of Object.values(rec)) {
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  }
  return "";
}

/**
 * Recursively extracts LaTeX formula strings.
 * Strips wrapping $$ or $ delimiters automatically.
 */
export function extractLatex(input: unknown, depth = 0): string {
  if (depth > 6 || input === null || input === undefined) return "";
  if (typeof input === "string") {
    let s = input.trim();
    if (s.startsWith("$$") && s.endsWith("$$") && s.length >= 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith("$") && s.endsWith("$") && s.length >= 2) {
      s = s.slice(1, -1).trim();
    } else if (s.startsWith("\\[") && s.endsWith("\\]") && s.length >= 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith("\\(") && s.endsWith("\\)") && s.length >= 4) {
      s = s.slice(2, -2).trim();
    }
    return s;
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => extractLatex(item, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const priorityKeys = [
      "latex",
      "formula",
      "equation",
      "math",
      "text",
      "content",
      "value",
      "expression",
      "code",
      "params",
      "args",
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractLatex(rec[key], depth + 1);
        if (res) return res;
      }
    }
  }
  return "";
}

/**
 * Recursively extracts a math function expression.
 * Strips leading "y =" or "f(x) =" if present.
 */
export function extractExpression(input: unknown, depth = 0): string {
  if (depth > 6 || input === null || input === undefined) return "";
  if (typeof input === "string") {
    let s = input.trim();
    s = s.replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "").trim();
    return s;
  }
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const priorityKeys = [
      "expression",
      "expr",
      "fn",
      "formula",
      "equation",
      "func",
      "code",
      "value",
      "content",
      "params",
      "args",
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractExpression(rec[key], depth + 1);
        if (res) return res;
      }
    }
  }
  return "";
}

/**
 * Recursively extracts diagram source text.
 * Strips code fences (e.g. ```mermaid) automatically.
 */
export function extractDiagramSource(input: unknown, depth = 0): string {
  if (depth > 6 || input === null || input === undefined) return "";
  if (typeof input === "string") {
    let s = input.trim();
    if (s.startsWith("```")) {
      s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```$/, "").trim();
    }
    return s;
  }
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const priorityKeys = [
      "source",
      "code",
      "diagram",
      "content",
      "text",
      "body",
      "spec",
      "data",
      "params",
      "args",
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractDiagramSource(rec[key], depth + 1);
        if (res) return res;
      }
    }
  }
  return "";
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
  let tool = canonicalToolName(c.tool || c.type || c.name || c.kind || c.action);

  // If tool is unrecognized, infer from content structure
  if (!["html_widget", "write_text", "draw_formula", "plot_function", "animate_scene", "diagram_source", "draw", "erase"].includes(tool)) {
    if (Array.isArray(c.objects) && Array.isArray(c.motions)) {
      tool = "animate_scene";
    } else {
      const potentialHtml = extractHtmlOrSvg(c);
      if (potentialHtml.includes("<svg") || potentialHtml.includes("<html") || potentialHtml.includes("<!DOCTYPE") || potentialHtml.includes("<div") || potentialHtml.includes("<canvas")) {
        tool = "html_widget";
      } else {
        const potentialLatex = extractLatex(c);
        if (potentialLatex && (potentialLatex.includes("\\") || potentialLatex.includes("^") || potentialLatex.includes("_"))) {
          tool = "draw_formula";
        } else {
          const potentialExpr = extractExpression(c);
          if (potentialExpr && /[a-z0-9]/.test(potentialExpr) && (potentialExpr.includes("x") || potentialExpr.includes("sin") || potentialExpr.includes("cos"))) {
            tool = "plot_function";
          } else {
            const potentialText = extractText(c);
            if (potentialText) {
              tool = "write_text";
            }
          }
        }
      }
    }
  }

  const placement = String(c.placement || "").toLowerCase();

  switch (tool) {
    case "write_text": {
      const rawText = extractText(c.text ?? c.content ?? c.message ?? c.value ?? c.markdown ?? c.theory ?? c.explanation ?? c.description ?? c.summary ?? c.body ?? c.answer ?? c.response ?? c);
      if (!rawText.trim()) return fail("write_text.empty");
      const text = rawText.slice(0, AI_TEXT_MAX_LENGTH);
      const fontSize = matchedTextFontSize(c.fontSize, text, ctx.scale, ctx.changedBox?.h);
      const lineHeight = Math.max(1, Math.min(2.2, Number(c.lineHeight) || 1.35));

      const viewportW = ctx.visibleRect?.w ?? 2000;
      const maxWidth = textColumnWidth(c.maxWidth ?? c.width ?? c.w, fontSize, ctx.scale, viewportW);
      const content = textContentBox(text, fontSize, lineHeight, maxWidth);
      const near = placeContent(placement, text, content.w, content.h, ctx, { x: c.x, y: c.y, targetBox: c.targetBox });
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
      const rawLatex = extractLatex(c.latex ?? c.formula ?? c.equation ?? c.math ?? c.text ?? c.content ?? c.value ?? c.expression ?? c.code ?? c);
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
      const rawExpr = extractExpression(c.expression ?? c.expr ?? c.fn ?? c.formula ?? c.equation ?? c.func ?? c.code ?? c.value ?? c.content ?? c);
      if (!rawExpr.trim() || rawExpr.length > 180) {
        return fail("plot_function.bad-expr");
      }
      const geom = fitPlotGeometry(c, ctx);
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
    case "animate_scene": {
      const geom = fitWidgetGeometry(
        c,
        ctx.visibleRect,
        ctx.changedBox,
        !ctx.keepPosition,
        ctx.widgetEditBox,
        ctx.sceneItems,
        ctx.widgetGeometry,
        ctx.spatialPlan
      );
      const sceneCmd = {
        ...c,
        tool: "animate_scene",
        x: geom ? geom.x : Number(c.x) || 0,
        y: geom ? geom.y : Number(c.y) || 0,
        w: geom ? geom.w : Number(c.w) || 800,
        h: geom ? geom.h : Number(c.h) || 600,
      };
      const normalized = normalizeAnimationScene(sceneCmd, SIZE);
      if (!normalized) return fail("animate_scene.invalid");

      return {
        tool: "animate_scene",
        x: normalized.x,
        y: normalized.y,
        w: normalized.w,
        h: normalized.h,
        durationMs: normalized.durationMs,
        loop: normalized.loop,
        objects: normalized.objects,
        motions: normalized.motions,
        scene: normalized,
        ...(typeof c.placement === "string" ? { placement: c.placement } : {}),
        ...(typeof c.targetId === "string" ? { targetId: c.targetId } : {}),
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
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry, ctx.spatialPlan);
      const rawTitle = typeof c.title === "string" ? (c.title as string).trim().slice(0, 120) : "";
      const title = rawTitle || diagramKind || (sourceFormat ? `${sourceFormat} Diagram` : "Visual Widget");
      const refreshSeconds = Number.isFinite(Number(c.refreshSeconds)) ? Math.max(0, Math.min(86400, Math.round(Number(c.refreshSeconds)))) : 0;

      const rawHtml = extractHtmlOrSvg(c.html ?? c.content ?? c.code ?? c.body ?? c.source ?? c.svg ?? c.template ?? c.markup ?? c.data ?? c.value ?? c);
      const html = rawHtml.trim();

      const rawCopyText = typeof c.copyText === "string" ? c.copyText : "";

      if (
        ctx.widgetSlots <= 0 ||
        !html ||
        html.length > MAX_WIDGET_HTML_LENGTH ||
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
        ...(typeof c.targetId === "string" ? { targetId: c.targetId } : {}),
      };
      if (diagramKind) out.diagramKind = diagramKind;
      if (sourceFormat) out.sourceFormat = sourceFormat;
      if (frameworkVersion) out.frameworkVersion = frameworkVersion;
      if (allowCopy && rawCopyText.trim()) {
        out.copyText = rawCopyText.trim().slice(0, MAX_WIDGET_COPY_TEXT_LENGTH);
        out.copyLabel = String(c.copyLabel || (sourceFormat ? `Copy ${sourceFormat}` : "Copy source")).trim().slice(0, 80);
      }
      return out;
    }
    case "diagram_source": {
      if (ctx.plugins && !ctx.plugins.has("flowchart")) {
        return fail("diagram_source.plugin-disabled");
      }
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry, ctx.spatialPlan);
      const rawFormat = typeof c.sourceFormat === "string" ? c.sourceFormat : "";
      const rawSource = extractDiagramSource(c.source ?? c.code ?? c.content ?? c.diagram ?? c.text ?? c.body ?? c.spec ?? c.data ?? c);
      const source = rawSource.trim();

      // If the diagram source is actually raw SVG or HTML, seamlessly validate as html_widget!
      if (source.startsWith("<svg") || source.startsWith("<html") || source.startsWith("<!DOCTYPE") || source.startsWith("<div")) {
        return validateCommand({ ...c, tool: "html_widget", html: source }, ctx, onReject);
      }

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
        ...(typeof c.targetId === "string" ? { targetId: c.targetId } : {}),
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

/**
 * Salvage an animate_scene-style `objects` array inside a raw draw command by
 * flattening every simple primitive into a polyline stroke. Models frequently
 * guess this shape because the schema exposes `objects` for animate_scene, and
 * rejecting the whole sketch turns the reply into a chat message. Object
 * coordinates are treated as local to the command's x/y box.
 */
function expandDrawObjects(raw: Record<string, unknown>): Record<string, unknown>[] | null {
  const objects = Array.isArray(raw.objects) ? (raw.objects as unknown[]) : [];
  if (!objects.length || objects.length > 32) return null;
  const ox = Number.isFinite(Number(raw.x)) ? Number(raw.x) : 0;
  const oy = Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0;
  const strokes: Record<string, unknown>[] = [];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    const o = obj as Record<string, unknown>;
    const type = String(o.type || "").toLowerCase();
    const size = Math.min(1600, Math.max(1, Math.round(Number(o.lineWidth) || 6)));
    let pts: [number, number][] | null = null;
    if (type === "line") {
      const x1 = Number(o.x1);
      const y1 = Number(o.y1);
      const x2 = Number(o.x2);
      const y2 = Number(o.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite)) pts = [[x1, y1], [x2, y2]];
    } else if (type === "rect") {
      const x = Number(o.x);
      const y = Number(o.y);
      const w = Number(o.w);
      const h = Number(o.h);
      if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
        pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      }
    } else if (type === "circle" || type === "ellipse") {
      const cx = Number(o.cx);
      const cy = Number(o.cy);
      const rx = type === "circle" ? Number(o.r) : Number(o.rx);
      const ry = type === "circle" ? Number(o.r) : Number(o.ry);
      if ([cx, cy, rx, ry].every(Number.isFinite) && rx > 0 && ry > 0) {
        pts = [];
        for (let i = 0; i <= 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
        }
      }
    } else if (type === "path") {
      const d = typeof o.d === "string" ? o.d : typeof o.path === "string" ? o.path : "";
      if (d.trim()) {
        const sampled = sampleSvgPath(d, 600);
        if (sampled && sampled.length >= 2) pts = sampled;
      }
      if (!pts) {
        const rawPts = Array.isArray(o.points) ? o.points : [];
        const poly: [number, number][] = [];
        for (const p of rawPts.slice(0, 600)) {
          if (Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
            poly.push([Number(p[0]), Number(p[1])]);
          }
        }
        if (poly.length >= 2) pts = poly;
      }
    }
    if (!pts) continue;
    strokes.push({
      tool: "draw",
      points: pts.map(([px, py]) => ({ x: Math.round(ox + px), y: Math.round(oy + py) })),
      size,
    });
    if (strokes.length >= 16) break;
  }
  return strokes.length ? strokes : null;
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
  if (raw === "animatescene" || raw === "animation" || raw === "anim" || raw === "sceneanimation") {
    return "animate_scene";
  }
  if (raw === "diagramsource" || raw === "diagram" || raw === "mermaid") {
    return "diagram_source";
  }
  if (raw === "draw" || raw === "sketch" || raw === "drawpoints" || raw === "stroke" || raw === "strokes" || raw === "polyline") {
    return "draw";
  }
  if (raw === "erase" || raw === "eraser") {
    return "erase";
  }
  return String(value || "").trim().toLowerCase();
}

/** Bounding box of a placed command, so later siblings can avoid it. */
function commandBounds(cmd: CanvasCommand): Box | null {
  switch (cmd.tool) {
    case "write_text":
      return { x: cmd.x, y: cmd.y, w: cmd.maxWidth, h: Math.round(cmd.fontSize * cmd.lineHeight * 2) };
    case "draw_formula":
      return {
        x: cmd.x,
        y: cmd.y,
        w: Math.min(5000, Math.max(cmd.fontSize * 2, cmd.latex.length * cmd.fontSize * 0.72)),
        h: Math.round(cmd.fontSize * 1.8),
      };
    case "plot_function":
    case "html_widget":
    case "diagram_source":
    case "animate_scene":
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    default:
      return null;
  }
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
  const acceptedTools = new Set(["write_text", "draw_formula", "plot_function", "animate_scene", "draw", "erase"]);
  acceptedTools.add("html_widget"); // General HTML is mandatory and always enabled
  if (ctx.plugins.has("flowchart") || ctx.plugins.size === 0) acceptedTools.add("diagram_source");

  let widgetSlots = ctx.widgetSlots;
  const plotBudget = { used: 0 };
  // Placed siblings are fed back as occupancy so commands in one reply don't pile up.
  const siblingBoxes: Array<{ kind: string; x: number; y: number; w: number; h: number }> = Array.isArray(
    ctx.sceneItems
  )
    ? [...ctx.sceneItems]
    : [];
  for (const raw of rawCmds.slice(0, MAX_COMMANDS)) {
    const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!c) {
      reportReject("not-an-object");
      continue;
    }
    let tool = canonicalToolName(c.tool || c.type || c.name || c.kind || c.action);
    if (!acceptedTools.has(tool)) {
      const htmlStr = extractHtmlOrSvg(c);
      if (htmlStr && (htmlStr.includes("<svg") || htmlStr.includes("<html") || htmlStr.includes("<!DOCTYPE") || htmlStr.includes("<div") || htmlStr.includes("<canvas"))) {
        tool = "html_widget";
      } else {
        const latexStr = extractLatex(c);
        if (latexStr && (latexStr.includes("\\") || latexStr.includes("^") || latexStr.includes("_"))) {
          tool = "draw_formula";
        } else {
          const exprStr = extractExpression(c);
          if (exprStr && /[a-z0-9]/.test(exprStr) && (exprStr.includes("x") || exprStr.includes("sin") || exprStr.includes("cos"))) {
            tool = "plot_function";
          } else {
            const textStr = extractText(c);
            if (textStr) {
              tool = "write_text";
            }
          }
        }
      }
    }
    if (!acceptedTools.has(tool)) {
      reportReject(`not-allowed:${tool}`);
      continue;
    }
    // A draw command carrying an animate_scene-style objects array is a common
    // model guess — flatten it into real polyline strokes instead of rejecting.
    let expanded: Record<string, unknown>[] | null = null;
    if ((tool === "draw" || (!c.html && !c.source && !c.text && !c.latex && !c.expression && !c.motions)) && Array.isArray(c.objects) && !Array.isArray(c.points)) {
      expanded = expandDrawObjects(c);
      if (expanded) {
        tool = "draw";
      } else if (tool === "draw") {
        reportReject("draw.bad");
        continue;
      }
    }
    for (const rc of expanded ?? [c]) {
      const cmd = validateCommand(
        { ...rc, tool },
        { ...ctx, widgetSlots, plotBudget, sceneItems: siblingBoxes },
        reportReject
      );
      if (!cmd) {
        continue;
      }
      if (cmd.tool === "html_widget" || cmd.tool === "diagram_source") widgetSlots--;
      validated.push(cmd);
      const placed = commandBounds(cmd);
      if (placed) siblingBoxes.push({ kind: "ai", ...placed });
    }
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
