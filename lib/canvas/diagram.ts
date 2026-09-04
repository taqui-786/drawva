import { DIAGRAM_SOURCE_FORMATS } from "./commands";
import { widgetThemeStyleTag } from "./theme";

export type DiagramFormat = (typeof DIAGRAM_SOURCE_FORMATS extends Set<infer T> ? T : never);

interface FormatRecord {
  id: string;
  label: string;
  aliases: string[];
}

const FORMATS: FormatRecord[] = [
  { id: "mermaid", label: "Mermaid", aliases: ["mermaid", "flowchart", "sequence", "sequencediagram", "classdiagram", "erdiagram", "gantt", "graph"] },
  { id: "dot", label: "Graphviz DOT", aliases: ["dot", "graphviz", "graphviz-dot", "graphviz dot"] },
  { id: "bpmn-xml", label: "BPMN XML", aliases: ["bpmn", "bpmn-xml", "bpmn2", "bpmn-2.0-xml"] },
  { id: "vega-lite", label: "Vega-Lite JSON", aliases: ["vega-lite", "vegalite", "vega-lite-json", "vega", "chart"] },
  { id: "geojson", label: "GeoJSON", aliases: ["geojson", "geo-json", "map"] },
  { id: "smiles", label: "SMILES", aliases: ["smiles", "chemical", "chemistry", "molecule", "molecular"] },
  { id: "cytoscape-json", label: "Cytoscape JSON", aliases: ["cytoscape", "cytoscape-json", "cytoscape-elements-json", "network"] },
];

const aliasMap = new Map<string, string>();
for (const f of FORMATS) for (const a of f.aliases) aliasMap.set(a, f.id);

export function normalizeFormat(value: unknown): string {
  return aliasMap.get(String(value || "").trim().toLowerCase()) || "";
}

