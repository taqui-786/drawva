# 🧩 USE CASES & EDGE CASES (03-USE-CASES.md)

Every scenario you must handle so the canvas never breaks. Organized as:
situation → what MUST happen → how PenEcho achieves it → what you do.

## A. Core drawing use cases

### A1. Student handwriting math (pen)
Situation: user writes "3+2=" by hand, fast, on a tablet.
Must: strokes appear instantly, smooth curves, no lag, pressure matters.
How: live ink on inkLayer per pointermove; commit to tiles on pointerup;
quadratic midpoint smoothing + pressure-based width.
Test: 100 strokes drawn quickly — zero dropped rAF frames mid-stroke.

### A2. Zoom into handwriting 8x
Situation: user zooms way in to read tiny writing.
Must: text stays crisp (no pixel blur), lines stay 1px on screen.
How: tiles are 512px raster; when zoomed, canvas redraws tiles scaled —
blur happens only if you scale raster. Better: keep strokes as data and
re-rasterize at target resolution when scale > 2 (re-tile at higher res).
PenEcho renders tiles at fixed 512 and accepts slight softness; for your
app, re-rasterize strokes into new tiles when scale crosses thresholds.
Test: zoom to 4x — strokes should still look like lines, not blocks.

### A3. Zoom out to see whole board (fit)
Must: compute bounding box of all ink (inkBounds union) + items, set
camera to fit. No NaN, no infinite render loop at extreme zoom-out.
How: clamp scale to [0.03, 4]. For huge boards, rendering every visible
tile at 0.03 scale = fine (tiles collapse to sub-pixel, browser handles).

### A4. Pan around a big diagram
Must: only visible tiles redraw; nothing else during pan.
How: pointermove pan updates panX/panY + one RAF redraw. DOM layers
(widgets/text) get transform updated via CSS translate (GPU).

## B. Selection & editing use cases

### B1. Lasso select handwriting + text + shapes
Situation: user circles a diagram region, wants to move it.
Must: closed lasso path; everything intersecting path gets selected,
including partial tile ink (clip pixels to path).
How: build Path2D from lasso points; for tiles, clip ctx to path and
draw region to interaction layer; drag = offset render; commit = blit
into tiles at new position, clearing old (snapshot for undo first!).
Hard part: moving pixels between tiles = erase originals, write
destination tiles, update inkBounds. Budget 1-2 days. Test: move
selection overlapping 4 tiles — all pixels move, nothing duplicated.

### B2. Delete selection
Clip selected area, clear pixels in tiles, snapshot undo. Test the
boundary case where the selection sits exactly on a tile edge (2 tiles:
both must clear).

### B3. Resize selection (stretch)
Scale the clipped bitmap; re-rasterize into destination bounds. Keep
aspect ratio unless shift held.

## B4. Undo/redo across mixed operations
Sequence: draw -> erase -> move text -> clear all -> undo 4 times
-> redo 3 -> must restore exact state each step.
Redo after new edit = redo stack dropped (invalidate). PenEcho keeps
history records per region; copying this pattern is fine.

## C. Text & rich content

### C1. Typing text at a world position
DOM overlay at panX+x*scale. Handles IME (Chinese input) natively —
you get composition events for free. Commit: rasterize to offscreen
canvas at logical size * resolution, store as TextItem.
Test: type 500 chars -> commit -> zoom -> still crisp.

### C2. Resizing placed text after commit
Keep TextItem as object (w/h + rendered image); scale the image.
Re-edit = re-open DOM editor pre-filled with text content — so you
normalize store BOTH the image and the original string.

### C3. Image import & merge
Situation: user drops a screenshot, then wants to erase part of it.
A 'place' image = object, eraser can't touch it (it's a DOM/bitmap object).
'Merge into ink' = rasterize onto tiles at that spot → eraser works since
ink is now pixels. Expose both options in a small popover (PenEcho does
exactly this: Place image vs Merge into ink).

## D. Zoom/pan + device edge cases

### D1. Window resize / DPR change / browser zoom
ResizeObserver on viewport -> refit all layer canvases (width =
clientW*dpr), keep camera (scale/pan in logical units untouched), redraw.
Test: drag window between 1x and 2x DPR monitors — content position stable.

### D2. Pinch zoom on touch
Two pointers: track both, distance ratio = zoom factor around midpoint.
One pointer = draw/pan. Must not conflict: if second finger goes down
mid-draw, cancel the stroke (pointercancel handler).

### D3. Tab hidden / device sleeps
rAF pauses automatically; on visibilitychange, flush autosave + redraw
once. No stale rAF (loop re-schedules each frame, so it just resumes).

### D4. Extreme coordinates
Draw at world edge (x=19950). Stroke commit must clamp to tile grid
bounds and not create tiles outside 0..SIZE. NaN guard: after every
camera operation check isFinite(scale/panX/panY) — log + reset if not.

## E. Performance & scale use cases

### E1. 1000+ strokes, heavy board
Pan/zoom smooth: the killer feature of tiles: visible tiles only. If
still slow, offscreen "mipmap" tiles: render 2x2 tiles to a half-res
canvas for far zoom levels (PenEcho doesn't, but lazy tiles + cap at
~150 in view is enough).

