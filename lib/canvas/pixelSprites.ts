/**
 * Procedural pixel-art sprite frames for the AI agent character.
 *
 * Frames are built on a 24×24 grid via stamp helpers, then baked once into
 * offscreen canvases. Drawing uses imageSmoothingEnabled=false and the
 * controller snaps the sprite to integer pixel multiples, so scaling stays
 * crisply pixelated at any zoom/DPR.
 *
 * Two sprite sets:
 *   front_* — faces the viewer (idle, think, celebrate, sad, vertical walk)
 *   side_*  — faces RIGHT (authored); the controller mirrors it for left.
 *             Used for walking, drawing (pencil), reading (magnifier).
 *
 * Palette keys:
 *   k outline    h hair       s skin       e eyes/mouth   w white glint/logo
 *   b shirt (Drawva primary green)  g highlight  d shade
 *   p pants      f shoes      t tool amber  o thought dots
 *
 * The shirt carries a 3×4 white "D" mark — Drawva's AI worker.
 */

export const SPRITE_W = 24;
export const SPRITE_H = 24;

export type SpriteFrameName =
  | "front_idle0"
  | "front_idle1"
  | "front_walk0"
  | "front_walk1"
  | "front_think0"
  | "front_think1"
  | "front_celebrate"
  | "front_sad"
  | "side_walk0"
  | "side_walk1"
  | "side_walk2"
  | "side_walk3"
  | "side_work0"
  | "side_work1"
  | "side_read0"
  | "side_read1";

