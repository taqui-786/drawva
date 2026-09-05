<div align="center">

# <img src="./public/icons/paint-board.svg" width="34" height="34" align="center" alt="Drawva" /> Drawva

**A tile-based infinite canvas powered by a multimodal AI perception agent.**  
*Draw anything — sketches, notes, wireframes, or math — and AI perceives your canvas to create live diagrams, code, formulas, and interactive applets.*

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Better Auth](https://img.shields.io/badge/Better_Auth-RBAC-blueviolet?style=flat-square)](https://better-auth.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-green?style=flat-square)](https://orm.drizzle.team/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

<br />

</div>

---

## <img src="./public/icons/ai-brain.svg" width="22" height="22" align="center" alt="AI Agent Architecture" /> Multimodal AI Perception Agent

Drawva's core is an interactive, multi-turn multimodal AI perception agent driven by a client-side **Conductor** and streaming backend. The AI doesn't just generate text — it inspects canvas pixels, understands spatial arrangements, executes canvas tools, and incrementally refines diagrams.

```
                   ┌────────────────────────────────────────────────────────┐
                   │                  User Draws on Canvas                  │
                   └──────────────────────────┬─────────────────────────────┘
                                              │
                     ┌────────────────────────┴───────────────────────┐
                     ▼                                                ▼
         📸 Viewport WebP Snapshot                      📋 Compact Scene JSON
          (2048px clamped via atlas.ts)                  (Vector objects, widgets, drafts)
                     │                                                │
                     └────────────────────────┬───────────────────────┘
                                              │
                                              ▼
                             🎼 Conductor Loop (Client-Side)
                          Manages multi-turn turns, steer/cancel queues,
                           token budget & conversation history
                                              │
                                    Server-Sent Events (SSE)
                                              │
                                              ▼
                             ⚡ Agent Step API (/api/canvas/agent/step)
                          Dynamic tool catalog, system prompts & plugins
                          Dispatched to Multimodal LLM via AI SDK
                                              │
                                              ▼
                       🛠️ Client-Side Tool Execution (agentTools.ts)
                         ├── canvas_apply (vector shapes, text, formulas)
                         ├── canvas_snapshot (crop & zoom inspection)
                         ├── canvas_read (inspect text & widget content)
                         ├── canvas_patch_widget (diff & update diagrams)
                         ├── canvas_scan (global canvas geometry survey)
                         └── load_plugin (on-demand capability hydration)
                                              │
                                              ▼
                        🎨 Stacked Rendering & Sandboxed Mount
                         Text / Formulas / Plots -> Canvas 2D Layers
                         7 Diagram Formats / HTML -> Sandboxed iframe Host
```

### 1. 📸 Visual Perception & Scene Extraction
- **Atlas Snapshotting (`lib/canvas/atlas.ts`)**: Captures crisp WebP snapshots ($\le 2048\text{px}$) centered on your newest ink and modified regions, preserving high visual contrast.
- **Scene Serialization (`lib/canvas/scene.ts`)**: Compiles visible canvas items (strokes, shapes, text, widgets) into a compact JSON geometry tree so the model understands exact coordinates, dimensions, and relationships.

### 2. 🎼 Client-Side Conductor (`lib/ai/conductor.ts`)
- **Multi-Turn ReAct Loop**: Orchestrates continuous conversation turns where the model can inspect, think, call tools, receive execution results, and continue reasoning.
- **Steering & Interruption**: Supports queuing mid-flight directives ("Make the nodes green instead") without restarting the entire turn.
- **Reasoning Depth Control**: Configurable thinking effort (`low`, `medium`, `high`, `default`) for supported reasoning models (e.g. `gemini-2.0-flash-thinking`, `o3-mini`).
- **Context Compaction (`/api/canvas/agent/compact`)**: Automatically summarizes older conversation turns when token thresholds (`AGENT_HISTORY_TOKEN_TRIGGER`) are approached, preserving working memory without context exhaustion.

### 3. 🛠️ Canvas Tool Calling & Extensible Plugins
The agent has full programmatic control over the canvas through validated client tools:
- **`canvas_apply`**: Inserts vector shapes (rect, ellipse, arrow, line), text blocks, LaTeX formulas, math function plots, diagrams, and HTML widgets.
- **`canvas_snapshot`**: Zooms in and captures focused crops of specific regions for high-resolution visual inspection.
- **`canvas_read`**: Reads detailed text, source definitions, or code inside any existing widget.
- **`canvas_patch_widget`**: Surgically updates code or content inside diagrams without redrawing.
- **`load_plugin`**: Dynamically loads specialized runtime plugins on demand from `public/plugins/` (Weather, Stocks, GitHub Pulse, Earthquakes, Exchange Rates, Tech News, Flowcharts, etc.).

### 4. 🔍 Marquee Selection Refinement (`/api/canvas/refine`)
Select any region on the canvas with the Selection tool (<kbd>V</kbd>) and click **Refine**:
- The Refinement Engine extracts contained ink, text, and widgets.
- Samples the visual color palette to maintain aesthetic consistency.
- Computes a manifest fingerprint (`manifest.fingerprint`) to guarantee concurrency safety.
- Replaces raw handwriting or rough sketches with polished diagrams or interactive applets in place.

---

## <img src="./public/icons/chart.svg" width="22" height="22" align="center" alt="Diagram Engines" /> 7 Diagram Engines & Sandboxed Applets

Drawva features a multi-format rendering engine (`lib/canvas/diagram.ts`) that transforms text or visual sketches into interactive, sandboxed iframes (`/widget-host.html`) with copyable source, full-screen expansion, and draft state confirmation:

| Format / Engine | Diagram Types | Runtime Library |
| :--- | :--- | :--- |
| **Mermaid** | Flowcharts, sequence diagrams, state machines, class diagrams, Gantt charts | `mermaid.esm.min.mjs` |
| **Graphviz DOT** | Dependency networks, ASTs, hierarchy trees, state graphs | `@viz-js/viz` (WebAssembly) |
| **Vega-Lite** | Statistical charts, interactive bar, line, and scatter graphs | `vega` + `vega-lite` + `vega-embed` |
| **SMILES** | Chemical molecular structure 2D representations | `openchemlib` |
| **BPMN XML** | Business process workflows, enterprise swimlanes | `bpmn-viewer` |
| **Cytoscape JSON** | Network topology, graph theory nodes and edges | `cytoscape` |
| **GeoJSON** | Geographic spatial maps and choropleths | `leaflet` |
| **LaTeX Formulas** | Mathematical expressions and equation typesetting | MathJax SVG |
| **2D Function Plotter** | Real-time mathematical expression evaluation and plotting | Canvas 2D Evaluator |
| **HTML / SVG Applets** | Interactive HTML5 mini-applications, CSS animations, and games | Sandboxed iframe |

---

## <img src="./public/icons/layers.svg" width="22" height="22" align="center" alt="Canvas Features" /> Infinite Canvas Architecture

- **Stacked 60fps Rendering Loop**:
  - `gridLayer` (`gridCtx`): Infinite mathematical background grid pattern.
  - `tileLayer` (`tileCtx`): High-performance 512px offscreen raster tile cache for ink strokes.
  - `objectLayer` (`objectCtx`): Vector shapes, text boxes, formulas, and function plots.
  - `interactionLayer` (`interactionCtx`): Real-time live stroke previews, marquee selection boxes, and draft overlays.
- **Navigation & Math**: World-to-screen coordinate transforms, touchpad pinch-to-zoom, smooth inertia panning, and wheel zooming ($0.03\times$ to $4.0\times$).

### Supported Canvas Tools

| Tool | Keyboard Shortcut | Function |
| :--- | :---: | :--- |
| **Select** | <kbd>V</kbd> | Click-select ink clusters, drag rectangular marquee on empty space, and move objects/widgets |
| **Hand** | <kbd>H</kbd> / Middle Mouse | Pan canvas viewport smoothly in 2D space |
| **Pen** | <kbd>P</kbd> | Real-time pressure-sensitive vector stroke drawing |
| **Highlighter** | <kbd>Shift</kbd> + <kbd>H</kbd> | Semi-transparent yellow highlight overlay (40% opacity) |
| **Eraser** | <kbd>E</kbd> | Precision stroke and raycast line eraser |
| **Text** | <kbd>T</kbd> | Interactive inline SVG text box insertion |
| **Rectangle** | <kbd>R</kbd> | Vector rectangle shape |
| **Ellipse** | <kbd>O</kbd> | Vector circle and ellipse shape |
| **Arrow** | <kbd>A</kbd> | Directed vector arrow shape |

---

## <img src="./public/icons/shield.svg" width="22" height="22" align="center" alt="Admin" /> Admin Dashboard & Whiteboard Telemetry

Drawva includes a dedicated administrative management console at `/admin`, protected by Better Auth Role-Based Access Control (RBAC):

- **Overview (`/admin`)**: Real-time telemetry dashboard displaying registered creators, cloud canvases, total AI invocations, and detailed token breakdown (prompt vs. completion).
- **User Management (`/admin/user`)**: Account directory with instant search, creation dates, canvas counts, cumulative AI token consumption, and dynamic `admin` $\leftrightarrow$ `user` role assignment.
- **Canvas Records (`/admin/canva`)**: Searchable index of all cloud-persisted canvases with tile counts, widget metrics, and last saved timestamps.
- **Canvas Playground Viewer (`/admin/canva/[id]`)**: Dedicated read-only canvas playground for inspecting any canvas document. Renders the authentic visual state (tiles, widgets, objects) with smooth pan and zoom navigation, with all editing tools stripped away.
- **AI Usage & Telemetry (`/admin/ai-usage`)**: Detailed audit log of multimodal AI turns:
  - Full prompt text with single-click copy.
  - **Whiteboard snapshot preview**: Inspect the exact visual crop sent to the perception model.
  - **Raw AI Response & Tool Actions**: Read the actual generated completion or executed tool parameters.
  - Token consumption and provider metadata.

---

## <img src="./public/icons/database.svg" width="22" height="22" align="center" alt="Cloud & Persistence" /> Persistence & Collaboration

- **Cloud Synchronization**: Automatic, debounced cloud persistence via Neon PostgreSQL (`/api/canvas/cloud`) backed by Drizzle ORM.
- **Local Fallback**: Full offline functionality with client-side IndexedDB persistence (`drawva-canvas-db`).
- **P2P Collaboration**: Real-time room syncing and peer cursor tracking powered by WebRTC via PeerJS.
- **Export Formats**: One-click crisp high-DPR PNG export and full-project JSON import/export.

---

## <img src="./public/icons/rocket.svg" width="22" height="22" align="center" alt="Getting Started" /> Getting Started

### Prerequisites

- Node.js $\ge 18$
- `pnpm` (pinned to `pnpm@10.33.3`)
- PostgreSQL database (e.g. Neon, Supabase, or local Postgres)
- AI Provider API key supporting vision (OpenAI, Gemini, Anthropic, Groq, NVIDIA NIM, OpenRouter, or Ollama)

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/taqui-786/drawva.git
   cd drawva
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file:
   ```env
   # PostgreSQL Connection (e.g., Neon DB)
   DATABASE_URL="postgresql://user:password@endpoint/dbname?sslmode=require"

   # Better Auth Secret & URL
   BETTER_AUTH_SECRET="your-secure-auth-secret"
   BETTER_AUTH_URL="http://localhost:3000"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"

   # Google OAuth (Optional)
   GOOGLE_CLIENT_ID=""
   GOOGLE_CLIENT_SECRET=""

   # Admin Bootstrap (Comma-separated admin emails)
   ADMIN_EMAIL="admin@example.com"
   ```

4. **Initialize Database Schema**:
   ```bash
   pnpm db:push
   ```

5. **Start Development Server**:
   ```bash
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser. Launch the Canvas, open **Settings** (gear icon in the top header) to enter your API credentials, and start drawing!

---

## <img src="./public/icons/settings.svg" width="22" height="22" align="center" alt="Tech Stack" /> Tech Stack

- **Framework**: [Next.js 16.3](https://nextjs.org/) (App Router, Turbopack) & [React 19](https://react.dev/)
- **UI Primitives**: Base UI (`@base-ui/react`), [shadcn/ui](https://ui.shadcn.com/) (`base-nova` style)
- **Icons**: HugeIcons (`@hugeicons/react` & `@hugeicons/core-free-icons`)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Authentication**: [Better Auth](https://better-auth.com/) with Admin Plugin & Drizzle Adapter
- **Database & ORM**: [Neon Serverless PostgreSQL](https://neon.tech/) & [Drizzle ORM](https://orm.drizzle.team/)
- **Client State**: [Valtio](https://github.com/pmndrs/valtio) & [TanStack Query v5](https://tanstack.com/query)
- **AI Framework**: [Vercel AI SDK](https://sdk.vercel.ai/) & Multi-turn Conductor Agent

---

## <img src="./public/icons/user.svg" width="22" height="22" align="center" alt="Author" /> Author

Built with <img src="./public/icons/heart.svg" width="14" height="14" align="center" alt="Love" /> by **[Md Taqui Imam](https://taqui.in)**
