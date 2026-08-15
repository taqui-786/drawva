# Drawva 🎨⚡

A tile-based infinite whiteboard powered by a **multimodal AI perception agent** — draw anything, and the AI turns your sketches into diagrams, code, and math. Zero-cloud-database P2P sync via WebRTC.

---

## 🎬 Demo

<!-- TODO: add demo video -->

[![Drawva Demo](https://img.shields.io/badge/Demo-Coming_Soon-6366f1)]()

---

## 🧠 How It Works

You draw → Drawva sees → the AI reasons → it builds.

```mermaid
flowchart LR
    A[✏️ You draw<br/>pen / shapes / text] --> B[🖼️ Atlas snapshot<br/>viewport WebP + scene JSON]
    B --> C[🤖 Multimodal AI<br/>vision + spatial reasoning]
    C --> D{What to build?}
    D -->|diagram| E[Mermaid / Graphviz / BPMN]
    D -->|math| F[MathJax / function plotter]
    D -->|data| G[Vega-Lite / Cytoscape / GeoJSON]
    D -->|molecule| H[SMILES]
    D -->|app| I[Sandboxed HTML applet]
    E & F & G & H & I --> J[🖥️ Widget iframe<br/>anchored below your ink]
    J --> K[💾 IndexedDB autosave]
```

The whole thing runs on a stacked canvas engine — grid, tile cache, vector objects, and live interaction layers — rendered at 60fps, synced P2P with a 6-digit room code.

---

## 🚀 Setup

```bash
git clone https://github.com/taqui-786/drawva.git
cd drawva
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Needs Node.js ≥ 18 and `pnpm@10.33.3`.

---

## 👤 About Me

Built by [Taqui Imam](https://taqui.in) — I like turning messy hand-drawn ideas into clean, working artifacts.

