# 🔀 HOW PENECHO RENDERS AI-GENERATED FLOWCHARTS (04-FLOWCHART-RENDERING.md)

You asked specifically: "how does penecho render the flowcharts the AI
generates?" I read the real code — here's the full pipeline, from AI
response to pixels on canvas.

## The BIG picture

PenEcho does NOT draw flowcharts itself. It does this:

1. AI (the model) generates a **text source** for the diagram, in a known
   format — like Mermaid code or Graphviz DOT text. It puts it in a
   `diagram_source` command.
2. Client creates a **sandboxed iframe** ("widget") on the canvas.
3. Inside the iframe, a small runtime loads a **CDN diagram library**
   (mermaid, viz.js, bpmn-js, etc.) and renders the source to SVG.
4. The SVG is scaled to fill the iframe. The iframe is YOUR canvas widget.
5. On canvas export, the iframe is asked for a snapshot (html2canvas).

So the flowchart is a *web page inside the canvas*, not canvas pixels.
Clever and safe: the diagram library runs in a sandbox, the model never
executes code on the main canvas.

## The command the AI emits

From `public/plugins/flowchart/plugin.md`:

```json
{
  "tool": "diagram_source",
  "pluginId": "flowchart",
  "x": 1200,
  "y": 800,
  "w": 900,
  "h": 500,
  "title": "Auth flow",
  "diagramKind": "architecture",
  "sourceFormat": "mermaid",
  "source": "flowchart LR\n  A[Login] --> B{Valid?}\n  B -- yes --> C[Home]\n  B -- no --> D[Error]"
}
```

`sourceFormat` is an OPEN string — mermaid, dot, bpmn-xml, vega-lite,
geojson, smiles, cytoscape-json. The model picks whatever fits.

## Format registry (from runtime.js)

```js
const FORMATS = [
  { id: "mermaid",       label: "Mermaid" },
  { id: "dot",           label: "Graphviz DOT" },
  { id: "bpmn-xml",      label: "BPMN XML" },
  { id: "vega-lite",     label: "Vega-Lite JSON" },
  { id: "geojson",       label: "GeoJSON" },
  { id: "smiles",        label: "SMILES" },          // chemistry!
  { id: "cytoscape-json", label: "Cytoscape JSON" },
];
```

Each has an alias map (e.g. "graphviz" -> "dot") and a dedicated renderer.

## The renderers (loaded on demand from CDN)

```js
renderMermaid():
  import("https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs")
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base" })
  const { svg } = await mermaid.render("id-" + random, source)
  stage.innerHTML = svg
  // make svg fill the widget:
  svg.removeAttribute("height"); svg.style.width = "100%" ...

renderDot():
  import("https://cdn.jsdelivr.net/npm/@viz-js/viz@3.9.0/lib/viz-standalone.mjs")
  const viz = await instance()
  const svg = viz.renderSVGElement(source)   // Graphviz renders to SVG
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet")

renderBpmn():
  // BPMN business-process diagrams, loads bpmn-js 17.11.1 + fonts
  const viewer = new BpmnJS({ container: stage })
  await viewer.importXML(source)
  viewer.get("canvas").zoom("fit-viewport")

renderVegaLite(): vega + vega-lite + vega-embed (charts!)
renderGeoJson():   Leaflet (maps!) with GCJ-02 coordinate conversion
renderSmiles():    SmilesDrawer (chemical structures!)
renderCytoscape(): Cytoscape.js graphs
```

Version PINNED (mermaid@10.9.1 etc.) and loaded with crossOrigin + no-referrer.
Exact version pinning = reproducible rendering. Do the same.

## Responsive re-layout (the smart part)

Mermaid flowcharts default to one direction. PenEcho rewrites the source
based on widget aspect ratio, then re-renders on resize:

```js
function responsiveMermaidSource(source, width, height) {
  // if user wrote %% penecho:responsive or >10 connectors:
  // pick LR (horizontal) when width >= height * 1.35, else TB (vertical)
  const direction = width >= height * 1.35 ? "LR" : "TB";
  return source.replace(/flowchart\s+(LR|RL|TB|TD|BT)/, `flowchart ${direction}`);
}
```

Graphviz DOT: renders BOTH orientations and swaps to whichever scales best:

```js
const best = layouts.reduce((winner, layout) => {
  const scale = Math.min(width / layout.intrinsicWidth, height / layout.intrinsicHeight);
  ...choose the layout with the largest readable scale...
}, null)
```

ResizeObserver on the stage → debounced 80ms → re-render. 9s timeout shows
"still loading" status; errors show friendly message; `postMessage` tells
the parent when the diagram is ready (penecho-widget-updated) — the parent
uses this for PNG snapshots.

## Widget iframe plumbing (from canvas-runtime.js + widget-host.html)

The canvas places an iframe at (x,y,w,h) in WORLD coords, CSS-transformed
with the camera. Communication is postMessage only:

- parent → iframe: `penecho-widget-init` { title, html }
- iframe → parent: `penecho-widget-host-ready`
- parent → iframe: `penecho-widget-state` { selected, active, scaleX, scaleY }
- iframe → parent: `penecho-widget-updated` (content rendered)
- parent → iframe: `penecho-widget-snapshot-request` { requestId }
- iframe → parent: `penecho-widget-snapshot` { requestId, dataUrl }

The diagram runtime is injected as a self-contained HTML document (a
<script> with a serialized config + the renderer functions) — see
`documentFor()` in runtime.js which builds the full iframe document.

For export: html2canvas (vendored, 1.4.1) snapshots the iframe content to
a data URL which the parent composites into the export PNG.

## Security model (copy this)

- Widget iframe is sandboxed? No — it's same-origin iframe, BUT the content
  is generated by the model. The plugin SYSTEM PROMPT tells the model:
  - "never include secrets; never navigate; no cookies/storage; use
    credentials:'omit' for data requests"
  - "no frames, no forms, no cookies"
  - allowed: arbitrary HTTPS scripts/styles/images (that's how libraries load)
- Everything diagram-related runs inside the iframe, isolated from the
  main canvas page. The model never executes on the main canvas context.
- Sizes/limits: source <= 100KB; widget geometry clamped to bounds derived
  from half the visible viewport; refreshSeconds 60..86400 for live widgets.

## What YOU should build for the same thing

Phase 1 (no AI yet):
1. A `widgetLayer` DOM container with CSS transform per widget.
2. A `widget-host.html` shell receiving { title, html } via postMessage.
3. A demo widget: static HTML demo to prove the bridge (render → notify →
   snapshot).
4. For diagrams specifically: mermaid installed as an npm dep (not CDN —
   you're in Next.js; bundle it or dynamic import), a `<MermaidViewer>`
   component that takes raw source and renders SVG.
5. Export: snapshot the widget (SVG serialization is cleaner than
   html2canvas for SVG diagrams — mermaid SVGs serialize fine).

Phase 2 (AI):
- `diagram_source` command → executor creates widget with the plugin's
  renderer keyed to sourceFormat. Model emits source text; you render it.
Real diagram formats wall are: mermaid (flowcharts), dot (graphviz), and
plain HTML/SVG fallback (the General HTML widget). That covers ~90% of
use cases. bpmn/vega/smiles/geojson = nice-to-have later.