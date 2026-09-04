/**
 * Procedural pixel-art sprite frames for the AI agent character.
 *
 * Frames are built on a 16×18 grid via tiny stamp helpers (clearer than
 * hand-typing 18 strings × 14 frames), then baked once into offscreen
 * canvases. Drawing uses imageSmoothingEnabled=false and the controller
 * snaps the sprite to integer pixel multiples, so scaling stays crisply
 * pixelated at any zoom/DPR.
 *
 * Palette keys:
 *   k outline   h hair      s skin      e eyes/mouth
 *   b shirt (Drawva primary green)   d shirt shade
 *   p pants     f shoes     t tool (amber)   o thought-bubble dots
 *
 * The character is front-facing; eyes sit one pixel right of center, so a
 * horizontal flip makes him visibly look toward the side his tool points.
 */

export const SPRITE_W = 16;
export const SPRITE_H = 18;

export type SpriteFrameName =
  | "idle0"
  | "idle1"
  | "walk0"
  | "walk1"
  | "work0"
  | "work1"
  | "think0"
  | "think1"
  | "read0"
  | "read1"
  | "celebrate0"
  | "celebrate1"
  | "sad";

const PALETTE: Record<string, string> = {
  k: "#1c232b",
  h: "#3b2f2a",
  s: "#f2c29b",
  e: "#1e293b",
  b: "#22c55e",
  d: "#15803d",
  p: "#3f4a5a",
  f: "#1c232b",
  t: "#f59e0b",
  o: "#94a3b8",
};

type Grid = string[][];

function emptyGrid(): Grid {
  return Array.from({ length: SPRITE_H }, () => Array<string>(SPRITE_W).fill("."));
}

function set(g: Grid, x: number, y: number, ch: string): void {
  if (y >= 0 && y < SPRITE_H && x >= 0 && x < SPRITE_W) g[y][x] = ch;
}

function hline(g: Grid, x0: number, x1: number, y: number, ch: string): void {
  for (let x = x0; x <= x1; x++) set(g, x, y, ch);
}

function vline(g: Grid, y0: number, y1: number, x: number, ch: string): void {
  for (let y = y0; y <= y1; y++) set(g, x, y, ch);
}

/** Head + torso. Right hand pixel at y8 only when `rightHand`. */
function baseBody(g: Grid, rightHand: boolean): void {
  // ── Head (outline box, cols 3-12) ──
  hline(g, 4, 11, 0, "k");
  set(g, 3, 1, "k");
  hline(g, 4, 11, 1, "h");
  set(g, 12, 1, "k");
  set(g, 3, 2, "k");
  set(g, 4, 2, "h");
  hline(g, 5, 10, 2, "s");
  set(g, 11, 2, "h");
  set(g, 12, 2, "k");
  set(g, 3, 3, "k");
  hline(g, 4, 11, 3, "s");
  set(g, 7, 3, "e");
  set(g, 10, 3, "e");
  set(g, 12, 3, "k");
  set(g, 3, 4, "k");
  hline(g, 4, 11, 4, "s");
  set(g, 12, 4, "k");
  hline(g, 6, 9, 5, "s"); // neck

  // ── Torso (t-shirt, cols 3-12, outline k at 2/13) ──
  set(g, 2, 6, "k");
  hline(g, 3, 12, 6, "b");
  set(g, 13, 6, "k");
  set(g, 2, 7, "k");
  set(g, 3, 7, "b");
  hline(g, 4, 11, 7, "d");
  set(g, 12, 7, "b");
  set(g, 13, 7, "k");
  set(g, 2, 8, "k");
  hline(g, 3, 12, 8, "b");
  set(g, 13, 8, "k");
  set(g, 1, 8, "s"); // left hand on hip
  if (rightHand) set(g, 14, 8, "s");
  set(g, 2, 9, "k");
  hline(g, 3, 12, 9, "b");
  set(g, 13, 9, "k");
  set(g, 2, 10, "k");
  hline(g, 3, 12, 10, "b");
  set(g, 13, 10, "k");
  set(g, 2, 11, "k");
  hline(g, 3, 12, 11, "d"); // hem
  set(g, 13, 11, "k");
}

function legsStand(g: Grid): void {
  hline(g, 4, 11, 12, "p");
  for (const y of [13, 14, 15]) {
    hline(g, 4, 6, y, "p");
    hline(g, 9, 11, y, "p");
  }
  hline(g, 3, 6, 16, "f");
  hline(g, 9, 12, 16, "f");
  hline(g, 2, 6, 17, "f");
  hline(g, 9, 13, 17, "f");
}

