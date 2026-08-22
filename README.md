<div align="center">

# <img src="./public/icons/paint-board.svg" width="34" height="34" align="center" alt="Drawva" /> Drawva

**A tile-based infinite canvas powered by a multimodal AI perception agent.**  
*Draw anything — sketches, notes, or math — and AI transforms them into live diagrams, code, formulas, and interactive applets.*

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

<br />

</div>

---

## <img src="./public/icons/ai-brain.svg" width="22" height="22" align="center" alt="How It Works" /> How It Works

Drawva operates on a single multimodal perception loop:

```
You Draw ──> Viewport WebP & Scene JSON ──> Vision Model ──> JSON Tool Commands ──> Strict Schema Validation ──> Render to Infinite Canvas
```

### The 8-Step Pipeline

1. **<img src="./public/icons/camera.svg" width="16" height="16" align="center" alt="Snapshot" /> Snapshot** — `atlas.ts` captures a clean WebP snapshot of confirmed canvas pixels around your latest input, and `scene.ts` compiles a compact JSON representation of canvas items.
2. **<img src="./public/icons/note.svg" width="16" height="16" align="center" alt="Prompt Build" /> Prompt Construction** — Assembles system directives, user persona instructions, canvas geometry (`changedBox`, camera bounds, viewport dimensions), and the image payload into a structured message.
3. **<img src="./public/icons/plug.svg" width="16" height="16" align="center" alt="Plugin Selection" /> Plugin Registry** — Reads modular markdown cards from `public/plugins/<name>/plugin.md` containing runtime capabilities, CSS classes, and format specifications.
4. **<img src="./public/icons/share.svg" width="16" height="16" align="center" alt="Plugin Injection" /> Context-Budget Injection** — Injects only user-enabled plugins into the model prompt while strictly enforcing a 40KB prompt budget ceiling.
5. **<img src="./public/icons/bot.svg" width="16" height="16" align="center" alt="AI Reasoning" /> Multimodal Reasoning** — The vision model parses handwriting, gestures, and layout intentions, choosing native tools (`write_text`, `draw_formula`, `plot_function`) or rich sandboxed widgets (`html_widget`, `diagram_source`).
6. **<img src="./public/icons/check-circle.svg" width="16" height="16" align="center" alt="Validation" /> Strict Validation** — Commands are verified before execution: coordinate bounds within the $20000 \times 20000$ canvas, size sanity checks, authorized plugin IDs, and payload byte limits.
7. **<img src="./public/icons/paint-brush.svg" width="16" height="16" align="center" alt="Render" /> Stacked Layer Rendering** — Text, formulas, and plots render directly to canvas layers; interactive applets and diagrams mount inside sandboxed iframe containers with copy-source, full-screen, and draft confirmation controls.
8. **<img src="./public/icons/database.svg" width="16" height="16" align="center" alt="Autosave" /> Local Persistence** — State and raster tiles autosave to IndexedDB (`drawva-canvas-db`), persisting your whiteboard across browser sessions.

> **Note**: The AI never directly mutates the canvas. It returns structured command proposals that pass through strict client-side validation before rendering.

---

## <img src="./public/icons/sparkles.svg" width="22" height="22" align="center" alt="Features" /> Features

### <img src="./public/icons/layers.svg" width="18" height="18" align="center" alt="Canvas" /> Infinite Canvas & Drawing Tools

- **Stacked 60fps Canvas Engine**: Multi-layer 2D context architecture (`gridLayer`, `tileLayer`, `objectLayer`, `interactionLayer`) with 512px offscreen tile caching.
- **Precision Drawing Tools**:

| Tool | Shortcut | Description |
| :--- | :---: | :--- |
| **Selection** | <kbd>V</kbd> | Click-select ink clusters, drag rectangular marquee, and translate objects |
| **Pan** | <kbd>H</kbd> / Middle Click | Pan canvas viewport smoothly in 2D space |
| **Pen** | <kbd>P</kbd> | Smooth vector stroke drawing with variable pressure |
| **Highlighter** | <kbd>Shift</kbd> + <kbd>H</kbd> | Semi-transparent overlay with 40% opacity |
| **Eraser** | <kbd>E</kbd> | Precision stroke and raycast eraser |
| **Text** | <kbd>T</kbd> | Interactive inline SVG text box insertion |
| **Rectangle** | <kbd>R</kbd> | Vector rectangle shape tool |
| **Ellipse** | <kbd>O</kbd> | Vector ellipse and circle shape tool |
| **Arrow** | <kbd>A</kbd> | Directed vector arrow tool |

