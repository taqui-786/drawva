import { CanvasEngine } from "./engine";
import { SIZE, TILE } from "./constants";
import type { Rect } from "./types";
import { WidgetManager, type WidgetItem } from "./widgets";
import { ObjectManager, type ObjectItem } from "./objects";

const MAX_ATLAS_WIDTH = 2048;
const MAX_ATLAS_HEIGHT = 1536;

export interface FocusInsetMeta {
  sourceRect: Rect;
  imageRect: Rect;
  imageScale: number;
  purpose: string;
}

export interface LatestInputMeta {
  globalRect: Rect;
  imageRect: Rect;
}

export interface AtlasResult {
  atlasImage: string;
  imageSize: { w: number; h: number };
  visibleRect: Rect;
  captureRect: Rect;
  sourceRect: Rect;
  changedBox: Rect;
  imageScale: number;
  focusInset: FocusInsetMeta | null;
  latestInput: LatestInputMeta | null;
}

/** Fit a bitmap into a widget box without stretching it into an oval. */
export function fittedImageRect(
  imageW: number,
  imageH: number,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  if (imageW < 2 || imageH < 2 || box.w < 2 || box.h < 2) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const imageAspect = imageW / imageH;
  const boxAspect = box.w / box.h;
  if (Math.abs(imageAspect - boxAspect) <= 0.12) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const scale = Math.min(box.w / imageW, box.h / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function bitmapSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  if (img instanceof HTMLCanvasElement) return { w: img.width, h: img.height };
  const anyImg = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  return {
    w: Number(anyImg.naturalWidth || anyImg.width) || 0,
    h: Number(anyImg.naturalHeight || anyImg.height) || 0,
  };
}

function drawWidgetBitmap(
  q: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const size = bitmapSize(img);
  const dest = fittedImageRect(size.w, size.h, { x, y, w, h });
  q.drawImage(img, dest.x, dest.y, dest.w, dest.h);
}

export async function renderWidgetToContext(
  widget: WidgetItem,
  q: CanvasRenderingContext2D
): Promise<void> {
  if (!widget || typeof document === "undefined") return;
  const w = Math.max(1, Math.round(widget.w || widget.contentW || 400));
  const h = Math.max(1, Math.round(widget.h || widget.contentH || 300));
  const wx = widget.x;
  const wy = widget.y;

  if (widget.cachedImage) {
    try {
      drawWidgetBitmap(q, widget.cachedImage, wx, wy, w, h);
      return;
    } catch {}
  }

  if (!widget.html) return;

  try {
    await renderHtmlToContext(widget, q);
  } catch (err) {
    console.warn("[renderWidgetToContext] HTML render error:", err);
  }
}

async function renderHtmlToContext(
  widget: WidgetItem,
  q: CanvasRenderingContext2D
): Promise<void> {
  if (typeof document === "undefined" || !widget.html) return;

  const contentW = Math.max(1, Math.round(widget.contentW || widget.w || 400));
  const contentH = Math.max(1, Math.round(widget.contentH || widget.h || 300));
  const sx = (widget.w || contentW) / contentW;
  const sy = (widget.h || contentH) / contentH;

  const frame = document.createElement("iframe");
  frame.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${contentW}px;
    height: ${contentH}px;
    opacity: 0;
    pointer-events: none;
    border: 0;
    z-index: -99999;
    background: transparent;
  `;
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{background:transparent!important;overflow:visible!important;margin:0!important;padding:4px;box-sizing:border-box}::-webkit-scrollbar{display:none!important}</style></head><body>${widget.html}</body></html>`
    );
    doc.close();
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    wrapTextNodes(doc.body);

    const rootRect = doc.body.getBoundingClientRect();
    q.save();
    q.translate(widget.x, widget.y);
    q.scale(sx, sy);
    q.beginPath();
    q.rect(0, 0, contentW, contentH);
    q.clip();

    const elements = doc.body.querySelectorAll<HTMLElement>("*");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const elX = rect.left - rootRect.left;
      const elY = rect.top - rootRect.top;
      const elW = rect.width;
      const elH = rect.height;

      const style = frame.contentWindow?.getComputedStyle(el) || window.getComputedStyle(el);
      if (style.display === "none") continue;

      const bg = style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        q.fillStyle = bg;
        const radius = parseFloat(style.borderRadius) || 0;
        if (radius > 0) {
          q.beginPath();
          q.roundRect(elX, elY, elW, elH, radius);
          q.fill();
        } else {
          q.fillRect(elX, elY, elW, elH);
        }
      }

      const btW = parseFloat(style.borderTopWidth) || 0;
      const bbW = parseFloat(style.borderBottomWidth) || 0;
      const blW = parseFloat(style.borderLeftWidth) || 0;
      const brW = parseFloat(style.borderRightWidth) || 0;

      if (bbW > 0 && style.borderBottomStyle !== "none") {
        q.strokeStyle = style.borderBottomColor || "#000";
        q.lineWidth = bbW;
        q.beginPath();
        q.moveTo(elX, elY + elH - bbW / 2);
        q.lineTo(elX + elW, elY + elH - bbW / 2);
        q.stroke();
      }
      if (btW > 0 && style.borderTopStyle !== "none") {
        q.strokeStyle = style.borderTopColor || "#000";
        q.lineWidth = btW;
        q.beginPath();
        q.moveTo(elX, elY + btW / 2);
        q.lineTo(elX + elW, elY + btW / 2);
        q.stroke();
      }
      if (blW > 0 && style.borderLeftStyle !== "none") {
        q.strokeStyle = style.borderLeftColor || "#000";
        q.lineWidth = blW;
        q.beginPath();
        q.moveTo(elX + blW / 2, elY);
        q.lineTo(elX + blW / 2, elY + elH);
        q.stroke();
      }
      if (brW > 0 && style.borderRightStyle !== "none") {
        q.strokeStyle = style.borderRightColor || "#000";
        q.lineWidth = brW;
        q.beginPath();
        q.moveTo(elX + elW - brW / 2, elY);
        q.lineTo(elX + elW - brW / 2, elY + elH);
        q.stroke();
      }

      if (el.tagName === "LI") {
        q.fillStyle = style.color || "#000";
        q.beginPath();
        const bulletRadius = 2.5;
        const bulletX = elX - 8;
        const bulletY = elY + elH / 2;
        q.arc(bulletX, bulletY, bulletRadius, 0, Math.PI * 2);
        q.fill();
      }

      if (el.dataset.drawvaWord === "true") {
        const text = el.textContent || "";
        if (text) {
          const weight = style.fontWeight || "400";
          const size = style.fontSize || "14px";
          const family = style.fontFamily || "system-ui, sans-serif";
          q.font = `${weight} ${size} ${family}`;
          q.fillStyle = style.color || "#000";
          q.textBaseline = "middle";
          q.fillText(text, elX, elY + elH / 2);
        }
      }
    }

    const svgs = doc.body.querySelectorAll<SVGSVGElement>("svg");
    for (let j = 0; j < svgs.length; j++) {
      const svgEl = svgs[j];
      const sRect = svgEl.getBoundingClientRect();
      if (sRect.width <= 0 || sRect.height <= 0) continue;
      const sX = sRect.left - rootRect.left;
      const sY = sRect.top - rootRect.top;
      const sW = sRect.width;
      const sH = sRect.height;
      try {
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const foreignObjects = Array.from(clone.querySelectorAll("foreignObject"));
        for (const fo of foreignObjects) fo.remove();
        const sSource = new XMLSerializer().serializeToString(clone);
        const sBlob = new Blob([sSource], { type: "image/svg+xml;charset=utf-8" });
        const sUrl = URL.createObjectURL(sBlob);
        const sImg = new Image();
        sImg.src = sUrl;
        await sImg.decode();
        URL.revokeObjectURL(sUrl);
        q.drawImage(sImg, sX, sY, sW, sH);
      } catch {}
    }

    q.restore();
  } finally {
    frame.remove();
  }
}

