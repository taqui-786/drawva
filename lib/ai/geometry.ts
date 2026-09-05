export const CANVAS_SIZE = 20000;
export const MIN_WIDGET_WIDTH = 300;
export const DEFAULT_WIDGET_WIDTH = 2400;
export const MODEL_MAX_WIDGET_WIDTH = 5000;
export const MAX_WIDGET_WIDTH = 10000;
export const MIN_WIDGET_HEIGHT = 200;
export const DEFAULT_WIDGET_HEIGHT = 1400;
export const MODEL_MAX_WIDGET_HEIGHT = 5000;
export const MAX_WIDGET_HEIGHT = 10000;
export const MAX_WIDGET_AREA = 40_000_000;

export interface WidgetGeometrySpec {
  basis: string;
  viewportBucket: { w: number; h: number; rounding: string };
  min: { w: number; h: number };
  max: { w: number; h: number };
  sizingPolicy: string;
}

import { fitAspectLocked } from "@/lib/canvas/placement";

export function widgetGeometryForViewport(visibleRect?: { w?: number; h?: number } | null): WidgetGeometrySpec {
  const viewW = Math.max(1, Math.min(CANVAS_SIZE, Number(visibleRect?.w) || DEFAULT_WIDGET_WIDTH * 2));
  const viewH = Math.max(1, Math.min(CANVAS_SIZE, Number(visibleRect?.h) || DEFAULT_WIDGET_HEIGHT));

  return {
    basis: "half-visible-width-full-visible-height",
    viewportBucket: { w: Math.round(viewW), h: Math.round(viewH), rounding: "exact-viewport" },
    min: { w: MIN_WIDGET_WIDTH, h: MIN_WIDGET_HEIGHT },
    max: {
      w: Math.max(MIN_WIDGET_WIDTH, Math.round(viewW / 2)),
      h: Math.max(MIN_WIDGET_HEIGHT, Math.round(viewH)),
    },
    sizingPolicy:
      "The bounds are not targets. Choose dimensions appropriate to content volume, aspect ratio, layout, and readable typography; neither maximize nor minimize by default.",
  };
}

export interface BoxLike {
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
}

export function fitWidgetGeometry(
  command: BoxLike | null | undefined,
  widgetGeometry?: { max?: { w?: number; h?: number }; mode?: "free" | "contained"; scale?: number } | null
): { x: number; y: number; w: number; h: number } | null {
  if (
    !command ||
    typeof command.x !== "number" ||
    typeof command.y !== "number" ||
    typeof command.w !== "number" ||
    typeof command.h !== "number" ||
    !Number.isFinite(command.x) ||
    !Number.isFinite(command.y) ||
    !Number.isFinite(command.w) ||
    !Number.isFinite(command.h)
  ) {
    return null;
  }

  const mode = widgetGeometry?.mode || "free";
  const minBoundW = mode === "contained" ? 1 : MIN_WIDGET_WIDTH;
  const minBoundH = mode === "contained" ? 1 : MIN_WIDGET_HEIGHT;
  const targetMaxW = Math.max(
    minBoundW,
    Math.min(MAX_WIDGET_WIDTH, Math.round(widgetGeometry?.max?.w ?? 0) || MODEL_MAX_WIDGET_WIDTH)
  );
  const targetMaxH = Math.max(
    minBoundH,
    Math.min(MAX_WIDGET_HEIGHT, Math.round(widgetGeometry?.max?.h ?? 0) || MODEL_MAX_WIDGET_HEIGHT)
  );

  let rawW = Math.round(command.w);
  let rawH = Math.round(command.h);
  if (rawW <= 0 || rawH <= 0) {
    rawW = DEFAULT_WIDGET_WIDTH;
    rawH = DEFAULT_WIDGET_HEIGHT;
  }

  const scale = widgetGeometry?.scale || 1;

  const fitted = fitAspectLocked(
    rawW,
    rawH,
    targetMaxW,
    targetMaxH,
    minBoundW,
    minBoundH,
    mode,
    scale
  );

  const w = fitted.w;
  const h = fitted.h;
  const x = Math.max(0, Math.min(CANVAS_SIZE - w, Math.round(command.x)));
  const y = Math.max(0, Math.min(CANVAS_SIZE - h, Math.round(command.y)));

  return { x, y, w, h };
}
