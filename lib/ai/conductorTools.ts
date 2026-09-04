import type { CanvasEngine } from "@/lib/canvas/engine";
import type { WidgetManager } from "@/lib/canvas/widgets";
import type { ObjectManager } from "@/lib/canvas/objects";
import type { BoardHistory } from "@/lib/canvas/history";
import type { DraftManager } from "@/lib/canvas/draftStore";
import type { Camera } from "@/lib/canvas/camera";
import type { Rect } from "@/lib/canvas/types";
import type { CanvasCommand, CommandValidationContext } from "@/lib/canvas/commands";
import { MAX_WIDGET_HTML_LENGTH, placeContent, validateCommands } from "@/lib/canvas/commands";
import { buildScene, visibleScene } from "@/lib/canvas/scene";
import { buildAtlas, contentBounds } from "@/lib/canvas/atlas";
import { MAX_SCALE, MIN_SCALE, SIZE } from "@/lib/canvas/constants";
import { fitWidgetGeometry, widgetGeometryForViewport } from "@/lib/ai/geometry";
import { applyWidgetPatch } from "@/lib/canvas/widgetPatch";
import { diagramDocument } from "@/lib/canvas/diagram";
import { trackedSceneSignature } from "@/lib/canvas/fingerprint";
import {
  READ_DEFAULT_LINES,
  READ_MAX_CHARS,
  SCAN_MAX_ITEMS,
  SNAPSHOT_BASIC,
  SNAPSHOT_DETAIL,
  isWebToolName,
  type CapturePolicy,
} from "./agentTools";

export interface ActiveImage {
  id: string;
  dataUrl: string;
  note: string;
}

export interface ConductorToolDeps {
  engine: CanvasEngine;
  widgets: WidgetManager;
  objects: ObjectManager;
  history: BoardHistory;
  draft: DraftManager;
  camera: Camera;
  getRevision: () => number;
  /** Content fingerprint of the board — see lib/canvas/fingerprint.ts. */
  getFingerprint: () => string;
  /** Fingerprint observed when `revision` was last reported to the model. */
  fingerprintAt: (revision: number) => string | undefined;
  afterBoardChange: () => void;
  registerImage: (img: ActiveImage) => void;
  getInkBox?: () => Rect | null;
  /** Registers a plugin contract for durable system-prompt injection. */
  registerPlugin?: (pluginId: string) => "registered" | "already" | "limit";
}

export function toolError(code: string, message: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { code, message, ...extra };
}