function wrapTextNodes(parent: Node): void {
  const textNodes: Text[] = [];
  const walk = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  let n: Text | null;
  while ((n = walk.nextNode() as Text | null)) {
    if (n.parentElement?.tagName === "SCRIPT" || n.parentElement?.tagName === "STYLE") continue;
    if (n.textContent?.trim()) textNodes.push(n);
  }

  for (const node of textNodes) {
    const text = node.textContent || "";
    const parentEl = node.parentElement;
    if (!parentEl) continue;

    const frag = document.createDocumentFragment();
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement("span");
        span.dataset.drawvaWord = "true";
        span.style.display = "inline";
        span.textContent = part;
        frag.appendChild(span);
      }
    }
    parentEl.replaceChild(frag, node);
  }
}

async function drawWidgets(
  wm: WidgetManager | WidgetItem[] | null | undefined,
  q: CanvasRenderingContext2D,
  rect: Rect,
  refreshedIds?: Set<string>
): Promise<void> {
  if (!wm) return;
  const manager = Array.isArray(wm) ? null : wm;
  const items = Array.isArray(wm) ? wm : wm.all();
  const visible = items.filter(
    (w) =>
      !(
        w.x + w.w < rect.x ||
        w.x > rect.x + rect.w ||
        w.y + w.h < rect.y ||
        w.y > rect.y + rect.h
      )
  );
  if (manager && refreshedIds) {
    const pending: Promise<unknown>[] = [];
    for (const w of visible) {
      if (refreshedIds.has(w.id)) continue;
      refreshedIds.add(w.id);
      pending.push(manager.refreshSnapshot(w.id, 1100));
    }
    if (pending.length) await Promise.all(pending);
  }
  for (const w of visible) {
    await renderWidgetToContext(w, q);
  }
}

