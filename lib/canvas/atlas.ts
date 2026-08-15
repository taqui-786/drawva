import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import type { Rect } from "./types";
import { WidgetManager, type WidgetItem } from "./widgets";
import { ObjectManager, type ObjectItem } from "./objects";

const MAX_ATLAS_WIDTH = 2048;
const MAX_ATLAS_HEIGHT = 1536;

export interface AtlasResult {
  atlasImage: string;
  imageSize: { w: number; h: number };
  visibleRect: Rect;
  sourceRect: Rect;
  changedBox: Rect;
  imageScale: number;
}

export async function renderWidgetToContext(
  widget: WidgetItem,
  q: CanvasRenderingContext2D
): Promise<void> {
  if (!widget || !widget.html || typeof document === "undefined") return;
  const w = Math.max(1, Math.round(widget.w || widget.contentW || 400));
  const h = Math.max(1, Math.round(widget.h || widget.contentH || 300));
  const wx = widget.x;
  const wy = widget.y;

  if (widget.cachedImage) {
    try {
      q.drawImage(widget.cachedImage, wx, wy, w, h);
      return;
    } catch {}
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(widget.html, "text/html");
  const svgEl = doc.querySelector("svg");

  if (svgEl) {
    try {
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

      const styles = Array.from(doc.querySelectorAll("style"))
        .map((s) => s.textContent || "")
        .join("\n");
      if (styles.trim()) {
        const defs = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
        const styleTag = doc.createElementNS("http://www.w3.org/2000/svg", "style");
        styleTag.textContent = styles;
        defs.appendChild(styleTag);
        clone.insertBefore(defs, clone.firstChild);
      }

      const foreignObjects = Array.from(clone.querySelectorAll("foreignObject"));
      for (const fo of foreignObjects) {
        const foW = parseFloat(fo.getAttribute("width") || "0");
        const foH = parseFloat(fo.getAttribute("height") || "0");
        const cx = foW > 0 ? foW / 2 : 0;
        const cy = foH > 0 ? foH / 2 : 0;
        const text = (fo.textContent || "").replace(/\s+/g, " ").trim();

        const textEl = doc.createElementNS("http://www.w3.org/2000/svg", "text");
        textEl.setAttribute("x", String(cx));
        textEl.setAttribute("y", String(cy));
        textEl.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
        textEl.setAttribute("font-size", "14");
        textEl.setAttribute("font-weight", "500");
        textEl.setAttribute("fill", "#1e293b");
        textEl.setAttribute("text-anchor", "middle");
        textEl.setAttribute("dominant-baseline", "central");
        textEl.textContent = text;

        fo.parentElement?.replaceChild(textEl, fo);
      }

      const vb = clone.viewBox?.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) {
        clone.setAttribute("width", String(vb.width));
        clone.setAttribute("height", String(vb.height));
      } else {
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
      }

      const svgSource = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);
      q.drawImage(img, wx, wy, w, h);
      return;
    } catch (err) {
      console.warn("[renderWidgetToContext] SVG draw failed, falling back to DOM walker:", err);
    }
  }

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
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{background:transparent!important;overflow:hidden!important;margin:0!important;padding:4px;box-sizing:border-box}::-webkit-scrollbar{display:none!important}</style></head><body>${widget.html}</body></html>`
    );
    doc.close();

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
  rect: Rect
): Promise<void> {
  if (!wm) return;
  const items = Array.isArray(wm) ? wm : wm.all();
  for (const w of items) {
    if (
      w.x + w.w < rect.x ||
      w.x > rect.x + rect.w ||
      w.y + w.h < rect.y ||
      w.y > rect.y + rect.h
    ) {
      continue;
    }
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
  includeWidgetTiles = false
): Promise<AtlasResult> {
  const sourceRect = clip(viewport);
  const scale = Math.min(
    1,
    MAX_ATLAS_WIDTH / sourceRect.w,
    MAX_ATLAS_HEIGHT / sourceRect.h
  );
  const outW = Math.max(1, Math.min(MAX_ATLAS_WIDTH, Math.ceil(sourceRect.w * scale)));
  const outH = Math.max(1, Math.min(MAX_ATLAS_HEIGHT, Math.ceil(sourceRect.h * scale)));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const q = out.getContext("2d")!;

  q.fillStyle = "#fff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(scale, 0, 0, scale, -sourceRect.x * scale, -sourceRect.y * scale);

  const hasChangedBox = !!changedBox && (changedBox.w > 0 || changedBox.h > 0);

  q.save();
  if (hasChangedBox) q.globalAlpha = 0.42;
  drawTiles(engine, q, sourceRect);
  await drawWidgets(widgets, q, sourceRect);
  drawObjects(objects, q, sourceRect);
  q.restore();

  if (hasChangedBox && changedBox) {
    const visible = clip(intersect(changedBox, sourceRect));
    if (visible.w > 0 && visible.h > 0) {
      q.save();
      q.beginPath();
      q.rect(visible.x, visible.y, visible.w, visible.h);
      q.clip();
      drawTiles(engine, q, visible);
      await drawWidgets(widgets, q, visible);
      drawObjects(objects, q, visible);
      q.restore();
    }
  }
  q.setTransform(1, 0, 0, 1, 0, 0);

  let data = "";
  try {
    data = out.toDataURL(includeWidgetTiles ? "image/png" : "image/webp", 0.9);
  } catch (err) {
    console.warn("[buildAtlas] toDataURL fallback:", err);
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = outW;
    fallbackCanvas.height = outH;
    const fq = fallbackCanvas.getContext("2d")!;
    fq.fillStyle = "#fff";
    fq.fillRect(0, 0, outW, outH);
    fq.setTransform(scale, 0, 0, scale, -sourceRect.x * scale, -sourceRect.y * scale);
    drawTiles(engine, fq, sourceRect);
    fq.setTransform(1, 0, 0, 1, 0, 0);
    data = fallbackCanvas.toDataURL("image/webp", 0.9);
  }

  return {
    atlasImage: data,
    imageSize: { w: outW, h: outH },
    visibleRect: { ...viewport },
    sourceRect,
    changedBox: changedBox ? clip(intersect(changedBox, sourceRect)) : { x: 0, y: 0, w: 0, h: 0 },
    imageScale: scale,
  };
}

function drawTiles(engine: CanvasEngine, q: CanvasRenderingContext2D, rect: Rect): void {
  const x0 = Math.max(0, Math.floor(rect.x / TILE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE));
  const x1 = Math.max(x0, Math.floor((rect.x + rect.w) / TILE));
  const y1 = Math.max(y0, Math.floor((rect.y + rect.h) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = engine.tiles.get(tx, ty);
      if (c) q.drawImage(c, tx * TILE, ty * TILE);
    }
  }
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

export async function buildFocusInset(
  engine: CanvasEngine,
  changedBox: Rect | null,
  widgets?: WidgetManager | WidgetItem[] | null,
  objects?: ObjectManager | ObjectItem[] | null
): Promise<string | undefined> {
  if (!changedBox || changedBox.w <= 0 || changedBox.h <= 0) return undefined;
  if (changedBox.w > 600 || changedBox.h > 600) return undefined;

  const pad = 32;
  const box = clip({
    x: changedBox.x - pad,
    y: changedBox.y - pad,
    w: changedBox.w + pad * 2,
    h: changedBox.h + pad * 2,
  });

  const out = document.createElement("canvas");
  const scale = 2;
  out.width = Math.max(1, Math.ceil(box.w * scale));
  out.height = Math.max(1, Math.ceil(box.h * scale));
  const q = out.getContext("2d");
  if (!q) return undefined;

  q.fillStyle = "#ffffff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  drawTiles(engine, q, box);
  await drawWidgets(widgets, q, box);
  drawObjects(objects, q, box);
  q.setTransform(1, 0, 0, 1, 0, 0);

  try {
    return out.toDataURL("image/webp", 0.95);
  } catch (err) {
    console.warn("[buildFocusInset] toDataURL failed:", err);
    return undefined;
  }
}
