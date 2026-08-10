# 📋 MASTER IDE PROMPT (01-IDE-PROMPT.md)

> Copy EVERYTHING inside the fence below into your IDE agent (Claude Code, Cursor, Codex).
> Replace `{YOUR_PROJECT_PATH}` with your Next.js project folder.

```
You are a senior canvas engineer. Build a PRODUCTION-GRADE infinite canvas app
inside my existing Next.js + TypeScript + shadcn/ui project at {YOUR_PROJECT_PATH}.

READ THIS FIRST: This prompt is a spec. Follow it exactly. Do not simplify it,
do not skip sections, do not build the AI part (see SCOPE below).

=====================================================================
PART 0 — SCOPE (WHAT TO BUILD AND WHAT NOT TO BUILD)
=====================================================================

WHAT TO BUILD:
- A full infinite canvas whiteboard engine (pan, zoom, draw, erase, select, move).
- Working tools: pen (with pressure), highlighter, eraser, hand/pan, lasso select,
  text box, rectangle/ellipse/arrow shapes, image import.
- Layers, tiles, undo/redo, save/load to IndexedDB, export to PNG.
- A clean React component API so shadcn/ui toolbar buttons can control the canvas.

WHAT NOT TO BUILD (IMPORTANT):
- NO AI integration. NO LLM calls. NO LangChain yet. NO server API routes for AI.
- BUT the architecture MUST be AI-ready: there must be a well-defined Command
  interface (JSON commands like write_text / draw_formula / plot_function / draw /
  erase / html_widget / diagram_source) that a future LangChain agent can emit and
  the canvas can render. Design the Command type + a draft-commit pipeline now.
- Follow the exact pattern PenEcho uses: AI output renders as a "draft" overlay,
  user can move/resize/accept/discard BEFORE it commits to the canvas.

=====================================================================
PART 1 — CORE ARCHITECTURE (MANDATORY)
=====================================================================

1.1 WORLD / SCREEN / CAMERA MODEL
- The canvas world is a LOGICAL space, e.g. 20000 x 20000 units (world coords).
- The viewport (screen) shows a small window of it. A camera holds
  { scale, panX, panY } (same pattern as PenEcho's state.scale/panX/panY).
- Provide pure functions:
  - worldToScreen(p: {x,y}) -> {x,y}
  - screenToWorld(p: {x,y}) -> {x,y}
  - These MUST be the ONLY places that convert coordinates. Every feature
    (drawing, clicking, dragging, lasso) uses them. Never inline the math.
- Zoom: wheel/pinch around the cursor position (zoom to point), clamp scale
  between 0.03 and 4.0. Pan: middle-mouse drag, space+drag, or hand tool.

1.2 SPARSE TILE SYSTEM (THE #1 PERFORMANCE TRICK)
- The world is divided into 512x512 logical tiles (PenEcho: TILE = 512).
- A tile is an offscreen canvas (512x512 CSS px * devicePixelRatio).
- Tiles are created LAZILY: only when ink/objects actually land on them.
  Store tiles in a Map keyed by "tx,ty" (e.g. "3,7").
- NEVER create a full-world bitmap. Never render all tiles. Only render the
  tiles intersecting the visible viewport rectangle (max ~40 visible tiles).
- Each tile also keeps an "ink bounds" (the bounding box of actual non-empty
  pixels within it) so export/selection can skip empty regions.
- On commit of any stroke: draw into the affected tiles (clipping to tile
  bounds), then mark those tiles' ink-bounds dirty.

1.3 LAYERED RENDERING (MANDATORY — like animation cels)
Create these stacked layers inside a relative-positioned viewport container:
  1. paperLayer (DOM/canvas) — background + grid
  2. tileLayer (canvas)      — confirmed ink rendered from tiles
  3. objectLayer (DOM)       — text boxes, images, widgets (HTML on top of canvas)
  4. draftLayer (canvas)     — AI drafts / pending items (uncommitted)
  5. inkLayer (canvas)       — live pen stroke preview while drawing
  6. interactionLayer (canvas) — lasso path, selection handles, hover outlines
Each layer is a separate <canvas> (or div for DOM layers) sized to the viewport
* devicePixelRatio. Layers render independently; pan/zoom updates the transform
of all layers.

1.4 RENDER LOOP
- Use requestAnimationFrame with a "dirty" flag pattern:
  - requestRender() sets renderQueued = true and schedules ONE rAF.
  - render() clears the flag and redraws: background, visible tiles, objects,
    then delegates to layer-specific renderers.
- NEVER render synchronously per mouse-move. Batch to rAF.
- During a stroke, only redraw inkLayer per pointermove (cheap), and redraw
  tileLayer once on pointerup (commit). This is what makes it lag-free.
- devicePixelRatio handling: all layer canvases = cssSize * dpr; ctx.scale(dpr).
  Re-fit canvases on resize (debounced).

1.5 DATA MODEL (TYPESCRIPT)
- Stroke { id, tool: 'pen'|'highlighter'|'eraser', points: {x,y,pressure}[],
  color, size, opacity, committedToTiles: boolean }
- TextItem { id, x, y, text, fontSize, color, width, height, image? }
- ImageItem { id, x, y, w, h, src, image }
- ShapeItem { id, type: 'rect'|'ellipse'|'arrow'|'line', x, y, w, h, color,
  strokeWidth, fill }
- WidgetItem { id, x, y, w, h, kind: 'html'|'diagram', payload }  // AI-ready
- DraftItem { id, type, ...payload, state: 'pending'|'accepted'|'discarded' }
- CanvasDocument { version, tiles: Record<string,string>, items: Item[],
  createdAt, updatedAt }  // tiles stored as dataURL/PNG blobs

1.6 COMMAND INTERFACE (AI-READY, BUILD NOW)
Define a discriminated union (future LangChain agent will emit these as JSON):
  type CanvasCommand =
    | { tool: 'write_text'; x; y; text; fontSize; maxWidth? }
    | { tool: 'draw_formula'; x; y; latex; fontSize }
    | { tool: 'plot_function'; x; y; w; h; expression }
    | { tool: 'draw'; origin; types: [...]; items: [...] }
    | { tool: 'erase'; mode; x; y; w; h }
    | { tool: 'html_widget'; x; y; w; h; title; html }
    | { tool: 'diagram_source'; x; y; w; h; sourceFormat; source; title }
Implement a CommandExecutor with one method per tool. For now, the executor
is only called from internal UI (e.g. "Add text"), but the interface is stable.
VALIDATE every command server-side-style: coordinates finite, sizes bounded,
tool names whitelisted, widget HTML length capped. Reject silently + log.

1.7 PERSISTENCE (IndexedDB)
- Open DB "canvas-db" v1 with object stores: documents (keyPath id),
  tiles (keyPath "id" = "docId:tx,ty"), items.
- Save = snapshot pattern: iterate tiles with ink, store PNG blobs; store
  items as JSON; store preview thumbnail.
- Autosave: debounce 2s after any commit. Save is async, never blocks render.
- Undo/redo: store BEFORE-snapshots of affected tile+item regions in a stack
  (max ~50 entries, keep memory bounded by storing small region blobs).

=====================================================================
PART 2 — TOOLS & INTERACTIONS (MANDATORY)
=====================================================================

2.1 PEN — pointer events (pointerdown/move/up/cancel) on the top interaction
  layer. Capture pointer via setPointerCapture. Track pressure (0..1).
  Draw live stroke on inkLayer with lineJoin/lineCap round, quadratic
  smoothing (midpoints). On pointerup: commit stroke into tiles, add to
  undo stack, clear inkLayer. Support touch + mouse + stylus (PenEcho uses
  pointer events for all three; do the same).

2.2 ERASER — raster eraser: destination-out on the tile context in a circle
  around each point, updating ink-bounds of affected tiles. (Because ink is
  pixels, not vectors, erase by clearing pixels — PenEcho's approach.)

2.3 LASSO SELECT — freehand path; on close (pointerup near start), build a
  Path2D, hit-test items and clip tiles to the path; selected region renders
  on interactionLayer with marching-ants + drag to move, handles to resize,
  Delete to remove, Esc to cancel. This is the hard tool — budget time for it.

2.4 TEXT TOOL — DOM textarea overlay positioned at world point (absolute
  positioned div translated by camera transform), live preview, Enter to
  commit -> rasterize to an offscreen canvas (so it renders on tileLayer),
  or keep as TextItem object rendered on objectLayer. PenEcho rasterizes
  text to keep everything uniform — do the same.

2.5 SHAPES — rect/ellipse/arrow: draw preview on interactionLayer during
  drag, commit to an item on pointerup. Hit-test for select/resize later.

2.6 IMAGE IMPORT — file input -> Image -> place at world point scaled to
  fit max ~600px, draggable/resizable (handles), keeps object identity.
  Option to "merge into ink" (rasterize onto tiles) later (PenEcho has this:
  "Place image" vs "Merge into ink" — merge makes eraser work on it).

2.7 HAND/PAN + ZOOM — hand tool drag = pan (middle-drag always pans).
  Wheel = zoom to cursor. Pinch (touch) = zoom. Buttons for zoom in/out/fit.

2.8 TOOLBAR (shadcn/ui) — Toolbar component with: pen (color swatches,
  size slider), highlighter, eraser, hand, select, text, shapes, image,
  undo, redo, clear, zoom controls, save, export PNG, grid toggle.
  shadcn buttons/select/dropdown/popover wrap a plain controller object
  (e.g. canvasApi.setTool('pen')). Keep React OUT of the render hot path:
  the engine is vanilla TS classes; React only mounts the DOM shell and
  toolbar. Zustand or React context for UI state only (tool, color, size).

=====================================================================
PART 3 — LAG-FREE / PRODUCTION REQUIREMENTS (MANDATORY)
=====================================================================

3.1 PERF BUDGET: 60fps during stroke; <16ms per frame; no jank on
  devices with touch. Verify with: drawing 1000+ strokes then pan/zoom
  must stay smooth; scrolling the page is never blocked by canvas.

3.2 NEVER DO IN A MOUSE HANDLER: tile drawing, item hit-tests (unless
  trivial), JSON serialization, IndexedDB writes. All heavy work goes to
  rAF or a deferred queue / idle callback.

3.3 MEMORY BOUNDS: cap tiles Map (~10k tiles max, evict far tiles to
  IndexedDB or drop with re-render from stored strokes when zoomed out);
  cap undo stack size by total bytes (~64MB); revoke object URLs after use.

3.4 EDGE CASES THAT MUST NOT CRASH (write tests for each):
  - Zooming to extreme out (0.03) and extreme in (4.0) — no divide-by-zero,
    no infinite loop, no NaN coordinates.
  - Resize of window / devicePixelRatio change (browser zoom, moving window
    between monitors) — canvas refits, content stays put.
  - Very fast strokes / huge strokes (10k+ points) — decimate points
    (distance threshold) before storing.
  - Tab hidden for 10 min then returning — render loop resumes, autosave
    flushes, no stale rAF.
  - Undo during an active stroke / undo after clear / redo after new edit
    (standard redo-invalidation).
  - Importing a 20MB image — downscale before placing; no memory blowup.
  - Touch + palm rejection: only one active pointer for drawing; ignore
    pointercancel gracefully.
  - Exporting a region larger than max canvas size (browsers cap canvas
    ~16384px) — chunk the export into tiles, compose onto a big canvas
    only if within limits, else compose on a max-size canvas and downscale.
  - localStorage unavailable (privacy mode) — catch and fall back to
    memory-only with a warning toast.
  - Multiple tabs open on same document — IndexedDB last-write-wins;
    show a "reopened from another tab" notice (no real-time sync needed).

3.5 ACCESSIBILITY: all toolbar controls keyboard-reachable, aria-labels,
  canvas region gets role="application" + aria-label, focus ring on canvas.

=====================================================================
PART 4 — DELIVERABLES & DONE CRITERIA
=====================================================================

DELIVER:
- /components/canvas/* — CanvasViewport.tsx, CanvasToolbar.tsx (shadcn),
  CanvasProvider.tsx (context/state), canvasApi.ts (imperative controller)
- /lib/canvas/* — engine.ts (camera, loop), tiles.ts, layers.ts,
  strokes.ts, commands.ts (Command types + executor), persistence.ts
  (IndexedDB), selection.ts, textTool.ts, shapes.ts, exportPng.ts
- /lib/canvas/__tests__/* — vitest tests: camera math, tile bounds,
  command validation, undo stack, export chunking. At least 20 tests.
- README-canvas.md — how to mount <CanvasViewport/> + toolbar in a page.

DONE CRITERIA (verify all before stopping):
1. Draw, erase, select, move, text, shapes, image all work in the browser.
2. Pan/zoom is smooth with 500+ strokes on screen (no jank).
3. Refresh page -> canvas restores from IndexedDB exactly.
4. Undo/redo works across strokes, text, shapes, images, clear.
5. Export PNG works for a region and for the whole used area.
6. `npm run test` passes (canvas tests).
7. The Command interface + draft pipeline exist and are unit-tested
   (even though no AI calls them yet).
8. No console errors on any path (drawing, zoom, save, export, resize).
9. Works with mouse AND touch (test via devtools device mode).

=====================================================================
PART 5 — CONSTRAINTS & STYLE
=====================================================================

- TypeScript strict mode. No `any` (except deliberate vendor boundaries).
- No new canvas libraries (no Konva/Fabric/tldraw/perfect-freehand deps).
  Vanilla Canvas2D only — this is the whole point of the exercise.
- React never touches the canvas directly. All rendering is imperative TS.
- Commit after each phase. Write tests BEFORE the implementation
  (red-green-refactor). Keep functions small and pure where possible.
- If something is ambiguous, make the simplest robust choice, document it
  in a DECISIONS.md note, and continue. Do not ask me questions mid-build.
- At the end, summarize what you built, what you decided, and what
  remains for the AI phase (Phase 2).
```
