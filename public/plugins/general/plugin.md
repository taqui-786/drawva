---
drawva-plugin: 1
id: general
name: General HTML
version: 1
description: Self-contained HTML/SVG for overlays, simulations, applets, and custom interactive visuals.
category: Creative
source: Public HTTPS web
connect:
recommended-refresh-seconds: 60
---

# General HTML
Behavior-first; not ordinary notes/math/static explanations handled by native tools.

## Choose a path
Pick ONE, never a second speculative version:
- Native `write_text`, `draw_formula`, `plot_function`, `draw`, `animate_scene`: short notes/equations/simple sketches/single-variable plots/motion riding ink.
- TOP-LEVEL `visual_explainer`: understand/explain/learn/analyze/organize/plan. Transformer explainer, restructured notes, itinerary, readable schedule. Math/physics → load_visual_skill math-2d/physics-2d/math-3d first.
- Professional `diagram_source`, pluginId flowchart: Mermaid/DOT/Vega-Lite/SMILES/BPMN/Cytoscape/GeoJSON; unsupported formats → that plugin's html_widget + copyText.
- General HTML: interaction changing data/views, simulation, animation, live display, small browser tool, freeform overlay/custom visual those paths cannot render. Explicit draw/sketch requests still use native draw.
Attention simulator → General HTML; editable C4 model → Professional Diagrams. Hover/reflow/layout control alone is not an applet requirement.

## Output contract
One complete inline HTML/CSS/JS `html_widget` inside canvas_apply, pluginId general; x/y/w/h for target (omit w/h only for engine default), refreshSeconds:0 unless live documented source needs bounded refresh. No prose during tool steps; short closing bubble afterwards.
HTML is source: omit copyText/copyLabel, no minification. Separate major HTML/CSS/JS lines, prefer <160 chars, never hard-wrap literals/URLs/strings. Primary view is visual, not JSON/XML/YAML/source/<pre> unless explicitly requested.
Delta-only transparent SVG overlay at referenced ink: new path/projectile/effect, never redraw figures. Use placement:"overlay" to preserve ink; in_place is for explicit replacement. Blank space only for standalone visuals.
All html/body/containers/cards/panels/canvas/SVG transparent !important, no opaque fills/shadows; clean 1px structure borders, dark typography. Ink supplies heading. Design at 20%–25% zoom: metrics 48–72px bold, headers 38–48px, body 30–38px, secondary 24–28px; buttons 52–64px high, font 28–34px bold, padding 12px 20px, radius 10–14px; handles 38–48px, strokes 4–6px. Fill space, no tiny corner controls/dead voids; theory accompanies diagrams in the explainer path.
--color-primary Lime: oklch(0.841 0.238 128.85)/#9ae600; dark oklch(0.768 0.233 130.85)/#7ccf00. Text #0f172a/#1e293b, never white/off-white/pale gray on light board. Minimal secondary success/warning/error colors.
Prefer inline SVG; canvas/library only when SVG insufficient. Motion via CSS/SMIL/JS.

## Runtime rules
Public HTTPS assets/version-pinned libraries may improve output; no secrets. Prefer a matching live plugin; otherwise resolve/verify the public source through tools before authoring live fetches. No invented endpoints or widget-side photo/search APIs. Use credentials:"omit", encoded URL params, response.ok, loading/error states; tool-resolved static media/data is allowed.
No authorization headers, cookies, private endpoints, unrelated user data, forms, storage, sendBeacon, current-frame navigation. Source links: <a target="_blank" rel="noopener noreferrer">.
Multi-part SVG: wrapping CSS/ResizeObserver, never stretch fixed viewBox with width:100%;height:100%. Aim 3D camera at subject after resize. First render/meaningful changes → window.parent.postMessage({type:"drawva-widget-updated"},"*"), not every animation frame.

## One-shot example
`colorful clock showing the current time` + right arrow → one html_widget there: large colorful clock, local date/seconds, one-second timer, responsive layout, no network, no prose outside tool call during execution.
"Make them throw a ball" with two ink figures → prefer native animate_scene; if genuine controls are requested, transparent delta-only overlay between their measured hands, not duplicated figures.
