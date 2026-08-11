import { FormulaItem } from "./types";

export function renderFormulaToSvgImage(
  latex: string,
  color: string = "#1e293b",
  fontSize: number = 28
): Promise<{ svgImage: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve) => {
    // Generate clean inline SVG representation for mathematical expressions
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80" viewBox="0 0 400 80">
      <style>
        text { font-family: 'Cambria Math', 'Times New Roman', serif; font-style: italic; font-size: ${fontSize}px; fill: ${color}; }
      </style>
      <text x="10" y="45">${escapeSvgText(latex)}</text>
    </svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        svgImage: img,
        width: 300,
        height: Math.ceil(fontSize * 2.2),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback empty image
      const fallback = new Image();
      resolve({ svgImage: fallback, width: 200, height: 50 });
    };
    img.src = url;
  });
}

function escapeSvgText(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function drawFormulaOnCanvas(ctx: CanvasRenderingContext2D, item: FormulaItem): void {
  if (item.svgImage) {
    ctx.drawImage(item.svgImage, item.x, item.y, item.w, item.h);
  } else {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = `italic ${item.fontSize}px serif`;
    ctx.textBaseline = "top";
    ctx.fillText(item.latex, item.x, item.y);
    ctx.restore();
  }
}