const PALETTE: Record<string, string> = {
  k: "#1c232b",
  h: "#4a3423",
  s: "#f2c29b",
  e: "#1e293b",
  w: "#ffffff",
  b: "#22c55e",
  g: "#4ade80",
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

// ── FRONT SET (faces viewer) ─────────────────────────────────────

type Eyes = "open" | "closed" | "lookL" | "lookR";
type Mouth = "smile" | "grin" | "frown" | "none";
type FrontArms = "hip" | "up" | "chin";

/** Head block; dy shifts it for breathing bob. */
function frontHead(g: Grid, dy: number, eyes: Eyes, mouth: Mouth): void {
  hline(g, 8, 15, 0 + dy, "k");
  set(g, 7, 1 + dy, "k");
  hline(g, 8, 15, 1 + dy, "h");
  set(g, 16, 1 + dy, "k");
  set(g, 6, 2 + dy, "k");
  hline(g, 7, 16, 2 + dy, "h");
  set(g, 17, 2 + dy, "k");
  // hair fringe, swept from the left
  set(g, 6, 3 + dy, "k");
  hline(g, 7, 11, 3 + dy, "h");
  hline(g, 12, 15, 3 + dy, "s");
  set(g, 16, 3 + dy, "s");
  set(g, 17, 3 + dy, "k");
  // eyes (glint w + pupil e), optionally looking left/right
  set(g, 6, 4 + dy, "k");
  hline(g, 7, 16, 4 + dy, "s");
  set(g, 17, 4 + dy, "k");
  if (eyes === "closed") {
    hline(g, 9, 10, 4 + dy, "e");
    hline(g, 13, 14, 4 + dy, "e");
  } else {
    const ex = eyes === "lookL" ? -1 : eyes === "lookR" ? 1 : 0;
    set(g, 9 + ex, 4 + dy, "w");
    set(g, 10 + ex, 4 + dy, "e");
    set(g, 13 + ex, 4 + dy, "w");
    set(g, 14 + ex, 4 + dy, "e");
  }
  // cheeks
  set(g, 6, 5 + dy, "k");
  hline(g, 7, 16, 5 + dy, "s");
  set(g, 17, 5 + dy, "k");
  // mouth
  set(g, 6, 6 + dy, "k");
  hline(g, 7, 16, 6 + dy, "s");
  set(g, 17, 6 + dy, "k");
  if (mouth === "smile") {
    hline(g, 11, 12, 6 + dy, "e");
  } else if (mouth === "grin") {
    hline(g, 10, 13, 6 + dy, "e");
  } else if (mouth === "frown") {
    hline(g, 11, 12, 7 + dy, "e");
  }
  // chin
  set(g, 6, 7 + dy, "k");
  hline(g, 7, 16, 7 + dy, "s");
  set(g, 17, 7 + dy, "k");
  set(g, 7, 8 + dy, "k");
  hline(g, 8, 15, 8 + dy, "s");
  set(g, 16, 8 + dy, "k");
  // neck
  hline(g, 10, 13, 9 + dy, "s");
}

/** Green tee with white "D" mark; dy shifts for breathing bob. */
function frontTorso(g: Grid, dy: number): void {
  set(g, 5, 10 + dy, "k");
  hline(g, 6, 17, 10 + dy, "b");
  set(g, 18, 10 + dy, "k");
  for (const y of [11, 12, 13, 14, 15]) {
    set(g, 4, y + dy, "k");
    hline(g, 5, 18, y + dy, "b");
    set(g, 19, y + dy, "k");
  }
  // shading: top-left highlight, right-edge shade
  hline(g, 6, 8, 11 + dy, "g");
  for (const y of [12, 13, 14, 15]) {
    set(g, 17, y + dy, "d");
    set(g, 18, y + dy, "d");
  }
  // hem
  set(g, 4, 16 + dy, "k");
  hline(g, 5, 18, 16 + dy, "d");
  set(g, 19, 16 + dy, "k");
  // white "D" logo (3×4) on the chest
  set(g, 11, 13 + dy, "w");
  set(g, 12, 13 + dy, "w");
  set(g, 11, 14 + dy, "w");
  set(g, 13, 14 + dy, "w");
  set(g, 11, 15 + dy, "w");
  set(g, 13, 15 + dy, "w");
  set(g, 11, 16 + dy, "w");
  set(g, 12, 16 + dy, "w");
}

function frontArms(g: Grid, dy: number, mode: FrontArms): void {
  if (mode === "hip") {
    set(g, 2, 11 + dy, "k");
    set(g, 3, 11 + dy, "b");
    set(g, 20, 11 + dy, "b");
    set(g, 21, 11 + dy, "k");
    for (const y of [12, 13, 14, 15]) {
      set(g, 2, y + dy, "k");
      set(g, 3, y + dy, "s");
      set(g, 20, y + dy, "s");
      set(g, 21, y + dy, "k");
    }
    set(g, 3, 16 + dy, "k");
    set(g, 20, 16 + dy, "k");
  } else if (mode === "up") {
    // sleeves at the shoulder, arms straight up, open palms above the head
    set(g, 2, 11 + dy, "k");
    set(g, 3, 11 + dy, "b");
    set(g, 20, 11 + dy, "b");
    set(g, 21, 11 + dy, "k");
    vline(g, 4 + dy, 10 + dy, 2, "k");
    vline(g, 4 + dy, 10 + dy, 3, "s");
    vline(g, 4 + dy, 10 + dy, 20, "s");
    vline(g, 4 + dy, 10 + dy, 21, "k");
    set(g, 3, 3 + dy, "s");
    set(g, 20, 3 + dy, "s");
  } else {
    // chin: left arm on hip, right forearm raised to the mouth
    set(g, 2, 11 + dy, "k");
    set(g, 3, 11 + dy, "b");
    for (const y of [12, 13, 14, 15]) {
      set(g, 2, y + dy, "k");
      set(g, 3, y + dy, "s");
    }
    set(g, 3, 16 + dy, "k");
    set(g, 19, 12 + dy, "s");
    set(g, 20, 12 + dy, "s");
    vline(g, 9 + dy, 12 + dy, 18, "s");
    set(g, 19, 12 + dy, "s");
  }
}

/** Standing legs (fixed rows — the breathing bob never moves the feet). */
function frontLegsStand(g: Grid): void {
  set(g, 6, 17, "k");
  hline(g, 7, 16, 17, "p");
  set(g, 17, 17, "k");
  for (const y of [18, 19, 20, 21]) {
    set(g, 6, y, "k");
    hline(g, 7, 9, y, "p");
    set(g, 10, y, "k");
    set(g, 13, y, "k");
    hline(g, 14, 16, y, "p");
    set(g, 17, y, "k");
  }
  set(g, 5, 22, "k");
  hline(g, 6, 10, 22, "f");
  set(g, 11, 22, "k");
  set(g, 12, 22, "k");
  hline(g, 13, 17, 22, "f");
  set(g, 18, 22, "k");
  set(g, 5, 23, "k");
  hline(g, 6, 9, 23, "f");
  set(g, 10, 23, "k");
  set(g, 13, 23, "k");
  hline(g, 14, 17, 23, "f");
  set(g, 18, 23, "k");
}

/** Front walk step: one leg lifted (shortened + raised shoe). */
function frontLegsStep(g: Grid, lift: "left" | "right"): void {
  frontLegsStand(g);
  const c = lift === "left" ? 7 : 14; // lifted leg column block start
  // clear the lifted leg block
  for (const y of [18, 19, 20, 21, 22, 23]) {
    for (let x = c - 2; x <= c + 3; x++) set(g, x, y, ".");
  }
  const k0 = lift === "left" ? 6 : 13;
  const p0 = lift === "left" ? 7 : 14;
  const f0 = lift === "left" ? 5 : 12;
  // raised shin + tucked shoe
  for (const y of [18, 19, 20]) {
    set(g, k0, y, "k");
    hline(g, p0, p0 + 2, y, "p");
    set(g, p0 + 3, y, "k");
  }
  set(g, k0 - 1, 21, "k");
  hline(g, f0, f0 + 4, 21, "f");
  set(g, f0 + 5, 21, "k");
  set(g, k0 - 1, 22, "k");
  hline(g, f0, f0 + 3, 22, "f");
  set(g, f0 + 4, 22, "k");
}

// ── SIDE SET (authored facing right; controller mirrors for left) ──

type SideArms = "hang" | "back" | "fwd" | "pencilUp" | "pencilDown" | "lensUp" | "lensDown";

function sideHead(g: Grid, dy: number, mouth: boolean): void {
  hline(g, 8, 15, 0 + dy, "k");
  set(g, 7, 1 + dy, "k");
  hline(g, 8, 15, 1 + dy, "h");
  set(g, 16, 1 + dy, "k");
  set(g, 6, 2 + dy, "k");
  hline(g, 7, 16, 2 + dy, "h");
  set(g, 17, 2 + dy, "k");
  // hair mass at the back (left), face toward the front (right)
  set(g, 6, 3 + dy, "k");
  hline(g, 7, 12, 3 + dy, "h");
  hline(g, 13, 16, 3 + dy, "s");
  set(g, 17, 3 + dy, "k");
  set(g, 6, 4 + dy, "k");
  hline(g, 7, 9, 4 + dy, "h");
  hline(g, 10, 13, 4 + dy, "s");
  hline(g, 14, 15, 4 + dy, "e");
  set(g, 16, 4 + dy, "s");
  set(g, 17, 4 + dy, "k");
  set(g, 6, 5 + dy, "k");
  hline(g, 7, 16, 5 + dy, "s");
  set(g, 17, 5 + dy, "k");
  set(g, 6, 6 + dy, "k");
  hline(g, 7, 11, 6 + dy, "s");
  if (mouth) {
    hline(g, 12, 13, 6 + dy, "e");
  } else {
    hline(g, 12, 13, 6 + dy, "s");
  }
  hline(g, 14, 16, 6 + dy, "s");
  set(g, 17, 6 + dy, "k");
  set(g, 6, 7 + dy, "k");
  hline(g, 7, 16, 7 + dy, "s");
  set(g, 17, 7 + dy, "k");
  set(g, 7, 8 + dy, "k");
  hline(g, 8, 15, 8 + dy, "s");
  set(g, 16, 8 + dy, "k");
  hline(g, 11, 14, 9 + dy, "s");
}

function sideTorso(g: Grid, dy: number): void {
  set(g, 7, 10 + dy, "k");
  hline(g, 8, 15, 10 + dy, "b");
  set(g, 16, 10 + dy, "k");
  for (const y of [11, 12, 13, 14, 15]) {
    set(g, 6, y + dy, "k");
    hline(g, 7, 16, y + dy, "b");
    set(g, 17, y + dy, "k");
  }
  // shading: light on the front-top, dark at the back seam
  hline(g, 9, 11, 11 + dy, "g");
  for (const y of [12, 13, 14, 15]) set(g, 7, y + dy, "d");
  set(g, 6, 16 + dy, "k");
  hline(g, 7, 16, 16 + dy, "d");
  set(g, 17, 16 + dy, "k");
}

function sideArms(g: Grid, dy: number, mode: SideArms): void {
  if (mode === "hang" || mode === "back") {
    const x = mode === "hang" ? 18 : 5; // front arm out, or swung behind
    const kx = mode === "hang" ? 19 : 4;
    set(g, x, 11 + dy, "b"); // sleeve
    set(g, kx, 11 + dy, "k");
    for (const y of [12, 13, 14, 15]) {
      set(g, x, y + dy, "s");
      set(g, kx, y + dy, "k");
    }
    set(g, x, 16 + dy, "k");
    return;
  }
  if (mode === "fwd") {
    // swung forward while walking
    set(g, 18, 12 + dy, "s");
    set(g, 19, 13 + dy, "s");
    set(g, 20, 14 + dy, "s");
    set(g, 21, 15 + dy, "s");
    return;
  }
  if (mode === "pencilUp") {
    // raised arm holding a pencil, tip up-forward
    set(g, 18, 11 + dy, "s");
    set(g, 19, 10 + dy, "s");
    set(g, 20, 9 + dy, "s");
    set(g, 20, 8 + dy, "s"); // hand
    set(g, 21, 7 + dy, "t");
    set(g, 22, 6 + dy, "t");
    set(g, 23, 5 + dy, "e"); // pencil tip
    return;
  }
  if (mode === "pencilDown") {
    // arm forward, pencil angled down at the canvas
    set(g, 18, 12 + dy, "s");
    set(g, 19, 13 + dy, "s");
    set(g, 20, 14 + dy, "s");
    set(g, 21, 15 + dy, "s"); // hand
    set(g, 22, 13 + dy, "t");
    set(g, 23, 14 + dy, "t");
    set(g, 23, 15 + dy, "e"); // tip touching the work
    return;
  }
  // magnifier frames
  const top = mode === "lensUp" ? 5 : 8;
  if (mode === "lensUp") {
    set(g, 18, 11 + dy, "s");
    set(g, 18, 12 + dy, "s");
    set(g, 19, 10 + dy, "s"); // hand under the lens
  } else {
    set(g, 18, 12 + dy, "s");
    set(g, 18, 13 + dy, "s");
    set(g, 19, 13 + dy, "s");
    set(g, 19, 12 + dy, "s"); // hand mid
  }
  // lens: 3×3 amber ring with white glass
  hline(g, 19, 21, top, "t");
  set(g, 19, top + 1, "t");
  set(g, 20, top + 1, "w");
  set(g, 21, top + 1, "t");
  hline(g, 19, 21, top + 2, "t");
  // handle down to the hand
  if (mode === "lensUp") {
    set(g, 20, top + 3, "t");
    set(g, 20, top + 4, "t");
  } else {
    set(g, 20, top + 3, "t");
  }
}

function sideLegsHips(g: Grid, tall: boolean): void {
  if (tall) {
    set(g, 6, 16, "k");
    hline(g, 7, 16, 16, "p");
    set(g, 17, 16, "k");
  }
  set(g, 6, 17, "k");
  hline(g, 7, 16, 17, "p");
  set(g, 17, 17, "k");
}

/** Profile legs together (standing / walking pass pose). */
function sideLegsStand(g: Grid, tall: boolean): void {
  sideLegsHips(g, tall);
  for (const y of [18, 19, 20, 21]) {
    set(g, 7, y, "k");
    hline(g, 8, 15, y, "p");
    set(g, 16, y, "k");
  }
  set(g, 6, 22, "k");
  hline(g, 7, 16, 22, "f");
  set(g, 17, 22, "k");
  set(g, 7, 23, "k");
  hline(g, 8, 16, 23, "f");
  set(g, 17, 23, "k");
}

/** Stride A: near leg planted forward, far leg lifting behind. */
function sideLegsStrideA(g: Grid): void {
  sideLegsHips(g, false);
  for (const [y, bx, px] of [
    [18, 4, 5],
    [19, 3, 4],
    [20, 3, 4],
  ] as const) {
    set(g, bx, y, "k");
    hline(g, px, px + 3, y, "p");
    set(g, px + 4, y, "k");
  }
  set(g, 3, 21, "k");
  hline(g, 4, 7, 21, "f");
  set(g, 8, 21, "k");
  for (const [y, bx, px] of [
    [18, 11, 12],
    [19, 12, 13],
    [20, 12, 13],
    [21, 12, 13],
  ] as const) {
    set(g, bx, y, "k");
    hline(g, px, px + 4, y, "p");
    set(g, px + 5, y, "k");
  }
  set(g, 12, 22, "k");
  hline(g, 13, 18, 22, "f");
  set(g, 19, 22, "k");
  set(g, 13, 23, "k");
  hline(g, 14, 18, 23, "f");
  set(g, 19, 23, "k");
}

/** Stride B: far leg planted forward, near leg trailing behind. */
function sideLegsStrideB(g: Grid): void {
  sideLegsHips(g, false);
  for (const [y, bx, px] of [
    [18, 5, 6],
    [19, 6, 7],
    [20, 6, 7],
    [21, 6, 7],
  ] as const) {
    set(g, bx, y, "k");
    hline(g, px, px + 3, y, "p");
    set(g, px + 4, y, "k");
  }
  set(g, 6, 22, "k");
  hline(g, 7, 11, 22, "f");
  set(g, 12, 22, "k");
  set(g, 7, 23, "k");
  hline(g, 8, 11, 23, "f");
  set(g, 12, 23, "k");
  // far leg reaches forward, lifted
  for (const [y, bx, px] of [
    [18, 13, 14],
    [19, 13, 14],
    [20, 12, 13],
  ] as const) {
    set(g, bx, y, "k");
    hline(g, px, px + 4, y, "p");
    set(g, px + 5, y, "k");
  }
  set(g, 12, 21, "k");
  hline(g, 13, 17, 21, "f");
  set(g, 18, 21, "k");
}

function build(frame: (g: Grid) => void): string[] {
  const g = emptyGrid();
  frame(g);
  return g.map((row) => row.join(""));
}

const FRAMES: Record<SpriteFrameName, string[]> = {
  // ── Front ──
  front_idle0: build((g) => {
    frontHead(g, 0, "open", "smile");
    frontTorso(g, 0);
    frontArms(g, 0, "hip");
    frontLegsStand(g);
  }),
  front_idle1: build((g) => {
    // breathing bob + blink
    frontHead(g, 1, "closed", "smile");
    frontTorso(g, 1);
    frontArms(g, 1, "hip");
    frontLegsStand(g);
  }),
  front_walk0: build((g) => {
    frontHead(g, 0, "open", "none");
    frontTorso(g, 0);
    frontArms(g, 0, "hip");
    frontLegsStep(g, "left");
  }),
  front_walk1: build((g) => {
    frontHead(g, 1, "open", "none");
    frontTorso(g, 1);
    frontArms(g, 1, "hip");
    frontLegsStep(g, "right");
  }),
  front_think0: build((g) => {
    frontHead(g, 0, "open", "none");
    frontTorso(g, 0);
    frontArms(g, 0, "chin");
    frontLegsStand(g);
    set(g, 22, 0, "o");
    set(g, 21, 2, "o");
  }),
  front_think1: build((g) => {
    // eyes glance toward the dots, bubble rises
    frontHead(g, 0, "lookR", "none");
    frontTorso(g, 0);
    frontArms(g, 0, "chin");
    frontLegsStand(g);
    set(g, 23, 0, "o");
    set(g, 22, 1, "o");
    set(g, 21, 2, "o");
  }),
  front_celebrate: build((g) => {
    frontHead(g, 0, "open", "grin");
    frontTorso(g, 0);
    frontArms(g, 0, "up");
    frontLegsStand(g);
  }),
  front_sad: build((g) => {
    // slumped: whole body down 1px, closed eyes, frown
    frontHead(g, 1, "closed", "frown");
    frontTorso(g, 1);
    frontArms(g, 1, "hip");
    frontLegsStand(g);
  }),
  // ── Side (facing right) ──
  side_walk0: build((g) => {
    sideHead(g, 0, false);
    sideTorso(g, 0);
    sideArms(g, 0, "back");
    sideLegsStrideA(g);
  }),
  side_walk1: build((g) => {
    sideHead(g, -1, false);
    sideTorso(g, -1);
    sideArms(g, -1, "hang");
    sideLegsStand(g, true);
  }),
  side_walk2: build((g) => {
    sideHead(g, 0, false);
    sideTorso(g, 0);
    sideArms(g, 0, "fwd");
    sideLegsStrideB(g);
  }),
  side_walk3: build((g) => {
    sideHead(g, -1, false);
    sideTorso(g, -1);
    sideArms(g, -1, "hang");
    sideLegsStand(g, true);
  }),
  side_work0: build((g) => {
    sideHead(g, 0, true);
    sideTorso(g, 0);
    sideArms(g, 0, "pencilUp");
    sideLegsStand(g, false);
  }),
  side_work1: build((g) => {
    sideHead(g, 0, true);
    sideTorso(g, 0);
    sideArms(g, 0, "pencilDown");
    sideLegsStand(g, false);
  }),
  side_read0: build((g) => {
    sideHead(g, 0, false);
    sideTorso(g, 0);
    sideArms(g, 0, "lensUp");
    sideLegsStand(g, false);
  }),
  side_read1: build((g) => {
    sideHead(g, 0, false);
    sideTorso(g, 0);
    sideArms(g, 0, "lensDown");
    sideLegsStand(g, false);
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