function drawObjects(
  om: ObjectManager | ObjectItem[] | null | undefined,
  q: CanvasRenderingContext2D,
  rect: Rect
): void {
  if (!om) return;
  const items = Array.isArray(om) ? om : om.all();
  for (const o of items) {
    if (
      o.x + o.w < rect.x ||
      o.x > rect.x + rect.w ||
      o.y + o.h < rect.y ||
      o.y > rect.y + rect.h
    ) {
      continue;
    }
    if (o.image) {
      q.drawImage(o.image, o.x, o.y, o.w, o.h);
    }
  }
}

export async function buildAtlas(
  engine: CanvasEngine,
  viewport: Rect,
  changedBox: Rect | null,
  widgets?: WidgetManager | WidgetItem[] | null,
  objects?: ObjectManager | ObjectItem[] | null,
  opts: { captureFullViewport?: boolean } = {}
): Promise<AtlasResult> {
  const visibleRect = clip(viewport);
  const captureRect = visibleRect;
  const latest = changedBox && (changedBox.w > 0 || changedBox.h > 0) ? clip(changedBox) : null;
  const latestInCapture = latest ? intersect(latest, captureRect) : emptyRect();
  const content = unionRects([
    visibleInkBounds(engine, captureRect),
    layerBounds(widgets, captureRect),
    layerBounds(objects, captureRect),
    latestInCapture.w > 0 && latestInCapture.h > 0 ? latestInCapture : null,
  ]);
  const useFullViewport =
    opts.captureFullViewport ||
    Boolean(latest && (latestInCapture.w <= 0 || latestInCapture.h <= 0)) ||
    !content;

  const camScale = Math.max(0.03, engine.camera.scale || 1);
  const margin = Math.max(120, Math.min(640, 160 / camScale));
  let sourceRect = captureRect;
  if (!useFullViewport && content) {
    const left = Math.max(captureRect.x, content.x - margin);
    const top = Math.max(captureRect.y, content.y - margin);
    const right = Math.min(captureRect.x + captureRect.w, content.x + content.w + margin);
    const bottom = Math.min(captureRect.y + captureRect.h, content.y + content.h + margin);
    const cropped = clip({ x: left, y: top, w: right - left, h: bottom - top });
    if (cropped.w > 0 && cropped.h > 0) sourceRect = cropped;
  }

  const imageScale =
    Math.min(1, MAX_ATLAS_WIDTH / Math.max(1, sourceRect.w), MAX_ATLAS_HEIGHT / Math.max(1, sourceRect.h)) *
    (1 - Number.EPSILON * 4);
  const imageSize = {
    w: Math.max(1, Math.min(MAX_ATLAS_WIDTH, Math.ceil(sourceRect.w * imageScale))),
    h: Math.max(1, Math.min(MAX_ATLAS_HEIGHT, Math.ceil(sourceRect.h * imageScale))),
  };
  const out = document.createElement("canvas");
  out.width = imageSize.w;
  out.height = imageSize.h;
  const q = out.getContext("2d")!;

  const latestVisible = latestInCapture.w > 0 && latestInCapture.h > 0
    ? clip(intersect(latestInCapture, sourceRect))
    : { ...sourceRect };

  q.fillStyle = "#fff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(imageScale, 0, 0, imageScale, -sourceRect.x * imageScale, -sourceRect.y * imageScale);

  const refreshedIds = new Set<string>();
  drawTiles(engine, q, sourceRect);
  await drawWidgets(widgets, q, sourceRect, refreshedIds);
  drawObjects(objects, q, sourceRect);

  q.setTransform(1, 0, 0, 1, 0, 0);

  let data = "";
  try {
    data = out.toDataURL("image/webp", 0.92);
  } catch (err) {
    console.warn("[buildAtlas] toDataURL fallback:", err);
    data = out.toDataURL("image/png");
  }

  return {
    atlasImage: data,
    imageSize,
    visibleRect,
    captureRect,
    sourceRect,
    changedBox: latestVisible,
    imageScale,
    focusInset: null,
    latestInput: latestInputMetadata(latestVisible, sourceRect, imageScale, imageSize),
  };
}

