export const VISUAL_EXPLAINER_SOURCE_FORMAT = "drawva-visual-explainer+html";
export const VISUAL_EXPLAINER_FRAMEWORK_VERSION = "drawva-visual-explainer/1";

export function isVisualExplainer(sourceFormat?: string, frameworkVersion?: string): boolean {
  return sourceFormat === VISUAL_EXPLAINER_SOURCE_FORMAT && frameworkVersion === VISUAL_EXPLAINER_FRAMEWORK_VERSION;
}

export const VISUAL_EXPLAINER_CONTRACT = `== VISUAL EXPLAINER ==
Default path for understand / explain / learn / analyze / organize / plan — even if the user never says "infographic". One coordinated, canvas-native infographic on the board combining theory + diagrams like a high-density illustrated notebook page. Yields when the job is only to edit existing ink, or when the defining result is interaction, simulation, live data, a small applet, or a professional diagram.

Do not decorate first. Rank the information, then pick the structure that carries it.

## 1. CANVAS INTEGRATION (IRONCLAD: NO BOX SHADOW, NO WINDOW BACKGROUND)
- The infographic MUST feel like it is directly drawn onto the whiteboard canvas alongside ink, NOT an external floating card, modal, or desktop window.
- ZERO WINDOW BACKGROUND: html, body, #stage, and outer wrapper divs MUST have background: transparent !important. Never paint a solid white or dark rectangle across the whole canvas viewport. The infinite canvas grid must show through.
- ZERO BOX SHADOW: Never use box-shadow on the container, outer window, or modules. Drop shadows create artificial card elevation that breaks whiteboard immersion.
- MODULE STYLING: Individual diagram boxes, cards, and chips use clean, crisp vector borders (e.g. border: 1.5px solid rgba(0,0,0,0.12) in light mode or rgba(255,255,255,0.15) in dark mode, border-radius: 8px..12px) and subtle translucent tinted fills (background: rgba(248, 250, 252, 0.7) or rgba(..., 0.04)), never heavy opaque cards.

## 2. NOTEBOOK-PAGE TYPOGRAPHY & SCALE (NEVER TOO SMALL)
Canvas-world units are larger than desktop websites! Standard web text (11px-14px) is microscopic and completely unreadable on the canvas. Use large, bold, crisp typography:
- Hero / Infographic Title: 52px – 64px, font-weight 700, tracking -0.02em.
- Subtitle / Framing: 28px – 34px, font-weight 500, muted color.
- Section Headings: 34px – 42px, font-weight 600.
- Panel Titles / Key Concept Badges: 28px – 32px, font-weight 600.
- Body Text (Theory & Explanations): 24px – 28px, line-height 1.45 – 1.55.
- Data Values & Metrics: 36px – 56px, bold, aligned with units.
- Diagram Node Labels, Flowchart Text, Chips: 20px – 26px.
- Footnotes & Meta Tags: 18px – 20px. Never drop below 18px anywhere!

## 3. ZERO WASTED SPACE (COMPACT NOTEBOOK PAGE)
- Treat the visual like a masterclass technical notebook page: dense, balanced, and purposeful.
- Every pixel has a reason to exist. Never leave giant empty voids or unused vertical space at the bottom.
- Flow theory paragraphs directly next to or above corresponding visual diagram components.
- Choose compact dimensions that tightly wrap the content: e.g. 1400×900 for focused explainers, 1600×1000 for standard landscape, 1800×1100 for multi-panel systems, or 1200×1600 for vertical timelines/articles.

## 4. THE 6 INFOGRAPHIC LAYOUT ARCHETYPES
Pick the one archetype from the layout cheat sheet that naturally fits the topic:

1. Useful Bait (Key Points & Core Takeaways)
   - Layout: Top headline banner → Primary hero diagram box (~40-50% height) → 2×2 grid of key takeaways cards → Large callout / feature block with side-by-side visual + text description → 3 bottom highlight cards.
   - Best for: Concept summaries, feature overviews, executive briefs, essential facts.

2. Versus / Comparison (Side-by-Side Analysis)
   - Layout: Header title + criteria → Two balanced side-by-side vertical columns (Option A vs Option B) with parallel structured points → Central comparison criteria spine or matrix → Comparative summary text → Bottom comparative badges / radar / indicator chips.
   - Best for: Contrasting technologies (e.g. REST vs GraphQL, Docker vs VM), pros & cons, trade-offs, before vs after.

3. Heavy Data (Numbers & System Metrics)
   - Layout: Header title → Central conceptual network hub with connected radial data chips → Connected horizontal metric flow chips (percentages, benchmarks, throughput) → Detailed breakdown cards with large stat callouts (48px+) and comparative bar meters.
   - Best for: Performance benchmarks, data-intensive topics, statistical reports, telemetry, quantitative comparisons.

4. Road Map (Process Journey & Winding Steps)
   - Layout: Top title → Serpentine / winding S-curve connecting path (SVG stroke) through sequential stages → Milestone node boxes with step numbers, icons/diagrams, and explanatory theory → Final destination / outcome card.
   - Best for: Step-by-step processes, workflows, development roadmaps, algorithmic execution stages, user journeys.

5. Timeline (Chronological Evolution)
   - Layout: Header title → Central vertical timeline spine (thick line with milestone dots) → Alternating left-and-right milestone cards → Circular date/version badges → Accompanying theory bullets and change notes → Milestone summary chips at the base.
   - Best for: History of a technology, version progression, project milestones, sequential causal chains.

6. Visualized Article (In-Depth Technical Deep Dive)
   - Layout: Editorial headline with subtitle → Left-column data chart / architectural SVG diagram + Right-column core theoretical narrative → Central spotlight concept callout circle with bulleted notes → Bottom multi-column analytical breakdown columns with summary takeaway.
   - Best for: Deep conceptual explanations (e.g. "Explain LLM", "How Transformers Work"), combining extensive theory with multi-stage diagrams.

## 5. Visual Grammar & Palette
- Clean technical illustration: Crisp inline SVG vectors for diagrams, arrows, and schemas.
- Purposeful semantic colors:
  * Blue (#2563eb / #3b82f6): Inputs, foundations, user space.
  * Teal / Cyan (#0891b2 / #06b6d4): Transformations, data processing.
  * Green (#16a34a / #22c55e): Outputs, verified state, success, stable results.
  * Amber / Orange (#d97706 / #f59e0b): Core mechanism, attention, compute, latency.
  * Purple (#7c3aed / #8b5cf6): Rules, algorithms, parameters, edge cases.
  * Red (#dc2626 / #ef4444): Risks, bottlenecks, constraints.
- Real SVG paths and shapes with labeled nodes, never blank placeholders or fake diagrams.

## Invocation
Call the visual_explainer tool once this turn with one complete HTML document (inline CSS/SVG, only the JS that helps). First paint must already be useful with JS off. Markers are stamped for you: sourceFormat ${VISUAL_EXPLAINER_SOURCE_FORMAT}, frameworkVersion ${VISUAL_EXPLAINER_FRAMEWORK_VERSION}, pluginId general, refreshSeconds 0. Omit copyText. Do not minify. Stable multiline HTML for later canvas_patch_widget.

On an empty board, pick finite w/h and place it. Otherwise canvas_scan with plannedWidget, then pass that x,y,w,h. One visual_explainer per user turn; refine with canvas_patch_widget on widget.html. If the HTML would take ~a minute, ship a runnable scaffold at final size, then fill sections with patches. After render, postMessage {type:"drawva-widget-updated"}. Call window.drawvaWidgetReady() after a scientific Manim scene settles.

For mathematics or physics, call load_visual_skill with math-2d, physics-2d, or math-3d before authoring. Put exactly one <meta name="drawva-visual-skill" content="…"> in the HTML. Import Manim-Web only as https://cdn.jsdelivr.net/npm/manim-web@0.3.24/dist/manim-web.browser.js inside an inline script type=module (Drawva rewrites it to the local 0.3.24 bundle, including its MathJax chunk). Static SVG first; Manim explains motion. 3-D scenes pass beforeSnapshot/afterSnapshot to window.drawvaWidgetReady so capture resets the camera. Do not load a skill for unrelated subjects.

Do not use write_text as the main answer for a substantial explanation. Do not use ordinary html_widget (that is behavior-first). Do not use diagram_source unless the deliverable is professional notation.`;
