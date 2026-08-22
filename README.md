# Drawva 🎨⚡

A tile-based infinite whiteboard powered by a **multimodal AI perception agent** — draw anything, and AI turns your sketches into interactive diagrams, code, formulas, and data visualizations.

---

## 🧠 How It Works

No magic here bruh, it's just one simple pipeline:

**You draw → Drawva photographs the canvas → AI looks at it → AI replies with JSON commands → we verify them → canvas renders the answer.** That's literally it.

Here's each step in plain English:

1. **📸 Snapshot** — `atlas.ts` takes a clean WebP photo of your canvas + `scene.ts` writes a tiny JSON summary of everything on it.
2. **🧾 Prompt build** — the AI gets 3 things glued together: a rulebook (system prompts), live canvas data (`changedBox` = where YOUR new ink is, camera position, existing objects) + the photo itself.
3. **🔌 Plugin selection** — plugins are just markdown cards sitting in `public/plugins/<name>/plugin.md`. Nothing fancy.
4. **💉 Plugin injection** — the server reads those cards, keeps only your *enabled* ones (under a 40KB budget), and pastes their docs straight into the prompt. So the AI doesn't pick plugins from some menu — it only knows what we hand it on paper.
5. **🤖 AI picks a tool** — based on your question it returns JSON like `{tool:"html_widget", pluginId:"weather", html:"..."}` or native stuff like `write_text` / `draw_formula` / `plot_function`. Simple answer → native tools. Diagrams → Mermaid / Graphviz / SMILES etc. Rich interactive stuff → HTML widget.
6. **✅ Safety check** — the AI's output is never trusted blindly. Every command gets validated: size limits, real coordinates inside the 20000×20000 canvas, plugin actually enabled, max 16 commands. Broken ones get silently dropped.
7. **🎨 Render** — text/formulas/plots draw straight onto canvas layers; widgets spin up inside sandboxed iframes with copy-source, resize, and accept/draft buttons.
8. **💾 Autosave** — everything persists to IndexedDB locally. Your board survives refreshes.

> TL;DR: the AI never touches your canvas directly. It can only *request* things, and strict validators decide what actually gets drawn.

---

## ✨ Features

### 🖌️ Infinite Canvas & Drawing Tools
- **Stacked 60fps Canvas Engine**: Multi-layer rendering with infinite grid, 512px raster tile caching, vector objects, and real-time interaction previews.
- **Precision Drawing Tools**:
  - **Pen (`P`)** & **Highlighter (`Shift+H`)**: Smooth vector inking with customizable colors and stroke widths.
  - **Vector Shapes**: Rectangle (`R`), Ellipse (`O`), Arrow (`A`), and Line.
  - **Text Tool (`T`)**: Interactive inline text labels and notes.
  - **Stroke Eraser (`E`)**: Precision raycast stroke erasing.
  - **Selection & Marquee (`V`)**: Area drag selection, cluster lifting, moving, and deletion.
- **Smooth Navigation**: Pan with Hand tool (`H`) or middle-click, smooth trackpad pinch zoom & mouse wheel scaling ($0.03\times$ to $4.0\times$).

### 🤖 Multimodal AI Perception
- **Spatial Scene Understanding**: Combines viewport WebP snapshots with structured scene JSON to recognize handwriting, arrows, and layout context.
- **Context-Aware Placement**: Automatically generates widgets anchored directly below your latest drawings.
- **Custom OpenAI-Compatible Providers**: Connect any OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio, OpenAI, etc.).
- **Trigger Modes**: On-demand **Ask AI** or real-time **Auto AI** toggle.

> [!IMPORTANT]
> **AI Model Requirements:**
> - **Multimodal / Vision (Required)**: The selected model **must** accept both **image and text** inputs simultaneously (e.g., `gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro/flash`, `qwen2.5-vl`, `llama-3.2-vision`) to inspect your drawings and handwriting.
> - **Structured Output (Optional)**: If the model supports native structured JSON output / function calling, Drawva leverages it for highest schema precision; if not, Drawva automatically falls back to raw JSON parsing.

### 📊 7 Diagram Engines + Interactive Applets
Drawva turns sketches into interactive sandboxed iframe widgets with copyable source code, full-screen view, and draft confirmation:
- **Flowcharts & Sequences**: Mermaid.js diagrams (`mermaid`).
- **Dependency Networks**: Graphviz DOT graphs (`@viz-js/viz` WebAssembly).
- **Statistical Charts**: Vega-Lite data visualizations and bar charts.
- **Molecular Structures**: SMILES chemical compound 2D rendering (`openchemlib`).
- **Business Workflows**: BPMN XML process diagrams (`bpmn-viewer`).
- **Network Graphs**: Interactive Cytoscape graph visualizations.
- **Geographic Maps**: GeoJSON maps powered by Leaflet.
- **LaTeX Math Formulas**: MathJax SVG typesetting.
- **2D Function Plotter**: Safe math expression graphing.
- **Live HTML Applets**: Fully functional sandboxed HTML/CSS/JS mini-apps.

### 💾 Persistence & Export
- **Local Autosave**: Seamless client-side persistence using IndexedDB (`drawva-canvas-db`).
- **Export & Import**: Export high-resolution PNG snapshots, save canvas state to JSON, or load previous project files.

---

## 🚀 Getting Started

### Prerequisites
- Node.js $\ge 18$
- `pnpm` (version `10.33.3` recommended)
- An OpenAI-compatible API key & model supporting **both image and text inputs** (vision-capable)

### Installation

```bash
# Clone the repository
git clone https://github.com/taqui-786/drawva.git
cd drawva

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Configure your AI model provider in **Settings** (top right) to start generating.

---

## 👤 Author

Built with ❤️ by **[Taqui Imam](https://taqui.in)**
