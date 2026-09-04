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
  objectId?: string;
  targetId?: string;
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
  /** Set of allowed plugin ids; when omitted, all plugins are allowed. */
  plugins?: Set<string>;
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
  const size = Number(value);
  if (Number.isFinite(size) && size >= 12) {
    return Math.max(12, Math.min(650, Math.round(size)));
  }
  // Only match ink box height if it is a reasonable handwriting stroke height (20px to 600px).
  if (changedBoxHeight && changedBoxHeight > 20 && changedBoxHeight <= 600) {
    return Math.max(20, Math.min(650, Math.round(changedBoxHeight * 0.75)));
  }
  return 42;
}

function matchedTextFontSize(
  value: unknown,
  text: string,
  scale: number,
  changedBoxHeight?: number
): number {
  const modelSize = Number(value);
  if (Number.isFinite(modelSize) && modelSize >= 12) {
    // 100% honor the model's explicitly specified font size in world units
    return Math.max(12, Math.min(650, Math.round(modelSize)));
  }
  const longForm = Array.from(String(text).replace(/\s/g, "")).length >= 10;
  // If handwriting was drawn, scale relative to handwriting.
  if (changedBoxHeight && changedBoxHeight > 20 && changedBoxHeight <= 600) {
    const size = Math.round(changedBoxHeight * 0.75);
    // Ink-height matching is for short completions beside the ink; a paragraph
    // note matched to a tall question ink box renders as a giant narrow column.
    return longForm ? Math.max(24, Math.min(64, size)) : Math.max(20, size);
  }
  // Standard whiteboard note font size default (contract: 36..48)
  return longForm ? 40 : 42;
}

function textColumnWidth(
  rawWidth: unknown,
  fontSize: number,
  scale: number,
  viewportW: number
): number {
  // Wrap-column ceiling. Capping at 3200 silently munged explicit model widths
  // (w:3900 -> maxWidth:3200 -> orphan second line); text boxes are tight-shrunk
  // to the longest wrapped line by the renderer, so a wide column is safe.
  const cap = Math.max(80, Math.min(6000, Math.round(Math.max(1, viewportW) * 0.9)));
  const modelW = Number(rawWidth);
  if (Number.isFinite(modelW) && modelW >= 80) {
    return clampNum(modelW, 80, cap);
  }
  const fallback = Math.max(Math.round(fontSize * 28), 1200);
  return clampNum(fallback, 80, cap);
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
  const h = Math.round(fontSize * lineHeight * Math.max(1, wrapLines));
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
    placement === "match_sketch" ||
    placement === "in_place" ||
    placement === "overlay"
  ) {
    return placement;
  }
  const chars = Array.from(String(text).replace(/\s/g, "")).length;
  if (chars > 0 && chars <= 8) return "right";
  return "";
}

/**
 * Where a box of w×h would land given the model's placement intent and the
 * live validation context — the same engine canvas_apply uses, exported for
 * read-only pre-flight (plannedWidget).
 */
export function placeContent(
  placement: string,
  sample: string,
  w: number,
  h: number,
  ctx: CommandValidationContext,
  explicitCoord?: { x?: unknown; y?: unknown; targetBox?: unknown }
): { x: number; y: number } {
  return placeContentImpl(placement, sample, w, h, ctx, explicitCoord);
}

