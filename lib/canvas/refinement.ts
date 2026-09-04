import type { Rect } from "./types";
import type { WidgetItem, WidgetManager } from "./widgets";
import type { ObjectItem, ObjectManager } from "./objects";
import type { SceneItemJson } from "./scene";
import { SIZE } from "./constants";

function inkFingerprint(canvas: HTMLCanvasElement | null): string {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return "none";
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "none";
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return "none";
  }
  const stride = Math.max(4, Math.floor((data.length / 4 / 4096)) * 4);
  let h = 2166136261;
  for (let i = 0; i < data.length; i += stride) {
    h ^= data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function canvasHasInk(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return false;
  }
  const stride = Math.max(4, Math.floor((data.length / 4 / 8192)) * 4);
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] > 10) return true;
  }
  return false;
}

export function samplePalette(canvas: HTMLCanvasElement | null, max = 5): string[] {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return [];
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return [];
  }
  const buckets = new Map<number, number>();
  const stride = Math.max(4, Math.floor((data.length / 4 / 8192)) * 4);
  for (let i = 0; i < data.length; i += stride) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i] & 0xe0;
    const g = data[i + 1] & 0xe0;
    const b = data[i + 2] & 0xe0;
    const key = (r << 16) | (g << 8) | b;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([key]) => `#${((key >>> 16) & 0xff).toString(16).padStart(2, "0")}${((key >>> 8) & 0xff).toString(16).padStart(2, "0")}${(key & 0xff).toString(16).padStart(2, "0")}`);
}

export async function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

export function encodeCanvas(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/webp", 0.92);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

export function markSelectionOnCanvas(
  canvas: HTMLCanvasElement,
  sourceRect: Rect,
  selectionRect: Rect,
  imageScale: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const x = (selectionRect.x - sourceRect.x) * imageScale;
  const y = (selectionRect.y - sourceRect.y) * imageScale;
  const w = selectionRect.w * imageScale;
  const h = selectionRect.h * imageScale;
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = Math.max(2, Math.min(canvas.width, canvas.height) * 0.006);
  ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

export interface RefinementManifest {
  rect: Rect;
  revision: number;
  fingerprint: string;
  inkPresent: boolean;
  containedWidgets: WidgetItem[];
  containedObjects: ObjectItem[];
  contextItems: SceneItemJson[];
}

function clipRect(r: Rect): Rect {
  const x = Math.max(0, Math.round(r.x));
  const y = Math.max(0, Math.round(r.y));
  const right = Math.min(SIZE, Math.round(r.x + r.w));
  const bottom = Math.min(SIZE, Math.round(r.y + r.h));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function isFullyContained(item: { x: number; y: number; w: number; h: number }, rect: Rect): boolean {
  return (
    item.x >= rect.x &&
    item.y >= rect.y &&
    item.x + item.w <= rect.x + rect.w &&
    item.y + item.h <= rect.y + rect.h
  );
}

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function buildRefinementManifest(
  rect: Rect,
  revision: number,
  widgets: WidgetManager | null,
  objects: ObjectManager | null,
  inkSnapshot: HTMLCanvasElement | null,
): RefinementManifest {
  const clipped = clipRect(rect);
  const containedWidgets: WidgetItem[] = [];
  const containedObjects: ObjectItem[] = [];
  const contextItems: SceneItemJson[] = [];

  if (widgets) {
    for (const w of widgets.all()) {
      if (isFullyContained(w, clipped)) {
        containedWidgets.push(w);
      } else if (
        w.x < clipped.x + clipped.w &&
        w.x + w.w > clipped.x &&
        w.y < clipped.y + clipped.h &&
        w.y + w.h > clipped.y
      ) {
        contextItems.push({
          id: w.id,
          kind: w.kind,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          title: w.title,
        });
      }
    }
  }

  if (objects) {
    for (const o of objects.all()) {
      if (isFullyContained(o, clipped)) {
        containedObjects.push(o);
      } else if (
        o.x < clipped.x + clipped.w &&
        o.x + o.w > clipped.x &&
        o.y < clipped.y + clipped.h &&
        o.y + o.h > clipped.y
      ) {
        contextItems.push({
          id: o.id,
          kind: o.kind,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
        });
      }
    }
  }

  const inkPresent = canvasHasInk(inkSnapshot);
  const parts: string[] = [
    `${clipped.x},${clipped.y},${clipped.w},${clipped.h}`,
    String(revision),
    inkFingerprint(inkSnapshot),
  ];

  for (const w of containedWidgets) {
    parts.push(`w:${w.id}:${w.x}:${w.y}:${w.w}:${w.h}:${fnv1a(w.html || w.copyText || "")}`);
  }
  for (const o of containedObjects) {
    parts.push(`o:${o.id}:${o.x}:${o.y}:${o.w}:${o.h}:${fnv1a(o.source || "")}`);
  }

  return {
    rect: clipped,
    revision,
    fingerprint: fnv1a(parts.join("|")),
    inkPresent,
    containedWidgets,
    containedObjects,
    contextItems,
  };
}

export function validateRefinementTarget(manifest: RefinementManifest): string | null {
  if (manifest.containedWidgets.length === 0 && manifest.containedObjects.length === 0 && !manifest.inkPresent) {
    return "Selection is empty.";
  }
  if (manifest.containedWidgets.length > 1) {
    return "Multiple widgets selected. Refine one widget at a time.";
  }
  for (const w of manifest.containedWidgets) {
    if (w.locked) return `Widget "${w.title || w.id}" is locked.`;
  }
  for (const o of manifest.containedObjects) {
    if (o.locked) return `Object "${o.id}" is locked.`;
  }
  return null;
}
