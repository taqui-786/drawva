# Drawva 🎨⚡

**Drawva** is a high-performance, offline-first, tile-based infinite whiteboard engine powered by a **3-stage multimodal AI perception pipeline** and **zero-cloud-database WebRTC P2P real-time device synchronization**.

---

## ✨ Key Features

### 📡 1. Zero-Cloud-Database P2P Real-time Collaboration
- **WebRTC DataChannels**: Connect laptops, tablets, and mobile phones directly browser-to-browser with sub-30ms latency.
- **Zero Database Required**: No cloud database or backend storage needed — data streams directly P2P.
- **Simple 6-Digit Room Codes**: Click **Connect**, generate a short code (e.g., `DRAW-8492`), and share it to connect instantly.
- **Independent Viewports**: Each device maintains its own camera view, pan offset, and zoom level without interrupting the other user's view.
- **Live Remote Cursor & Pen Preview**: See the connected peer's live drawing pencil and cursor position in real time with custom name badges.

### 🤖 2. 3-Stage Multimodal AI Perception Pipeline
- **Vision Perception & Evaluation**: Reads ink drawings, sketches, and annotations directly from the canvas atlas.
- **Auto AI & Ask AI**: Instant **Ask AI** button or continuous debounced **Auto AI** loop that turns hand-drawn sketches into structured diagrams, code, or math equations.
- **Universal Provider Compatibility**: Works with any OpenAI-compatible provider (OpenAI, DeepSeek-V4, NVIDIA Nemotron, Qwen2-VL, OpenRouter, Groq, Ollama, etc.). Configurable Base URL & API key.

### 📊 3. Multi-Format Diagram & Interactive Applet Engine
Supports dynamic sandboxed rendering for **7 diagram & visualization formats**:
1. **Mermaid.js**: Flowcharts, sequence diagrams, class diagrams, state diagrams.
2. **Graphviz DOT**: Dependency networks, decision trees, graph topologies.
3. **Vega-Lite**: Data visualizations, bar charts, scatter plots, statistical graphs.
4. **SMILES**: Molecular chemical structure bonds (via OpenChemLib).
5. **BPMN XML**: Business process workflow diagrams.
6. **Cytoscape JSON**: Interactive network graph nodes.
7. **GeoJSON**: Spatial maps (via Leaflet).
8. **Sandboxed HTML Applets**: Interactive micro-webapps with full DOM execution.

### 📐 4. Living Vector Objects & LaTeX Engine
- **MathJax SVG Typesetting**: Render complex LaTeX formulas ($\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$) directly onto the board.
- **2D Math Function Plotter**: Plot mathematical expressions ($y = \sin(x)$) with safe real-time expression evaluation.
- **Living Text Objects**: Interactive text blocks with dynamic text wrap and font sizing.
- **Merge-to-Ink**: Convert living LaTeX formulas, plots, or text back into erasable ink tiles whenever needed.

### ✏️ 5. Canvas Engine & Drawing Tools
- **Stacked rAF Rendering Pipeline**: Offscreen 512px raster tile cache (`TileCache`) with device DPR scaling for smooth 60fps interaction.
- **Canvas Tools**: Pen (`P`), Highlighter (`Shift+H`), Precision Eraser (`E`), Rectangle (`R`), Ellipse (`O`), Arrow (`A`), Text (`T`), Hand/Pan (`H`), Selection (`V`).
- **Touch & Gesture Support**: Touchpad pinch-to-zoom, 2-finger touch pan, and smooth wheel zooming ($0.03\times \dots 4.0\times$).
- **Marquee Selection**: Drag-select ink clusters, objects, and widgets to move, resize, or delete.

### 💾 6. Persistence & History
- **IndexedDB Autosave**: Automatic local document persistence (`drawva-canvas-db`).
- **Diff-Based Undo / Redo**: Lightweight snapshot diffing for full $\text{Cmd+Z} / \text{Cmd+Shift+Z}$ support.
- **Import / Export**: Save as project JSON or export high-resolution PNG images.

---

## 🚀 Getting Started

### Prerequisites
- Node.js $\ge 18$
- `pnpm` (version `10.33.3` recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/drawva.git
cd drawva

# Install dependencies using pnpm
pnpm install
```

### Running the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Project Architecture

```
Drawva Architecture:
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  UI Shell (React 19 App Router): CanvasHeader, CanvasProvider, CanvasApp  │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Canvas Engine (lib/canvas/engine.ts): stacked 2D contexts rAF loop      │
 │   ├── Grid Layer (gridCtx): infinite background grid pattern             │
 │   ├── Tile Layer (tileCtx): 512px offscreen tile cache & ink strokes     │
 │   ├── Object Layer (objectCtx): vector shapes, text, formulas, plots     │
 │   └── Interaction Layer (interactionCtx): live pen, marquee & peer dot  │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  P2P WebRTC Sync (lib/canvas/sync.ts): PeerJS DataChannel broadcasting   │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Widget Manager (lib/canvas/widgets.ts & diagram.ts):                    │
 │   └── Sandboxed iframe host for 7 diagram formats & HTML applets         │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  3-Stage LangChain AI Agent (lib/ai/):                                   │
 │   ├── Stage 1: Vision Perception Model                                   │
 │   ├── Stage 2: Prompt Evaluation Engine                                  │
 │   └── Stage 3: Structured Code Model                                     │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Persistence (lib/canvas/persistence.ts): IndexedDB autosave canvas-db   │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Keyboard Shortcuts

| Tool / Action | Keyboard Shortcut |
| :--- | :--- |
| **Select / Move** | `V` |
| **Hand / Pan** | `H` or Middle Mouse Drag |
| **Pen** | `P` |
| **Highlighter** | `Shift + H` |
| **Eraser** | `E` |
| **Text Tool** | `T` |
| **Rectangle** | `R` |
| **Ellipse** | `O` |
| **Arrow** | `A` |
| **Undo** | `⌘Z` / `Ctrl+Z` |
| **Redo** | `⇧⌘Z` / `Ctrl+Y` |
| **Delete Selected** | `Backspace` / `Delete` |

---

## 📄 License

MIT License. Built with ❤️ using Next.js, React 19, Tailwind CSS v4, Base UI, and PeerJS.
