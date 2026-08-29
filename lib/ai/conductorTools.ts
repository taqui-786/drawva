import type { CanvasEngine } from "@/lib/canvas/engine";
import type { WidgetManager } from "@/lib/canvas/widgets";
import type { ObjectManager } from "@/lib/canvas/objects";
import type { BoardHistory } from "@/lib/canvas/history";
import type { DraftManager } from "@/lib/canvas/draftStore";
import type { Camera } from "@/lib/canvas/camera";
import type { Rect } from "@/lib/canvas/types";
import type { CanvasCommand, CommandValidationContext } from "@/lib/canvas/commands";
import { MAX_WIDGET_HTML_LENGTH, validateCommands } from "@/lib/canvas/commands";
import { buildScene, visibleScene } from "@/lib/canvas/scene";
import { buildAtlas } from "@/lib/canvas/atlas";
import { MAX_SCALE, MIN_SCALE, SIZE } from "@/lib/canvas/constants";
import { widgetGeometryForViewport } from "@/lib/ai/geometry";
import { applyWidgetPatch } from "@/lib/canvas/widgetPatch";
import { diagramDocument } from "@/lib/canvas/diagram";
import {
  READ_DEFAULT_LINES,
  READ_MAX_CHARS,
  SNAPSHOT_BASIC_MAX_EDGE,
  SNAPSHOT_DETAIL_MAX_EDGE,
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
  afterBoardChange: () => void;
  enabledPluginIds: () => string[];
  registerImage: (img: ActiveImage) => void;
  getInkBox?: () => Rect | null;
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

function encodeCanvas(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/webp", 0.92);
  } catch {
    return canvas.toDataURL("image/png");
  }
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

async function execScan(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const scope = args.scope === "viewport" ? "viewport" : "all";
  const viewport = deps.engine.camera.visibleWorldRect();
  const scene = scope === "viewport" ? visibleScene(deps.widgets, deps.objects, viewport) : buildScene(deps.widgets, deps.objects);
  return {
    revision: deps.getRevision(),
    canvasSize: SIZE,
    viewport,
    counts: { widgets: deps.widgets.all().length, objects: deps.objects.all().length },
    items: scene.items,
  };
}

async function execSnapshot(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const target = String(args.target || "viewport");
  const quality = args.quality === "detail" ? "detail" : "basic";
  if (quality === "detail" && target !== "region" && target !== "object") {
    return toolError("DETAIL_TARGET_REQUIRED", "Detail snapshots are limited to region or object targets.");
  }

  let source: Rect;
  if (target === "viewport") {
    source = deps.engine.camera.visibleWorldRect();
  } else if (target === "canvas") {
    source = { x: 0, y: 0, w: SIZE, h: SIZE };
  } else if (target === "region") {
    const r = args.region as Rect | undefined;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) {
      return toolError("INVALID_ARGUMENT", "region {x,y,w,h} is required when target=region.");
    }
    source = clipRect(r);
  } else if (target === "object") {
    const id = String(args.objectId || "");
    const item = deps.widgets.get(id) || deps.objects.get(id);
    if (!item) return toolError("OBJECT_NOT_FOUND", `No object with id ${id}.`, { objectId: id });
    source = clipRect({ x: item.x, y: item.y, w: item.w, h: item.h });
  } else {
    return toolError("INVALID_ARGUMENT", "target must be viewport, canvas, region, or object.");
  }

  const atlas = await buildAtlas(deps.engine, source, null, deps.widgets, deps.objects, {
    captureFullViewport: true,
  });
  const maxEdge = quality === "detail" ? SNAPSHOT_DETAIL_MAX_EDGE : SNAPSHOT_BASIC_MAX_EDGE;
  const raw = await canvasFromDataUrl(atlas.atlasImage);
  const framed = downscaleToMaxEdge(raw, maxEdge);
  if (args.grid !== false) {
    drawCoordinateGrid(framed, atlas.sourceRect);
  }
  const imageScale = framed.width / Math.max(1, atlas.sourceRect.w);
  const dataUrl = encodeCanvas(framed);
  const imageId = `img-${fnv1a(dataUrl)}`;
  deps.registerImage({
    id: imageId,
    dataUrl,
    note: `snapshot of {x:${atlas.sourceRect.x},y:${atlas.sourceRect.y},w:${atlas.sourceRect.w},h:${atlas.sourceRect.h}} at revision ${deps.getRevision()}`,
  });
  return {
    revision: deps.getRevision(),
    sourceRect: atlas.sourceRect,
    imageSize: { w: framed.width, h: framed.height },
    imageScale,
    imageId,
  };
}