function clipRect(r: Rect): Rect {
  const x = Math.max(0, Math.round(r.x));
  const y = Math.max(0, Math.round(r.y));
  const right = Math.min(SIZE, Math.round(r.x + r.w));
  const bottom = Math.min(SIZE, Math.round(r.y + r.h));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function encodeCanvas(canvas: HTMLCanvasElement, quality = 0.92): string {
  try {
    return canvas.toDataURL("image/webp", quality);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Encode under a byte budget: drop webp quality first (step -0.08, floor 0.50),
 * then shrink dimensions (0.84 per step), at most 10 attempts.
 */
function encodeWithinBudget(src: HTMLCanvasElement, policy: CapturePolicy): string {
  let canvas = src;
  let quality = policy.quality;
  let best = encodeCanvas(canvas, quality);
  for (let attempt = 0; attempt < 10 && dataUrlBytes(best) > policy.maxBytes; attempt++) {
    if (quality > 0.5) {
      quality = Math.max(0.5, quality - 0.08);
    } else {
      const next = document.createElement("canvas");
      next.width = Math.max(1, Math.round(canvas.width * 0.84));
      next.height = Math.max(1, Math.round(canvas.height * 0.84));
      next.getContext("2d")!.drawImage(canvas, 0, 0, next.width, next.height);
      canvas = next;
      quality = policy.quality;
    }
    best = encodeCanvas(canvas, quality);
  }
  return best;
}

function downscaleToMaxEdge(src: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const long = Math.max(src.width, src.height);
  if (long <= maxEdge) return src;
  const scale = maxEdge / long;
  const next = document.createElement("canvas");
  next.width = Math.max(1, Math.round(src.width * scale));
  next.height = Math.max(1, Math.round(src.height * scale));
  next.getContext("2d")!.drawImage(src, 0, 0, next.width, next.height);
  return next;
}

async function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function revisionConflict(
  currentRevision: number,
  args: Record<string, unknown>,
  deps: ConductorToolDeps
): Record<string, unknown> | null {
  const base = args.baseRevision;
  if (typeof base !== "number" || !Number.isFinite(base)) {
    return toolError(
      "REVISION_CONFLICT",
      `baseRevision is required. Canvas revision is ${currentRevision} — retry this same call with baseRevision: ${currentRevision}.`,
      { currentRevision }
    );
  }
  if (base === currentRevision) return null;
  // The revision is a call counter, not a content version: it also advances on
  // changes that leave the board identical (widget iframes self-fitting their
  // content, gesture handlers ending without a gesture, autosave bookkeeping).
  // Rejecting on those produced REVISION_CONFLICT storms where the model
  // re-scanned and retried against a board that had never actually changed.
  // Only conflict when the content the model observed at `base` really moved.
  const observed = deps.fingerprintAt(Math.floor(base));
  if (observed !== undefined && observed === deps.getFingerprint()) return null;
  return toolError(
    "REVISION_CONFLICT",
    `Canvas content changed: you acted on revision ${Math.floor(base)}, current revision is ${currentRevision}. Re-scan only if you need the new ids or boxes; otherwise retry this same call with baseRevision: ${currentRevision}.`,
    { currentRevision }
  );
}

async function execScan(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const scope = args.scope === "viewport" ? "viewport" : "all";
  const viewport = deps.engine.camera.visibleWorldRect();
  const scene = scope === "viewport" ? visibleScene(deps.widgets, deps.objects, viewport) : buildScene(deps.widgets, deps.objects);
  const total = scene.count;
  const items = scene.items.slice(0, SCAN_MAX_ITEMS);
  const planned = planWidget(args.plannedWidget, deps);
  return {
    revision: deps.getRevision(),
    canvasSize: SIZE,
    viewport,
    counts: { widgets: deps.widgets.all().length, objects: deps.objects.all().length },
    items,
    ...(planned ? { plannedWidget: planned } : {}),
    ...(total > items.length ? { truncated: true, totalItems: total, note: `Showing ${items.length} of ${total} items. Focus with scope=viewport or canvas_snapshot on a region for the rest.` } : {}),
  };
}

/** Screen-px targets used by the legibility verdict (comfortable / preferred min / compact min). */
const TYPO_TARGETS = { comfortableBodyPx: 15, preferredMinimumPx: 11, compactMinimumPx: 8 } as const;

/**
 * Read-only pre-flight for a proposed widget: runs the real placement engine,
 * reports collisions, and predicts on-screen typography after the camera
 * focuses the widget — before the model spends thousands of output tokens.
 */
function planWidget(raw: unknown, deps: ConductorToolDeps): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const ctx = applyContext(deps);
  const askedW = Math.round(Number(rec.width) || 0);
  const askedH = Math.round(Number(rec.height) || 0);
  const fitted = fitWidgetGeometry(
    { x: rec.x, y: rec.y, w: rec.width, h: rec.height },
    ctx.widgetGeometry
  );
  const w = fitted?.w ?? Math.max(1, Math.round(Number(rec.width) || 1));
  const h = fitted?.h ?? Math.max(1, Math.round(Number(rec.height) || 1));
  const placement = typeof rec.placement === "string" ? rec.placement : "below";
  const placed = placeContent(placement, "", w, h, ctx, { x: rec.x, y: rec.y });
  const box: Rect = { x: placed.x, y: placed.y, w, h };

  const pad = 24;
  const overlapping = (ctx.sceneItems ?? []).filter(
    (it) =>
      box.x < it.x + it.w + pad &&
      box.x + box.w > it.x - pad &&
      box.y < it.y + it.h + pad &&
      box.y + box.h > it.y - pad
  );
  const overlappingObjectIds = overlapping.map((it) => it.id).filter((id): id is string => Boolean(id));
  const vp = deps.engine.camera.viewportRect;
  const offViewport =
    box.x + box.w < vp.x ||
    box.x > vp.x + vp.w ||
    box.y + box.h < vp.y ||
    box.y > vp.y + vp.h;

  // Predicted camera state when the widget is focused (same math as canvas_focus).
  const focusPad = 64;
  const focusScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, Math.min((vp.w - focusPad * 2) / Math.max(1, w), (vp.h - focusPad * 2) / Math.max(1, h)))
  );
  const predicted: Record<string, number> = {};
  for (const key of ["bodyPx", "captionPx", "titlePx"] as const) {
    const px = Number(rec[key]);
    if (Number.isFinite(px) && px > 0) predicted[key] = Math.round(px * focusScale * 10) / 10;
  }
  const sourceTargets: Record<string, number> = {};
  for (const key of ["bodyPx", "captionPx", "titlePx"] as const) {
    if (predicted[key] !== undefined) {
      const target = key === "bodyPx" ? TYPO_TARGETS.preferredMinimumPx : TYPO_TARGETS.compactMinimumPx;
      sourceTargets[key] = Math.ceil(target / focusScale);
    }
  }
  const clamped = askedW > 0 && askedH > 0 && (askedW !== w || askedH !== h);
  return {
    // The requested size is echoed back so a clamp is visible BEFORE the model
    // spends thousands of output tokens laying out HTML for a box it will not get.
    requested: { w: askedW || w, h: askedH || h },
    maxWidgetSize: ctx.widgetGeometry?.max,
    proposed: {
      createPlacement: { mode: "absolute", x: box.x, y: box.y, w, h },
      placement: fitted ? "engine-adjusted to widget geometry limits" : "as requested",
      ...(clamped
        ? { clamped: true, note: `Requested ${askedW}x${askedH} exceeds maxWidgetSize; use ${w}x${h} on the apply.` }
        : {}),
      crowded: overlappingObjectIds.length >= 2,
      offViewport,
      overlappingObjectIds,
    },
    focusedView: {
      scale: Math.round(focusScale * 1000) / 1000,
      displayed: { w: Math.round(w * focusScale), h: Math.round(h * focusScale) },
    },
    typography: {
      predicted,
      targets: { ...TYPO_TARGETS, note: "screen px after focus; raise the widget px values until predicted >= targets" },
      sourcePxTargetsAtFocusedView: sourceTargets,
      readableAtFocusedView:
        predicted.bodyPx === undefined
          ? undefined
          : predicted.bodyPx >= TYPO_TARGETS.preferredMinimumPx &&
            (predicted.captionPx === undefined || predicted.captionPx >= TYPO_TARGETS.compactMinimumPx),
    },
    note: "Whole-canvas overview thumbnails render text small on purpose — judge local legibility from this pre-flight or an object/detail snapshot, never from the overview.",
  };
}

