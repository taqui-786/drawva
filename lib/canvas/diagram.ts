import { DIAGRAM_SOURCE_FORMATS } from "./commands";

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

  // If title or source indicates SMILES / chemical molecule:
  if (
    norm === "smiles" ||
    /smiles|molecule|chemical|c1ccccc1|aspirin|c@/i.test(tit) ||
    (/^[A-Za-z0-9@+\-\[\]\(\)\\\/%=#$]+$/.test(src) &&
      !/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|digraph|subgraph)/i.test(src) &&
      (/[cCnNoOpPsS]/.test(src) && (src.includes("=") || src.includes("(") || src.includes("1") || src.includes("@"))))
  ) {
    return "smiles";
  }

  // If JSON structure:
  if (src.startsWith("{") || src.startsWith("[")) {
    if (/\"\$schema\"|\"mark\"|\"encoding\"|\"data\"/i.test(src)) return "vega-lite";
    if (/\"nodes\"|\"edges\"|\"elements\"/i.test(src)) return "cytoscape-json";
    if (/\"FeatureCollection\"|\"geometry\"|\"coordinates\"/i.test(src)) return "geojson";
  }

  // If XML structure:
  if (/<\?xml|<bpmn|<definitions/i.test(src)) return "bpmn-xml";

  // If DOT graph:
  if (/^\s*(di)?graph\s*(\w+)?\s*\{/i.test(src)) return "dot";

  // If norm is a recognized valid format:
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

  // Auto-quote unquoted labels containing special characters like parentheses, colons, formulas, etc.
  s = s.replace(/(\b[A-Za-z0-9_]+)\[([^"\]\r\n][^\]\r\n]*)\]/g, (match, id, label) => {
    if (/[()\[\]{}":;=<>#]/.test(label)) {
      const cleanLabel = label.replace(/"/g, "'");
      return `${id}["${cleanLabel}"]`;
    }
    return match;
  });

  return s;
}

async function renderMermaid(source: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    flowchart: { htmlLabels: false },
  });
  const id = `dm-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const result = await mermaid.render(id, source);
  return result.svg || "";
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

  if (format === "bpmn-xml" || format === "cytoscape-json" || format === "geojson") {
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

  if (format === "mermaid") {
    const { source: responsive } = responsiveMermaidSource(effectiveSource, 800, 500);
    try {
      const svg = await renderMermaid(responsive);
      if (svg) {
        const dims = extractSvgDimensions(svg) ?? estimateDiagramDimensions("mermaid", effectiveSource, diagramKind);
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:max-content;max-width:100%;height:auto;min-height:0;overflow:hidden;background:transparent!important;box-sizing:border-box}#stage{width:max-content;height:auto;min-height:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:8px}#stage svg{width:auto;height:auto;display:block;margin:auto}</style></head><body><div id="stage">${svg}</div><script>function fitServerSvg(){try{const s=document.querySelector("#stage svg");if(!s)return;let w=0,h=0;if(s.viewBox&&s.viewBox.baseVal&&s.viewBox.baseVal.width>2){w=s.viewBox.baseVal.width;h=s.viewBox.baseVal.height}if(!w){const a=s.getAttribute("viewBox");if(a){const p=a.split(/[\\s,]+/).map(Number);if(p.length===4&&p[2]>2&&p[3]>2){w=p[2];h=p[3]}}}if(!w){const aw=parseFloat(s.getAttribute("width"));const ah=parseFloat(s.getAttribute("height"));if(aw>2&&ah>2&&!String(s.getAttribute("width")||"").includes("%")){w=aw;h=ah}}if(w>2&&h>2){s.setAttribute("width",String(w));s.setAttribute("height",String(h));s.style.width=w+"px";s.style.height=h+"px";s.style.maxWidth="none";window.parent?.postMessage({type:"drawva-widget-resize-content",width:Math.ceil(w+16),height:Math.ceil(h+16)},"*")}}catch(e){}}window.addEventListener("DOMContentLoaded",fitServerSvg);setTimeout(fitServerSvg,50);setTimeout(fitServerSvg,300);</script></body></html>`;
        return { html, width: dims.width, height: dims.height };
      }
    } catch (e) {
      console.warn("[Diagram Renderer] Mermaid pre-render failed, using fallback:", e);
    }
  }

  const dims = estimateDiagramDimensions(format, effectiveSource, diagramKind);
  const encodedSource = JSON.stringify(effectiveSource);
  const isCompact =
    diagramKind === "molecular-structure-compact" ||
    diagramKind === "compact" ||
    /compact/i.test(diagramKind || "");
  const estW = dims.width;
  const estH = dims.height;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; width: max-content; max-width: 100%; height: auto; min-height: 0; overflow: hidden; background: transparent !important; font-family: system-ui, -apple-system, sans-serif; }
    #stage { width: max-content; height: auto; min-height: 0; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 8px; background: transparent !important; }
    #stage svg, #stage canvas { width: auto; height: auto; display: block; }
    .err-msg { color: #b91c1c; font-size: 14px; text-align: center; padding: 20px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; }
  </style>
</head>
<body>
<div id="stage">Rendering ${escapeHtml(formatLabel(format))}...</div>
<script type="module">
(async () => {
  const stage = document.getElementById("stage");
  const source = ${encodedSource};
  const format = ${JSON.stringify(format)};
  const estW = ${estW};
  const estH = ${estH};

  function showError(msg) {
    stage.innerHTML = '<div class="err-msg">⚠️ ' + String(msg || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) + '</div>';
  }

  function postNatural(w, h) {
    if (!(w > 2 && h > 2)) return;
    window.parent?.postMessage({
      type: "drawva-widget-resize-content",
      width: Math.min(3200, Math.max(120, Math.ceil(w))),
      height: Math.min(5000, Math.max(80, Math.ceil(h))),
    }, "*");
  }

  try {
    if (format === "mermaid") {
      const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        flowchart: { htmlLabels: false },
      });
      const id = "m-" + Math.random().toString(36).substring(2, 9);
      const res = await mermaid.render(id, source);
      stage.innerHTML = res.svg;
      fitContent();
    } else if (format === "dot") {
      const { instance } = await import("https://cdn.jsdelivr.net/npm/@viz-js/viz@3.9.0/lib/viz-standalone.mjs");
      const viz = await instance();
      const svgElement = viz.renderSVGElement(source);
      stage.replaceChildren(svgElement);
      fitContent();
    } else if (format === "smiles") {
      const { default: SmilesDrawer } = await import("https://cdn.jsdelivr.net/npm/smiles-drawer@2.1.7/+esm");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      SmilesDrawer.parse(source, (tree) => {
        new SmilesDrawer.SvgDrawer({ width: estW, height: estH, bondThickness: 2, compactDrawing: ${isCompact} })
          .draw(tree, svg, "light", null, false, []);
        stage.replaceChildren(svg);
        fitContent();
      }, (err) => showError("SMILES Parse Error: " + err));
    } else if (format === "vega-lite") {
      const [{ default: vega }, { default: vegaLite }, { default: vegaEmbed }] = await Promise.all([
        import("https://cdn.jsdelivr.net/npm/vega@5.30.0/+esm"),
        import("https://cdn.jsdelivr.net/npm/vega-lite@5.19.0/+esm"),
        import("https://cdn.jsdelivr.net/npm/vega-embed@6.26.0/+esm")
      ]);
      const rawSpec = typeof source === "string" ? JSON.parse(source) : source;
      const spec = { ...rawSpec };
      if (!spec.width) spec.width = 560;
      if (!spec.height) spec.height = 320;
      await vegaEmbed(stage, spec, { actions: false });
      setTimeout(fitContent, 80);
      fitContent();
    } else if (format === "bpmn-xml") {
      stage.style.width = estW + "px";
      stage.style.height = estH + "px";
      const { default: BpmnJS } = await import("https://cdn.jsdelivr.net/npm/bpmn-js@17.11.1/+esm");
      const viewer = new BpmnJS({ container: stage });
      await viewer.importXML(source);
      viewer.get('canvas').zoom('fit-viewport');
      postNatural(estW, estH);
    } else if (format === "cytoscape-json") {
      stage.style.width = estW + "px";
      stage.style.height = estH + "px";
      const { default: cytoscape } = await import("https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/+esm");
      const elements = typeof source === "string" ? JSON.parse(source) : source;
      cytoscape({
        container: stage,
        elements: Array.isArray(elements) ? elements : (elements.elements || []),
        layout: { name: 'cose', animate: false, fit: true, padding: 24 },
        style: [
          { selector: 'node', style: { 'background-color': '#ffffff', 'border-color': '#2563eb', 'border-width': 2, 'label': 'data(label)', 'color': '#0f172a', 'font-size': 14 } },
          { selector: 'edge', style: { 'width': 2, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'label': 'data(label)' } }
        ]
      });
      postNatural(estW, estH);
    } else if (format === "geojson") {
      stage.style.width = estW + "px";
      stage.style.height = estH + "px";
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const { default: L } = await import("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm");
      const mapDiv = document.createElement("div");
      mapDiv.style.width = "100%";
      mapDiv.style.height = "100%";
      stage.replaceChildren(mapDiv);
      const map = L.map(mapDiv).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      const geoData = typeof source === "string" ? JSON.parse(source) : source;
      const layer = L.geoJSON(geoData).addTo(map);
      if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds());
      postNatural(estW, estH);
    }
  } catch (err) {
    showError(err.message || String(err));
  }

  function fitContent() {
    try {
      const embed = stage.querySelector(".vega-embed");
      if (embed) {
        const r = embed.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) {
          postNatural(r.width + 16, r.height + 16);
          return;
        }
      }
      const svgEl = stage.querySelector("svg");
      const canvasEl = stage.querySelector("canvas");
      if (svgEl) {
        let naturalW = 0;
        let naturalH = 0;
        if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 2) {
          naturalW = svgEl.viewBox.baseVal.width;
          naturalH = svgEl.viewBox.baseVal.height;
        }
        if (!naturalW) {
          const attr = svgEl.getAttribute("viewBox");
          if (attr) {
            const p = attr.split(/[\s,]+/).map(Number);
            if (p.length === 4 && p[2] > 2 && p[3] > 2) {
              naturalW = p[2];
              naturalH = p[3];
            }
          }
        }
        if (!naturalW) {
          const aw = parseFloat(svgEl.getAttribute("width") || "");
          const ah = parseFloat(svgEl.getAttribute("height") || "");
          if (aw > 2 && ah > 2 && !String(svgEl.getAttribute("width") || "").includes("%")) {
            naturalW = aw;
            naturalH = ah;
          }
        }
        if (!naturalW) {
          try {
            const b = svgEl.getBBox();
            if (b && b.width > 2 && b.height > 2) {
              naturalW = b.width;
              naturalH = b.height;
            }
          } catch (e) {}
        }
        if (naturalW > 2 && naturalH > 2) {
          svgEl.setAttribute("width", String(naturalW));
          svgEl.setAttribute("height", String(naturalH));
          svgEl.style.width = naturalW + "px";
          svgEl.style.height = naturalH + "px";
          svgEl.style.maxWidth = "none";
          postNatural(naturalW + 16, naturalH + 16);
        }
      } else if (canvasEl) {
        const cw = canvasEl.width || canvasEl.getBoundingClientRect().width;
        const ch = canvasEl.height || canvasEl.getBoundingClientRect().height;
        if (cw > 2 && ch > 2) {
          postNatural(cw + 16, ch + 16);
        }
      }
    } catch (e) {}
  }
})();
</script>
</body>
</html>`;

  return { html, width: estW, height: estH };
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
