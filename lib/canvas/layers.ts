export interface CanvasLayers {
  gridCanvas: HTMLCanvasElement;
  tileCanvas: HTMLCanvasElement;
  objectCanvas: HTMLCanvasElement;
  interactionCanvas: HTMLCanvasElement;
}

export interface LayerContexts {
  gridCtx: CanvasRenderingContext2D;
  tileCtx: CanvasRenderingContext2D;
  objectCtx: CanvasRenderingContext2D;
  interactionCtx: CanvasRenderingContext2D;
}

export class LayerManager {
  public dpr: number = 1;
  public width: number = 0;
  public height: number = 0;

  public layers: CanvasLayers | null = null;
  public contexts: LayerContexts | null = null;

  public mount(container: HTMLElement): CanvasLayers {
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const createLayer = (id: string, zIndex: number): HTMLCanvasElement => {
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = zIndex === 4 ? "auto" : "none";
      canvas.style.zIndex = zIndex.toString();
      container.appendChild(canvas);
      return canvas;
    };

    const gridCanvas = createLayer("drawva-grid-layer", 1);
    const tileCanvas = createLayer("drawva-tile-layer", 2);
    const objectCanvas = createLayer("drawva-object-layer", 3);
    const interactionCanvas = createLayer("drawva-interaction-layer", 4);

    this.layers = { gridCanvas, tileCanvas, objectCanvas, interactionCanvas };
    this.contexts = {
      gridCtx: gridCanvas.getContext("2d")!,
      tileCtx: tileCanvas.getContext("2d")!,
      objectCtx: objectCanvas.getContext("2d")!,
      interactionCtx: interactionCanvas.getContext("2d")!,
    };

    this.resize(container.clientWidth, container.clientHeight);
    return this.layers;
  }

  public resize(width: number, height: number): void {
    if (!this.layers || !this.contexts) return;
    this.width = width;
    this.height = height;
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const scaledWidth = Math.floor(width * this.dpr);
    const scaledHeight = Math.floor(height * this.dpr);

    Object.values(this.layers).forEach((canvas) => {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    });

    Object.values(this.contexts).forEach((ctx) => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    });
  }

  public clearAll(): void {
    if (!this.contexts || !this.layers) return;
    const { gridCanvas } = this.layers;
    Object.values(this.contexts).forEach((ctx) => {
      ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    });
  }

  public unmount(): void {
    if (this.layers) {
      Object.values(this.layers).forEach((canvas) => canvas.remove());
      this.layers = null;
      this.contexts = null;
    }
  }
}