async function execSnapshot(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const target = String(args.target || "viewport");
  const quality = args.quality === "detail" ? "detail" : "basic";
  if (quality === "detail" && target !== "region" && target !== "object") {
    return toolError("DETAIL_TARGET_REQUIRED", "Detail snapshots are limited to region or object targets.");
  }
  const policy: CapturePolicy = quality === "detail" ? SNAPSHOT_DETAIL : SNAPSHOT_BASIC;

  let source: Rect;
  let coveredContent: Rect | null = null;
  if (target === "viewport") {
    source = deps.engine.camera.visibleWorldRect();
  } else if (target === "canvas") {
    // Content-bounded overview: capturing the 20000-unit world renders a
    // blank unreadable thumbnail. Pad the real content bounds instead.
    const content = contentBounds(deps.engine, deps.widgets, deps.objects);
    coveredContent = content;
    if (!content) {
      source = deps.engine.camera.visibleWorldRect();
    } else {
      const pad = 240;
      source = clipRect({
        x: content.x - pad,
        y: content.y - pad,
        w: content.w + pad * 2,
        h: content.h + pad * 2,
      });
    }
  } else if (target === "region") {
    const r = args.region as Rect | undefined;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) {
      return toolError("INVALID_ARGUMENT", "region {x,y,w,h} is required when target=region.");
    }
    source = clipRect(r);
    coveredContent = contentBounds(deps.engine, deps.widgets, deps.objects);
  } else if (target === "object") {
    const id = String(args.objectId || "");
    const item = deps.widgets.get(id) || deps.objects.get(id);
    if (!item) return toolError("OBJECT_NOT_FOUND", `No object with id ${id}.`, { objectId: id });
    source = clipRect({ x: item.x, y: item.y, w: item.w, h: item.h });
    coveredContent = contentBounds(deps.engine, deps.widgets, deps.objects);
  } else {
    return toolError("INVALID_ARGUMENT", "target must be viewport, canvas, region, or object.");
  }

  const atlas = await buildAtlas(deps.engine, source, null, deps.widgets, deps.objects, {
    captureFullViewport: true,
    resolution: { maxLongEdge: policy.maxLongEdge, maxPixels: policy.maxPixels },
  });
  const raw = await canvasFromDataUrl(atlas.atlasImage);
  const framed = downscaleToMaxEdge(raw, policy.maxLongEdge);
  if (args.grid !== false) {
    drawCoordinateGrid(framed, atlas.sourceRect);
  }
  const imageScale = framed.width / Math.max(1, atlas.sourceRect.w);
  const dataUrl = encodeWithinBudget(framed, policy);
  const imageId = `img-${fnv1a(dataUrl)}`;
  deps.registerImage({
    id: imageId,
    dataUrl,
    note: `snapshot of {x:${atlas.sourceRect.x},y:${atlas.sourceRect.y},w:${atlas.sourceRect.w},h:${atlas.sourceRect.h}} at revision ${deps.getRevision()}`,
  });
  // A snapshot satisfies layout review only when it covers ~all current content.
  let coversContent = false;
  if (coveredContent && coveredContent.w > 0 && coveredContent.h > 0) {
    const ix = Math.max(0, Math.min(atlas.sourceRect.x + atlas.sourceRect.w, coveredContent.x + coveredContent.w) - Math.max(atlas.sourceRect.x, coveredContent.x));
    const iy = Math.max(0, Math.min(atlas.sourceRect.y + atlas.sourceRect.h, coveredContent.y + coveredContent.h) - Math.max(atlas.sourceRect.y, coveredContent.y));
    coversContent = (ix * iy) / (coveredContent.w * coveredContent.h) >= 0.95;
  } else if (target === "canvas") {
    coversContent = true; // empty board — nothing to review
  }
  // The scene list rides along with every snapshot. Previously the model had to
  // follow each snapshot with a canvas_scan just to learn ids and boxes, and each
  // of those is a full extra request (system prompt + whole conversation resent),
  // so the pattern cost roughly a third of the turn's input tokens for data the
  // host already had in hand here.
  const scene = buildScene(deps.widgets, deps.objects);
  const sceneItems = scene.items.slice(0, SCAN_MAX_ITEMS);
  return {
    revision: deps.getRevision(),
    sourceRect: atlas.sourceRect,
    imageSize: { w: framed.width, h: framed.height },
    imageScale,
    imageId,
    ...(coveredContent ? { contentBounds: coveredContent } : {}),
    coversContent,
    counts: { widgets: deps.widgets.all().length, objects: deps.objects.all().length },
    items: sceneItems,
    ...(scene.count > sceneItems.length
      ? { truncated: true, totalItems: scene.count }
      : {}),
  };
}

function applyContext(deps: ConductorToolDeps): CommandValidationContext {
  const visibleRect = deps.engine.camera.visibleWorldRect();
  const ink = deps.getInkBox?.();
  const changedBox = ink && ink.w > 4 && ink.h > 4 ? ink : undefined;
  const scene = buildScene(deps.widgets, deps.objects);
  return {
    aiColor: "#2679b8",
    scale: Math.max(0.03, deps.engine.camera.scale || 1),
    widgetSlots: 8,
    visibleRect,
    changedBox,
    sceneItems: scene.items,
    widgetGeometry: widgetGeometryForViewport(visibleRect),
  };
}