function legsStride(g: Grid): void {
  hline(g, 4, 11, 12, "p");
  hline(g, 3, 5, 13, "p");
  hline(g, 10, 12, 13, "p");
  hline(g, 2, 4, 14, "p");
  hline(g, 11, 13, 14, "p");
  hline(g, 1, 2, 15, "p");
  hline(g, 13, 14, 15, "p");
  hline(g, 0, 2, 16, "f");
  hline(g, 13, 15, 16, "f");
}

function legsPass(g: Grid): void {
  hline(g, 4, 11, 12, "p");
  for (const y of [13, 14, 15]) {
    hline(g, 4, 6, y, "p");
    hline(g, 9, 11, y, "p");
  }
  hline(g, 4, 6, 16, "f");
  hline(g, 9, 11, 16, "f");
}

function build(frame: (g: Grid) => void): string[] {
  const g = emptyGrid();
  frame(g);
  return g.map((row) => row.join(""));
}

const FRAMES: Record<SpriteFrameName, string[]> = {
  idle0: build((g) => {
    baseBody(g, true);
    legsStand(g);
  }),
  idle1: build((g) => {
    baseBody(g, true);
    legsStand(g);
    // blink: eyes drop a row
    set(g, 7, 3, "s");
    set(g, 10, 3, "s");
    set(g, 7, 4, "e");
    set(g, 10, 4, "e");
  }),
  walk0: build((g) => {
    baseBody(g, true);
    legsStride(g);
  }),
  walk1: build((g) => {
    baseBody(g, true);
    legsPass(g);
  }),
  work0: build((g) => {
    baseBody(g, false);
    legsStand(g);
    // right arm raised, hammer up
    vline(g, 2, 6, 14, "s");
    hline(g, 12, 14, 0, "t");
    set(g, 14, 1, "t");
  }),
  work1: build((g) => {
    baseBody(g, false);
    legsStand(g);
    // right arm out, hammer down at hip level
    set(g, 14, 7, "s");
    set(g, 14, 8, "s");
    set(g, 14, 9, "t");
    set(g, 14, 10, "t");
    hline(g, 13, 15, 11, "t");
  }),
  think0: build((g) => {
    baseBody(g, true);
    legsStand(g);
    set(g, 14, 0, "o");
    set(g, 13, 2, "o");
    // hand at chin
    set(g, 12, 5, "s");
    set(g, 13, 5, "s");
  }),
  think1: build((g) => {
    baseBody(g, true);
    legsStand(g);
    set(g, 14, 0, "o");
    set(g, 13, 1, "o");
    set(g, 12, 2, "o");
    set(g, 12, 5, "s");
    set(g, 13, 5, "s");
  }),
  read0: build((g) => {
    baseBody(g, false);
    legsStand(g);
    // magnifier raised
    hline(g, 13, 14, 2, "t");
    hline(g, 13, 14, 3, "t");
    set(g, 14, 4, "t");
    set(g, 14, 5, "s");
    set(g, 14, 6, "s");
  }),
  read1: build((g) => {
    baseBody(g, true);
    legsStand(g);
    // magnifier lowered
    hline(g, 13, 14, 4, "t");
    hline(g, 13, 14, 5, "t");
    set(g, 14, 6, "t");
    set(g, 14, 7, "s");
  }),
  celebrate0: build((g) => {
    baseBody(g, false);
    legsStand(g);
    // both arms up
    set(g, 0, 3, "s");
    vline(g, 4, 6, 1, "s");
    set(g, 15, 3, "s");
    vline(g, 4, 6, 14, "s");
  }),
  celebrate1: build((g) => {
    baseBody(g, false);
    legsPass(g); // airborne tuck
    set(g, 0, 3, "s");
    vline(g, 4, 6, 1, "s");
    set(g, 15, 3, "s");
    vline(g, 4, 6, 14, "s");
  }),
  sad: build((g) => {
    baseBody(g, false);
    legsStand(g);
    // frown + limp arms (no hands on hips)
    set(g, 7, 4, "e");
    set(g, 8, 4, "e");
  }),
};

/** Row access without touching DOM (validation / tests). */
export function getFrameRows(name: SpriteFrameName): string[] {
  return FRAMES[name];
}

const cache = new Map<SpriteFrameName, HTMLCanvasElement>();

/** Bake (once) and return the offscreen canvas for a frame. */
export function getSpriteFrame(name: SpriteFrameName): HTMLCanvasElement {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext("2d");
  const rows = FRAMES[name];
  if (ctx) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const color = PALETTE[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  cache.set(name, canvas);
  return canvas;
}
