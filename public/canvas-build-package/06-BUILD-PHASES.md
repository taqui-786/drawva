# 🛠️ BUILD PHASES (06-BUILD-PHASES.md)

Sequential phases. Each ends with a demo + acceptance check you can
verify yourself. Do NOT jump ahead — each phase hardens the one before.

PHASE 0 — BASE & CAMERA (days 1-2)
- Setup folders: /lib/canvas (engine), /components/canvas (React).
- Camera class: scale/panX/panY, worldToScreen/screenToWorld (pure,
  tested), zoom-at-point, clamp(0.03..4), fit-bounds.
- CanvasViewport React mount: container div, engine init in useEffect,
  destroy on unmount, SSR guard, StrictMode-safe.
- Layers: create 4 canvases (tileLayer, inkLayer, interactionLayer,
  paperLayer) + CSS stack + dpr fit on resize (ResizeObserver).
- rAF loop with dirty flag; pan via middle-drag and space+drag; wheel
  zoom to cursor; pinch (two-pointer) zoom.
ACCEPT: zoom in/out centers on cursor, pan smooth, resize of window
doesn't blur or shift content, no console errors, works in devtools
touch mode. Test file: camera math (screenToWorld(worldToScreen(p))==p,
clamps, fit).

PHASE 2 — PEN & ERASER (days 2-3)
- Pointer events on interactionLayer; setPointerCapture; pressure;
  points decimated; smoothing (quadratic midpoints); live stroke on
  inkLayer; pointerup commit into tiles; inkBounds update.
- Tile module: tile(tx,ty), forTiles(rect), clearRect commits,
  tileBounds scan (inkBox) — read pixels with willReadFrequently ctx.
- Eraser: destination-out circles per point; update inkBounds; erase
  preview on inkLayer; commit same path.
- Undo stack v1: snapshot affected tile data before commit (store
  ImageData or dataURL per changed tile). Undo restores tile + redraw.
AC: draw, undo, redo, erase; zoom into strokes while drawing mid-stroke
still smooth; 500 strokes then refresh keeps everything (see Ph3) —
actually just verify memory sane; no leaks on rapid undo/redo.
Tests: tile allocation only where ink lands; commit writes correct px;
eraser clears exactly its circle; undo restores pixel-identical.

PHASE 3 — PERSISTENCE (day 4)
- IndexedDB wrapper (promisified): documents/tiles/items stores.
- Save current doc: all tiles with ink -> blobs; items -> JSON;
  preview thumb; doc row with updatedAt.
- Autosave: debounce 2s + on visibilitychange + beforeunload.
- Load: restore tiles into Map, items, camera, render. Pixel-identical
  restore (test).
- "New canvas", "Save as", rename.
ACCEPT: draw, wait 3s, refresh -> exact restore. Close tab mid-stroke,
reopen -> last confirmed stroke restored. Tests: idb roundtrip
(commit -> load -> compare tile data); idb absent fallback (memory-only
+ toast).

PHASE 4 — TEXT, SHAPES, IMAGE (days 5-7)
- Text tool: DOM overlay (absolute div), IME-compatible, Enter commit ->
  rasterize text with fillText at dpr to offscreen; TextItem stores
  {text, image, fontSize, w, h, color}; render on objectLayer DOM
  absolutely (position via camera) or blit on tileLayer; choose DOM
  object (easier editing: re-open overlay on double-click).
- Shapes: rect/ellipse/arrow drag preview on interactionLayer, commit
  as ShapeItem on objectLayer; select by hit-test; move/resize handles.
- Image: import via input; downscale to max 2000px longest side;
  ImageItem with natural size; drag to move, corner handle to resize;
  toolbar popover: Place vs Merge-into-ink.
- Selection unified: click=select item, lasso=select pixels+items,
  marching ants, move selected pixels via tile blit, delete wipes
  tiles (clear + undo), Esc cancels.
ACCEPT: text with Chinese input works; shapes move/resize; image drag/
resize; lasso circles handwriting and moves it clean across tile
boundaries; all undoable. Tests: geometry intersect, blob move across
4 tiles, resize keeps aspect.