function commandBox(cmd: CanvasCommand): { objectId: string; kind: string; box: Rect } {
  const rec = cmd as CanvasCommand & { x?: number; y?: number; w?: number; h?: number; targetId?: string };
  const x = Number(rec.x) || 0;
  const y = Number(rec.y) || 0;
  let w = Number(rec.w) || 0;
  let h = Number(rec.h) || 0;
  if (cmd.tool === "write_text") {
    w = Number((cmd as { maxWidth?: number }).maxWidth) || 0;
    const fs = Number((cmd as { fontSize?: number }).fontSize) || 24;
    const lh = Number((cmd as { lineHeight?: number }).lineHeight) || 1.35;
    h = Math.round(fs * lh * 4);
  } else if (cmd.tool === "draw_formula") {
    const fs = Number((cmd as { fontSize?: number }).fontSize) || 24;
    const latex = String((cmd as { latex?: string }).latex || "");
    w = Math.round(Math.min(5000, Math.max(fs * 2, latex.length * fs * 0.72)));
    h = Math.round(fs * 1.8);
  }
  return {
    objectId: typeof rec.targetId === "string" ? rec.targetId : cmd.tool,
    kind: cmd.tool,
    box: { x, y, w, h },
  };
}

/** Ink footprint of a draw/erase command so history can snapshot affected tiles. */
function commandInkBox(cmd: CanvasCommand): Rect | null {
  const rec = cmd as CanvasCommand & { x?: number; y?: number; w?: number; h?: number; points?: unknown[]; size?: number };
  if (Array.isArray(rec.points) && rec.points.length > 0) {
    // Validated draw/erase points are {x, y} objects (DrawPoint) — NOT tuples.
    const size = (Number(rec.size) || 40) / 2 + 8;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of rec.points) {
      const px = Array.isArray(p) ? Number(p[0]) : Number((p as { x?: number })?.x);
      const py = Array.isArray(p) ? Number(p[1]) : Number((p as { y?: number })?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      x0 = Math.min(x0, px - size);
      y0 = Math.min(y0, py - size);
      x1 = Math.max(x1, px + size);
      y1 = Math.max(y1, py + size);
    }
    if (x1 < x0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const x = Number(rec.x);
  const y = Number(rec.y);
  const w = Number(rec.w);
  const h = Number(rec.h);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { x, y, w, h };
}

/**
 * Geometry the model asked for on the (at most one) widget-ish command, so the
 * apply result can report a placement override instead of leaving the model to
 * guess. Without it, a clamped box reads as "the tool ignored me" and the model
 * burns the rest of the turn on move/resize calls.
 */
function requestedWidgetBox(raw: unknown[]): Rect | null {
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const nested = ["box", "bbox", "rect", "geometry", "bounds", "frame"]
      .map((key) => rec[key])
      .find((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v));
    const num = (...keys: string[]) => {
      for (const key of keys) {
        const value = Number(rec[key] ?? nested?.[key]);
        if (Number.isFinite(value)) return value;
      }
      return NaN;
    };
    const w = num("w", "width");
    const h = num("h", "height");
    const x = num("x", "left");
    const y = num("y", "top");
    const isWidgetish =
      rec.html !== undefined || rec.source !== undefined || rec.objects !== undefined || rec.expression !== undefined;
    if (isWidgetish && [x, y, w, h].every(Number.isFinite)) {
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
  }
  return null;
}

function sameBox(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

async function execApply(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const currentRevision = deps.getRevision();
  const conflict = revisionConflict(currentRevision, args, deps);
  if (conflict) return conflict;
  // Some providers stringify array arguments. Parsing beats a hard reject: the
  // alternative is one wasted round trip per occurrence, which is exactly what
  // the real-user trace shows (steps 1 and 12 of the same turn).
  let rawArg = args.commands;
  if (typeof rawArg === "string") {
    try {
      rawArg = JSON.parse(rawArg) as unknown;
    } catch {
      return toolError("INVALID_ARGUMENT", "commands must be a JSON array of command objects, not a string.");
    }
  }
  const raw = Array.isArray(rawArg) ? rawArg : [];
  if (raw.length === 0) {
    return toolError("INVALID_ARGUMENT", "commands[] must hold 1..16 command objects.");
  }
  const ctx = applyContext(deps);
  const { commands, rejected } = validateCommands(raw, ctx);
  const rejectedRows = rejected.map((reason) => ({ reason }));
  if (commands.length === 0) {
    return {
      ok: false,
      code: "ALL_COMMANDS_REJECTED",
      revision: currentRevision,
      applied: [],
      rejected: rejectedRows.length
        ? rejectedRows
        : [
            {
              reason:
                "no command carried a usable payload — every command needs an explicit tool plus its own field (write_text→text, draw_formula→latex, html_widget→html, diagram_source→source+sourceFormat) and flat x/y/w/h geometry",
            },
          ],
    };
  }
  const requestedBox = requestedWidgetBox(raw);

  const beforeW = new Set(deps.widgets.all().map((w) => w.id));
  const beforeO = new Set(deps.objects.all().map((o) => o.id));
  // Watchlist for the async apply gap: everything that already existed and that
  // this apply does not itself target. Comparing the raw revision here rejected
  // valid applies whenever a content-neutral bump landed mid-flight.
  const targeted = new Set(
    commands
      .map((c) => (c as { targetId?: unknown }).targetId)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  const watched = [...beforeW, ...beforeO].filter((id) => !targeted.has(id));
  const watchedBefore = trackedSceneSignature(deps.widgets, deps.objects, watched);
  // Pre-record undo state so a mid-apply renderer failure rolls the board back
  // instead of leaving a half-applied, un-bumped, un-committed mutation.
  deps.history.recordObjects();
  deps.history.recordWidgets();
  deps.draft.setPending(commands);
  try {
    for (const c of commands) {
      if (c.tool === "draw" || c.tool === "erase") {
        const box = commandInkBox(c);
        if (box && box.w > 0 && box.h > 0) deps.history.captureRect(box);
      }
    }
    await deps.draft.accept(deps.engine);
  } catch (err) {
    deps.draft.discard();
    await deps.history.undo();
    deps.history.dropRedo();
    deps.afterBoardChange();
    return toolError(
      "APPLY_FAILED",
      `A renderer failed mid-apply and the board was rolled back — nothing from this call persisted. ${err instanceof Error ? err.message : "Unknown renderer error."} Simplify or split the commands and retry.`,
      { revision: deps.getRevision() }
    );
  }
  if (trackedSceneSignature(deps.widgets, deps.objects, watched) !== watchedBefore) {
    // A pre-existing item this apply was not targeting changed or vanished
    // during the async apply. Roll back so the mutation never lands on top of
    // an unseen concurrent change.
    await deps.history.undo();
    deps.history.dropRedo();
    deps.afterBoardChange();
    return toolError(
      "REVISION_CONFLICT",
      `Canvas changed while the apply was running (expected revision ${currentRevision}, now ${deps.getRevision()}); the apply was rolled back. Re-scan and retry with the fresh revision.`,
      { currentRevision: deps.getRevision() }
    );
  }
  deps.afterBoardChange();

  const applied: { objectId: string; kind: string; box: Rect; requested?: Rect; maxWidth?: number; fontSize?: number }[] = [];
  const afterW = new Set(deps.widgets.all().map((w) => w.id));
  const afterO = new Set(deps.objects.all().map((o) => o.id));
  for (const w of deps.widgets.all()) {
    if (beforeW.has(w.id)) continue;
    const box: Rect = { x: w.x, y: w.y, w: w.w, h: w.h };
    // Placement/geometry limits can move or shrink a widget. Saying so once here
    // is what stops the model re-issuing move/resize calls to "fix" it.
    applied.push({
      objectId: w.id,
      kind: w.kind,
      box,
      ...(requestedBox && !sameBox(requestedBox, box) ? { requested: requestedBox } : {}),
    });
  }
  for (const o of deps.objects.all()) {
    if (!beforeO.has(o.id)) {
      // For text, box.w is the tight width of the longest wrapped line — surface
      // the wrap boundary (maxWidth) + fontSize so the model understands the
      // effective column vs its requested width instead of guessing.
      const row: (typeof applied)[number] = { objectId: o.id, kind: o.kind, box: { x: o.x, y: o.y, w: o.w, h: o.h } };
      if (o.kind === "text") {
        if (typeof o.maxWidth === "number") row.maxWidth = o.maxWidth;
        if (typeof o.fontSize === "number") row.fontSize = o.fontSize;
      }
      applied.push(row);
    }
  }
  for (const wid of beforeW) {
    if (!afterW.has(wid)) applied.push({ objectId: wid, kind: "removed_widget", box: { x: 0, y: 0, w: 0, h: 0 } });
  }
  for (const oid of beforeO) {
    if (!afterO.has(oid)) applied.push({ objectId: oid, kind: "removed_object", box: { x: 0, y: 0, w: 0, h: 0 } });
  }
  // draw/erase rasterize straight into ink tiles, so they create no item and were
  // silently absent from `applied` — a 7-command apply reported 5 rows and the
  // model had no confirmation its strokes landed. Report them as ink rows with
  // the affected box so the row count always matches the command count.
  for (const c of commands) {
    if (c.tool !== "draw" && c.tool !== "erase") continue;
    const box = commandInkBox(c);
    applied.push({
      objectId: "",
      kind: c.tool === "draw" ? "ink" : "ink_erased",
      box: box ?? { x: 0, y: 0, w: 0, h: 0 },
    });
  }
  if (applied.length === 0) {
    for (const c of commands) applied.push(commandBox(c));
  }
  // Layout-review gate: arm it only when a widget's *final geometry is unknown*
  // to the agent — a freshly created widget renders its own content and self-fits.
  // Deletions are excluded: removing a widget only frees space, it can never
  // produce a surprise layout, and arming the gate there forced an extra
  // snapshot step (and a full extra request) for no information.
  const widgetMutated =
    commands.some((c) => c.tool === "html_widget" || c.tool === "diagram_source" || c.tool === "animate_scene") ||
    applied.some((a) => a.kind === "html" || a.kind === "diagram");
  return { ok: true, revision: deps.getRevision(), applied, rejected: rejectedRows, ...(widgetMutated ? { widgetMutated: true } : {}) };
}

/** Canonical edit op from whatever key the model used to name it. */
function canonicalEditOp(rec: Record<string, unknown>): string {
  const raw = String(rec.op ?? rec.kind ?? rec.type ?? rec.operation ?? rec.action ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "_");
  if (raw === "move_object" || raw === "move") return "move_object";
  if (raw === "resize_object" || raw === "resize" || raw === "resize_widget" || raw === "resize_image") return "resize_object";
  if (raw === "delete_object" || raw === "delete" || raw === "remove" || raw === "remove_object") return "delete_object";
  if (raw) return raw;
  // Unnamed op, inferred from payload: a bare {objectId, w, h} is a resize.
  if (rec.dx !== undefined || rec.dy !== undefined) return "move_object";
  if (rec.w !== undefined || rec.h !== undefined || rec.width !== undefined || rec.height !== undefined) return "resize_object";
  return "";
}

/** Live box of a widget or object, for the edit receipt. */
function itemBox(deps: ConductorToolDeps, id: string): Rect | undefined {
  const item = deps.widgets.get(id) ?? deps.objects.get(id);
  return item ? { x: item.x, y: item.y, w: item.w, h: item.h } : undefined;
}

async function execEdit(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const currentRevision = deps.getRevision();
  const conflict = revisionConflict(currentRevision, args, deps);
  if (conflict) return conflict;
  let opsArg = args.operations;
  if (typeof opsArg === "string") {
    try {
      opsArg = JSON.parse(opsArg) as unknown;
    } catch {
      return toolError("INVALID_ARGUMENT", "operations must be a JSON array of operation objects, not a string.");
    }
  }
  const ops = Array.isArray(opsArg) ? opsArg : [];
  if (ops.length === 0) return toolError("INVALID_ARGUMENT", "operations[] is required (move_object, resize_object, delete_object).");
  if (ops.length > 16) return toolError("INVALID_ARGUMENT", "At most 16 operations per canvas_edit.");

  const results: { op: string; objectId: string; ok: boolean; reason?: string; box?: Rect }[] = [];
  let touched = false;
  /**
   * Layout-review gate. Only a widget *resize* can end somewhere the agent did
   * not ask for: the iframe reflows its content and may self-fit past the given
   * box. Moves land exactly where told, and deletes only free space — arming the
   * gate for those cost a mandatory snapshot round trip per edit for nothing.
   */
  let widgetReflowed = false;
  deps.history.recordObjects();
  deps.history.recordWidgets();
  for (const raw of ops) {
    const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const op = canonicalEditOp(rec);
    const id = String(rec.objectId ?? rec.id ?? "");
    const widget = deps.widgets.get(id);
    const object = widget ? null : deps.objects.get(id);
    const item = widget || object;
    if (!item) {
      results.push({ op, objectId: id, ok: false, reason: "OBJECT_NOT_FOUND" });
      continue;
    }
    if (op === "move_object") {
      // dx/dy is the contract, but absolute x/y is the obvious other guess —
      // convert it rather than spending a round trip teaching the difference.
      let dx = Number(rec.dx);
      let dy = Number(rec.dy);
      if (!Number.isFinite(dx) && Number.isFinite(Number(rec.x))) dx = Number(rec.x) - item.x;
      if (!Number.isFinite(dy) && Number.isFinite(Number(rec.y))) dy = Number(rec.y) - item.y;
      if (!Number.isFinite(dx)) dx = 0;
      if (!Number.isFinite(dy)) dy = 0;
      if (dx === 0 && dy === 0) {
        results.push({ op, objectId: id, ok: false, reason: "move_object needs dx/dy offsets (or absolute x/y) that actually move the item" });
        continue;
      }
      if (widget) deps.widgets.move(id, dx, dy);
      else deps.objects.move(id, dx, dy);
      results.push({ op, objectId: id, ok: true, box: itemBox(deps, id) });
      touched = true;
    } else if (op === "resize_object") {
      // One axis is a legitimate request; keep the other as-is instead of
      // rejecting the whole operation.
      const w = Number(rec.w ?? rec.width ?? item.w);
      const h = Number(rec.h ?? rec.height ?? item.h);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        results.push({ op, objectId: id, ok: false, reason: "resize_object needs w and/or h as numbers > 0" });
        continue;
      }
      if (widget) {
        // Reflow, don't magnify. A bare resize() runs the "corner" path, which
        // scales the frame while the iframe keeps its old content box — so every
        // glyph grew with the widget and the requested height was overridden to
        // preserve aspect (3400x1150 became 3400x2267 at 3.5x type). Holding
        // w/contentW and h/contentH constant keeps the on-screen text size and
        // gives the content the extra room, which is what a resize means here.
        const scaleW = widget.contentW > 0 ? widget.contentW / Math.max(1, widget.w) : 1;
        const scaleH = widget.contentH > 0 ? widget.contentH / Math.max(1, widget.h) : 1;
        deps.widgets.resize(id, w, h, w * scaleW, h * scaleH, true, "corner");
      } else {
        deps.objects.resize(id, w, h);
      }
      if (widget) widgetReflowed = true;
      results.push({ op, objectId: id, ok: true, box: itemBox(deps, id) });
      touched = true;
    } else if (op === "delete_object") {
      if (widget) deps.widgets.remove(id);
      else deps.objects.remove(id);
      results.push({ op, objectId: id, ok: true });
      touched = true;
    } else {
      results.push({
        op,
        objectId: id,
        ok: false,
        reason: `Unsupported op ${op ? `"${op}"` : "(missing)"} — use exactly one of move_object (dx,dy), resize_object (w,h), delete_object, under the key "op"`,
      });
    }
  }
  if (touched) {
    deps.afterBoardChange();
  }
  const failed = results.filter((r) => !r.ok).length;
  return {
    ...(failed === results.length ? { ok: false, code: "ALL_OPERATIONS_REJECTED" } : { ok: true }),
    revision: deps.getRevision(),
    operations: results,
    ...(widgetReflowed ? { widgetMutated: true } : {}),
  };
}

async function execLoadPlugin(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const pluginId = String(args.pluginId || "").trim();
  if (!pluginId) return toolError("INVALID_ARGUMENT", "pluginId is required.");
  // Verify the id exists before promising a system-prompt injection.
  const res = await fetch(`/api/plugins?doc=${encodeURIComponent(pluginId)}`);
  if (res.status === 404) {
    return { ok: false, code: "PLUGIN_NOT_FOUND", message: `Plugin ${pluginId} was not found.` };
  }
  if (!res.ok) {
    return toolError("INTERNAL", "Failed to load plugin document.");
  }
  const registration = deps.registerPlugin?.(pluginId);
  if (registration === "limit") {
    return toolError(
      "LIMIT_EXCEEDED",
      "Too many plugin contracts loaded this session. Finish with the loaded ones or start a new conversation."
    );
  }
  return {
    ok: true,
    pluginId,
    alreadyLoaded: registration === "already",
    note:
      registration === "already"
        ? "Contract is already injected into the system prompt for this session. Proceed with its APIs."
        : "Full contract injected into the system prompt for the rest of this session (durable — survives context compaction). Continue with its APIs on the next step.",
  };
}

function numberedLines(content: string, startLine: number, endLine: number): { text: string; totalLines: number } {
  const lines = content.split(/\n/);
  const totalLines = lines.length;
  const start = Math.max(1, Math.floor(startLine));
  const end = Math.min(totalLines, Math.floor(endLine));
  const slice = lines.slice(start - 1, end).map((line, i) => `${String(start + i).padStart(3, " ")}| ${line}`);
  let text = slice.join("\n");
  if (text.length > READ_MAX_CHARS) {
    text = `${text.slice(0, READ_MAX_CHARS)}\n[truncated]`;
  }
  return { text, totalLines };
}

async function execRead(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const objectId = String(args.objectId || "");
  const widget = deps.widgets.get(objectId);
  const object = widget ? null : deps.objects.get(objectId);
  if (!widget && !object) return toolError("OBJECT_NOT_FOUND", `No object with id ${objectId}.`, { objectId });
  const resource = args.resource === "html" || args.resource === "source" ? args.resource : "text";
  let content = "";
  let kind = "object";
  if (widget) {
    kind = widget.kind;
    if (resource === "html") content = widget.html || "";
    else if (resource === "source") content = widget.copyText || widget.html || "";
    else content = widget.kind === "diagram" ? widget.copyText || widget.html || "" : widget.html || "";
  } else if (object) {
    kind = object.kind;
    content = object.source || "";
  }
  const startLine = Math.max(1, typeof args.startLine === "number" && Number.isFinite(args.startLine) ? Math.floor(args.startLine) : 1);
  const endLine =
    typeof args.endLine === "number" && Number.isFinite(args.endLine)
      ? Math.floor(args.endLine)
      : startLine + READ_DEFAULT_LINES - 1;
  const view = numberedLines(content, startLine, endLine);
  return {
    revision: deps.getRevision(),
    objectId,
    kind,
    totalLines: view.totalLines,
    startLine,
    endLine: Math.min(view.totalLines, endLine),
    content: view.text,
    contentHash: fnv1a(content),
  };
}

async function execPatch(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const currentRevision = deps.getRevision();
  const conflict = revisionConflict(currentRevision, args, deps);
  if (conflict) return conflict;
  const objectId = String(args.objectId || "");
  const widget = deps.widgets.get(objectId);
  if (!widget) return toolError("OBJECT_NOT_FOUND", `No widget with id ${objectId}.`, { objectId });
  const patch = String(args.patch || "");
  const pathGuess = /^(?:---|\+\+\+)\s+[ab]\/widget\.source/m.test(patch) ? "widget.source" : "widget.html";
  const current = pathGuess === "widget.source" ? widget.copyText || widget.html || "" : widget.html || "";
  const expectedHash = typeof args.expectedContentHash === "string" ? args.expectedContentHash : "";
  if (expectedHash && expectedHash !== fnv1a(current)) {
    return toolError(
      "CONTENT_CHANGED",
      `Widget changed after it was read (expectedContentHash mismatch). canvas_read objectId "${objectId}" again, then rebuild the patch against the fresh contentHash.`,
      { objectId }
    );
  }
  const result = applyWidgetPatch(current, patch);
  if (!result.ok) return result;
  if (result.content.length > MAX_WIDGET_HTML_LENGTH) {
    return toolError("LIMIT_EXCEEDED", `Patched content exceeds ${MAX_WIDGET_HTML_LENGTH} characters.`);
  }

  const next = { ...widget };
  const fingerprintBefore = deps.getFingerprint();
  if (result.path === "widget.source") {
    next.copyText = result.content;
    if (next.kind === "diagram" && next.sourceFormat) {
      try {
        const doc = await diagramDocument(next.sourceFormat, result.content, next.diagramKind, next.title);
        next.html = typeof doc === "string" ? doc : doc.html;
      } catch (err) {
        return toolError("INTERNAL", err instanceof Error ? err.message : "Failed to rebuild diagram.");
      }
    } else {
      next.html = result.content;
    }
  } else {
    next.html = result.content;
  }
  if (next.html.length > MAX_WIDGET_HTML_LENGTH) {
    return toolError("LIMIT_EXCEEDED", `Patched HTML exceeds ${MAX_WIDGET_HTML_LENGTH} characters.`);
  }
  // Second check after the async rebuild gap: the board content must not have
  // moved between validation and commit. Compared by fingerprint, not revision,
  // so a content-neutral bump during the rebuild does not discard the work.
  if (deps.getFingerprint() !== fingerprintBefore) {
    return toolError(
      "REVISION_CONFLICT",
      `Canvas changed while the patch was being prepared (expected revision ${currentRevision}, now ${deps.getRevision()}). Re-scan and retry with the fresh revision.`,
      { currentRevision: deps.getRevision() }
    );
  }

  deps.history.recordWidgets();
  deps.widgets.add(next);
  deps.afterBoardChange();
  return {
    ok: true,
    revision: deps.getRevision(),
    linesChanged: result.linesChanged,
    newLineCount: result.newLineCount,
    widgetMutated: true,
  };
}

async function execUndo(_args: Record<string, unknown>, deps: ConductorToolDeps) {
  if (!deps.history.canUndo) return { ok: false, code: "NOTHING_TO_UNDO" };
  const ok = await deps.history.undo();
  if (!ok) return { ok: false, code: "NOTHING_TO_UNDO" };
  deps.afterBoardChange();
  return { ok: true, revision: deps.getRevision() };
}

function focusRect(camera: Camera, rect: Rect): void {
  const vp = camera.viewportRect;
  if (vp.w <= 0 || vp.h <= 0) return;
  const pad = 64;
  const scaleX = (vp.w - pad * 2) / Math.max(1, rect.w);
  const scaleY = (vp.h - pad * 2) / Math.max(1, rect.h);
  const desired = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));
  const centerCss = { x: vp.w / 2, y: vp.h / 2 };
  camera.pinchZoom(centerCss, centerCss, camera.scale, desired, camera.scale, camera.panX, camera.panY);
  const screen = camera.worldToScreen(rect.x + rect.w / 2, rect.y + rect.h / 2);
  camera.panBy(centerCss.x - screen.x, centerCss.y - screen.y);
}

async function execFocus(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const target = String(args.target || "canvas");
  let rect: Rect;
  if (target === "canvas") {
    rect = contentBounds(deps.engine, deps.widgets, deps.objects) ?? deps.engine.camera.visibleWorldRect();
  } else if (target === "object") {
    const id = String(args.objectId || "");
    const item = deps.widgets.get(id) || deps.objects.get(id);
    if (!item) return toolError("OBJECT_NOT_FOUND", `No object with id ${id}.`, { objectId: id });
    rect = { x: item.x, y: item.y, w: item.w, h: item.h };
  } else if (target === "region") {
    const r = args.region as Rect | undefined;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) {
      return toolError("INVALID_ARGUMENT", "region {x,y,w,h} is required when target=region.");
    }
    rect = clipRect(r);
  } else {
    return toolError("INVALID_ARGUMENT", "target must be canvas, object, or region.");
  }
  focusRect(deps.camera, rect);
  deps.engine.requestRender();
  return { ok: true, viewport: deps.camera.visibleWorldRect() };
}

