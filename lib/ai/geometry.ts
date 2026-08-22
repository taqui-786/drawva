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

export function widgetGeometryForViewport(visibleRect?: { w?: number; h?: number } | null): WidgetGeometrySpec {
  const bucket = (value: number | undefined) =>
    Math.ceil(Math.min(CANVAS_SIZE, Math.max(1, Number(value) || 1)) / 1000) * 1000;
  const viewportW = bucket(visibleRect?.w);
  const viewportH = bucket(visibleRect?.h);

  return {
    basis: "half-of-current-visible-viewport",
    viewportBucket: { w: viewportW, h: viewportH, rounding: "ceil-to-1000-before-halving" },
    min: { w: MIN_WIDGET_WIDTH, h: MIN_WIDGET_HEIGHT },
    max: {
      w: Math.max(MIN_WIDGET_WIDTH, Math.round(viewportW / 2)),
      h: Math.max(MIN_WIDGET_HEIGHT, Math.round(viewportH / 2)),
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
  widgetGeometry?: { max?: { w?: number; h?: number } } | null
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

  const targetMaxW = Math.max(
    MIN_WIDGET_WIDTH,
    Math.min(MAX_WIDGET_WIDTH, Math.round(widgetGeometry?.max?.w ?? 0) || MODEL_MAX_WIDGET_WIDTH)
  );
  const targetMaxH = Math.max(
    MIN_WIDGET_HEIGHT,
    Math.min(MAX_WIDGET_HEIGHT, Math.round(widgetGeometry?.max?.h ?? 0) || MODEL_MAX_WIDGET_HEIGHT)
  );

  let x = Math.round(command.x);
  let y = Math.round(command.y);
  let w = Math.round(command.w);
  let h = Math.round(command.h);

  if (w <= 0 || h <= 0) {
    w = DEFAULT_WIDGET_WIDTH;
    h = DEFAULT_WIDGET_HEIGHT;
  } else if (w < MIN_WIDGET_WIDTH || h < MIN_WIDGET_HEIGHT) {
    const scale = Math.max(MIN_WIDGET_WIDTH / w, MIN_WIDGET_HEIGHT / h);
    w = Math.ceil(w * scale);
    h = Math.ceil(h * scale);
  }

  if (w > targetMaxW || h > targetMaxH || w * h > MAX_WIDGET_AREA) {
    const scale = Math.min(
      1,
      targetMaxW / w,
      targetMaxH / h,
      Math.sqrt(MAX_WIDGET_AREA / (w * h))
    );
    w = Math.floor(w * scale);
    h = Math.floor(h * scale);
  }

  w = Math.max(MIN_WIDGET_WIDTH, Math.min(w, CANVAS_SIZE));
  h = Math.max(MIN_WIDGET_HEIGHT, Math.min(h, CANVAS_SIZE));
  x = Math.max(0, Math.min(CANVAS_SIZE - w, x));
  y = Math.max(0, Math.min(CANVAS_SIZE - h, y));

  return w >= MIN_WIDGET_WIDTH && h >= MIN_WIDGET_HEIGHT ? { x, y, w, h } : null;
}
