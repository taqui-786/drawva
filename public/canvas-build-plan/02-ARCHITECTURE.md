# 🏗️ CANVAS ENGINE ARCHITECTURE (02-ARCHITECTURE.md)

How PenEcho's canvas works (verified from source) + how YOU replicate it
in Next.js/TS. This is the "why" behind the master prompt.

## 1. The core idea: the canvas is a LIE

Your screen shows a white page. Behind it there is NO single big image.
PenEcho uses a LOGICAL space 20000x20000 units, cut into 512x512 tiles.
Only tiles that have actual ink on them are ever created. Everything else
is virtual. This one decision solves memory, speed, and save all at once.

```
World space (20000x20000 logical units)
┌─────────────────────────────────────┐
│  ┌────┐ ┌────┐  (only these tiles   │
│  │5,4 │ │6,4 │   actually exist as  │
│  └────┘ └────┘  512x512 canvases)   │
│        ┌────┐                        │
│        │5,5 │                        │
│        └────┘                        │
└─────────────────────────────────────┘
```

Real code from PenEcho (src/client/app/canvas-runtime.js):

```js
function tile(tx, ty, create = true) {
  const k = key(tx, ty);                    // "5,4"
  if (!tiles.has(k) && create) {           // only make when needed
    const c = document.createElement("canvas");
    c.width = c.height = TILE;             // 512
    c.getContext("2d", { willReadFrequently: true });
    tiles.set(k, c);
  }
  return tiles.get(k);
}
```

Wait: `willReadFrequently: true` — that's for the eraser/lasso which read
pixels back. Copy this.

## 2. The camera (pan + zoom transform)

PenEcho's state: `{ scale, panX, panY }`. Conversion math (from source):

```js
// world -> screen
screenX = panX + worldX * scale;
screenY = panY + worldY * scale;
// screen -> world (used for placing things under the cursor)
worldX = (screenX - panX) / scale;
worldY = (screenY - panY) / scale;
```

Zooming is done by pointing the camera at the cursor:
newScale = clamp(oldScale * factor, 0.03, 4)
panX' = cursorScreenX - cursorWorldX * newScale

## 3. The render loop (only visible tiles, batched)

```js
function requestRender() {
  if (state.renderQueued) return;      // one rAF per frame, no spam
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function render() {
  // compute visible world rect from camera
  const l = Math.max(0, -state.panX / state.scale);
  const t = Math.max(0, -state.panY / state.scale);
  const rr = Math.min(SIZE, (viewportW - state.panX) / state.scale);
  const b = Math.min(SIZE, (viewportH - state.panY) / state.scale);
  // apply camera to the context
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportW, viewportH);
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.scale, state.scale);
  // draw ONLY tiles intersecting the visible rect
  forTiles(l, t, rr - l, b - t, (canvas, tx, ty) =>
    ctx.drawImage(canvas, tx * TILE, ty * TILE));
}
```

forTiles computes tile index ranges from a rect (world coords):
```js
function forTiles(x, y, w, h, fn) {
  if (w <= 0 || h <= 0) return;
  const x0 = Math.max(0, Math.floor(x / TILE));
  const y0 = Math.max(0, Math.floor(y / TILE));
  const x1 = Math.min(Math.ceil(SIZE / TILE) - 1, Math.ceil((x + w) / TILE) - 1);
  const y1 = Math.min(Math.ceil(SIZE / TILE) - 1, Math.ceil((y + h) / TILE) - 1);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      fn(tile(tx, ty), tx, ty);
}
```

## 4. Layer stack (from index.html)

```html
<section id="viewport">
  <canvas id="screen"></canvas>           <!-- paper + confirmed ink -->
  <canvas id="animationLayer"></canvas>  <!-- animations (you can skip) -->
  <div id="widgetLayer"></div>           <!-- HTML widgets -->
  <canvas id="summonLayer"></canvas>     <!-- AI "thinking" indicator -->
  <canvas id="inkLayer"></canvas>        <!-- live pen preview -->
  <canvas id="interactionLayer"></canvas><!-- lasso + handles -->
  <div id="objectChromeLayer"></div>    <!-- drop shadows/hit areas -->
  <div id="textEditorLayer"></div>      <!-- DOM text editor -->
  <div id="selectionOverlayLayer"></div><!-- toolbar over selection -->
</section>
```

Key insight: DURING a stroke only inkLayer redraws (cheap). On pointerup the
stroke is committed to tiles and tileLayer redraws once. This split is what
keeps 60fps while drawing on huge boards.

## 5. Strokes: pressure, smoothing, commit

- pointerdown: begin stroke, capture pointer
- pointermove: append point {x,y,pressure}, draw preview on inkLayer
  using quadratic curves through midpoints (smooth handwriting)
- pointerup: commit to tiles via forTiles(strokeBox, ...), pushing each
  affected tile's ctx; update inkBounds; push undo record; redraw tileLayer

Pressure: `e.pressure` (0..1). Pen width = baseSize * (0.35 + pressure*0.65).

## 6. Text: DOM overlay, commit by rasterizing

Typing directly on canvas is pain (no cursor, no IME, no selection). PenEcho
uses a DOM textarea positioned at the world point, then rasterizes on
confirm. For your app: MathJax-free version can just rasterize with
canvas fillText (or use KaTeX for pretty formulas later — it's a dep
that stays client-side and works offline).

## 7. Undo/redo: snapshot the CHANGED REGION only

Before any destructive operation (stroke commit, erase, move, clear),
capture the BEFORE state of exactly the affected tiles/items into a
snapshot object. Undo = restore snapshot. Store max ~50 snapshots and cap
total bytes (~64MB) — drop oldest when over. This is simpler than
command-pattern undo and works for pixel erasers.

## 8. Persistence: IndexedDB, tile-as-blob

```
DB: canvas-db v1
 - documents:  { id, version, createdAt, updatedAt, previewBlob }
 - tiles:      { id: "docId:tx,ty", blob: PNG }
 - items:      { id: "docId:itemId", data }   // text/shape/image/widget
```

Save = iterate tiles, for each with inkBounds -> canvas.toBlob('image/png')
-> put. Autosave debounced 2s. Load = open doc, load its tiles, render.

## 9. Export PNG

Export region -> create offscreen canvas of region size * scale (cap
~4096x4096), iterate forTiles over region, drawImage each, canvas.toBlob.
If region is bigger than browser limits, render in chunks and compose.

## 10. Next.js + TS specifics (your stack)

- Canvas engine = plain TS classes in /lib/canvas (zero React). React
  component <CanvasViewport /> mounts a container div; engine attaches
  to it in useEffect (create layer canvases, listeners, RAF).
- Cleanup on unmount: cancel RAF, remove listeners, close IndexedDB
  connections, revoke object URLs.
- StrictMode double-mount: make mount/destroy idempotent.
- SSR: guard all canvas/DOM code with `typeof window !== 'undefined'`
  (Next.js prerenders on server).
- shadcn/ui: toolbar only. Use CanvasProvider (React context) for UI state,
  but the engine never re-renders from React state — it reads its own
  internal state; React mirrors to toolbar via subscribe/emit.
- dynamic import the engine with `ssr: false` if you hydrate it in a page.

## 11. Why NOT a canvas library

Konva/Fabric/tldraw are great but: (a) they own the render loop and data
model, which fights your AI-command design later; (b) PenEcho proves a
hand-rolled engine in ~3k lines of canvas runtime beats them for control.
You learn more and the AI integration becomes trivial (your model outputs
commands, your executor owns everything). Keep vanilla.
```