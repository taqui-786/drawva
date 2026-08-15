import type { Rect } from "./types";

export type LayerName = "screen" | "ink" | "interaction";

const LAYER_ORDER: LayerName[] = ["screen", "ink", "interaction"];

const LAYER_Z: Record<LayerName, number> = {
  screen: 0,
  ink: 1,
  interaction: 2,
};

export class LayerStack {
  readonly root: HTMLDivElement;
  private layers = new Map<LayerName, HTMLCanvasElement>();
  private contexts = new Map<LayerName, CanvasRenderingContext2D>();

  constructor(root: HTMLDivElement) {
    this.root = root;
    const rootStyle = this.root.style;
    const computedPos = typeof window !== "undefined" ? window.getComputedStyle(this.root).position : "";
    if (!rootStyle.position && (computedPos === "static" || !computedPos)) {
      rootStyle.position = "relative";
    }
    rootStyle.overflow = "hidden";
    for (const name of LAYER_ORDER) {
      const canvas = document.createElement("canvas");
      canvas.dataset.layer = name;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.zIndex = String(LAYER_Z[name]);
      this.root.appendChild(canvas);
      this.layers.set(name, canvas);
      const ctx = canvas.getContext("2d", { willReadFrequently: name === "ink" });
      if (!ctx) throw new Error(`Canvas 2D context unavailable: ${name}`);
      this.contexts.set(name, ctx);
    }
  }

  canvas(name: LayerName): HTMLCanvasElement {
    const c = this.layers.get(name);
    if (!c) throw new Error(`missing layer: ${name}`);
    return c;
  }

  ctx(name: LayerName): CanvasRenderingContext2D {
    const c = this.contexts.get(name);
    if (!c) throw new Error(`missing ctx: ${name}`);
    return c;
  }

  names(): LayerName[] {
    return [...LAYER_ORDER];
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    for (const name of LAYER_ORDER) {
      const c = this.layers.get(name);
      if (!c) continue;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
  }

  clearLayer(name: LayerName, rect?: Rect, dpr = 1): void {
    const c = this.canvas(name);
    const ctx = this.ctx(name);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (rect) {
      ctx.clearRect(
        Math.round(rect.x * dpr),
        Math.round(rect.y * dpr),
        Math.round(rect.w * dpr),
        Math.round(rect.h * dpr)
      );
    } else {
      ctx.clearRect(0, 0, c.width, c.height);
    }
    ctx.restore();
  }

  destroy(): void {
    for (const c of this.layers.values()) c.remove();
    this.layers.clear();
    this.contexts.clear();
  }
}
