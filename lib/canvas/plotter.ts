import { PlotItem } from "./types";

export function evaluateExpression(expr: string, x: number): number {
  const normalized = expr
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos")
    .replace(/\btan\b/g, "Math.tan")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\bexp\b/g, "Math.exp")
    .replace(/\blog\b/g, "Math.log")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\^/g, "**");

  try {
    // Safe numeric evaluation function
    const fn = new Function("x", `return ${normalized};`);
    const val = fn(x);
    return typeof val === "number" && Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

export function drawFunctionPlot(ctx: CanvasRenderingContext2D, item: PlotItem): void {
  const { x: rectX, y: rectY, w, h, expression, color } = item;

  ctx.save();
  ctx.translate(rectX, rectY);

  // Background frame
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);

  // Axes (centered)
  const originX = w / 2;
  const originY = h / 2;

  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(0, originY);
  ctx.lineTo(w, originY);
  ctx.moveTo(originX, 0);
  ctx.lineTo(originX, h);
  ctx.stroke();

  // Plot function curve
  ctx.strokeStyle = color || "#2563eb";
  ctx.lineWidth = 2;
  ctx.beginPath();

  const xMin = -10;
  const xMax = 10;
  const steps = Math.min(500, Math.floor(w));
  let isFirst = true;

  for (let i = 0; i <= steps; i++) {
    const px = (i / steps) * w;
    const mathX = xMin + (i / steps) * (xMax - xMin);
    const mathY = evaluateExpression(expression, mathX);

    // Map mathY [-10, 10] to pixel Y
    const py = originY - (mathY / 10) * (h / 2);

    if (py >= 0 && py <= h) {
      if (isFirst) {
        ctx.moveTo(px, py);
        isFirst = false;
      } else {
        ctx.lineTo(px, py);
      }
    } else {
      isFirst = true;
    }
  }
  ctx.stroke();

  // Expression title
  ctx.fillStyle = "#334155";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`y = ${expression}`, 8, 16);

  ctx.restore();
}
