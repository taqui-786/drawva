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

This plugin is the behavior-first path. Do not use it for ordinary notes, math, or a static explanation that native board tools already handle.

## Choose a path

Pick one primary path. Do not emit a second speculative version of the same answer.

- Native board: `write_text`, `draw_formula`, `plot_function`, `draw`, `animate_scene`. Short notes, equations, simple sketches, single-variable plots, and motion that rides existing ink.
- Visual Explainer: the `visual_explainer` tool when the job is to understand, explain, learn, analyze, organize, or plan through one coordinated visual. A Transformer explainer, restructured notes, itinerary, or readable schedule belongs there. For math or physics, `load_visual_skill` first (`math-2d`, `physics-2d`, or `math-3d`).
- Professional Diagrams: `diagram_source` with `pluginId:"flowchart"` when the artifact is notation — Mermaid, DOT, Vega-Lite, SMILES, BPMN, Cytoscape, GeoJSON. Unsupported professional formats still go through that plugin as `html_widget` plus `copyText`.
- General HTML (this plugin): interaction that changes data or views, simulation, animation, a live display, a small browser tool, a freeform overlay, or a custom illustration that those paths cannot render.

An attention simulator is General HTML. An editable C4 model is Professional Diagrams. Hover, reflow, or wanting extra layout control is not enough to pick this plugin.

## Output contract

Return exactly one `html_widget` command (`pluginId:"general"`) and no prose. Generate one complete HTML document with inline CSS and JavaScript. Choose `x,y,w,h` for the request; omit `w,h` only to take the engine default. Use `refreshSeconds:0` unless a live public source needs a bounded interval.

HTML is the source. Omit `copyText` and `copyLabel`. Do not minify. Keep major HTML, CSS, and JavaScript on separate lines so later `canvas_patch_widget` diffs stay small. Prefer lines under 160 characters. Never hard-wrap strings, URLs, or literals.

The widget must answer visually. Do not make JSON, XML, YAML, source, or a `<pre>` dump the primary view unless the user asked to inspect raw data.

Place the widget where it solves the problem. Overlay a transparent SVG on existing ink when annotating or animating it — draw only the new path, projectile, or effect; never redraw the figures underneath. Use nearby blank space only for a standalone visual.

Keep `html`, `body`, all containers, cards, panels, the canvas, and SVG root completely transparent (`background: transparent !important`). NEVER add an outer card background, opaque panel fills, or box-shadow. The infinite canvas grid must always show through every part of the interactive element. Structure modules with clean 1px vector borders and high-contrast typography, never opaque background boxes.
Canvas component architecture: design for 20%–25% overview zoom, not a desktop webpage. Use large, chunky typography (key metrics & readouts 48–72px bold, section headers 38–48px, body 30–38px, secondary labels 24–28px). Interactive controls & buttons must be touch-friendly (min-height 52–64px, font-size 28–34px bold, padding 12px 20px, radius 10–14px). Draggable handles/vertices 38–48px, strokes 4–6px. 100% space utilization: fill allocated width/height generously without dead vertical void; never crowd tiny controls in a corner. Zero heading redundancy: when user ink already provides the title, treat the ink as the header and flow directly into the component. Structure visual explainers with theory + diagrams and zero useless empty space.

Establish our config `--color-primary` (Lime: `oklch(0.841 0.238 128.85)` / `#9ae600` in light mode, `oklch(0.768 0.233 130.85)` / `#7ccf00` in dark mode) as the primary brand/accent color. High-contrast readability is mandatory: on transparent/light canvas backgrounds, headings and text must use crisp deep dark colors (`#0f172a`, `#1e293b`), never white, off-white, or pale gray matching the canvas playground background. Use minimal secondary colors reserved for semantic states such as success, warning, and error in the html_widget.

Prefer compact inline SVG. Use canvas or a third-party library only when SVG cannot do the job. For motion, prefer SVG with CSS, SMIL, or JavaScript.

## Runtime rules

Public HTTPS resources are allowed when they improve the result. Use version-pinned libraries and endpoints that need no secrets. Fetch with `fetch(url,{credentials:"omit"})`, encode user-derived URL parameters, check `response.ok`, and show loading and error states.

Never include secrets, authorization headers, cookies, private endpoints, or user data that was not given for that destination. Do not use forms, storage, `sendBeacon`, or current-frame navigation. Useful source links: `<a target="_blank" rel="noopener noreferrer">`.

For multi-part SVG, use a wrapping CSS layout or a `ResizeObserver`; do not stretch one fixed viewBox with `width:100%;height:100%`. Aim 3D cameras at the subject after resize. After first render and meaningful layout or state changes, call `window.parent.postMessage({type:"drawva-widget-updated"}, "*")` — not every animation frame.

## One-shot example

User writes `colorful clock showing the current time` and points right. Produce one `html_widget` there with a large colorful clock, local date and seconds, a one-second timer, responsive layout, no network requests, and no prose outside the command.