function gridStep(span: number): number {
  const rough = Math.max(1, span / 6);
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}

function drawCoordinateGrid(canvas: HTMLCanvasElement, region: Rect): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || region.w <= 0 || region.h <= 0) return;
  const width = canvas.width;
  const height = canvas.height;
  const scaleX = width / region.w;
  const scaleY = height / region.h;
  const step = gridStep(Math.max(region.w, region.h));
  const fontSize = Math.max(10, Math.min(16, Math.round(Math.min(width, height) / 38)));
  ctx.save();
  ctx.strokeStyle = "rgba(37,99,235,.38)";
  ctx.fillStyle = "rgba(30,64,175,.92)";
  ctx.lineWidth = 1;
  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "top";
  for (let x = Math.ceil(region.x / step) * step; x <= region.x + region.w; x += step) {
    const px = (x - region.x) * scaleX;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    ctx.fillText(`x ${Math.round(x)}`, Math.min(width - fontSize * 6, px + 3), 3);
  }
  for (let y = Math.ceil(region.y / step) * step; y <= region.y + region.h; y += step) {
    const py = (y - region.y) * scaleY;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
    ctx.fillText(`y ${Math.round(y)}`, 3, Math.min(height - fontSize - 2, py + 3));
  }
  ctx.restore();
}