function applyContext(deps: ConductorToolDeps): CommandValidationContext {
  const visibleRect = deps.engine.camera.visibleWorldRect();
  const ink = deps.getInkBox?.();
  const changedBox = ink && ink.w > 4 && ink.h > 4 ? ink : visibleRect;
  const scene = buildScene(deps.widgets, deps.objects);
  const plugins = new Set(deps.enabledPluginIds());
  plugins.add("general");
  return {
    aiColor: "#2679b8",
    scale: Math.max(0.03, deps.engine.camera.scale || 1),
    widgetSlots: 8,
    plugins,
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
  const w = Number(rec.w) || Number((cmd as { maxWidth?: number }).maxWidth) || 0;
  const h = Number(rec.h) || 0;
  return {
    objectId: typeof rec.targetId === "string" ? rec.targetId : cmd.tool,
    kind: cmd.tool,
    box: { x, y, w, h },
  };
}

async function execApply(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const currentRevision = deps.getRevision();
  const raw = Array.isArray(args.commands) ? args.commands : [];
  const ctx = applyContext(deps);
  const { commands, rejected } = validateCommands(raw, ctx);
  const rejectedRows = rejected.map((reason) => ({ reason }));
  if (commands.length === 0) {
    return { ok: false, code: "ALL_COMMANDS_REJECTED", revision: currentRevision, applied: [], rejected: rejectedRows };
  }

  const beforeW = new Set(deps.widgets.all().map((w) => w.id));
  const beforeO = new Set(deps.objects.all().map((o) => o.id));
  deps.history.recordObjects();
  deps.history.recordWidgets();
  deps.draft.setPending(commands);
  await deps.draft.accept(deps.engine);
  deps.afterBoardChange();

  const applied: { objectId: string; kind: string; box: Rect }[] = [];
  for (const w of deps.widgets.all()) {
    if (!beforeW.has(w.id)) applied.push({ objectId: w.id, kind: w.kind, box: { x: w.x, y: w.y, w: w.w, h: w.h } });
  }
  for (const o of deps.objects.all()) {
    if (!beforeO.has(o.id)) applied.push({ objectId: o.id, kind: o.kind, box: { x: o.x, y: o.y, w: o.w, h: o.h } });
  }
  if (applied.length === 0) {
    for (const c of commands) applied.push(commandBox(c));
  }
  return { ok: true, revision: deps.getRevision(), applied, rejected: rejectedRows };
}

async function execLoadPlugin(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const pluginId = String(args.pluginId || "").trim();
  if (!pluginId) return toolError("INVALID_ARGUMENT", "pluginId is required.");
  const enabled = new Set(deps.enabledPluginIds());
  if (!enabled.has(pluginId)) {
    return { ok: false, code: "PLUGIN_NOT_ENABLED", message: `Plugin ${pluginId} is not enabled.` };
  }
  const res = await fetch(`/api/plugins?doc=${encodeURIComponent(pluginId)}`);
  if (res.status === 404) {
    return { ok: false, code: "PLUGIN_NOT_FOUND", message: `Plugin ${pluginId} was not found.` };
  }
  if (!res.ok) {
    return toolError("INTERNAL", "Failed to load plugin document.");
  }
  const data = (await res.json()) as { plugin?: { id: string; document: string } };
  if (!data.plugin?.document) {
    return { ok: false, code: "PLUGIN_NOT_FOUND", message: `Plugin ${pluginId} was not found.` };
  }
  return { ok: true, pluginId: data.plugin.id, document: data.plugin.document };
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
  };
}

async function execPatch(args: Record<string, unknown>, deps: ConductorToolDeps) {
  const objectId = String(args.objectId || "");
  const widget = deps.widgets.get(objectId);
  if (!widget) return toolError("OBJECT_NOT_FOUND", `No widget with id ${objectId}.`, { objectId });
  const patch = String(args.patch || "");
  const pathGuess = /^(?:---|\+\+\+)\s+[ab]\/widget\.source/m.test(patch) ? "widget.source" : "widget.html";
  const current = pathGuess === "widget.source" ? widget.copyText || widget.html || "" : widget.html || "";
  const result = applyWidgetPatch(current, patch);
  if (!result.ok) return result;
  if (result.content.length > MAX_WIDGET_HTML_LENGTH) {
    return toolError("LIMIT_EXCEEDED", `Patched content exceeds ${MAX_WIDGET_HTML_LENGTH} characters.`);
  }

  const next = { ...widget };
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

  deps.history.recordWidgets();
  deps.widgets.add(next);
  deps.afterBoardChange();
  return {
    ok: true,
    revision: deps.getRevision(),
    linesChanged: result.linesChanged,
    newLineCount: result.newLineCount,
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
    rect = { x: 0, y: 0, w: SIZE, h: SIZE };
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
      return toolError("INVALID_ARGUMENT", `Unknown tool: ${name}.`);
  }
}

export { fnv1a };
