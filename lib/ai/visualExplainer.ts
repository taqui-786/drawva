export const VISUAL_EXPLAINER_SOURCE_FORMAT = "drawva-visual-explainer+html";
export const VISUAL_EXPLAINER_FRAMEWORK_VERSION = "drawva-visual-explainer/1";

export function isVisualExplainer(sourceFormat?: string, frameworkVersion?: string): boolean {
  return sourceFormat === VISUAL_EXPLAINER_SOURCE_FORMAT && frameworkVersion === VISUAL_EXPLAINER_FRAMEWORK_VERSION;
}

export const VISUAL_EXPLAINER_CONTRACT = `== VISUAL EXPLAINER ==
Default path for understand / explain / learn / analyze / organize / plan — even if the user never says "infographic". One coordinated HTML visual on the board. Yields when the job is only to edit existing ink, or when the defining result is interaction, simulation, live data, a small applet, or a professional diagram.

Do not decorate first. Rank the information, then pick the structure that carries it.

## Concise document mode
Turn this on immediately (do not ask) when the user wants simple, concise, at-a-glance, visual-first, one-page, slides, a deck, a handout, export/print, or a straightforward concept. Words like explain/analyze/learn alone do not force it — keep full depth when they asked for comprehensive detail.

Concise mode keeps the 3–5 second overview. Prefer diagrams, arrows, comparisons, small tables, short labels. Each module is a title plus one short line or 1–3 labels. Required facts stay; extra prose goes.

## 1. Information architecture
Level 1 — overview (3–5 seconds): 4–8 major parts. Pick the grammar that fits: pipeline, layered system, causal graph, hub-and-spoke, timeline, comparison, matrix, hierarchy, feedback loop, spatial map. Do not force a pipeline on a non-sequence.

Level 2 — panels (~30 seconds): normally 3–5 labeled panels (A, B, C…) each zooming one overview part. Flows, mini charts, tables, equations, trees, timelines, matrices.

Level 3 — micro (up to ~3 minutes): numbers, formulas, thresholds, assumptions, constraints, exceptions. Short labels, not paragraphs.

## 2. Hierarchy
Title → subtitle → overview → panels → micro notes. A compact key-facts badge near the title when useful (scale, time, accuracy, assumptions).

## 3. Visual grammar
Colors encode meaning, not decoration. A useful default: blue=inputs/foundations, teal=transform, green=stable/output, orange=core mechanism, purple=rules/edge cases, red=risks. Adapt to nearby ink. Arrows only for real flow, dependency, causality, or feedback. Rounded modules, thin borders, numbered stages, small tables. No stock-art icons unless they carry information.

## 4. Density
High information, no clutter. Each large module: one idea, 2–5 supporting facts, one visual cue. Whitespace separates groups. No huge empty decorative areas.

## 5. Typography
Technical sans-serif unless asked otherwise. Readable in the focused widget. Labels 2–8 words. Bold headings, aligned numbers, consistent terms. Widget w/h are world units — body ~clamp(28px,1.2cqw,44px), headings larger. On a nonempty board, canvas_scan plannedWidget with bodyPx/titlePx first and reuse the proposed box.

## 6. Accuracy
Do not invent numbers. Omit, describe qualitatively, or mark as illustrative. Relationships must match the topic. Web facts need a tool result and a cited URL.

## 7. Style
Conference-paper figure / systems diagram / technical poster. Light inner surface is fine; keep html/body/outer stage transparent so the board shows around it. Crisp vectors. No photorealism, glossy 3D, unnecessary gradients, cartoons, or decorative illustration.

## 8. Composition
Landscape when it helps; do not force a layout that weakens the explanation. A useful default when it fits: title+metrics on top, system map, then 2–3 mechanism panels, then a compact summary. The viewer should see: what it is, major parts, how they relate, what happens inside, which numbers/rules matter, the conclusion. Use the user's language.

## Invocation
Call the visual_explainer tool once this turn with one complete HTML document (inline CSS/SVG, only the JS that helps). First paint must already be useful with JS off. Markers are stamped for you: sourceFormat ${VISUAL_EXPLAINER_SOURCE_FORMAT}, frameworkVersion ${VISUAL_EXPLAINER_FRAMEWORK_VERSION}, pluginId general, refreshSeconds 0. Omit copyText. Do not minify. Stable multiline HTML for later canvas_patch_widget.

On an empty board, pick finite w/h and place it. Otherwise canvas_scan with plannedWidget, then pass that x,y,w,h. One visual_explainer per user turn; refine with canvas_patch_widget on widget.html. If the HTML would take ~a minute, ship a runnable scaffold at final size, then fill sections with patches. After render, postMessage {type:"drawva-widget-updated"}. Call window.drawvaWidgetReady() after a scientific Manim scene settles.

For mathematics or physics, call load_visual_skill with math-2d, physics-2d, or math-3d before authoring. Put exactly one <meta name="drawva-visual-skill" content="…"> in the HTML. Import Manim-Web only as https://cdn.jsdelivr.net/npm/manim-web@0.3.24/dist/manim-web.browser.js inside an inline script type=module. Static SVG first; Manim explains motion. Do not load a skill for unrelated subjects.

Do not use write_text as the main answer for a substantial explanation. Do not use ordinary html_widget (that is behavior-first). Do not use diagram_source unless the deliverable is professional notation.`;
