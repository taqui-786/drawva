// ============================================================
// Drawva Canvas Engine — Layer Stack
// Creates 6 stacked canvas/div layers, handles DPR and resize.
// ============================================================

export interface Layers {
  /** Static background + grid */
  paperLayer: HTMLCanvasElement;
  paperCtx: CanvasRenderingContext2D;
  /** Confirmed ink from tile system */
  tileLayer: HTMLCanvasElement;
  tileCtx: CanvasRenderingContext2D;
  /** DOM objects: text boxes, images, widgets */
  objectLayer: HTMLDivElement;
  /** AI drafts (uncommitted pending items) */
  draftLayer: HTMLCanvasElement;
  draftCtx: CanvasRenderingContext2D;
  /** Live pen stroke preview while drawing */
  inkLayer: HTMLCanvasElement;
  inkCtx: CanvasRenderingContext2D;
  /** Lasso path, selection handles, hover outlines */
  interactionLayer: HTMLCanvasElement;
  interactionCtx: CanvasRenderingContext2D;
  /** Current dpr */
  dpr: number;
  /** CSS viewport size */
  cssWidth: number;
  cssHeight: number;
  /** Destroy all DOM + observer */
  destroy: () => void;
}

const CANVAS_LAYERS = [
  "paperLayer",
  "tileLayer",
  "draftLayer",
  "inkLayer",
  "interactionLayer",
] as const;

function makeCanvas(container: HTMLElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.style.position = "absolute";
  c.style.inset = "0";
  c.style.pointerEvents = "none";
  container.appendChild(c);
  return c;
}

function makeDiv(container: HTMLElement): HTMLDivElement {
  const d = document.createElement("div");
  d.style.position = "absolute";
  d.style.inset = "0";
  d.style.pointerEvents = "none";
  container.appendChild(d);
  return d;
}

function getCtx(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext("2d", { willReadFrequently: true })!;
}

function fitCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
}

/**
 * Create the layer stack inside `container`.
 * The container must be position:relative (or absolute/fixed).
 * Call layers.destroy() on unmount.
 */
export function createLayers(container: HTMLElement): Layers {
  // ensure container is the positioning root
  container.style.position = "relative";
  container.style.overflow = "hidden";

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = container.clientWidth || 800;
  const cssH = container.clientHeight || 600;

  const paperLayer = makeCanvas(container);
  const tileLayer = makeCanvas(container);
  const objectLayer = makeDiv(container);
  const draftLayer = makeCanvas(container);
  const inkLayer = makeCanvas(container);
  const interactionLayer = makeCanvas(container);

  // Only interactionLayer captures pointer events (top-most canvas)
  interactionLayer.style.pointerEvents = "auto";
  interactionLayer.style.cursor = "crosshair";
  interactionLayer.setAttribute("role", "application");
  interactionLayer.setAttribute("aria-label", "Infinite canvas whiteboard");
  interactionLayer.tabIndex = 0;

  function fitAll(w: number, h: number, d: number): void {
    fitCanvas(paperLayer, w, h, d);
    fitCanvas(tileLayer, w, h, d);
    objectLayer.style.width = `${w}px`;
    objectLayer.style.height = `${h}px`;
    fitCanvas(draftLayer, w, h, d);
    fitCanvas(inkLayer, w, h, d);
    fitCanvas(interactionLayer, w, h, d);
  }

  fitAll(cssW, cssH, dpr);

  let currentDpr = dpr;
  let currentW = cssW;
  let currentH = cssH;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const d = Math.max(1, window.devicePixelRatio || 1);
      if (w === currentW && h === currentH && d === currentDpr) return;
      currentW = w;
      currentH = h;
      currentDpr = d;
      fitAll(w, h, d);
      // engine will see cssWidth/cssHeight updated and re-render
      layers.cssWidth = w;
      layers.cssHeight = h;
      layers.dpr = d;
      container.dispatchEvent(new CustomEvent("canvas-resize", { detail: { w, h, dpr: d } }));
    }
  });
  observer.observe(container);

  const layers: Layers = {
    paperLayer,
    paperCtx: getCtx(paperLayer),
    tileLayer,
    tileCtx: getCtx(tileLayer),
    objectLayer,
    draftLayer,
    draftCtx: getCtx(draftLayer),
    inkLayer,
    inkCtx: getCtx(inkLayer),
    interactionLayer,
    interactionCtx: getCtx(interactionLayer),
    dpr,
    cssWidth: cssW,
    cssHeight: cssH,
    destroy() {
      observer.disconnect();
      for (const id of CANVAS_LAYERS) {
        try { container.removeChild(layers[id]); } catch { /* ok */ }
      }
      try { container.removeChild(objectLayer); } catch { /* ok */ }
    },
  };

  return layers;
}