### E2. Huge single stroke (10k points)
Decimate points: skip if dist < max(0.8, size*0.1) px. Prevents memory
blowup and slow commit. Keep original if < 2000 points for fidelity.

### E3. Long session memory
Cap tiles Map total ~10k; evict tiles far from view (write to a
'tile-cache' IDB store when evicted, reload on demand). Actually —
your items store may suffice: if stroke committed as raster tile, eviction
loses fidelity unless you re-rasterize from stored Stroke data. Decide:
keep stroke data as source of truth + tile as render cache (best — gives
you re-rasterization on zoom for free), or store raster only (simplest —
PenEcho does raster, and loses zoom fidelity). For AI-era editing,
stroke source data wins: AI can modify strokes. But complexity. Pick
raster for v1, source-data for v2.

### E4. Memory on mobile
Pressures: keep tile blobs only for saved state; live canvas tiles are
memory — cap count; when over, GC oldest by re-rendering from source
(if source kept) or drop + flag as "needs reraster on view".

## F. Persistence & session

### F1. Refresh = exact restore
Load doc from IndexedDB, load its tiles into the tiles Map, items into
state, restore camera (if saved), render. MUST be pixel-identical —
unit test: save -> wipe state -> load -> compare tile pixels.

### F2. Crash / autosave loss
Autosave debounce 2s; also snapshot on visibilitychange and on unload
(document visibilitychange + beforeunload best-effort).

### F3. Multiple tabs, same browser
No sync: last-write-wins. Show "saved at HH:MM" + "opened from another
tab" notice via storage event. Avoid corrupting: version the doc, on
load if stored version > current, warn before overwrite.
Test: open 2 tabs, edit both, confirm toast + no silent data loss.

## G. Export & share

### G1. Export used region PNG
Compute union inkBounds + items bounds, pad 1 tile margin, chunk if
> 4096px, compose, toBlob, download. Must be cropped to ink (no giant
blank paper) — Pen boundary: "one 512-pixel tile of paper margin on
every side".

### G2. Copy to clipboard
navigator.clipboard.write with PNG blob (async, catch permission denial).

### G3. Export as JSON (for later AI phase)
CanvasDocument serialization: tiles (base64), items, version. Useful
later as the AI's context payload. Cheap to add now — do it.

## I. UI/UX edge cases

### I1. Toolbar state vs canvas state desync
Single source of truth: engine state; React mirrors via a subscribe
(callback) pattern. Tools changing while stroke in progress -> cancel
stroke first.

### I2. Keyboard shortcuts
Space = pan (temporarily switch hand), Ctrl+Z/Y undo/redo, Del delete
selection, Ctrl+= / Ctrl+- zoom, 0 = fit. Guard: don't hijack when focus
is in a textarea/input.

### I3. Mouse leaving the window mid-drag
pointerup outside -> should still commit. Use setPointerCapture so
events keep flowing. On pointercancel -> commit or revert (PenEcho
reverts to the pre-stroke tile state; simplest and safest).

### I4. Right-click context menu
Prevent default on canvas (except when text editing); decide later
to add menu: paste image, add note, copy link to position.

### I5. High contrast / color-blind
Never color-code tools ONLY by color — also shape/label. Grid + paper
colors themeable.

## J. Future-proof (build interface now, implement later)

### J1. The Command pipeline (AI-ready)
Even with AI disconnected, executor must exist and validate commands.
This is the contract the LangChain agent will emit. Unit test with
false commands: unknown tool, NaN coords, text over 10k chars, widget
HTML > 100kb, x/y outside canvas, empty string latex — all rejected,
no partial writes.

### J2. Draft → accept flow skeleton
DraftLayer exists (canvas). draftItem state pending; paint on
draftLayer not tileLayer; move/resize/accept/discard controls
(React small controls overlay). When AI comes, it renders into
draftLayer and only commit to tileLayer on accept. Build this UI
now and call it from a debug button ("simulate AI reply") with a
fixed command list — proves the pipeline end to end.

### J3. Widget container (HTML/diagram widgets)
A sandboxed iframe host (widget-host.html) that receives
{title, html} via postMessage and renders, plus a snapshot bridge
(html2canvas or svg serialization) for export. Building the shell
NOW with a "demo widget" makes the AI phase purely additive:
which model emits { tool:'html_widget', html }.
(Full details in 04-FLOWCHART-RENDERING.md + 05-AI-FUTURE.md.)

## K. Non-functional requirements checklist (final)

- FPS: stroke 60fps (check via Performance monitor), pan/zoom 60fps
- Load time: bundle < 250kb gzip; canvas code lazy-loaded
- Memory: 1000 strokes ~< 100MB (tile bytes dominate); watch leak
  (object URLs, RAF, listeners, IndexedDB tx)
- Error tolerance: any error in render/commit caught, logged,
  canvas stays usable (try/catch around RAF body)
- Security: never eval arbitrary strings; SVG sanitized if injected
  (widgets sandboxed) — XSS-safe by design
- Tests: vitest unit (engine math, tiles, undo, commands, export)
  + playwright E2E for draw/load/save/zoom touch
```