async function execWebTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const res = await fetch("/api/canvas/web", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
    const payload = await res.json().catch(() => null);
    if (payload && typeof payload === "object") return payload;
    return toolError("WEB_TOOL_FAILED", `${name} returned an unreadable response (HTTP ${res.status}).`);
  } catch (err) {
    return toolError("WEB_TOOL_FAILED", `${name} could not reach the server: ${(err as Error).message}`);
  }
}

export async function executeTool(
  name: string,
  args: unknown,
  deps: ConductorToolDeps
): Promise<unknown> {
  const rec = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  switch (name) {
    case "canvas_scan":
      return execScan(rec, deps);
    case "canvas_snapshot":
      return execSnapshot(rec, deps);
    case "canvas_apply":
      return execApply(rec, deps);
    case "canvas_edit":
      return execEdit(rec, deps);
    case "load_plugin":
      return execLoadPlugin(rec, deps);
    case "canvas_read":
      return execRead(rec, deps);
    case "canvas_patch_widget":
      return execPatch(rec, deps);
    case "canvas_undo":
      return execUndo(rec, deps);
    case "canvas_focus":
      return execFocus(rec, deps);
    default:
      if (isWebToolName(name)) return execWebTool(name, rec);
      return toolError("INVALID_ARGUMENT", `Unknown tool: ${name}.`);
  }
}

export { fnv1a };
