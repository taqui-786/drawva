export interface DiagramFormat {
  id: string;
  label: string;
  aliases: string[];
}

export const DIAGRAM_FORMATS: DiagramFormat[] = [
  { id: "mermaid", label: "Mermaid", aliases: ["mermaid"] },
  { id: "dot", label: "Graphviz DOT", aliases: ["dot", "graphviz", "graphviz-dot", "graphviz dot"] },
  { id: "bpmn-xml", label: "BPMN XML", aliases: ["bpmn", "bpmn-xml", "bpmn2"] },
  { id: "vega-lite", label: "Vega-Lite JSON", aliases: ["vega-lite", "vegalite", "vega-lite-json"] },
  { id: "geojson", label: "GeoJSON", aliases: ["geojson", "geo-json"] },
  { id: "smiles", label: "SMILES", aliases: ["smiles"] },
  { id: "cytoscape-json", label: "Cytoscape JSON", aliases: ["cytoscape", "cytoscape-json"] },
];

export function normalizeDiagramFormat(format: string): string {
  const normalized = (format || "").trim().toLowerCase();
  for (const f of DIAGRAM_FORMATS) {
    if (f.id === normalized || f.aliases.includes(normalized)) {
      return f.id;
    }
  }
  return "mermaid";
}

export function responsiveMermaidSource(source: string, width: number = 600, height: number = 400): { source: string; direction: string } {
  const src = source || "";
  const match = /^(\s*(?:(?:%%[^\n]*)\n\s*)*)(flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/im.exec(src);
  if (!match || /%%\s*(?:penecho|drawva):fixed-layout\b/i.test(src)) {
    return { source: src, direction: "" };
  }

  const originalDir = match[3].toUpperCase();
  const horizontal = originalDir === "RL" ? "RL" : "LR";
  const vertical = originalDir === "BT" ? "BT" : "TB";
  const direction = width >= height * 1.35 ? horizontal : vertical;

  const responsiveDiagram = src.replace(match[0], `${match[1]}${match[2]} ${direction}`);
  return { source: responsiveDiagram, direction };
}

export function createDiagramHtml(sourceFormat: string, source: string, title: string = "Diagram"): string {
  const format = normalizeDiagramFormat(sourceFormat);
  const safeSource = escapeScriptTag(source);
  const safeTitle = escapeHtml(title);

  if (format === "mermaid") {
    const { source: responsiveSrc } = responsiveMermaidSource(safeSource);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #ffffff; font-family: system-ui, -apple-system, sans-serif; }
    body { display: flex; justify-content: center; align-items: center; box-sizing: border-box; padding: 12px; }
    #stage { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
    #stage svg { max-width: 100% !important; max-height: 100% !important; height: auto !important; }
  </style>
</head>
<body>
  <div id="stage"></div>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
    try {
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      const { svg } = await mermaid.render("mermaid-" + Math.random().toString(36).substring(2, 7), ${JSON.stringify(responsiveSrc)});
      document.getElementById("stage").innerHTML = svg;
    } catch (err) {
      document.getElementById("stage").innerHTML = "<pre style='color:red;padding:12px;'>" + err.message + "</pre>";
    }
  </script>
</body>
</html>`;
  }

  if (format === "dot") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #ffffff; font-family: system-ui, sans-serif; }
    body { display: flex; justify-content: center; align-items: center; box-sizing: border-box; padding: 12px; }
    #stage { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
    #stage svg { max-width: 100% !important; max-height: 100% !important; height: auto !important; }
  </style>
</head>
<body>
  <div id="stage">Rendering Graphviz DOT...</div>
  <script type="module">
    import { instance } from "https://cdn.jsdelivr.net/npm/@viz-js/viz@3.9.0/lib/viz-standalone.mjs";
    try {
      const viz = await instance();
      const svg = viz.renderSVGElement(${JSON.stringify(safeSource)});
      svg.style.width = "100%";
      svg.style.height = "100%";
      const stage = document.getElementById("stage");
      stage.innerHTML = "";
      stage.appendChild(svg);
    } catch (err) {
      document.getElementById("stage").innerHTML = "<pre style='color:red;padding:12px;'>" + err.message + "</pre>";
    }
  </script>
</body>
</html>`;
  }

  if (format === "vega-lite") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #ffffff; }
    #vis { width: 100%; height: 100%; box-sizing: border-box; padding: 12px; }
  </style>
</head>
<body>
  <div id="vis"></div>
  <script>
    try {
      const spec = JSON.parse(${JSON.stringify(safeSource)});
      vegaEmbed('#vis', spec, { actions: false, responsive: true });
    } catch (err) {
      document.getElementById('vis').innerHTML = "<pre style='color:red;padding:12px;'>" + err.message + "</pre>";
    }
  </script>
</body>
</html>`;
  }

  if (format === "smiles") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/openchemlib@8.12.0/dist/openchemlib-full.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #ffffff; display: flex; justify-content: center; align-items: center; }
    canvas { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <canvas id="chem-canvas" width="500" height="350"></canvas>
  <script>
    try {
      const smiles = ${JSON.stringify(safeSource.trim())};
      const molecule = OCL.Molecule.fromSmiles(smiles);
      const canvas = document.getElementById('chem-canvas');
      OCL.StructureView.drawMolecule(canvas, molecule);
    } catch (err) {
      document.body.innerHTML = "<pre style='color:red;padding:12px;'>" + err.message + "</pre>";
    }
  </script>
</body>
</html>`;
  }

  if (format === "cytoscape-json") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.0/dist/cytoscape.min.js"></script>
  <style>
    html, body, #cy { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #ffffff; }
  </style>
</head>
<body>
  <div id="cy"></div>
  <script>
    try {
      const elements = JSON.parse(${JSON.stringify(safeSource)});
      cytoscape({
        container: document.getElementById('cy'),
        elements: Array.isArray(elements) ? elements : (elements.elements || []),
        style: [
          { selector: 'node', style: { 'background-color': '#2563eb', 'label': 'data(label)', 'color': '#1e293b', 'font-size': '12px' } },
          { selector: 'edge', style: { 'width': 2, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
        ],
        layout: { name: 'cose', animate: false }
      });
    } catch (err) {
      document.getElementById('cy').innerHTML = "<pre style='color:red;padding:12px;'>" + err.message + "</pre>";
    }
  </script>
</body>
</html>`;
  }

  // Fallback pre-formatted renderer for other text formats
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 12px; width: 100%; height: 100%; box-sizing: border-box; background: #0f172a; color: #f8fafc; font-family: monospace; font-size: 13px; overflow: auto; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <pre><code>${escapeHtml(safeSource)}</code></pre>
</body>
</html>`;
}

function escapeScriptTag(str: string): string {
  return (str || "").replace(/<\/script>/gi, "<\\/script>");
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