export function latestInputMetadata(
  changedBox: Rect,
  sourceRect: Rect,
  imageScale: number,
  imageSize: { w: number; h: number }
): LatestInputMeta | null {
  if (changedBox.w <= 0 || changedBox.h <= 0 || sourceRect.w <= 0 || sourceRect.h <= 0) return null;
  const left = Math.max(changedBox.x, sourceRect.x);
  const top = Math.max(changedBox.y, sourceRect.y);
  const right = Math.min(changedBox.x + changedBox.w, sourceRect.x + sourceRect.w);
  const bottom = Math.min(changedBox.y + changedBox.h, sourceRect.y + sourceRect.h);
  if (right <= left || bottom <= top) return null;
  const x = Math.round((left - sourceRect.x) * imageScale);
  const y = Math.round((top - sourceRect.y) * imageScale);
  const imageRight = Math.min(imageSize.w, Math.round((right - sourceRect.x) * imageScale));
  const imageBottom = Math.min(imageSize.h, Math.round((bottom - sourceRect.y) * imageScale));
  return {
    globalRect: clip(changedBox),
    imageRect: { x, y, w: Math.max(1, imageRight - x), h: Math.max(1, imageBottom - y) },
  };
}


function visibleInkBounds(engine: CanvasEngine, visible: Rect): Rect | null {
  let bounds: Rect | null = null;
  for (const key of engine.tiles.keys()) {
    const [tx, ty] = key.split(",").map(Number);
    const tileBox = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    const part = intersect(tileBox, visible);
    if (part.w <= 0 || part.h <= 0) continue;
    const canvas = engine.tiles.get(tx, ty);
    if (!canvas) continue;
    const ink = tileInkBox(canvas);
    if (!ink) continue;
    const found = intersect({ x: tileBox.x + ink.x, y: tileBox.y + ink.y, w: ink.w, h: ink.h }, visible);
    if (found.w <= 0 || found.h <= 0) continue;
    bounds = bounds ? union(bounds, found) : found;
  }
  return bounds;
}

function tileInkBox(c: HTMLCanvasElement): Rect | null {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
  const d = data.data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3] && !(d[i] > 248 && d[i + 1] > 248 && d[i + 2] > 248)) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function layerBounds(
  layer: WidgetManager | WidgetItem[] | ObjectManager | ObjectItem[] | null | undefined,
  visible: Rect
): Rect | null {
  if (!layer) return null;
  const items = Array.isArray(layer) ? layer : layer.all();
  let bounds: Rect | null = null;
  for (const item of items) {
    const hit = intersect({ x: item.x, y: item.y, w: item.w, h: item.h }, visible);
    if (hit.w <= 0 || hit.h <= 0) continue;
    bounds = bounds ? union(bounds, hit) : hit;
  }
  return bounds;
}

function drawTiles(engine: CanvasEngine, q: CanvasRenderingContext2D, rect: Rect): void {
  const maxIdx = Math.ceil(SIZE / TILE) - 1;
  const x0 = Math.max(0, Math.floor(rect.x / TILE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE));
  const x1 = Math.min(maxIdx, Math.floor((rect.x + rect.w) / TILE));
  const y1 = Math.min(maxIdx, Math.floor((rect.y + rect.h) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = engine.tiles.get(tx, ty);
      if (c) q.drawImage(c, tx * TILE, ty * TILE);
    }
  }
}

function emptyRect(): Rect {
  return { x: 0, y: 0, w: 0, h: 0 };
}

function clip(r: Rect): Rect {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.max(0, Math.round(r.w)),
    h: Math.max(0, Math.round(r.h)),
  };
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function unionRects(rects: Array<Rect | null | undefined>): Rect | null {
  let bounds: Rect | null = null;
  for (const r of rects) {
    if (!r || r.w <= 0 || r.h <= 0) continue;
    bounds = bounds ? union(bounds, r) : r;
  }
  return bounds;
}