function placeContentImpl(
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
    placement === "in_place" ||
    placement === "overlay" ||
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
      !ctx.keepPosition
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
  allowMove: boolean
): Box {
  const anchor = placementAnchor(source.changedBox, source.visibleRect);
  if (!allowMove || !anchor) return box;
  if (
    placement === "in_place" ||
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch" ||
    placement === "overlay"
  ) {
    return box;
  }
  if (!overlaps(box, anchor, 4)) return box;
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

function findSceneWidgetMatch(
  cmd: { title?: unknown; targetId?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown },
  sceneWidgets: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>
): { id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string } | null {
  if (sceneWidgets.length === 0) return null;

  // Match ONLY by explicit targetId
  const targetId = typeof cmd.targetId === "string" ? cmd.targetId.trim() : "";
  if (targetId) {
    const byId = sceneWidgets.find((w) => w.id === targetId);
    if (byId) return byId;
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
  _reposition = true,
  widgetEditBox?: Box,
  sceneItems?: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>,
  widgetGeometry?: { max?: { w?: number; h?: number } } | null
): Box | null {
  void _reposition;
  const placement = String(cmd.placement || "").toLowerCase();
  const widgetItems = Array.isArray(sceneItems)
    ? sceneItems.filter((i) => i.kind === "diagram" || i.kind === "html")
    : [];
  const matchedTarget = findSceneWidgetMatch(cmd, widgetItems);

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
    placement === "match_sketch" ||
    placement === "overlay";

  // Refinement mode: snap ONLY if there is an explicit matched target or widgetEditBox
  const explicitTarget = matchedTarget || widgetEditBox;
  const isTargetExplicit = Boolean(cmd.targetId) || Boolean(widgetEditBox);

  if (isTargetExplicit && explicitTarget && explicitTarget.w > 0 && explicitTarget.h > 0) {
    cmd.placement = "in_place";
    const targetId = ("id" in explicitTarget && typeof (explicitTarget as { id?: unknown }).id === "string") ? (explicitTarget as { id: string }).id : undefined;
    if (targetId && !cmd.targetId) cmd.targetId = targetId;
    return sanitizeWidgetGeometry(
      {
        x: Math.round(explicitTarget.x),
        y: Math.round(explicitTarget.y),
        w: Math.round(explicitTarget.w),
        h: Math.round(explicitTarget.h),
      },
      widgetGeometry
    );
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
    return box;
  }

  const anchor = placementAnchor(changedBox, visibleRect);

  // If user requested targeting the drawn container/sketch
  if ((isTargetPlacement || placement === "in_place") && anchor && changedBox) {
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

  // Size when the model gave none. An explicit finite size is HONOURED at any
  // magnitude and clamped by sanitizeWidgetGeometry below (which respects
  // widgetGeometry.max, the ceiling the prompt advertises as maxWidgetSize).
  // This used to discard any w > 1600 / h > 1200 and substitute an
  // anchor-derived guess, so a model that asked for 2400x1400 without x/y —
  // legal, and inside the advertised ceiling — silently got 375x240.
  //
  // The no-size default is viewport-derived rather than anchor-derived: a
  // widget scaled to a small scribble came out at 375x240, far too small to
  // hold readable canvas-scale type.
  if (!Number.isFinite(rawW) || rawW <= 0) {
    const viewW = visibleRect?.w ?? DEFAULT_WIDGET_WIDTH;
    rawW = Math.max(600, Math.min(1200, Math.round(viewW * 0.7)), Math.round((anchor?.w ?? 0) * 1.25));
  }
  if (!Number.isFinite(rawH) || rawH <= 0) {
    const viewH = visibleRect?.h ?? DEFAULT_WIDGET_HEIGHT;
    rawH = Math.max(400, Math.min(800, Math.round(viewH * 0.7)), Math.round((anchor?.h ?? 0) * 1.25));
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

function fitAnimationGeometry(
  c: Record<string, unknown>,
  ctx: CommandValidationContext
): Box | null {
  const placement = String(c.placement || "").toLowerCase();
  const targetBox = (c.targetBox && typeof c.targetBox === "object"
    ? c.targetBox
    : null) as Record<string, unknown> | null;

  const rawX = Number(targetBox && typeof targetBox.x === "number" ? targetBox.x : c.x);
  const rawY = Number(targetBox && typeof targetBox.y === "number" ? targetBox.y : c.y);
  let rawW = Number(targetBox && typeof targetBox.w === "number" ? targetBox.w : c.w);
  let rawH = Number(targetBox && typeof targetBox.h === "number" ? targetBox.h : c.h);

  const hasExplicitCoords = Number.isFinite(rawX) && Number.isFinite(rawY);
  const isOverlayPlacement =
    placement === "in_place" ||
    placement === "inside_target" ||
    placement === "target_box" ||
    placement === "at_target" ||
    placement === "match_sketch" ||
    placement === "overlay";

  const ANIM_MIN_W = 120;
  const ANIM_MIN_H = 90;
  const ANIM_MAX_W = 6000;
  const ANIM_MAX_H = 6000;
  const ANIM_DEFAULT_W = 800;
  const ANIM_DEFAULT_H = 600;

  if (hasExplicitCoords) {
    if (!Number.isFinite(rawW) || rawW <= 0) rawW = ANIM_DEFAULT_W;
    if (!Number.isFinite(rawH) || rawH <= 0) rawH = ANIM_DEFAULT_H;

    const w = clampNum(rawW, ANIM_MIN_W, ANIM_MAX_W);
    const h = clampNum(rawH, ANIM_MIN_H, ANIM_MAX_H);
    const x = clampNum(rawX, 0, SIZE - w);
    const y = clampNum(rawY, 0, SIZE - h);

    return { x, y, w, h };
  }

  const anchor = placementAnchor(ctx.changedBox, ctx.visibleRect);
  if (isOverlayPlacement && anchor && ctx.changedBox) {
    const pad = 8;
    const w = clampNum(Math.max(ANIM_MIN_W, ctx.changedBox.w + pad * 2), ANIM_MIN_W, ANIM_MAX_W);
    const h = clampNum(Math.max(ANIM_MIN_H, ctx.changedBox.h + pad * 2), ANIM_MIN_H, ANIM_MAX_H);
    const x = clampNum(ctx.changedBox.x - pad, 0, SIZE - w);
    const y = clampNum(ctx.changedBox.y - pad, 0, SIZE - h);
    return { x, y, w, h };
  }

  const w = clampNum(Number.isFinite(rawW) && rawW > 0 ? rawW : (anchor && anchor.w > 60 ? anchor.w : ANIM_DEFAULT_W), ANIM_MIN_W, ANIM_MAX_W);
  const h = clampNum(Number.isFinite(rawH) && rawH > 0 ? rawH : (anchor && anchor.h > 60 ? anchor.h : ANIM_DEFAULT_H), ANIM_MIN_H, ANIM_MAX_H);

  const blockers = occupancy(ctx.changedBox, ctx.sceneItems, ctx.visibleRect);
  let x: number;
  let y: number;

  if (anchor && ctx.changedBox) {
    const preferred = pickPreferredSide(placement, ctx.changedBox, w, h, ctx.visibleRect, blockers, "below");
    const near = placeAroundAnchor(ctx.changedBox, w, h, ctx.visibleRect, blockers, preferred);
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

  return {
    x: clampNum(x, 0, SIZE - w),
    y: clampNum(y, 0, SIZE - h),
    w,
    h,
  };
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
    x = clampNum(rawX, 0, SIZE - w);
    y = clampNum(rawY, 0, SIZE - h);
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
  if (typeof input === "number") {
    return String(input);
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
    ];
    for (const key of priorityKeys) {
      if (key in rec && rec[key] !== undefined && rec[key] !== null) {
        const res = extractText(rec[key], depth + 1);
        if (res) return res;
      }
    }
    const IGNORED_METADATA_KEYS = new Set([
      "tool",
      "command",
      "action",
      "type",
      "kind",
      "name",
      "pluginId",
      "plugin",
      "placement",
      "targetId",
      "sourceFormat",
      "diagramKind",
      "copyLabel",
      "copyText",
      "html",
      "source",
      "latex",
      "formula",
      "equation",
      "math",
      "expression",
      "expr",
      "title",
      "note",
      "reason",
      "status",
      "revision",
      "baseRevision",
    ]);
    for (const [k, val] of Object.entries(rec)) {
      if (IGNORED_METADATA_KEYS.has(k)) continue;
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
  if (typeof input === "number") {
    return String(input);
  }
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
      "tex",
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

/**
 * Lift geometry out of a nested wrapper (`box`, `bbox`, `rect`, `geometry`) and
 * accept `width`/`height` as `w`/`h`. The contract is flat x/y/w/h, but models
 * regularly wrap it; before this, `{box:{x,y,w,h}}` silently lost all four
 * numbers and the placement engine invented a box somewhere else — the model
 * then spent the rest of the turn trying to move a widget it never placed.
 */
function flattenGeometry(c: Record<string, unknown>): Record<string, unknown> {
  const nested = ["box", "bbox", "rect", "geometry", "bounds", "frame"]
    .map((key) => c[key])
    .find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      if (c[key] !== undefined && c[key] !== null) return c[key];
      if (nested && nested[key] !== undefined && nested[key] !== null) return nested[key];
    }
    return undefined;
  };
  const out = { ...c };
  const x = pick("x", "left");
  const y = pick("y", "top");
  const w = pick("w", "width");
  const h = pick("h", "height");
  if (x !== undefined) out.x = x;
  if (y !== undefined) out.y = y;
  if (w !== undefined) out.w = w;
  if (h !== undefined) out.h = h;
  return out;
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
  const c = flattenGeometry(raw as Record<string, unknown>);
  let tool = canonicalToolName(c.tool || c.command || c.type || c.name || c.kind || c.action || c.actionType || c.operation);

  // If tool is unrecognized, infer from content structure
  if (!["html_widget", "write_text", "draw_formula", "plot_function", "animate_scene", "diagram_source", "draw", "erase"].includes(tool)) {
    if (Array.isArray(c.objects) && Array.isArray(c.motions)) {
      tool = "animate_scene";
    } else if (Array.isArray(c.points) && c.points.length > 0) {
      tool = c.mode === "rect" || c.mode === "path" ? "erase" : "draw";
    } else if (c.html !== undefined || c.pluginId !== undefined) {
      tool = "html_widget";
    } else if (c.source !== undefined || c.sourceFormat !== undefined || c.diagram !== undefined) {
      tool = "diagram_source";
    } else if (c.latex !== undefined || c.math !== undefined || c.tex !== undefined) {
      tool = "draw_formula";
    } else if (c.text !== undefined || c.markdown !== undefined || c.message !== undefined || c.explanation !== undefined) {
      tool = "write_text";
    } else if (c.formula !== undefined || c.equation !== undefined) {
      tool = "draw_formula";
    } else if (c.expression !== undefined || c.expr !== undefined || c.fn !== undefined) {
      tool = "plot_function";
    } else {
      const potentialHtml = extractHtmlOrSvg(c);
      if (potentialHtml && (potentialHtml.includes("<svg") || potentialHtml.includes("<html") || potentialHtml.includes("<!DOCTYPE") || potentialHtml.includes("<div") || potentialHtml.includes("<canvas"))) {
        tool = "html_widget";
      } else {
        const potentialDiagram = extractDiagramSource(c);
        if (potentialDiagram && (potentialDiagram.startsWith("graph ") || potentialDiagram.startsWith("flowchart ") || potentialDiagram.startsWith("sequenceDiagram") || potentialDiagram.startsWith("digraph "))) {
          tool = "diagram_source";
        } else {
          const potentialText = extractText(c);
          if (potentialText) {
            tool = "write_text";
          } else {
            const potentialLatex = extractLatex(c);
            if (potentialLatex) {
              tool = "draw_formula";
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
      const near = placeContentImpl(placement, text, content.w, content.h, ctx, { x: c.x, y: c.y, targetBox: c.targetBox });
      let x = near.x;
      let y = near.y;

      x = Math.max(0, Math.min(Math.max(0, SIZE - content.w), Math.round(x)));
      y = Math.max(0, Math.min(Math.max(0, SIZE - content.h), Math.round(y)));

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
      const near = placeContentImpl(placement, latex, estimatedWidth, formulaH, ctx, { x: c.x, y: c.y, targetBox: c.targetBox });
      let x = near.x;
      let y = near.y;

      x = Math.max(0, Math.min(Math.max(0, SIZE - estimatedWidth), Math.round(x)));
      y = Math.max(0, Math.min(Math.max(0, SIZE - formulaH), Math.round(y)));

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
      const geom = fitAnimationGeometry(c, ctx);
      if (!geom) return fail("animate_scene.bad-geom");
      const sceneCmd = {
        ...c,
        tool: "animate_scene",
        x: geom.x,
        y: geom.y,
        w: geom.w,
        h: geom.h,
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
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry);
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
      const geometry = fitWidgetGeometry(c, ctx.visibleRect, ctx.changedBox, !ctx.keepPosition, ctx.widgetEditBox, ctx.sceneItems, ctx.widgetGeometry);
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
      const targetId =
        typeof c.objectId === "string" && c.objectId.trim()
          ? c.objectId.trim()
          : typeof c.targetId === "string" && c.targetId.trim()
          ? c.targetId.trim()
          : undefined;
      const explicitMode = typeof c.mode === "string" ? c.mode.toLowerCase() : "";

      if (explicitMode === "path" && Array.isArray(c.points) && c.points.length > 0) {
        const pts = (c.points as unknown[])
          .map((p) =>
            isPointPair(p)
              ? p
              : p && typeof p === "object" && typeof (p as { x?: number }).x === "number" && typeof (p as { y?: number }).y === "number"
              ? ([(p as { x: number }).x, (p as { y: number }).y] as [number, number])
              : null
          )
          .filter((p): p is [number, number] => p !== null && n(p[0]) && n(p[1]));
        if (pts.length < 1 || pts.length > 600) return fail("erase.path.bad");
        const size = Math.max(2, Math.min(600, Number(c.size) || 80));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        if (Math.max(...xs) - Math.min(...xs) > 6000 || Math.max(...ys) - Math.min(...ys) > 6000) return fail("erase.path.span");
        return {
          tool: "erase",
          mode: "path",
          points: pts,
          size,
          ...(targetId ? { objectId: targetId, targetId } : {}),
        };
      }

      let rectX = typeof c.x === "number" && Number.isFinite(c.x) ? c.x : undefined;
      let rectY = typeof c.y === "number" && Number.isFinite(c.y) ? c.y : undefined;
      let rectW = typeof c.w === "number" && Number.isFinite(c.w) && c.w > 0 ? c.w : undefined;
      let rectH = typeof c.h === "number" && Number.isFinite(c.h) && c.h > 0 ? c.h : undefined;

      if (targetId && (rectX === undefined || rectY === undefined || rectW === undefined || rectH === undefined)) {
        const found = ctx.sceneItems?.find((s) => s.id === targetId);
        if (found) {
          rectX = found.x;
          rectY = found.y;
          rectW = Math.max(10, found.w);
          rectH = Math.max(10, found.h);
        }
      }

      if ((rectX === undefined || rectY === undefined || rectW === undefined || rectH === undefined) && Array.isArray(c.points) && c.points.length >= 2) {
        const xs = (c.points as unknown[])
          .map((p) => (isPointPair(p) ? p[0] : (p as { x?: number })?.x))
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const ys = (c.points as unknown[])
          .map((p) => (isPointPair(p) ? p[1] : (p as { y?: number })?.y))
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (xs.length >= 2 && ys.length >= 2) {
          rectX = Math.min(...xs);
          rectY = Math.min(...ys);
          rectW = Math.max(10, Math.max(...xs) - rectX);
          rectH = Math.max(10, Math.max(...ys) - rectY);
        }
      }

      if (rectX === undefined || rectY === undefined || rectW === undefined || rectH === undefined) {
        if (targetId) {
          return { tool: "erase", mode: "rect", x: 0, y: 0, w: 0, h: 0, objectId: targetId, targetId };
        }
        return fail("erase.rect.bad");
      }

      const clampedX = Math.max(0, Math.min(SIZE, rectX));
      const clampedY = Math.max(0, Math.min(SIZE, rectY));
      const clampedW = Math.max(1, Math.min(SIZE - clampedX, rectW));
      const clampedH = Math.max(1, Math.min(SIZE - clampedY, rectH));

      return {
        tool: "erase",
        mode: "rect",
        x: clampedX,
        y: clampedY,
        w: clampedW,
        h: clampedH,
        ...(targetId ? { objectId: targetId, targetId } : {}),
      };
    }
    case "draw": {
      const pts = Array.isArray(c.points) ? (c.points as unknown[]) : [];
      // When the command carries an origin (x,y), points are local to it —
      // same convention expandDrawObjects uses for salvaged objects. Without
      // an origin, points are already global.
      const originX = isFiniteNum(c.x) ? Number(c.x) : 0;
      const originY = isFiniteNum(c.y) ? Number(c.y) : 0;
      const hasOrigin = isFiniteNum(c.x) || isFiniteNum(c.y);
      const points: DrawPoint[] = [];
      for (const p of pts) {
        const x = isPointPair(p) ? p[0] : (p as { x: number })?.x;
        const y = isPointPair(p) ? p[1] : (p as { y: number })?.y;
        if (!isFiniteNum(x) || !isFiniteNum(y)) return fail("draw.bad");
        points.push(hasOrigin ? { x: originX + Number(x), y: originY + Number(y) } : { x, y });
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
  if (raw === "htmlwidget" || raw === "html" || raw === "widget" || raw === "svg" || raw === "applet" || raw === "interactive") {
    return "html_widget";
  }
  if (raw === "writetext" || raw === "text" || raw === "write" || raw === "note" || raw === "notes" || raw === "textbox") {
    return "write_text";
  }
  if (raw === "drawformula" || raw === "formula" || raw === "latex" || raw === "math" || raw === "equation" || raw === "drawmath" || raw === "mathformula") {
    return "draw_formula";
  }
  if (raw === "plotfunction" || raw === "plot" || raw === "functionplot" || raw === "graph" || raw === "graphplot") {
    return "plot_function";
  }
  if (raw === "animatescene" || raw === "animation" || raw === "anim" || raw === "sceneanimation") {
    return "animate_scene";
  }
  if (raw === "diagramsource" || raw === "diagram" || raw === "mermaid" || raw === "flowchart") {
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
    case "write_text": {
      const content = textContentBox(cmd.text, cmd.fontSize, cmd.lineHeight, cmd.maxWidth);
      return { x: cmd.x, y: cmd.y, w: content.w, h: content.h };
    }
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
  if (!ctx.plugins || ctx.plugins.has("flowchart") || ctx.plugins.size === 0) acceptedTools.add("diagram_source");

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
    let tool = canonicalToolName(c.tool || c.command || c.type || c.name || c.kind || c.action || c.actionType || c.operation);
    if (!acceptedTools.has(tool)) {
      const htmlStr = extractHtmlOrSvg(c);
      if (htmlStr && (htmlStr.includes("<svg") || htmlStr.includes("<html") || htmlStr.includes("<!DOCTYPE") || htmlStr.includes("<div") || htmlStr.includes("<canvas"))) {
        tool = "html_widget";
      } else {
        const hasExplicitMathKey = Boolean(c.latex !== undefined || c.formula !== undefined || c.equation !== undefined || c.math !== undefined);
        const latexStr = extractLatex(c);
        if (latexStr && (hasExplicitMathKey || latexStr.includes("\\") || latexStr.includes("^") || latexStr.includes("_") || latexStr.includes("="))) {
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
      const received = Object.keys(c).filter((k) => k !== "tool").join(",") || "(no fields)";
      reportReject(
        `not-allowed:${tool || "(missing tool)"} (received keys: ${received}; allowed tools: ${[...acceptedTools].join(",")}; hint: set tool explicitly, e.g. {"tool":"write_text","x":0,"y":0,"text":"..."} or {"tool":"animate_scene","x":0,"y":0,"w":100,"h":100,"objects":[],"motions":[]})`
      );
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
