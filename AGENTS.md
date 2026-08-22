<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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

### How the AI Pipeline Actually Works (short version)

No magic bruh, it's just one loop: **draw → snapshot → prompt build → AI picks tools → validators → render.**

1. **📸 Snapshot**: `atlas.ts` photographs the canvas as WebP (≤2048px) + `scene.ts` serializes scene state to compact JSON.
2. **🧾 Prompt build** (`agent.ts`): system prompt = rulebook blocks glued together (`prompts.ts`: `SYSTEM_PROMPT` + persona + `PLUGIN_ROUTING_PROMPT` + `PLUGIN_SYSTEM_PROMPT` + `MANDATORY_VISIBLE_RESPONSE` + JSON schema). User message = JSON blob (`modelInput`) with `changedBox` (newest ink), viewport rects, widget geometry limits, scene items — plus the photo attached as an image part.
3. **🔌 Plugin injection** (`lib/plugins/registry.ts`): plugins are markdown cards in `public/plugins/<name>/plugin.md`. Server scans them (10s cache), filters by enabled IDs (localStorage `drawva.enabledPlugins`), enforces a 40KB total injection budget, and pastes each card's full document into `modelInput.enabledPlugins[]`. The model only knows plugins because their docs were pasted into its prompt — plugin CSS never enters model context.
4. **🤖 Tool choice is the model's job**: native commands for simple stuff (`write_text`, `draw_formula`, `plot_function`, `draw`, `erase`), `diagram_source` for professional formats (mermaid/dot/smiles/vega-lite/bpmn/cytoscape/geojson), `html_widget` for rich/interactive/live-data visuals.
5. **✅ Validation is NOT optional** (`commands.ts`): every command goes through `validateCommand`/`validateCommands` — allowed-tools check against enabled plugins, coordinate clamping to 20000×20000, HTML ≤200KB, diagram source ≤100KB, max 16 commands, max 1 widget per reply (with companion native commands like write_text/draw_formula preserved), smart placement around `changedBox`. Failures are dropped with a reason. Never bypass these checks.
6. **🎨 Render**: native commands hit canvas layers directly; widgets mount via `WidgetManager` into sandboxed iframes (`/widget-host.html`, libraries loaded per format).

Key rule: **the AI can only request changes; strict validators decide what actually draws.** Any new command type must be added in both `prompts.ts` (schema/rulebook) and `commands.ts` (validator) or it will be silently rejected.

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
 │  LangChain AI Agent (lib/ai/):                                           │
 │   ├── Canvas Perception (Atlas image & Scene JSON)                       │
 │   ├── Multimodal Reasoning (Spatial intent & gestures)                    │
 │   └── Structured Command Output (7 diagram formats, MathJax & applets)   │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  Persistence (lib/canvas/persistence.ts): IndexedDB autosave canvas-db   │
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

### 3. LangChain AI Agent (`lib/ai/`)

- `model.ts`: Single OpenAI-compatible model factory `createChatModel({ baseUrl, apiKey, model })` → `ChatOpenAI` (temp 0.2, timeout 120s). `MAX_RETRIES = 3` (total attempts). No env-based provider routing.
- `agent.ts`: Single-model pipeline (`runAgent(req, sceneText, model, opts)`): structured-output first, direct-JSON fallback within an attempt, up to `MAX_RETRIES` total attempts, then throws. No fallback chain (`getAllCodeModels`, `getFallbackReply` removed).
- `provider.ts`: Safe-SSR localStorage helpers for the user's provider config (`drawva.aiProvider`), cached model list (`drawva.aiModels`), and active model (`drawva.aiModel`).
- `prompts.ts`: Core prompt contracts (`SYSTEM_PROMPT`, `CODE_SYSTEM_PROMPT_EXTRA`, `MANDATORY_VISIBLE_RESPONSE`, `PLUGIN_ROUTING_PROMPT`, `PLUGIN_SYSTEM_PROMPT`, `WIDGET_RENDERING_POLICY`). Anchors answers below the user's latest ink (`x = changedBox.x, y = changedBox.y + changedBox.h + 24`).
- `app/api/canvas/provider/route.ts`: POST verifies a user-supplied OpenAI-compatible base URL + API key by fetching `{base}/models` (falls back to `{base}/v1/models`); returns the model list. When the provider declares per-model capabilities (OpenRouter `input_modalities`), it returns only vision-capable models (`filteredByVision: true`); otherwise it returns all models. Key is never logged or persisted.

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
