export const VISUAL_EXPLAINER_SOURCE_FORMAT = "drawva-visual-explainer+html";
export const VISUAL_EXPLAINER_FRAMEWORK_VERSION = "drawva-visual-explainer/1";

export function isVisualExplainer(sourceFormat?: string, frameworkVersion?: string): boolean {
  return sourceFormat === VISUAL_EXPLAINER_SOURCE_FORMAT && frameworkVersion === VISUAL_EXPLAINER_FRAMEWORK_VERSION;
}

export const VISUAL_EXPLAINER_CONTRACT = `== VISUAL EXPLAINER ==
Tool for visual infographics combining theory + diagrams. ANTI-CRAMMING MANDATE: For beginner educational requests ("explain", "explain me", "understand", "learn", "teach me", "what is"), NEVER cram an entire multi-part curriculum into one massive, dense 1800px card with 8 sections. Follow SECTION 4A MASTER TEACHER MODE: construct a clean, modular Whiteboard Classroom Suite (Card #01 Foundation from zero, Card #02 Worked Numbers & Example, Card #03 Cheat Sheet & Visual Notes, Card #04 Interactive/Animated Playground) connected spatially with directional arrows. If visual_explainer is used directly, keep it strictly focused as the core concept card and allow companion cards/notes to breathe. Yield to existing-ink edits, explicit sketchnotes, or professional notation.

## Integration
- Directly on whiteboard, not a floating card/modal/desktop window. "Photosynthesis" / "Quantization" ink IS the title: omit duplicate <h1>/hero banner; start with category framing/subtitle, primary diagram, reaction formulas, or core cards below ink. Hero title only when no written title exists.
- Beginner lesson structure: plain-language hook & relatable analogy → definition from zero → labeled mechanism → step-by-step worked arithmetic example → cheat sheet notes with formulas & trade-offs → interactive/animated playground. Define unfamiliar terms before use and show a concrete numeric transformation when the subject has one. Example "Explain quantization": FP32/INT8 bucket visual + Q(x)=round(x/S)+Z legend + x=1.37 worked mapping + 32/8=4× memory arithmetic with hardware caveat; never claim universal latency gains.
- html/body/#stage/outer wrappers AND modules/cards/chips: background:transparent !important; no opaque/semi-opaque/white/dark window fills, no box-shadow anywhere. Grid visible through every module.
- Crisp vector borders, e.g. 1.5px solid rgba(0,0,0,0.12) (light) or rgba(255,255,255,0.15) (dark), radius 8–12px. Drawn-layout compartments remain borderless per agent placement rules.

## Notebook typography (20%–25% zoom; not microscopic 11–14px web text)
Hero 56–68px/700, tracking -0.02em (omit duplicate title); framing 30–36px/500, muted readable color; section headings 38–48px/600; panel titles/key-concept badges 32–38px/600; body theory 28–34px, line-height 1.45–1.55; metrics 48–68px bold aligned with units; diagram/flowchart/chip labels 24–30px; footnotes/meta 22–26px. Never below 22px. This explainer-specific scale overrides applet type defaults.
Dense, balanced, purposeful: theory beside/above its corresponding diagram, no giant bottom void. Content-fitting aspect examples: 1400×900 focused, 1600×1000 landscape, 1800×1100 multi-panel, 1200×1600 vertical timeline/article. Fit these to maxWidgetSize rather than requesting an oversized frame.

## Six layout archetypes (omit any headline already supplied by ink)
1. Useful Bait / Key Points: headline → hero diagram (~40–50% height) → 2×2 takeaway cards → large side-by-side visual/text callout → 3 bottom highlights. Concept summaries, feature overviews, executive briefs, essential facts.
2. Versus / Comparison: title+criteria → balanced Option A/Option B columns with parallel points → central criteria spine/matrix → comparative summary → bottom badges/radar/indicator chips. REST vs GraphQL, Docker vs VM, pros/cons, trade-offs, before/after.
3. Heavy Data: title → conceptual network hub/radial data chips → connected horizontal metrics (percentages/benchmarks/throughput) → detailed breakdown, 48px+ stats, comparative bar meters. Performance benchmarks, data-intensive topics, statistical reports, telemetry, quantitative comparisons.
4. Road Map: title → winding serpentine/S-curve SVG through sequential stages → milestone boxes with step numbers/icons/diagrams/theory → destination/outcome. Step-by-step processes, workflows, development roadmaps, algorithmic execution stages, user journeys.
5. Timeline: title → thick vertical spine/milestone dots → alternating left/right cards → circular date/version badges + theory/change notes → base summary chips. Technology history, version progression, project milestones, sequential causal chains.
6. Visualized Article: editorial headline/subtitle → left data chart/architectural SVG + right theory narrative → central spotlight circle/bullets → bottom multi-column analysis + takeaway. "Explain LLM", "How Transformers Work": extensive theory with multi-stage diagrams.

## Visual grammar
Real labeled inline SVG paths/shapes/arrows/schemas, never fake diagrams/blank placeholders.
- If companion native notes/diagrams are created by a neighboring canvas_apply, do not repeat them in the HTML. Leave clear local anchors for them and let labeled arrows express the learning order.
Semantic palette: blue #2563eb/#3b82f6 = inputs/foundations/user space; teal/cyan #0891b2/#06b6d4 = transformation/processing; green #16a34a/#22c55e = outputs/verified/success/stable; amber/orange #d97706/#f59e0b = mechanism/attention/compute/latency; purple #7c3aed/#8b5cf6 = rules/algorithms/parameters/edge cases; red #dc2626/#ef4444 = risks/bottlenecks/constraints.

## Invocation
TOP-LEVEL visual_explainer, once per turn, complete HTML with inline CSS/SVG and only helpful JS. First paint useful with JS off. Host stamps sourceFormat ${VISUAL_EXPLAINER_SOURCE_FORMAT}, frameworkVersion ${VISUAL_EXPLAINER_FRAMEWORK_VERSION}, pluginId general, refreshSeconds 0. Omit copyText; stable multiline HTML, never minify.
Clear target/current state → finite w/h and place directly; crowded/uncertain target → canvas_scan plannedWidget, then use proposed x/y/w/h and placement. Refine only via canvas_patch_widget on widget.html. If authoring would take ~a minute, create a useful runnable scaffold at final size, then fill sections with patches. After render: postMessage {type:"drawva-widget-updated"}.
Math/physics: load_visual_skill math-2d/physics-2d/math-3d BEFORE authoring, not for unrelated subjects. Exactly one <meta name="drawva-visual-skill" content="…">. Manim-Web import ONLY https://cdn.jsdelivr.net/npm/manim-web@0.3.24/dist/manim-web.browser.js in inline script type=module; host rewrites to local 0.3.24 bundle/MathJax chunk. Static SVG first, Manim for motion. Call window.drawvaWidgetReady() after scene settles; 3-D supplies beforeSnapshot/afterSnapshot to reset camera for capture.
Examples: "REST vs GraphQL" → parallel criteria, concrete trade-offs, comparison diagram; "How Transformers Work" → labeled attention/data flow beside theory, not a wall of text; "Quantum Computing" already in ink → begin at qubit diagram, not another hero title.
Never use write_text alone as the substantial answer, or diagram_source unless the result is professional notation. For full educational whiteboard classroom suites, batch modular cards and connecting arrows via canvas_apply or combine visual_explainer with companion cards.`;
