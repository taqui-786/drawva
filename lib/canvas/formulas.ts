import { pasteRegion } from "./selection";
import type { CanvasEngine } from "./engine";

// ============================================================================
// MathJax (bundled, pinned 3.2.2) LaTeX → raster. Port of penecho
// mathJaxImage()/formulaImage(). Produces an offscreen canvas image we bake
// into the tiles at the command's anchor with fontSize scaling.
// ============================================================================

let mathjaxPromise: Promise<{ tex2svgPromise: (latex: string) => Promise<Element> }> | null = null;

function loadMathJax() {
  if (!mathjaxPromise) {
    mathjaxPromise = (async () => {
      const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] =
        await Promise.all([
          import("mathjax-full/js/mathjax.js"),
          import("mathjax-full/js/input/tex.js"),
          import("mathjax-full/js/output/svg.js"),
          import("mathjax-full/js/adaptors/liteAdaptor.js"),
          import("mathjax-full/js/handlers/html.js"),
          import("mathjax-full/js/input/tex/AllPackages.js"),
        ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adaptor = (liteAdaptor as any)();
      RegisterHTMLHandler(adaptor);
      const tex = new TeX({ packages: AllPackages });
      const svg = new SVG({ fontCache: "none" });
      const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });
      return {
        tex2svgPromise: (latex: string) => {
          const node = doc.convert(latex, { display: false });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return Promise.resolve((adaptor as any).outerHTML(node)) as unknown as Promise<Element>;
        },
      };
    })();
  }
  return mathjaxPromise;
}

export interface FormulaRender {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
  error?: Error;
}

export async function renderFormula(
  latex: string,
  fontSize: number,
  color: string
): Promise<FormulaRender> {
  try {
    const mj = await loadMathJax();
    const xml = await mj.tex2svgPromise(latex);
    const container = document.createElement("div");
    container.innerHTML = String(xml);
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("No MathJax SVG");
    const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
    const ratio =
      viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0
        ? viewBox[2] / viewBox[3]
        : Math.max(0.7, latex.length * 0.65);
    const logicalHeight = Math.max(1, Math.ceil(fontSize * 1.35));
    const logicalWidth = Math.max(1, Math.ceil(logicalHeight * ratio));
    const rasterWidth = logicalWidth;
    const rasterHeight = logicalHeight;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(rasterWidth));
    svg.setAttribute("height", String(rasterHeight));
    svg.setAttribute("color", color);
    svg.setAttribute("fill", "currentColor");
    const serialized = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = rasterWidth;
      canvas.height = rasterHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0, rasterWidth, rasterHeight);
      return { canvas, logicalWidth, logicalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    return {
      canvas: formulaFallback(latex, fontSize, color),
      logicalWidth: 0,
      logicalHeight: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function formulaFallback(latex: string, fontSize: number, color: string): HTMLCanvasElement {
  const text = latex
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/[\\{}]/g, "");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const w = Math.max(1, Math.ceil(ctx.measureText(text).width));
  const h = Math.max(1, Math.ceil(fontSize * 1.35));
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.fillText(text, 0, 0);
  return canvas;
}

/** Bake a rendered formula into the tiles at (x, y). */
export function bakeFormula(
  engine: CanvasEngine,
  anchorX: number,
  anchorY: number,
  render: FormulaRender
): void {
  if (render.canvas.width <= 0 || render.canvas.height <= 0) return;
  pasteRegion(engine, render.canvas, anchorX, anchorY);
}