- **Navigation**: Touchpad pinch zoom, smooth pixel scroll, and mouse wheel notch scaling ($0.03\times$ to $4.0\times$).

---

### <img src="./public/icons/ai-brain.svg" width="18" height="18" align="center" alt="AI" /> Multimodal AI Perception

- **Spatial Scene Understanding**: Combines high-resolution viewport WebP snapshots with structured scene JSON to recognize handwriting, arrows, circles, and spatial relationships.
- **Context-Aware Placement**: Automatically anchors generated widgets and answers directly below your latest drawings (`x = changedBox.x, y = changedBox.y + changedBox.h + 24`).
- **OpenAI-Compatible Providers**: Works with OpenAI, Google Gemini, Anthropic, Groq, NVIDIA NIM, OpenRouter, Ollama, and any custom OpenAI-compatible endpoint.
- **Trigger Modes**: On-demand **Ask AI** button or real-time **Auto AI** toggle.

> [!IMPORTANT]
> **AI Model Requirements:**
> - **Vision Capability (Required)**: The selected model must support simultaneous **image and text** inputs (e.g., `gpt-4o`, `claude-3-5-sonnet`, `gemini-2.0-flash`, `qwen2.5-vl`, `llama-3.2-vision`) to inspect handwriting and visual context.
> - **Structured Output (Optional)**: If supported, Drawva uses native JSON schema output; otherwise, it automatically utilizes direct-JSON fallback parsing with schema recovery.

---

### <img src="./public/icons/chart.svg" width="18" height="18" align="center" alt="Diagrams" /> 7 Diagram Engines & Sandboxed Applets

Sketches turn into interactive sandboxed iframe widgets with copyable source code, full-screen view, and draft state confirmation:

| Engine / Format | Capabilities | Runtime Library |
| :--- | :--- | :--- |
| **Mermaid** | Flowcharts, sequence diagrams, state diagrams, class diagrams | `mermaid.js` |
| **Graphviz DOT** | Dependency graphs, trees, hierarchy networks | `@viz-js/viz` (WebAssembly) |
| **Vega-Lite** | Statistical charts, interactive bar/line/scatter graphs | `vega` + `vega-lite` + `vega-embed` |
| **SMILES** | Chemical molecular structure 2D rendering | `openchemlib` |
| **BPMN XML** | Business process workflow diagrams | `bpmn-viewer` |
| **Cytoscape JSON** | Network topology and graph theory models | `cytoscape` |
| **GeoJSON** | Geographic maps and spatial datasets | `leaflet` |
| **LaTeX Formulas** | Mathematical notation and equation typesetting | MathJax SVG |
| **2D Function Plotter** | Safe real-time mathematical expression graphing | Canvas 2D evaluator |
| **HTML Applets** | Sandboxed interactive HTML, CSS, JavaScript, and SVG mini-apps | Custom iframe sandbox |

---

### <img src="./public/icons/floppy-disk.svg" width="18" height="18" align="center" alt="Persistence" /> Persistence & Export

- **Local Autosave**: Debounced client-side persistence via IndexedDB (`drawva-canvas-db`).
- **Export & Import**: Export crisp high-resolution PNG canvas snapshots, export scene JSON, or load existing whiteboard projects.
- **P2P Collaboration**: Real-time room syncing and peer cursor tracking powered by WebRTC via PeerJS.

---

## <img src="./public/icons/rocket.svg" width="22" height="22" align="center" alt="Getting Started" /> Getting Started

### Prerequisites

- Node.js $\ge 18$
- `pnpm` (pinned to `pnpm@10.33.3`)
- An OpenAI-compatible API key & model supporting vision inputs

### Installation

```bash
# Clone repository
git clone https://github.com/taqui-786/drawva.git
cd drawva

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Open **Settings** (top right) to configure your AI provider and start drawing.

---

## <img src="./public/icons/user.svg" width="22" height="22" align="center" alt="Author" /> Author

Built with <img src="./public/icons/heart.svg" width="14" height="14" align="center" alt="Love" /> by **[Taqui Imam](https://taqui.in)**
