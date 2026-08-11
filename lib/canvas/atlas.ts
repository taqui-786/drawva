import { CanvasEngine } from "./engine";

export interface ViewportAtlasResult {
  dataUrl: string;
  width: number;
  height: number;
  visibleRect: { x: number; y: number; w: number; h: number };
}

export function captureViewportAtlas(engine: CanvasEngine, maxDimension: number = 2048): ViewportAtlasResult | null {
  if (typeof document === "undefined") return null;

  const layers = engine.layerManager.layers;
  if (!layers) return null;

  const bounds = engine.camera.getViewportWorldBounds();
  const rawWidth = Math.max(1, Math.ceil(layers.gridCanvas.width / engine.layerManager.dpr));
  const rawHeight = Math.max(1, Math.ceil(layers.gridCanvas.height / engine.layerManager.dpr));

  // Determine scale to constrain max dimension to 2048px
  let scale = 1;
  if (rawWidth > maxDimension || rawHeight > maxDimension) {
    scale = Math.min(maxDimension / rawWidth, maxDimension / rawHeight);
  }

  const atlasW = Math.max(1, Math.floor(rawWidth * scale));
  const atlasH = Math.max(1, Math.floor(rawHeight * scale));

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasW;
  atlasCanvas.height = atlasH;
  const ctx = atlasCanvas.getContext("2d");
  if (!ctx) return null;

  // Solid white background for AI vision recognition
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, atlasW, atlasH);

  // Composite canvas layers
  ctx.drawImage(layers.tileCanvas, 0, 0, atlasW, atlasH);
  ctx.drawImage(layers.objectCanvas, 0, 0, atlasW, atlasH);

  const dataUrl = atlasCanvas.toDataURL("image/webp", 0.9);

  return {
    dataUrl,
    width: atlasW,
    height: atlasH,
    visibleRect: {
      x: bounds.minX,
      y: bounds.minY,
      w: bounds.maxX - bounds.minX,
      h: bounds.maxY - bounds.minY,
    },
  };
}
