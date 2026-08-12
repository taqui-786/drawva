import { pasteRegion } from "./selection";
import type { CanvasEngine } from "./engine";
import type { PlotFunctionCommand } from "./commands";

// ============================================================================
// Safe 2D expression evaluator + axis plotter. Port of penecho ai-runtime.js
// compileExpression/normalizePlotExpression/plot/plotView/nicePlotStep/...
// No eval() — a recursive-descent parser over a strict token whitelist.
// ============================================================================

type EvalFn = (x: number) => number;

export function normalizePlotExpression(source: string): string {
  return String(source || "")
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/gi, "pi")
    .replace(/√\s*\(([^()]*)\)/g, "sqrt($1)")
    .replace(/√\s*([A-Za-z0-9_.]+)/g, "sqrt($1)")
    .replace(
      /(\d|\)|x(?![A-Za-z_])|pi(?![A-Za-z_])|e(?![A-Za-z_]))\s*(?=x|pi|e(?![+\-]?\d)|sin|cos|tan|sqrt|abs|exp|log|ln|\()/gi,
      "$1*"
    );
}

export function compileExpression(source: string): EvalFn {
  const text = normalizePlotExpression(source)
    .trim()
    .replace(/^y\s*=\s*/i, "");
  if (!text || text.length > 180 || !/^[\d\sA-Za-z_+\-*/^().]+$/.test(text)) {
    throw new Error("Unsupported expression");
  }
  const tokens: string[] = [];
  const re = /\s*(\d*\.?\d+(?:e[+\-]?\d+)?|[A-Za-z_]+|[()+\-*/^])/gy;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index !== at) throw new Error("Invalid token");
    tokens.push(m[1]);
    at = re.lastIndex;
  }
  if (at !== text.length || tokens.length > 100) throw new Error("Expression too complex");
  let i = 0;
  const funcs: Record<string, (n: number) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    exp: Math.exp,
    log: Math.log,
    ln: Math.log,
  };
  const take = (v: string) => (tokens[i] === v ? (i++, true) : false);
  const primary = (): EvalFn => {
    const t = tokens[i++];
    if (t === "(") {
      const v = add();
      if (!take(")")) throw new Error("Unclosed parenthesis");
      return v;
    }
    if (/^\d|^\./.test(t || "")) return () => Number(t);
    if (t === "x") return (x) => x;
    if (t === "pi") return () => Math.PI;
    if (t === "e") return () => Math.E;
    if (t && funcs[t]) {
      if (!take("(")) throw new Error("Function needs parentheses");
      const arg = add();
      if (!take(")")) throw new Error("Unclosed function");
      const f = funcs[t];
      return (x) => f(arg(x));
    }
    throw new Error("Unknown identifier");
  };
  const unary = (): EvalFn => {
    if (take("+")) return unary();
    if (take("-")) {
      const v = unary();
      return (x) => -v(x);
    }
    return primary();
  };
  const power = (): EvalFn => {
    let left = unary();
    if (take("^")) {
      const right = power();
      const old = left;
      left = (x) => old(x) ** right(x);
    }
    return left;
  };
  const multiply = (): EvalFn => {
    let left = power();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++];
      const right = power();
      const old = left;
      left = op === "*" ? (x) => old(x) * right(x) : (x) => old(x) / right(x);
    }
    return left;
  };
  const add = (): EvalFn => {
    let left = multiply();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const right = multiply();
      const old = left;
      left = op === "+" ? (x) => old(x) + right(x) : (x) => old(x) - right(x);
    }
    return left;
  };
  const result = add();
  if (i !== tokens.length) throw new Error("Unexpected expression tail");
  return result;
}

interface View {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function nicePlotStep(range: number, targetTicks: number): number {
  const rough = Math.max(Number.MIN_VALUE, range / Math.max(1, targetTicks));
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

function plotTicks(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  const first = Math.ceil((min - step * 1e-9) / step) * step;
  for (let value = first; value <= max + step * 1e-9 && values.length < 40; value += step) {
    values.push(Math.abs(value) < step * 1e-9 ? 0 : value);
  }
  return values;
}

function formatPlotTick(value: number, step: number): string {
  const digits = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
  return Number(value.toFixed(digits)).toString();
}

function fitCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}...`).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low)}...`;
}

