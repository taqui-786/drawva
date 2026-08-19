import { SIZE } from "./constants";

export type WidgetResizeMode = "corner" | "horizontal" | "vertical";

export interface WidgetGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  contentW: number;
  contentH: number;
  resizeMode?: WidgetResizeMode;
  userResized?: boolean;
}

export const MIN_WIDGET_W = 120;
export const MIN_WIDGET_H = 80;
export const MAX_CONTENT_W = 3200;
export const MAX_CONTENT_H = 6000;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));

/** Converts old snapshots and untrusted sync input into a box that always fits the canvas. */
export function normalizeWidgetGeometry<T extends Partial<WidgetGeometry>>(item: T): T & WidgetGeometry {
  const contentW = clamp(finite(item.contentW, finite(item.w, 400)), 80, MAX_CONTENT_W);
  const contentH = clamp(finite(item.contentH, finite(item.h, 300)), 60, MAX_CONTENT_H);
  const w = clamp(finite(item.w, contentW), MIN_WIDGET_W, SIZE);
  const h = clamp(finite(item.h, contentH), MIN_WIDGET_H, SIZE);
  return {
    ...item,
    x: clamp(finite(item.x, 0), 0, SIZE - w),
    y: clamp(finite(item.y, 0), 0, SIZE - h),
    w,
    h,
    contentW,
    contentH,
    resizeMode: item.resizeMode === "horizontal" || item.resizeMode === "vertical" ? item.resizeMode : "corner",
  };
}

export function widgetScale(item: Pick<WidgetGeometry, "w" | "h" | "contentW" | "contentH">): number {
  return Math.max(0.01, Math.min(item.w / Math.max(1, item.contentW), item.h / Math.max(1, item.contentH)));
}

/** Edge resizes change the inner viewport; corner resizes retain the widget's aspect ratio. */
export function resizeWidgetGeometry(item: WidgetGeometry, mode: WidgetResizeMode, requestedW: number, requestedH: number): WidgetGeometry {
  const base = normalizeWidgetGeometry(item);
  const scale = widgetScale(base);
  if (mode === "horizontal") {
    const contentW = clamp(requestedW / scale, 80, MAX_CONTENT_W);
    return normalizeWidgetGeometry({ ...base, w: contentW * scale, h: base.contentH * scale, contentW, resizeMode: mode, userResized: true });
  }
  if (mode === "vertical") {
    const contentH = clamp(requestedH / scale, 60, MAX_CONTENT_H);
    return normalizeWidgetGeometry({ ...base, w: base.contentW * scale, h: contentH * scale, contentH, resizeMode: mode, userResized: true });
  }
  const factor = Math.max(requestedW / base.w, requestedH / base.h);
  return normalizeWidgetGeometry({ ...base, w: base.w * factor, h: base.h * factor, resizeMode: "corner", userResized: true });
}

/** A settled reflow updates content dimensions while preserving the selected uniform canvas scale. */
export function settleWidgetContent(item: WidgetGeometry, contentW: number, contentH: number): WidgetGeometry {
  const base = normalizeWidgetGeometry(item);
  const nextW = clamp(contentW, 80, MAX_CONTENT_W);
  const nextH = clamp(contentH, 60, MAX_CONTENT_H);
  if (!base.userResized) return normalizeWidgetGeometry({ ...base, w: nextW, h: nextH, contentW: nextW, contentH: nextH });
  const scale = widgetScale(base);
  return normalizeWidgetGeometry({ ...base, w: nextW * scale, h: nextH * scale, contentW: nextW, contentH: nextH });
}
