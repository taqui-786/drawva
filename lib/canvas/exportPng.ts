import { CanvasEngine } from "./engine";

export function exportCanvasPng(engine: CanvasEngine, fileName: string = "drawva-canvas.png"): void {
  if (typeof document === "undefined") return;

  const atlas = engine.layerManager.layers;
  if (!atlas) return;

  const width = Math.max(1, Math.ceil(atlas.gridCanvas.width / engine.layerManager.dpr));
  const height = Math.max(1, Math.ceil(atlas.gridCanvas.height / engine.layerManager.dpr));

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext("2d");
  if (!ctx) return;

  // Solid white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Composite tile and object layers
  ctx.drawImage(atlas.tileCanvas, 0, 0, width, height);
  ctx.drawImage(atlas.objectCanvas, 0, 0, width, height);

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}