export function detectDiagramFormat(
  sourceFormat?: string,
  source?: string,
  title?: string
): DiagramFormat {
  const norm = normalizeFormat(sourceFormat);
  const src = String(source || "").trim();
  const tit = String(title || "").trim();

  if (
    norm === "smiles" ||
    /smiles|molecule|chemical|c1ccccc1|aspirin|c@/i.test(tit) ||
    (/^[A-Za-z0-9@+\-\[\]\(\)\\\/%=#$]+$/.test(src) &&
      !/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|digraph|subgraph)/i.test(src) &&
      (/[cCnNoOpPsS]/.test(src) && (src.includes("=") || src.includes("(") || src.includes("1") || src.includes("@"))))
  ) {
    return "smiles";
  }

  if (src.startsWith("{") || src.startsWith("[")) {
    if (/\"\$schema\"|\"mark\"|\"encoding\"|\"data\"/i.test(src)) return "vega-lite";
    if (/\"nodes\"|\"edges\"|\"elements\"/i.test(src)) return "cytoscape-json";
    if (/\"FeatureCollection\"|\"geometry\"|\"coordinates\"/i.test(src)) return "geojson";
  }

  if (/<\?xml|<bpmn|<definitions/i.test(src)) return "bpmn-xml";

  if (/^\s*(di)?graph\s*(\w+)?\s*\{/i.test(src)) return "dot";

  if (norm && (DIAGRAM_SOURCE_FORMATS as Set<string>).has(norm)) {
    return norm as DiagramFormat;
  }

  return "mermaid";
}

export function formatLabel(value: unknown): string {
  const id = normalizeFormat(value);
  return FORMATS.find((f) => f.id === id)?.label || "source";
}

export function copyLabel(value: unknown): string {
  return `Copy ${formatLabel(value)}`;
}

export function responsiveMermaidSource(
  value: string,
  width: number,
  height: number
): { source: string; direction: string } {
  const source = String(value || "");
  const directive = /^(\s*(?:(?:%%[^\n]*)\n\s*)*)(flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/im.exec(source);
  if (!directive || /%%\s*drawva:fixed-layout\b/i.test(source)) return { source, direction: "" };
  const connectors = source.match(/-->|---|-\.-?>|==>/g)?.length || 0;
  const responsive = /%%\s*drawva:responsive\b/i.test(source) || connectors > 10;
  if (!responsive) return { source, direction: directive[3].toUpperCase() };
  const original = directive[3].toUpperCase();
  const horizontal = original === "RL" ? "RL" : "LR";
  const vertical = original === "BT" ? "BT" : "TB";
  const direction = width >= height * 1.35 ? horizontal : vertical;
  const innerDirection = direction === horizontal ? "TB" : "LR";
  let responsiveDiagram = source.replace(directive[0], `${directive[1]}${directive[2]} ${direction}`);
  if (/%%\s*drawva:responsive\b/i.test(source)) {
    responsiveDiagram = responsiveDiagram.replace(/^(\s*direction\s+)(LR|RL|TB|TD|BT)\b/gim, `$1${innerDirection}`);
  }
  return { source: responsiveDiagram, direction };
}

export function sanitizeMermaidSource(raw: string): string {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();

  s = s.replace(/(\b[A-Za-z0-9_]+)\[([^"\]\r\n][^\]\r\n]*)\]/g, (match, id, label) => {
    if (/[()\[\]{}":;=<>#]/.test(label)) {
      const cleanLabel = label.replace(/"/g, "'");
      return `${id}["${cleanLabel}"]`;
    }
    return match;
  });

  return s;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const loadedScripts = new Map<string, Promise<void>>();

function loadBrowserScript(url: string): Promise<void> {
  const existing = loadedScripts.get(url);
  if (existing) return existing;
  const pending = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => {
      loadedScripts.delete(url);
      reject(new Error(`Could not load ${url}`));
    };
    document.head.append(script);
  });
  loadedScripts.set(url, pending);
  return pending;
}

type SmilesDrawerGlobal = {
  parse: (source: string, onOk: (tree: unknown) => void, onErr: (err: unknown) => void) => void;
  SvgDrawer: new (opts: object) => { draw: (...args: unknown[]) => void };
};

async function renderMermaid(source: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: isDark ? "dark" : "default",
    themeVariables: {
      fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
      fontSize: "15px",
      darkMode: isDark,
      background: "transparent",
      mainBkg: isDark ? "#1e293b" : "#f8fafc",
      nodeBorder: isDark ? "#475569" : "#cbd5e1",
      nodeTextColor: isDark ? "#f1f5f9" : "#0f172a",
      lineColor: isDark ? "#94a3b8" : "#475569",
      textColor: isDark ? "#f1f5f9" : "#0f172a",
    },
    flowchart: { htmlLabels: false, curve: "basis" },
  });
  const id = `dm-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const result = await mermaid.render(id, source);
  return result.svg || "";
}

async function renderSmilesSvg(
  source: string,
  width: number,
  height: number,
  compact: boolean
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const primary = "https://cdn.jsdelivr.net/npm/smiles-drawer@2.1.7/dist/smiles-drawer.min.js";
  const fallback = "https://unpkg.com/smiles-drawer@2.1.7/dist/smiles-drawer.min.js";
  try {
    await loadBrowserScript(primary);
  } catch {
    await loadBrowserScript(fallback);
  }
  const SD = (window as unknown as { SmilesDrawer?: SmilesDrawerGlobal }).SmilesDrawer;
  if (!SD?.parse || typeof SD.SvgDrawer !== "function") return null;
  const tree = await new Promise((resolve, reject) => {
    try {
      SD.parse(source, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  new SD.SvgDrawer({
    width,
    height,
    bondThickness: 2,
    padding: 16,
    compactDrawing: compact,
  }).draw(tree, svg, "light", null, false, []);
  if (!svg.childNodes.length) return null;
  cropSvgElement(svg, 12);
  return svg.outerHTML;
}

function cropSvgElement(svg: SVGSVGElement, pad = 12): { width: number; height: number } | null {
  if (typeof document === "undefined") return null;
  const detached = !svg.isConnected;
  if (detached) {
    svg.style.position = "absolute";
    svg.style.visibility = "hidden";
    svg.style.pointerEvents = "none";
    svg.style.left = "-9999px";
    document.body.append(svg);
  }
  try {
    const b = svg.getBBox();
    if (!(b.width > 2 && b.height > 2)) return null;
    const x = b.x - pad;
    const y = b.y - pad;
    const w = b.width + pad * 2;
    const h = b.height + pad * 2;
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    svg.setAttribute("width", String(Math.ceil(w)));
    svg.setAttribute("height", String(Math.ceil(h)));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("style");
    return { width: Math.ceil(w + 16), height: Math.ceil(h + 16) };
  } catch {
    return null;
  } finally {
    if (detached) svg.remove();
  }
}

function wrapStaticSvg(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${widgetThemeStyleTag()}<style>
html,body{margin:0;padding:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:transparent!important;box-sizing:border-box}
#stage{width:max-content;max-width:100%;height:max-content;max-height:100%;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box}
#stage svg{width:auto;height:auto;max-width:100%;max-height:100%;display:block;margin:auto}
.node rect, .node circle, .node ellipse, .node polygon, .node path { fill: var(--card, #ffffff); stroke: var(--border, #cbd5e1); }
.node .label, text { fill: var(--foreground, #0f172a); }
</style></head><body><div id="stage">${svg}</div><script>
function fitServerSvg(){
  try{
    var s=document.querySelector("#stage svg");
    if(!s)return;
    var w=0,h=0,pad=12;
    try{
      var b=s.getBBox();
      if(b && b.width>2 && b.height>2){
        var x=b.x-pad,y=b.y-pad;
        w=b.width+pad*2;h=b.height+pad*2;
        s.setAttribute("viewBox",x+" "+y+" "+w+" "+h);
      }
    }catch(e0){}
    if(!w){
      if(s.viewBox&&s.viewBox.baseVal&&s.viewBox.baseVal.width>2){w=s.viewBox.baseVal.width;h=s.viewBox.baseVal.height}
    }
    if(!w){
      var a=s.getAttribute("viewBox");
      if(a){var p=a.split(/[\\s,]+/).map(Number);if(p.length===4&&p[2]>2&&p[3]>2){w=p[2];h=p[3]}}
    }
    if(!w){
      var aw=parseFloat(s.getAttribute("width"));
      var ah=parseFloat(s.getAttribute("height"));
      if(aw>2&&ah>2&&String(s.getAttribute("width")||"").indexOf("%")<0){w=aw;h=ah}
    }
    if(w>2&&h>2){
      s.setAttribute("width",String(Math.ceil(w)));
      s.setAttribute("height",String(Math.ceil(h)));
      s.setAttribute("preserveAspectRatio","xMidYMid meet");
      s.style.width=Math.ceil(w)+"px";
      s.style.height=Math.ceil(h)+"px";
      s.style.maxWidth="100%";
      s.style.maxHeight="100%";
      window.parent&&window.parent.postMessage({type:"drawva-widget-resize-content",width:Math.ceil(w+16),height:Math.ceil(h+16)},"*");
    }
  }catch(e){}
}
window.addEventListener("DOMContentLoaded",fitServerSvg);
setTimeout(fitServerSvg,50);
setTimeout(fitServerSvg,300);
</script></body></html>`;
}

function errorDocument(message: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const escaped = String(message).replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent!important;font:14px system-ui;color:#b91c1c}</style></head><body><div>⚠️ ${escaped}</div></body></html>`;
}

export function extractSvgDimensions(svg: string): { width: number; height: number } | null {
  if (!svg) return null;
  const vbMatch = svg.match(/viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i);
  if (vbMatch) {
    const w = parseFloat(vbMatch[3]);
    const h = parseFloat(vbMatch[4]);
    if (w > 20 && h > 20) {
      return { width: Math.round(w + 16), height: Math.round(h + 16) };
    }
  }
  const wMatch = svg.match(/width=["']([\d.]+)px?["']/i);
  const hMatch = svg.match(/height=["']([\d.]+)px?["']/i);
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1]);
    const h = parseFloat(hMatch[1]);
    if (w > 20 && h > 20) {
      return { width: Math.round(w + 16), height: Math.round(h + 16) };
    }
  }
  return null;
}

export function estimateDiagramDimensions(
  format: string,
  source: string,
  diagramKind?: string
): { width: number; height: number } {
  if (format === "vega-lite") {
    try {
      const spec = typeof source === "string" ? JSON.parse(source) : source;
      const w = Number(spec?.width);
      const h = Number(spec?.height);
      const pad = spec?.padding;
      const extraW = typeof pad === "number" ? pad * 2 : (Number(pad?.left) || 16) + (Number(pad?.right) || 16);
      const extraH = typeof pad === "number" ? pad * 2 : (Number(pad?.top) || 16) + (Number(pad?.bottom) || 16);
      const legend = spec?.encoding && (spec.encoding.color || spec.encoding.stroke) ? 80 : 24;
      const title = spec?.title ? 36 : 8;
      if (w > 0 && h > 0) {
        return {
          width: Math.round(w + extraW + legend + 24),
          height: Math.round(h + extraH + title + 48),
        };
      }
    } catch {}
    return { width: 640, height: 380 };
  }

  if (format === "smiles") {
    const isCompact = diagramKind === "molecular-structure-compact" || diagramKind === "compact" || /compact/i.test(diagramKind || "");
    return isCompact ? { width: 340, height: 240 } : { width: 440, height: 320 };
  }

  if (format === "dot") {
    return { width: 580, height: 360 };
  }

  if (format === "bpmn-xml") {
    const shapes = (source.match(/<(?:bpmn:)?(?:task|userTask|serviceTask|exclusiveGateway|parallelGateway|startEvent|endEvent|intermediateCatchEvent)/gi) || []).length;
    const estW = Math.min(1800, Math.max(680, 240 + shapes * 160));
    const estH = Math.min(900, Math.max(400, 240 + Math.ceil(shapes / 4) * 80));
    return { width: estW, height: estH };
  }

  if (format === "cytoscape-json" || format === "geojson") {
    return { width: 680, height: 440 };
  }

  if (format === "mermaid") {
    const nodes =
      (source.match(/^\s*[A-Za-z][\w-]*\s*(?:\[|\(|\{|>|{{)/gm) || []).length ||
      (source.match(/-->|---|==>/g) || []).length + 1;
    const horizontal = /(?:flowchart|graph)\s+(LR|RL)/i.test(source);
    if (horizontal) {
      return {
        width: Math.min(1400, Math.max(360, 160 + nodes * 150)),
        height: Math.min(700, Math.max(200, 180 + Math.ceil(nodes / 5) * 70)),
      };
    }
    return {
      width: Math.min(800, Math.max(280, 240 + Math.ceil(nodes / 4) * 80)),
      height: Math.min(1400, Math.max(220, 140 + nodes * 72)),
    };
  }

  return { width: 560, height: 360 };
}

export async function diagramDocument(
  sourceFormat: string,
  source: string,
  diagramKind?: string,
  title?: string
): Promise<{ html: string; width?: number; height?: number }> {
  const format = detectDiagramFormat(sourceFormat, source, title);
  if (!format) {
    return { html: errorDocument(`Unknown diagram format: ${sourceFormat}`) };
  }

  const effectiveSource = format === "mermaid" ? sanitizeMermaidSource(source) : source;

  if (format === "mermaid" && typeof document !== "undefined") {
    const { source: responsive } = responsiveMermaidSource(effectiveSource, 800, 500);
    try {
      const svg = await withTimeout(renderMermaid(responsive), 8000, "Mermaid");
      if (svg) {
        const dims = extractSvgDimensions(svg) ?? estimateDiagramDimensions("mermaid", effectiveSource, diagramKind);
        return { html: wrapStaticSvg(svg), width: dims.width, height: dims.height };
      }
    } catch (e) {
      console.warn("[Diagram Renderer] Mermaid pre-render failed, using iframe runtime:", e);
    }
  }

  const isCompact =
    diagramKind === "molecular-structure-compact" ||
    diagramKind === "compact" ||
    /compact/i.test(diagramKind || "");

  if (format === "smiles") {
    const smileDims = estimateDiagramDimensions("smiles", effectiveSource, diagramKind);
    try {
      const svg = await withTimeout(
        renderSmilesSvg(effectiveSource, smileDims.width, smileDims.height, isCompact),
        2500,
        "SMILES"
      );
      if (svg) {
        const dims = extractSvgDimensions(svg) ?? smileDims;
        return { html: wrapStaticSvg(svg), width: dims.width, height: dims.height };
      }
    } catch (e) {
      console.warn("[Diagram Renderer] SMILES pre-render failed, using iframe runtime:", e);
    }
  }

  const dims = estimateDiagramDimensions(format, effectiveSource, diagramKind);
  const encodedSource = JSON.stringify(effectiveSource);
  const estW = dims.width;
  const estH = dims.height;
  const html = clientDiagramRuntimeHtml({
    sourceJson: encodedSource,
    format,
    label: formatLabel(format),
    estW,
    estH,
    compact: isCompact,
  });
  return { html, width: estW, height: estH };
}

function clientDiagramRuntimeHtml(opts: {
  sourceJson: string;
  format: string;
  label: string;
  estW: number;
  estH: number;
  compact: boolean;
}): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent !important; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; }
    #stage { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 8px; background: transparent !important; position: relative; margin: 0; overflow: hidden; }
    #stage > svg, #stage > canvas { width: auto; height: auto; max-width: 100%; max-height: 100%; display: block; margin: auto; }
    .bjs-container, .djs-container { width: 100% !important; height: 100% !important; background: transparent !important; }
    .djs-container svg { width: 100% !important; height: 100% !important; display: block !important; }
    .bjs-breadcrumbs, .bjs-powered-by, .bjs-container > .bjs-powered-by { display: none !important; opacity: 0 !important; pointer-events: none !important; }
    .err-msg { color: #b91c1c; font-size: 14px; text-align: center; padding: 20px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; max-width: 420px; }
    .wait-msg { color: #64748b; font-size: 14px; text-align: center; padding: 20px; }
  </style>
</head>
<body>
<div id="stage"><div class="wait-msg" data-drawva-wait="1">Rendering ${escapeHtml(opts.label)}...</div></div>
<script>
(function () {
  var stage = document.getElementById("stage");
  var source = ${opts.sourceJson};
  var format = ${JSON.stringify(opts.format)};
  var estW = ${opts.estW};
  var estH = ${opts.estH};
  var compact = ${opts.compact ? "true" : "false"};
  var finished = false;

  function escapeMsg(msg) {
    return String(msg || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function showError(msg) {
    finished = true;
    stage.innerHTML = '<div class="err-msg">⚠️ ' + escapeMsg(msg) + "</div>";
  }
  function postNatural(w, h) {
    if (!(w > 2 && h > 2)) return;
    window.parent && window.parent.postMessage({
      type: "drawva-widget-resize-content",
      width: Math.min(3200, Math.max(120, Math.ceil(w))),
      height: Math.min(5000, Math.max(80, Math.ceil(h)))
    }, "*");
    window.parent && window.parent.postMessage({ type: "drawva-widget-updated" }, "*");
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.referrerPolicy = "no-referrer";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Could not load " + url)); };
      document.head.appendChild(s);
    });
  }
  function loadStyle(url) {
    return new Promise(function (resolve, reject) {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = url;
      l.referrerPolicy = "no-referrer";
      l.onload = function () { resolve(); };
      l.onerror = function () { reject(new Error("Could not load " + url)); };
      document.head.appendChild(l);
    });
  }
  function npmUrl(pkgPath) {
    return "https://cdn.jsdelivr.net/npm/" + pkgPath;
  }
  function unpkgUrl(pkgPath) {
    return "https://unpkg.com/" + pkgPath;
  }
  function loadScriptFallback(pkgPath) {
    return loadScript(npmUrl(pkgPath)).catch(function () { return loadScript(unpkgUrl(pkgPath)); });
  }
  function loadStyleFallback(pkgPath) {
    return loadStyle(npmUrl(pkgPath)).catch(function () { return loadStyle(unpkgUrl(pkgPath)); });
  }
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(label + " timed out")); }, ms);
      })
    ]);
  }
  function parseJson() {
    try { return typeof source === "string" ? JSON.parse(source) : source; }
    catch (e) { throw new Error(format + " source is not valid JSON"); }
  }

  function fitContent() {
    try {
      var svgEl = stage.querySelector("svg");
      var canvasEl = stage.querySelector("canvas");
      if (svgEl) {
        var naturalW = 0, naturalH = 0, pad = 12;
        try {
          var b = svgEl.getBBox();
          if (b && b.width > 2 && b.height > 2) {
            var declaredW = 0, declaredH = 0;
            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 2) {
              declaredW = svgEl.viewBox.baseVal.width;
              declaredH = svgEl.viewBox.baseVal.height;
            }
            var cropW = b.width + pad * 2, cropH = b.height + pad * 2;
            if (!declaredW || cropW < declaredW * 0.82 || cropH < declaredH * 0.82) {
              svgEl.setAttribute("viewBox", (b.x - pad) + " " + (b.y - pad) + " " + cropW + " " + cropH);
              naturalW = cropW;
              naturalH = cropH;
            }
          }
        } catch (e0) {}
        if (!naturalW && svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 2) {
          naturalW = svgEl.viewBox.baseVal.width;
          naturalH = svgEl.viewBox.baseVal.height;
        }
        if (!naturalW) {
          var attr = svgEl.getAttribute("viewBox");
          if (attr) {
            var p = attr.split(/[\\s,]+/).map(Number);
            if (p.length === 4 && p[2] > 2 && p[3] > 2) { naturalW = p[2]; naturalH = p[3]; }
          }
        }
        if (!naturalW) {
          var aw = parseFloat(svgEl.getAttribute("width") || "");
          var ah = parseFloat(svgEl.getAttribute("height") || "");
          if (aw > 2 && ah > 2 && String(svgEl.getAttribute("width") || "").indexOf("%") < 0) {
            naturalW = aw; naturalH = ah;
          }
        }
        if (naturalW > 2 && naturalH > 2) {
          svgEl.setAttribute("width", String(Math.ceil(naturalW)));
          svgEl.setAttribute("height", String(Math.ceil(naturalH)));
          svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svgEl.style.width = Math.ceil(naturalW) + "px";
          svgEl.style.height = Math.ceil(naturalH) + "px";
          svgEl.style.maxWidth = "100%";
          svgEl.style.maxHeight = "100%";
          postNatural(naturalW + 16, naturalH + 16);
          return;
        }
      }
      if (canvasEl) {
        var cw = canvasEl.width || canvasEl.getBoundingClientRect().width;
        var ch = canvasEl.height || canvasEl.getBoundingClientRect().height;
        if (cw > 2 && ch > 2) { postNatural(cw + 16, ch + 16); }
      }
    } catch (e3) {}
  }

  async function renderMermaid() {
    await loadScriptFallback("mermaid@10.9.1/dist/mermaid.min.js");
    var mermaid = window.mermaid;
    if (!mermaid || !mermaid.render) throw new Error("Mermaid did not initialize");
    var isDark = document.documentElement.classList.contains("dark") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: isDark ? "dark" : "default",
      themeVariables: {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "15px",
        darkMode: isDark,
        background: "transparent",
        mainBkg: isDark ? "#1e293b" : "#f8fafc",
        nodeBorder: isDark ? "#475569" : "#cbd5e1",
        nodeTextColor: isDark ? "#f1f5f9" : "#0f172a",
        lineColor: isDark ? "#94a3b8" : "#475569",
        textColor: isDark ? "#f1f5f9" : "#0f172a"
      },
      flowchart: { htmlLabels: false, curve: "basis" }
    });
    var res = await mermaid.render("m-" + Math.random().toString(36).slice(2, 9), source);
    stage.innerHTML = res.svg;
    fitContent();
  }
  async function renderDot() {
    var mod = await import("https://cdn.jsdelivr.net/npm/@viz-js/viz@3.9.0/lib/viz-standalone.mjs");
    var viz = await mod.instance();
    var svgElement = viz.renderSVGElement(source);
    stage.replaceChildren(svgElement);
    fitContent();
  }
  async function renderSmiles() {
    await loadScriptFallback("smiles-drawer@2.1.7/dist/smiles-drawer.min.js");
    var SD = window.SmilesDrawer;
    if (!SD || !SD.parse || typeof SD.SvgDrawer !== "function") throw new Error("SMILES renderer did not initialize");
    var tree = await new Promise(function (resolve, reject) {
      try { SD.parse(source, resolve, reject); }
      catch (err) { reject(err); }
    });
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    new SD.SvgDrawer({ width: estW, height: estH, bondThickness: 2, padding: 24, compactDrawing: compact })
      .draw(tree, svg, "light", null, false, []);
    if (!svg.childNodes.length) throw new Error("SMILES produced an empty drawing");
    stage.replaceChildren(svg);
    fitContent();
  }
  async function renderVega() {
    await loadScriptFallback("vega@5.30.0/build/vega.min.js");
    await loadScriptFallback("vega-lite@5.20.1/build/vega-lite.min.js");
    await loadScriptFallback("vega-embed@6.26.0/build/vega-embed.min.js");
    if (typeof window.vegaEmbed !== "function") throw new Error("Vega-Lite renderer did not initialize");
    var spec = parseJson();
    if (!spec.width) spec.width = 560;
    if (!spec.height) spec.height = 320;
    if (Array.isArray(spec.layer) && (!spec.transform || !spec.transform.length)) {
      var hoisted = [];
      for (var i = 0; i < spec.layer.length; i++) {
        var lyr = spec.layer[i];
        if (lyr && Array.isArray(lyr.transform)) {
          for (var j = 0; j < lyr.transform.length; j++) hoisted.push(lyr.transform[j]);
        }
      }
      if (hoisted.length) spec.transform = hoisted;
    }
    var vegaDiv = document.createElement("div");
    stage.replaceChildren(vegaDiv);
    await window.vegaEmbed(vegaDiv, spec, { actions: false, renderer: "svg" });
    fitContent();
    setTimeout(fitContent, 80);
  }
  async function renderBpmn() {
    await Promise.all([
      loadStyleFallback("bpmn-js@17.11.1/dist/assets/diagram-js.css"),
      loadStyleFallback("bpmn-js@17.11.1/dist/assets/bpmn-js.css"),
      loadStyleFallback("bpmn-js@17.11.1/dist/assets/bpmn-font/css/bpmn.css"),
      loadScriptFallback("bpmn-js@17.11.1/dist/bpmn-viewer.production.min.js")
    ]);
    if (typeof window.BpmnJS !== "function") throw new Error("BPMN renderer did not initialize");
    var bpmnDiv = document.createElement("div");
    bpmnDiv.style.width = "100%";
    bpmnDiv.style.height = "100%";
    bpmnDiv.style.position = "relative";
    stage.replaceChildren(bpmnDiv);

    var viewer = new window.BpmnJS({ container: bpmnDiv });
    await viewer.importXML(source);
    var canvas = viewer.get("canvas");
    canvas.zoom("fit-viewport", "auto");

    window.addEventListener("resize", function () {
      try { canvas.zoom("fit-viewport", "auto"); } catch (e) {}
    });

    try {
      var vb = canvas.viewbox();
      if (vb && vb.inner && vb.inner.width > 20 && vb.inner.height > 20) {
        var pad = 40;
        var naturalW = Math.min(3200, Math.max(estW, Math.ceil(vb.inner.width + pad * 2)));
        var naturalH = Math.min(2400, Math.max(estH, Math.ceil(vb.inner.height + pad * 2)));
        postNatural(naturalW, naturalH);
        setTimeout(function () {
          try { canvas.zoom("fit-viewport", "auto"); } catch (e2) {}
        }, 80);
        return;
      }
    } catch (e) {}

    postNatural(estW, estH);
  }
  async function renderCytoscape() {
    await loadScriptFallback("cytoscape@3.30.4/dist/cytoscape.min.js");
    if (typeof window.cytoscape !== "function") throw new Error("Cytoscape renderer did not initialize");
    var cyDiv = document.createElement("div");
    cyDiv.style.width = "100%";
    cyDiv.style.height = "100%";
    stage.replaceChildren(cyDiv);

    var elements = parseJson();
    var cy = window.cytoscape({
      container: cyDiv,
      elements: Array.isArray(elements) ? elements : (elements.elements || []),
      layout: { name: "cose", animate: false, fit: true, padding: 24 },
      style: [
        { selector: "node", style: { "background-color": "#ffffff", "border-color": "#2563eb", "border-width": 2, label: "data(label)", color: "#0f172a", "font-size": 14 } },
        { selector: "edge", style: { width: 2, "line-color": "#94a3b8", "target-arrow-color": "#94a3b8", "target-arrow-shape": "triangle", "curve-style": "bezier", label: "data(label)" } }
      ]
    });
    cy.fit(undefined, 24);
    postNatural(estW, estH);
  }
  async function renderGeo() {
    stage.style.width = estW + "px";
    stage.style.height = estH + "px";
    await Promise.all([
      loadStyleFallback("leaflet@1.9.4/dist/leaflet.css"),
      loadScriptFallback("leaflet@1.9.4/dist/leaflet.js")
    ]);
    if (!window.L || !window.L.map) throw new Error("GeoJSON renderer did not initialize");
    var mapDiv = document.createElement("div");
    mapDiv.style.width = "100%";
    mapDiv.style.height = "100%";
    stage.replaceChildren(mapDiv);
    var map = window.L.map(mapDiv).setView([20, 0], 2);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    var layer = window.L.geoJSON(parseJson()).addTo(map);
    if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds());
    postNatural(estW, estH);
  }

  async function render() {
    if (format === "mermaid") await renderMermaid();
    else if (format === "dot") await renderDot();
    else if (format === "smiles") await renderSmiles();
    else if (format === "vega-lite") await renderVega();
    else if (format === "bpmn-xml") await renderBpmn();
    else if (format === "cytoscape-json") await renderCytoscape();
    else if (format === "geojson") await renderGeo();
    else throw new Error("Unsupported diagram format: " + format);
  }

  setTimeout(function () {
    if (!finished && stage.querySelector("[data-drawva-wait]")) {
      var wait = stage.querySelector("[data-drawva-wait]");
      if (wait) wait.textContent = ${JSON.stringify(opts.label)} + " is still loading…";
    }
  }, 4000);

  withTimeout(render(), 15000, ${JSON.stringify(opts.label)})
    .then(function () { finished = true; })
    .catch(function (err) {
      if (finished && stage.querySelector("svg, canvas, .vega-embed, .leaflet-container, .djs-container")) return;
      showError((${JSON.stringify(opts.label)}) + " could not be rendered. " + (err && err.message ? err.message : String(err)));
    });
})();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] || c);
}