PHASE 5 — EXPORT & GRID (day 8)
- Export used region: inkBounds union + pad 1 tile (paper margin);
  chunk > 2048 -> compose; toBlob download; copy-to-clipboard (async).
- Grid toggle: compute grid lines in world coords visible only.
- Clear-all with confirm; fit-content camera button; zoom controls.
ACCEPT: export crops exactly; huge board export chunks; grid aligns
with world coords under zoom. Tests: export bounds math equals
inkBounds+pad (golden PNG sample compared).

PHASE 6 — COMMAND INTERFACE + DRAFT PIPELINE (day 9)
- commands.ts: CanvasCommand union + validator (all fields finite,
  whitelist tools, limits) + CommandExecutor (one method per tool,
  all internally produce DraftItems or direct items; write_text
  renders via textwriter; draw_formula stub -> KaTeX or plain text
  placeholder for now; plot_function stub -> canvas plot of ASCII
  expression (small evaluator, safe — no eval; better: mathjs or a
  tiny tokenizer); html_widget -> creates widget (Phase 7); others
  rejected.)
- Draft layer: DraftItem state pending; draft items render on
  draftLayer, move/resize controls (small React toolbar), Accept ->
  commit to engine (tiles + shapes + undo), Discard -> drop.
- Debug panel: "Simulate AI reply" button -> inject canned command
  list (write_text + a flowchart widget) -> proves pipeline.
- API route stub /api/canvas/ai (501 "AI not configured") — flagged.
ACCEPT: simulate AI reply renders draft, move/resizes, accept commits,
discard clears; validator rejects NaN/unknown tool with no partial
draws. Tests: validator fuzz (20+ bad payloads all rejected), draft
commit == manual commit for identical command.

PHASE 7 — WIDGET HOST (day 10)
- widget-host.html shell + postMessage bridge (init/host-ready/state/
  updated/snapshot-request).
- Widget items on widgetLayer (DOM absolute, CSS transform popover).
- Demo widgets: static HTML card; Mermaid chart (npm dep, dynamic
  import, responsive re-layout on resize like penecho's).
- Snapshot for export: request widget snapshot -> dataURL -> paste
  into export canvas (html2canvas or, cleaner for SVG, serializer).
- Widget management: drag, resize, select chrome, delete.
ACCEPT: widget scales/zooms with canvas; export includes it;
sandboxed iframe cannot touch parent (console error if it tries).
Tests: bridge handshake + snapshot roundtrip width/height match.

PHASE 8 — POLISH & HARDENING (days 11-13)
- Accessibility: aria, keyboard shortcuts, focus management.
- Memory guard: tile cap + eviction, undo byte cap, objectURL revoke.
- Perf monitors: rAF frame-time badge (dev only), long-task audit.
- Edge suites from 03-USE-CASES.md (D,E,I sections) — test each.
- Toolbar complete: all tools + color palette + size slider + zoom
  controls + undo/redo + save/export + grid via shadcn/ui.
- Dark/light themes match shadcn tokens; canvas paper/grid colorable.
- E2E (Playwright): draw->save->reload->compare, touch flow, export
  downloads; page screenshot visual check.
ACCEPT: full checklist from master prompt PART 4 (DONE CRITERIA)
all pass; no console errors on any path; 60fps verified.

====================================================================
DELIVERY ORDER (git log shape)
====================================================================
c1: canvas scaffold + camera
c2: pen/ink/tiles/erase/undo
c3: idb persistence
c4: text/shapes/images/selection
c5: export + grid
c6: command interface + drafts
c7: widget host + mermaid demo
c8: polish/hardening/tests final

====================================================================
DEFINITIONS OF DONE (DOD) — every merged phase:
- Tests green (vitest)
- No console errors (manual run)
- Works mouse + touch (devtools)
- Undo/redo for any new operation
- No leak (devtools memory over 3 min)
- Commit message = phase name

The canvas engine now is: an infinite whiteboard with 7 tools,
undo history, persistence, export, drafts, sandbox widgets — and
a perfect seam for the LangChain agent in Phase 2 (see 05-AI-FUTURE).