function plotView(evaluate: EvalFn): View {
  for (const extent of [5, 10, 100, 1000, 10000]) {
    const values: number[] = [];
    for (let i = 0; i <= 240; i++) {
      const y = evaluate(-extent + (i / 240) * extent * 2);
      if (Number.isFinite(y)) values.push(y);
    }
    if (values.length < 8) continue;
    if (extent === 5 && values.some((y) => y >= -10 && y <= 10)) {
      return { xMin: -5, xMax: 5, yMin: -10, yMax: 10 };
    }
    values.sort((a, b) => a - b);
    let low = values[Math.floor(values.length * 0.02)];
    let high = values[Math.ceil(values.length * 0.98) - 1];
    if (low === high) {
      const padding = Math.max(1, Math.abs(low) * 0.1);
      low -= padding;
      high += padding;
    } else {
      const padding = (high - low) * 0.1;
      low -= padding;
      high += padding;
    }
    const step = nicePlotStep(high - low, 8);
    return {
      xMin: -extent,
      xMax: extent,
      yMin: Math.floor(low / step) * step,
      yMax: Math.ceil(high / step) * step,
    };
  }
  return { xMin: -5, xMax: 5, yMin: -10, yMax: 10 };
}

/** Rasterize a plot_function command into an offscreen canvas (world units). */
export function plotCommand(c: PlotFunctionCommand): HTMLCanvasElement {
  const o = document.createElement("canvas");
  o.width = Math.max(1, Math.ceil(c.w));
  o.height = Math.max(1, Math.ceil(c.h));
  const q = o.getContext("2d")!;
  const minSide = Math.min(c.w, c.h);
  const tickFont = Math.max(10, Math.min(96, minSide * 0.032));
  const titleFont = Math.max(11, Math.min(112, minSide * 0.041));
  const margin = {
    left: Math.max(42, minSide * 0.105),
    right: Math.max(24, minSide * 0.06),
    top: Math.max(42, minSide * 0.12),
    bottom: Math.max(38, minSide * 0.1),
  };
  const area = {
    left: margin.left,
    top: margin.top,
    right: c.w - margin.right,
    bottom: c.h - margin.bottom,
  };
  const plotWidth = Math.max(1, area.right - area.left);
  const plotHeight = Math.max(1, area.bottom - area.top);
  const gridWidth = Math.max(0.75, Math.min(5, minSide * 0.002));
  const axisWidth = Math.max(1.5, Math.min(9, minSide * 0.004));
  const curveWidth = Math.max(2.2, Math.min(13, minSide * 0.006));

  let evaluate: EvalFn;
  try {
    evaluate = compileExpression(c.expression);
  } catch {
    return o;
  }
  const view = plotView(evaluate);
  const { xMin, xMax, yMin, yMax } = view;
  const xPixel = (x: number) => area.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const yPixel = (y: number) => area.bottom - ((y - yMin) / (yMax - yMin)) * plotHeight;
  const axisX = Math.max(area.left, Math.min(area.right, xPixel(0)));
  const axisY = Math.max(area.top, Math.min(area.bottom, yPixel(0)));
  const xStep = nicePlotStep(xMax - xMin, Math.max(2, plotWidth / 72));
  const yStep = nicePlotStep(yMax - yMin, Math.max(2, plotHeight / 52));
  const xTicks = plotTicks(xMin, xMax, xStep);
  const yTicks = plotTicks(yMin, yMax, yStep);

  q.save();
  q.lineCap = "round";
  q.lineJoin = "round";
  q.strokeStyle = "rgba(148, 163, 184, 0.34)";
  q.lineWidth = gridWidth;
  q.beginPath();
  for (const x of xTicks) {
    if (Math.abs(x) > xStep * 1e-9) {
      q.moveTo(xPixel(x), area.top);
      q.lineTo(xPixel(x), area.bottom);
    }
  }
  for (const y of yTicks) {
    if (Math.abs(y) > yStep * 1e-9) {
      const py = yPixel(y);
      q.moveTo(area.left, py);
      q.lineTo(area.right, py);
    }
  }
  q.stroke();

  q.strokeStyle = "#475569";
  q.fillStyle = "#475569";
  q.lineWidth = axisWidth;
  q.beginPath();
  q.moveTo(area.left, axisY);
  q.lineTo(area.right, axisY);
  q.moveTo(axisX, area.bottom);
  q.lineTo(axisX, area.top);
  q.stroke();
  const arrow = Math.max(6, Math.min(24, tickFont * 0.62));
  q.beginPath();
  q.moveTo(area.right, axisY);
  q.lineTo(area.right - arrow, axisY - arrow * 0.55);
  q.lineTo(area.right - arrow, axisY + arrow * 0.55);
  q.closePath();
  q.moveTo(axisX, area.top);
  q.lineTo(axisX - arrow * 0.55, area.top + arrow);
  q.lineTo(axisX + arrow * 0.55, area.top + arrow);
  q.closePath();
  q.fill();

  const tickLength = Math.max(4, Math.min(18, tickFont * 0.42));
  q.font = `500 ${tickFont}px ui-sans-serif, system-ui, sans-serif`;
  q.textBaseline = axisY > area.bottom - tickFont * 1.8 ? "bottom" : "top";
  q.textAlign = "center";
  q.beginPath();
  for (const x of xTicks) q.moveTo(xPixel(x), axisY - tickLength / 2);
  for (const y of yTicks) q.moveTo(axisX - tickLength / 2, yPixel(y));
  q.stroke();
  for (const x of xTicks) {
    if (Math.abs(x) > xStep * 1e-9) {
      q.fillText(formatPlotTick(x, xStep), xPixel(x), axisY + (q.textBaseline === "top" ? tickLength * 0.7 : -tickLength * 0.7));
    }
  }
  q.textAlign = axisX < area.left + tickFont * 3 ? "left" : "right";
  q.textBaseline = "middle";
  for (const y of yTicks) {
    if (Math.abs(y) > yStep * 1e-9) {
      q.fillText(formatPlotTick(y, yStep), axisX + (q.textAlign === "left" ? tickLength * 0.8 : -tickLength * 0.8), yPixel(y));
    }
  }
  q.textAlign = "left";
  q.textBaseline = "bottom";
  q.font = `600 ${titleFont}px ui-sans-serif, system-ui, sans-serif`;
  q.fillText("x", area.right - titleFont * 0.35, Math.max(area.top + titleFont, axisY - titleFont * 0.28));
  q.fillText("y", Math.min(area.right - titleFont, axisX + titleFont * 0.28), area.top + titleFont * 0.9);
  const title = `y = ${normalizePlotExpression(c.expression).replace(/^y\s*=\s*/i, "")}`;
  q.fillStyle = c.color || "#2563eb";
  q.textBaseline = "top";
  q.fillText(fitCanvasText(q, title, plotWidth), area.left, Math.max(2, (margin.top - titleFont) / 2));

  q.save();
  q.beginPath();
  q.rect(area.left, area.top, plotWidth, plotHeight);
  q.clip();
  q.strokeStyle = c.color || "#2563eb";
  q.lineWidth = curveWidth;
  q.beginPath();
  let joined = false;
  let previousPy = 0;
  let previousX = 0;
  const sampleStep = Math.max(0.5, Math.min(2, 900 / plotWidth));
  for (let px = area.left; px <= area.right; px += sampleStep) {
    const x = xMin + ((px - area.left) / plotWidth) * (xMax - xMin);
    let y: number;
    try {
      y = evaluate(x);
    } catch {
      y = NaN;
    }
    const py = yPixel(y);
    const visibleEnough = Number.isFinite(py) && py > area.top - plotHeight * 2 && py < area.bottom + plotHeight * 2;
    const midpointY = joined ? evaluate((previousX + x) / 2) : y;
    const discontinuity =
      joined &&
      (!Number.isFinite(midpointY) ||
        Math.abs(py - previousPy) > plotHeight * 0.75 ||
        Math.abs(yPixel(midpointY) - (py + previousPy) / 2) > plotHeight * 0.5);
    if (visibleEnough) {
      if (!joined) {
        q.moveTo(px, py);
        joined = true;
      } else if (discontinuity) q.moveTo(px, py);
      else q.lineTo(px, py);
      previousPy = py;
      previousX = x;
    } else {
      joined = false;
    }
  }
  q.stroke();
  q.restore();
  q.restore();
  return o;
}

/** Bake a plot into the tiles at (x, y). */
export function bakePlot(engine: CanvasEngine, c: PlotFunctionCommand): void {
  pasteRegion(engine, plotCommand(c), c.x, c.y);
}
