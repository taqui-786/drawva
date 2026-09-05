<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

> 🧠 **Complete Codebase Memory:** Read [docs/codebase-memory.md](file:///home/md-taqui-imam/my-projects/drawva/docs/codebase-memory.md) to understand the entire architecture, engine layers, AI conductor loop, tools, and conventions in a single file without burning tokens exploring the repository.

## Commands

Use **pnpm** (pinned to `pnpm@10.33.3` in `package.json`) — not npm/yarn, despite what README says.

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npx tsc --noEmit` — typecheck (no npm script exists for this)
- **No test framework is installed.** Verify changes with `pnpm lint` + `npx tsc --noEmit` + `pnpm build`.

Add shadcn components with `pnpm dlx shadcn add <component>` — never hand-write files into `components/ui/`.

## Non-obvious Stack & Design System Rules

- **Base UI Primitives (`@base-ui/react`)**: Style is `"base-sera"` (see `components.json`). UI components import from `@base-ui/react/` (e.g. `components/ui/button.tsx` uses `@base-ui/react/button`).
  - **Critical Element Nesting Rule**: `TooltipTrigger`, `PopoverTrigger`, and `DropdownMenuTrigger` render `<button>` elements by default. ALWAYS use the `render={<Button ... />}` prop pattern on triggers when wrapping a `<Button>` to prevent invalid nested `<button><button>` HTML hydration errors.
  - Do NOT write Radix API code (`asChild`, `Slot`, etc.) against these components.
- **HugeIcons Library**: Icon library is `@hugeicons/react` and `@hugeicons/core-free-icons` (do not import `lucide-react`).
- **Tailwind CSS v4 (CSS-First)**: Theme configuration lives in `app/globals.css` via `@theme inline` and shadcn CSS variables. Keep `@import "shadcn/tailwind.css"` at the top of `globals.css`.
- **Path Alias**: `@/*` → `./*` (repo root). Aliases in `components.json`: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- **Dark Mode Variant**: Uses `.dark` class variant (`@custom-variant dark (&:is(.dark *))` in `globals.css`), not `dark:` media default.

## Architecture & Codebase Map

Drawva is a tile-based infinite canvas whiteboard engine powered by a multimodal AI perception agent.

### How the AI Pipeline Actually Works

The AI is an interactive, multi-turn agent driven by a client-side Conductor and streaming backend:

1. **📸 Perception & Snapshot**: `atlas.ts` captures canvas WebP snapshots + `scene.ts` serializes visible canvas items into compact scene JSON.
2. **🎼 Conductor Agent Loop** (`lib/ai/conductor.ts`): Client-side controller managing multi-turn agent turns, message history, streaming SSE events, steering, cancellation, and token budgets.
3. **⚡ Step API Route** (`app/api/canvas/agent/step/route.ts`): Server-side SSE route that prepares system prompts with enabled plugins catalog, dispatches LLM calls via AI SDK (`lib/ai/model.ts`), and streams back tool calls or text deltas.
4. **🛠️ Tool Execution** (`lib/ai/conductorTools.ts`, `lib/ai/agentTools.ts`): Client executes requested agent tools against live canvas state (`apply_patch`, `inspect_box`, `load_plugin`, `read_history`, etc.) on objects, widgets, drafts, and history.
5. **🗜️ Context Compaction** (`app/api/canvas/agent/compact/route.ts`): Summarizes earlier conversation turns when token limits are reached (`AGENT_HISTORY_TOKEN_TRIGGER`).
6. **🎨 Render**: Native shapes, text, and formulas render to canvas layers via `ObjectManager` / `CanvasEngine`; rich diagrams and HTML applets mount via `WidgetManager` into sandboxed iframes (`/widget-host.html`).

```
Drawva Stack Architecture:
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  UI Shell (React 19 App Router): CanvasHeader, CanvasProvider, CanvasApp  │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Canvas Engine (lib/canvas/engine.ts): multi-layer rAF rendering loop   │
 │   ├── Grid Layer (gridCtx): infinite background grid pattern             │
 │   ├── Tile Layer (tileCtx): 512px offscreen tile cache & strokes         │
 │   ├── Object Layer (objectCtx): shapes, text, formulas, plots            │
 │   └── Interaction Layer (interactionCtx): live strokes, marquee, drafts   │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Widget Manager (lib/canvas/widgets.ts & diagram.ts):                    │
 │   └── Dynamic iframe host for 7 diagram formats & HTML applets           │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Conductor AI Agent System (lib/ai/ & app/api/canvas/):                  │
 │   ├── Conductor Loop (lib/ai/conductor.ts & conductorTools.ts)           │
 │   ├── Step & Compact Routes (/api/canvas/agent/step & /compact)          │
 │   └── Provider Adapters (AI SDK OpenAI, Anthropic, Gemini, Groq, NVIDIA) │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Persistence: IndexedDB (persistence.ts) & Cloud Sync (/api/canvas/cloud)│
 └──────────────────────────────────────────────────────────────────────────┘
```

### 1. Canvas Engine Modules (`lib/canvas/`)

- `engine.ts`: Core `CanvasEngine` class managing stacked 2D contexts (`gridCtx`, `tileCtx`, `objectCtx`, `interactionCtx`), DPR scaling, rAF loop, real-time pen/highlighter preview rendering, and active marquee selection rectangle overlay.
- `camera.ts`: Screen-to-world and world-to-screen coordinate math, scale bounds ($0.03\times .. 4.0\times$), touchpad pinch zoom, and wheel pan offsets.
- `selection.ts`: Rectangle (marquee) selection controller — click-to-select an ink cluster, drag a rect box for area selection, and lift/erase/paste translation drags on the raster tiles.
- `widgets.ts`: `WidgetManager` class handling DOM lifecycle for mounted widgets and sandboxed diagram iframes (`/widget-host.html`). Supports draft vs. accepted state transitions, top action bars (`×`, `⤢`, `Copy Source`, `✓`), header drag handlers, and viewport scaling transforms.
- `diagram.ts`: Dynamic multi-format diagram renderer generating HTML/JS for **7 diagram formats**:
  - **Mermaid**: Flowcharts, sequence diagrams (`mermaid.esm.min.mjs`).
  - **Graphviz DOT**: Dependency networks, trees (`@viz-js/viz` WebAssembly standalone).
  - **Vega-Lite**: Statistical charts & bar graphs (`vega` + `vega-lite` + `vega-embed`).
  - **SMILES**: Molecular chemical structure bonds (`openchemlib`).
  - **BPMN XML**: Business process workflow diagrams (`bpmn-viewer`).
  - **Cytoscape JSON**: Interactive network graphs (`cytoscape`).
  - **GeoJSON**: Geographic spatial maps (`leaflet`).
- `formulas.ts`: MathJax SVG typesetting for LaTeX equations.
- `plotter.ts`: Safe 2D math expression evaluator and graph plotter.
- `strokes.ts` & `shapes.ts` & `textTool.ts`: Primitive stroke creation, line-erasing raycast intersection, vector shapes (rect, ellipse, arrow, line), and SVG text rendering.
- `atlas.ts` & `scene.ts`: Viewport WebP snapshot builder ($\le 2048\text{px}$) and compact JSON scene state serializer.
- `persistence.ts` & `exportPng.ts`: IndexedDB (`drawva-canvas-db` v1) autosave/restore engine and PNG image / JSON file exporter.
- `commands.ts`: Validator (`validateCommand`) and converter (`commandToCanvasItem`) mapping AI JSON payload commands to typed canvas items.

### 2. Supported Canvas Tools

| Tool | Keyboard Shortcut | Function |
| :--- | :--- | :--- |
| `select` | `V` | Click-select + drag ink, drag rectangular marquee on empty ground, and move widgets/objects |
| `hand` | `H` / Middle Mouse | Pan canvas viewport in 2D space |
| `pen` | `P` | Real-time vector stroke drawing |
| `highlighter` | `Shift+H` | Semi-transparent yellow stroke overlay ($40\%$ opacity) |
| `eraser` | `E` | Precision stroke eraser |
| `text` | `T` | Interactive text box insertion |
| `rect` | `R` | Vector rectangle shape |
| `ellipse` | `O` | Vector ellipse shape |
| `arrow` | `A` | Directed arrow vector shape |

### 3. Conductor AI Agent Architecture (`lib/ai/` & `app/api/canvas/`)

- `conductor.ts`: Client-side `Conductor` class orchestrating the multi-turn ReAct agent loop, managing message history, streaming SSE events, tool invocation cycles, steer/cancel queues, and turn budgets.
- `conductorTools.ts` & `agentTools.ts`: Canvas tool executor and AI SDK tool definitions (`apply_patch`, `inspect_box`, `load_plugin`, `read_history`, etc.).
- `model.ts`: Model factory `createChatModel({ providerType, baseUrl, apiKey, model })` with retry/backoff.
- `modelRegistry.ts` & `capabilities.ts`: Model metadata registry, pricing tiers, vision capability detection, and tool calling support.
- `prompts.ts`: `AGENT_SYSTEM_PROMPT` and system prompt contracts.
- `provider.ts`: Safe-SSR localStorage helpers for provider config (`drawva.aiProvider`), cached models (`drawva.aiModels`), and active model (`drawva.aiModel`).
- `app/api/canvas/agent/step/route.ts`: SSE streaming endpoint executing a single LLM agent step via AI SDK.
- `app/api/canvas/agent/compact/route.ts`: POST endpoint summarizing conversation history on context overflow.
- `app/api/canvas/provider/route.ts`: POST endpoint verifying API credentials and fetching model lists.
- `app/api/canvas/model-validate/route.ts`: POST endpoint validating model tool calling and vision support.
- `app/api/canvas/cloud/route.ts`: GET/POST endpoint for cloud canvas persistence.

### 4. UI Shell & Control Dock (`components/canvas/`)

- `CanvasHeader.tsx`: Floating header bar featuring:
  - Top status indicator pill (**`Generating…`** with spinner, **`Done · model`**, `Ready`).
  - Tool buttons (`V`, `H`, `P`, `Shift+H`, `E`, `T`, `R`, `O`, `A`).
  - Color palette popover and stroke width selector.
  - Document File dropdown (Export PNG / Save JSON / Open JSON).
  - AI controls: model select (names only), Auto AI toggle (**OFF** by default), Ask AI button, and a Settings button opening `SettingsDialog.tsx` (provider base URL + API key → verify → fetch models).
  - Floating bottom zoom bar (`-`, `+`, percentage, `Reset`).
- `CanvasProvider.tsx`: React 19 context state management with ref guards for effect dependencies, debounced autosave, and alert dialogs.
- `CanvasApp.tsx`: Main inner shell syncing widget manager lifecycle, keyboard shortcuts, and draft accept/discard handlers.

## Session preferences

For coding tasks: work code-first, skip lengthy prose/explanations, and end with a 2–4 line summary of what changed + what's left. Re-read surrounding code before editing. Verify with `pnpm lint` + `npx tsc --noEmit` + `pnpm build`.
