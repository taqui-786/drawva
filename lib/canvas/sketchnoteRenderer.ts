import type { CanvasCommand, DrawPoint } from "./commands";
import { SIZE } from "./constants";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";

export type LayoutMode = "modular" | "flowing" | "radial" | "columns" | "timeline";
export type PaletteName = "mono" | "cool" | "warm" | "vibrant" | "pastel";

export interface SketchnoteCustomElement {
  type: "line" | "arrow" | "circle" | "ellipse" | "curve" | "arc" | "text" | "dot";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  w?: number;
  h?: number;
  points?: [number, number][];
  startA?: number;
  endA?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  size?: number;
}

export interface SketchnoteVisualDiagram {
  type?: "surface_3d" | "loss_surface" | "complex_plane" | "unit_circle" | "network" | "neural_network" | "cycle" | "flow" | "custom" | string;
  title?: string;
  annotation?: string;
  elements?: SketchnoteCustomElement[];
}

export interface SketchnoteSection {
  id: string;
  heading: string;
  bullets?: string[];
  icon?: string;
  container?: "box" | "cloud" | "bracket" | "banner" | "underline" | "burst" | "none" | string;
  emphasis?: "normal" | "highlight" | "bold";
  accentColor?: "red" | "yellow" | "blue" | "green" | "black" | string;
  highlightWord?: string;
  listStyle?: "bullet" | "number";
}

export interface SketchnoteConnector {
  from: string;
  to: string;
  label?: string;
  style?: "arrow" | "dashed" | "line" | "curved";
}

export interface SketchnoteSpec {
  title: string;
  subtitle?: string;
  layout?: string;
  palette?: string;
  visualDiagram?: SketchnoteVisualDiagram;
  sections: SketchnoteSection[];
  connectors?: SketchnoteConnector[];
  x: number;
  y: number;
  w?: number;
}

const INK_BLACK = "#18181b";
const INK_RED = "#dc2626";
const INK_BLUE = "#2563eb";
const INK_SKY = "#0284c7";
const INK_GREEN = "#16a34a";
const INK_AMBER = "#f59e0b";
const INK_GRAY = "#4b5563";
const INK_YELLOW_FILL = "rgba(251, 191, 36, 0.4)";
const INK_YELLOW_HL = "rgba(250, 204, 21, 0.35)";

interface Palette {
  red: string;
  blue: string;
  green: string;
  amber: string;
  black: string;
}

const PALETTES: Record<string, Palette> = {
  mono: { red: "#3f3f46", blue: "#27272a", green: "#52525b", amber: "#71717a", black: INK_BLACK },
  cool: { red: INK_RED, blue: INK_BLUE, green: INK_GREEN, amber: INK_AMBER, black: INK_BLACK },
  warm: { red: "#b91c1c", blue: "#9a3412", green: "#a16207", amber: "#d97706", black: INK_BLACK },
  vibrant: { red: "#e11d48", blue: "#4f46e5", green: "#059669", amber: "#f59e0b", black: INK_BLACK },
  pastel: { red: "#f87171", blue: "#7dd3fc", green: "#6ee7b7", amber: "#fcd34d", black: "#334155" },
};

const gen = rough.generator();

const STROKE_SCALE: Options = { roughness: 2.2, bowing: 3.5, maxRandomnessOffset: 4 };
const SINGLE: Options = { ...STROKE_SCALE, disableMultiStroke: true };

function clampPt(p: DrawPoint): DrawPoint {
  return {
    x: Math.max(0, Math.min(SIZE, Math.round(p.x))),
    y: Math.max(0, Math.min(SIZE, Math.round(p.y))),
  };
}

function drawableToPolylines(drawable: Drawable, stepsPerCurve = 6): DrawPoint[][] {
  const polylines: DrawPoint[][] = [];
  for (const set of drawable.sets) {
    let cur: DrawPoint[] = [];
    let cx = 0;
    let cy = 0;
    const flush = () => {
      if (cur.length >= 2) polylines.push(cur.map(clampPt));
      cur = [];
    };
    for (const op of set.ops) {
      if (op.op === "move") {
        flush();
        cx = op.data[0];
        cy = op.data[1];
        cur.push({ x: cx, y: cy });
      } else if (op.op === "lineTo") {
        cx = op.data[0];
        cy = op.data[1];
        cur.push({ x: cx, y: cy });
      } else if (op.op === "bcurveTo") {
        const [c1x, c1y, c2x, c2y, ex, ey] = op.data;
        for (let s = 1; s <= stepsPerCurve; s++) {
          const t = s / stepsPerCurve;
          const u = 1 - t;
          cur.push({
            x: u * u * u * cx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
            y: u * u * u * cy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
          });
        }
        cx = ex;
        cy = ey;
      }
    }
    flush();
  }
  return polylines;
}

function chainNearby(polylines: DrawPoint[][], threshold = 42): DrawPoint[][] {
  const merged: DrawPoint[][] = [];
  let acc: DrawPoint[] | null = null;
  for (const pl of polylines) {
    if (pl.length < 2) continue;
    if (acc && Math.hypot(pl[0].x - acc[acc.length - 1].x, pl[0].y - acc[acc.length - 1].y) <= threshold) {
      acc.push(...pl.slice(1));
    } else {
      if (acc) merged.push(acc);
      acc = [...pl];
    }
  }
  if (acc) merged.push(acc);
  return merged;
}

function inkCommands(polylines: DrawPoint[][], size: number, color: string, chain = true): CanvasCommand[] {
  const merged = chain ? chainNearby(polylines) : polylines;
  const cmds: CanvasCommand[] = [];
  for (let pl of merged) {
    if (pl.length < 2) continue;
    pl = pl.map(clampPt);
    if (pl.length > 598) {
      for (let i = 0; i < pl.length; i += 500) {
        const chunk = pl.slice(i, i + 502);
        if (chunk.length >= 2) cmds.push({ tool: "draw", points: chunk, size, color });
      }
    } else {
      cmds.push({ tool: "draw", points: pl, size, color });
    }
  }
  return cmds;
}

function stroke(drawable: Drawable, size: number, color: string): CanvasCommand[] {
  return inkCommands(drawableToPolylines(drawable), size, color);
}

function lineCmds(x1: number, y1: number, x2: number, y2: number, size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.line(x1, y1, x2, y2, multi ? STROKE_SCALE : SINGLE), size, color);
}

function rectCmds(x: number, y: number, w: number, h: number, size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.rectangle(x, y, w, h, multi ? STROKE_SCALE : SINGLE), size, color);
}

function circleCmds(cx: number, cy: number, r: number, size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.circle(cx, cy, r * 2, multi ? STROKE_SCALE : SINGLE), size, color);
}

function ellipseCmds(cx: number, cy: number, w: number, h: number, size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.ellipse(cx, cy, w, h, multi ? STROKE_SCALE : SINGLE), size, color);
}

function arcCmds(cx: number, cy: number, w: number, h: number, startA: number, endA: number, size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.arc(cx, cy, w, h, startA, endA, false, multi ? STROKE_SCALE : SINGLE), size, color);
}

function curveCmds(points: [number, number][], size: number, color: string, multi = true): CanvasCommand[] {
  return stroke(gen.curve(points, multi ? STROKE_SCALE : SINGLE), size, color);
}

function linearPathCmds(points: [number, number][], size: number, color: string, multi = false): CanvasCommand[] {
  return stroke(gen.linearPath(points, multi ? STROKE_SCALE : SINGLE), size, color);
}

function polygonCmds(points: [number, number][], size: number, color: string, multi = false): CanvasCommand[] {
  return stroke(gen.polygon(points, multi ? STROKE_SCALE : SINGLE), size, color);
}

function cloudCmds(x: number, y: number, w: number, h: number, size: number, color: string): CanvasCommand[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const cloudPts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const bump = 1 + 0.12 * Math.sin(a * 6);
    cloudPts.push([cx + rx * bump * Math.cos(a), cy + ry * bump * Math.sin(a)]);
  }
  return curveCmds(cloudPts, size, color, true);
}

function burstCmds(x: number, y: number, w: number, h: number, size: number, color: string): CanvasCommand[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const teeth = 14;
  const burstPts: [number, number][] = [];
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const factor = i % 2 === 0 ? 1.12 : 0.88;
    burstPts.push([cx + rx * factor * Math.cos(a), cy + ry * factor * Math.sin(a)]);
  }
  return polygonCmds(burstPts, size, color);
}

function bracketCmds(x: number, y: number, h: number, size: number, color: string): CanvasCommand[] {
  const midY = y + h / 2;
  return linearPathCmds(
    [
      [x + 18, y],
      [x + 4, y + 12],
      [x + 4, midY - 14],
      [x - 12, midY],
      [x + 4, midY + 14],
      [x + 4, y + h - 12],
      [x + 18, y + h],
    ],
    size,
    color
  );
}

function arrowCmds(x1: number, y1: number, x2: number, y2: number, size: number, color: string): CanvasCommand[] {
  const cmds = lineCmds(x1, y1, x2, y2, size, color, false);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 18;
  const wing: [number, number][] = [
    [x2 - headLen * Math.cos(angle - 0.5), y2 - headLen * Math.sin(angle - 0.5)],
    [x2, y2],
    [x2 - headLen * Math.cos(angle + 0.5), y2 - headLen * Math.sin(angle + 0.5)],
  ];
  cmds.push(...linearPathCmds(wing, size + 0.5, color, false));
  return cmds;
}

function curvedArrowCmds(x1: number, y1: number, x2: number, y2: number, size: number, color: string): CanvasCommand[] {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(90, len * 0.25);
  const px = mx - (dy / len) * bow;
  const py = my + (dx / len) * bow;
  const cmds = curveCmds([[x1, y1], [px, py], [x2, y2]], size, color, false);
  const angleIn = Math.atan2(y2 - py, x2 - px);
  const headLen = 18;
  const wing: [number, number][] = [
    [x2 - headLen * Math.cos(angleIn - 0.5), y2 - headLen * Math.sin(angleIn - 0.5)],
    [x2, y2],
    [x2 - headLen * Math.cos(angleIn + 0.5), y2 - headLen * Math.sin(angleIn + 0.5)],
  ];
  cmds.push(...linearPathCmds(wing, size + 0.5, color, false));
  return cmds;
}

function dotCmd(x: number, y: number, size = 14, color = INK_BLACK): CanvasCommand {
  return {
    tool: "draw",
    points: [
      { x: Math.round(x), y: Math.round(y) },
      { x: Math.round(x + 0.1), y: Math.round(y + 0.1) },
    ],
    size,
    color,
  };
}

function estWrappedLines(text: string, fontSize: number, maxWidth: number): number {
  const avgChar = Math.max(8, fontSize * 0.55);
  let lines = 0;
  for (const para of String(text).split("\n")) {
    const chars = Array.from(para).length;
    lines += Math.max(1, Math.ceil((chars * avgChar) / Math.max(1, maxWidth)));
  }
  return Math.max(1, lines);
}

const TEXT_CHUNK_LIMIT = 760;

function textCommands(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  maxWidth: number,
  lineHeight = 1.4
): { commands: CanvasCommand[]; totalLines: number } {
  const safe = String(text);
  const chunks: string[] = [];
  let rest = safe;
  while (rest.length > TEXT_CHUNK_LIMIT) {
    let cut = rest.lastIndexOf("\n", TEXT_CHUNK_LIMIT - 4);
    if (cut < 300) cut = TEXT_CHUNK_LIMIT - 4;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  chunks.push(rest);
  const lineH = fontSize * lineHeight;
  const commands: CanvasCommand[] = [];
  let cursorY = y;
  let totalLines = 0;
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const lines = estWrappedLines(chunk, fontSize, maxWidth);
    commands.push({
      tool: "write_text",
      x: Math.round(x),
      y: Math.round(cursorY),
      maxWidth: Math.round(maxWidth),
      text: chunk,
      fontSize,
      lineHeight,
      color,
    });
    cursorY += lines * lineH;
    totalLines += lines;
  }
  return { commands, totalLines };
}

function labelCmd(x: number, y: number, text: string, fontSize: number, color: string, maxWidth: number): CanvasCommand[] {
  return textCommands(x, y, text, fontSize, color, maxWidth, 1.2).commands;
}

function renderIcon(icon: string, cx: number, cy: number, size = 36, color = INK_BLACK, palette: Palette): CanvasCommand[] {
  const s = size / 2;
  const key = icon.toLowerCase().trim();
  const cmds: CanvasCommand[] = [];
  const add = (c: CanvasCommand[]) => cmds.push(...c);

  switch (key) {
    case "lightbulb":
      add(circleCmds(cx, cy - s * 0.2, s * 0.45, 2.5, palette.amber, false));
      add(lineCmds(cx - s * 0.25, cy + s * 0.35, cx + s * 0.25, cy + s * 0.35, 2.5, INK_BLACK, false));
      add(lineCmds(cx - s * 0.18, cy + s * 0.55, cx + s * 0.18, cy + s * 0.55, 2.5, INK_BLACK, false));
      add(lineCmds(cx, cy - s * 0.75, cx, cy - s * 0.95, 2, palette.amber, false));
      add(lineCmds(cx - s * 0.7, cy - s * 0.2, cx - s * 0.9, cy - s * 0.2, 2, palette.amber, false));
      add(lineCmds(cx + s * 0.7, cy - s * 0.2, cx + s * 0.9, cy - s * 0.2, 2, palette.amber, false));
      break;
    case "gear":
      add(circleCmds(cx, cy, s * 0.65, 2.5, color, false));
      add(circleCmds(cx, cy, s * 0.25, 2.5, color, false));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(lineCmds(cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6, cx + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.95, 2.5, color, false));
      }
      break;
    case "brain":
      add(cloudCmds(cx - s * 0.75, cy - s * 0.6, s * 1.5, s * 1.2, 2.5, palette.red));
      add(lineCmds(cx, cy - s * 0.45, cx, cy + s * 0.45, 2, INK_BLACK, false));
      break;
    case "person":
      add(circleCmds(cx, cy - s * 0.55, s * 0.22, 2.5, INK_BLACK, false));
      add(lineCmds(cx, cy - s * 0.3, cx, cy + s * 0.25, 2.5, INK_BLACK, false));
      add(lineCmds(cx - s * 0.45, cy - s * 0.05, cx + s * 0.45, cy - s * 0.05, 2.5, palette.red, false));
      add(lineCmds(cx, cy + s * 0.25, cx - s * 0.3, cy + s * 0.8, 2.5, INK_BLACK, false));
      add(lineCmds(cx, cy + s * 0.25, cx + s * 0.3, cy + s * 0.8, 2.5, INK_BLACK, false));
      break;
    case "target":
      add(circleCmds(cx, cy, s * 0.8, 2.5, palette.red, false));
      add(circleCmds(cx, cy, s * 0.45, 2.5, INK_BLACK, false));
      cmds.push(dotCmd(cx, cy, 10, palette.red));
      break;
    case "check":
      add(linearPathCmds(
        [
          [cx - s * 0.55, cy],
          [cx - s * 0.12, cy + s * 0.5],
          [cx + s * 0.7, cy - s * 0.55],
        ],
        3.5,
        palette.green
      ));
      break;
    case "star": {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 5; i++) {
        const outerA = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const innerA = outerA + Math.PI / 5;
        pts.push([cx + Math.cos(outerA) * s * 0.85, cy + Math.sin(outerA) * s * 0.85]);
        if (i < 5) {
          pts.push([cx + Math.cos(innerA) * s * 0.4, cy + Math.sin(innerA) * s * 0.4]);
        }
      }
      add(polygonCmds(pts, 2.5, palette.amber));
      break;
    }
    case "database":
      add(ellipseCmds(cx, cy - s * 0.45, s * 1.4, s * 0.5, 2.5, color, false));
      add(lineCmds(cx - s * 0.7, cy - s * 0.45, cx - s * 0.7, cy + s * 0.45, 2.5, color, false));
      add(lineCmds(cx + s * 0.7, cy - s * 0.45, cx + s * 0.7, cy + s * 0.45, 2.5, color, false));
      add(arcCmds(cx, cy, s * 1.4, s * 0.5, 0, Math.PI, 2.5, color, false));
      add(arcCmds(cx, cy + s * 0.45, s * 1.4, s * 0.5, 0, Math.PI, 2.5, color, false));
      break;
    case "book":
      add(linearPathCmds(
        [
          [cx - s * 0.8, cy - s * 0.55],
          [cx - s * 0.8, cy + s * 0.6],
          [cx, cy + s * 0.35],
          [cx + s * 0.8, cy + s * 0.6],
          [cx + s * 0.8, cy - s * 0.55],
        ],
        2.5,
        palette.blue
      ));
      add(lineCmds(cx, cy + s * 0.35, cx, cy - s * 0.45, 2.5, INK_BLACK, false));
      add(lineCmds(cx - s * 0.55, cy - s * 0.35, cx - s * 0.2, cy - s * 0.35, 2, palette.blue, false));
      add(lineCmds(cx + s * 0.2, cy - s * 0.35, cx + s * 0.55, cy - s * 0.35, 2, palette.blue, false));
      break;
    case "rocket":
      add(curveCmds(
        [
          [cx, cy - s * 0.95],
          [cx + s * 0.35, cy - s * 0.2],
          [cx + s * 0.3, cy + s * 0.45],
          [cx, cy + s * 0.7],
          [cx - s * 0.3, cy + s * 0.45],
          [cx - s * 0.35, cy - s * 0.2],
        ],
        2.5,
        palette.red
      ));
      add(circleCmds(cx, cy - s * 0.25, s * 0.16, 2, INK_BLACK, false));
      add(linearPathCmds(
        [
          [cx - s * 0.32, cy + s * 0.4],
          [cx - s * 0.75, cy + s * 0.75],
          [cx - s * 0.3, cy + s * 0.72],
        ],
        2,
        palette.amber
      ));
      add(linearPathCmds(
        [
          [cx + s * 0.32, cy + s * 0.4],
          [cx + s * 0.75, cy + s * 0.75],
          [cx + s * 0.3, cy + s * 0.72],
        ],
        2,
        palette.amber
      ));
      break;
    case "magnifier":
      add(circleCmds(cx - s * 0.15, cy - s * 0.15, s * 0.5, 2.5, INK_BLACK, false));
      add(lineCmds(cx + s * 0.22, cy + s * 0.22, cx + s * 0.75, cy + s * 0.75, 3.5, INK_BLACK, false));
      break;
    case "heart":
      add(curveCmds(
        [
          [cx, cy + s * 0.75],
          [cx - s * 0.95, cy - s * 0.1],
          [cx - s * 0.5, cy - s * 0.75],
          [cx, cy - s * 0.2],
          [cx + s * 0.5, cy - s * 0.75],
          [cx + s * 0.95, cy - s * 0.1],
          [cx, cy + s * 0.75],
        ],
        2.5,
        palette.red
      ));
      break;
    case "cloud":
      add(cloudCmds(cx - s * 0.85, cy - s * 0.5, s * 1.7, s * 1.05, 2.5, palette.blue));
      break;
    case "bolt":
      add(linearPathCmds(
        [
          [cx + s * 0.25, cy - s * 0.9],
          [cx - s * 0.4, cy + s * 0.1],
          [cx + s * 0.1, cy + s * 0.1],
          [cx - s * 0.25, cy + s * 0.9],
        ],
        3,
        palette.amber
      ));
      break;
    case "lock":
      add(rectCmds(cx - s * 0.5, cy - s * 0.1, s, s * 0.75, 2.5, color, false));
      add(arcCmds(cx, cy - s * 0.1, s * 0.7, s * 0.85, Math.PI, Math.PI * 2, 2.5, color, false));
      cmds.push(dotCmd(cx, cy + s * 0.28, 9, color));
      break;
    default:
      add(polygonCmds(
        [
          [cx, cy - s * 0.65],
          [cx + s * 0.65, cy],
          [cx, cy + s * 0.65],
          [cx - s * 0.65, cy],
        ],
        2.5,
        color
      ));
  }
  return cmds;
}

interface HeroResult {
  bottomY: number;
}

function renderLossSurface(originX: number, contentY: number, totalW: number, palette: Palette, out: CanvasCommand[]): HeroResult {
  const cx = originX + 540;
  const cy = contentY + 230;

  out.push(...lineCmds(cx - 320, cy + 190, cx - 320, cy - 220, 3, INK_BLACK));
  out.push(...arrowCmds(cx - 320, cy - 200, cx - 320, cy - 225, 3, INK_BLACK));
  out.push(...labelCmd(cx - 420, cy - 255, "Loss J(θ)", 22, INK_BLACK, 240));

  out.push(...lineCmds(cx - 320, cy + 190, cx + 330, cy + 190, 3, INK_BLACK));
  out.push(...arrowCmds(cx + 310, cy + 190, cx + 335, cy + 190, 3, INK_BLACK));
  out.push(...labelCmd(cx + 345, cy + 176, "θ₁", 22, INK_BLACK, 160));

  out.push(...lineCmds(cx - 320, cy + 190, cx - 410, cy + 270, 3, INK_BLACK));
  out.push(...arrowCmds(cx - 395, cy + 258, cx - 415, cy + 275, 3, INK_BLACK));
  out.push(...labelCmd(cx - 450, cy + 280, "θ₂", 22, INK_BLACK, 160));

  out.push(...ellipseCmds(cx, cy - 80, 520, 160, 3.5, INK_BLUE));
  out.push(...ellipseCmds(cx, cy - 20, 380, 110, 2.5, INK_SKY));
  out.push(...ellipseCmds(cx, cy + 40, 240, 70, 2.5, "#93c5fd"));
  out.push(...arcCmds(cx, cy - 100, 520, 360, 0.05, Math.PI - 0.05, 3, INK_BLUE));

  const trajectory: [number, number][] = [
    [cx - 180, cy - 120],
    [cx - 90, cy - 40],
    [cx - 10, cy + 20],
    [cx + 40, cy + 55],
  ];
  out.push(...curveCmds(trajectory, 4, INK_RED));

  out.push(dotCmd(cx - 180, cy - 120, 14, INK_RED));
  out.push(...labelCmd(cx - 280, cy - 150, "t=0 (Start)", 20, INK_RED, 180));

  out.push(dotCmd(cx - 90, cy - 40, 14, INK_RED));
  out.push(...labelCmd(cx - 145, cy - 65, "t=1", 19, INK_RED, 140));

  out.push(dotCmd(cx - 10, cy + 20, 14, INK_RED));
  out.push(...labelCmd(cx - 55, cy + 5, "t=2", 19, INK_RED, 140));

  out.push(dotCmd(cx + 40, cy + 55, 18, INK_GREEN));
  out.push(...labelCmd(cx + 60, cy + 45, "θ* (Minimum)", 22, INK_GREEN, 220));

  out.push(...arrowCmds(cx - 90, cy - 40, cx - 130, cy - 80, 3, INK_SKY));
  out.push(...labelCmd(cx - 180, cy - 105, "∇J (Uphill)", 20, INK_SKY, 200));

  out.push(...labelCmd(cx - 60, cy - 15, "−α·∇J", 20, INK_RED, 160));

  const calloutX = originX + 1140;
  const calloutY = contentY + 40;
  const calloutW = totalW - 1180;
  const calloutH = 380;

  for (let hy = calloutY + 40; hy <= calloutY + 115; hy += 24) {
    out.push(...lineCmds(calloutX + 30, hy, calloutX + calloutW - 30, hy, 28, INK_YELLOW_HL, false));
  }

  out.push(...burstCmds(calloutX, calloutY, calloutW, calloutH, 3, palette.red));

  out.push(...labelCmd(calloutX + 40, calloutY + 28, "GRADIENT DESCENT UPDATE RULE", 34, INK_BLACK, calloutW - 80));
  out.push(...labelCmd(calloutX + 40, calloutY + 80, "θ ← θ − α · ∇J(θ)", 46, INK_RED, calloutW - 80));
  out.push(
    ...textCommands(
      calloutX + 40,
      calloutY + 160,
      "• θ: Model parameter vector being optimized\n• J(θ): Scalar cost/loss function over the dataset\n• ∇J: Vector of partial derivatives pointing uphill\n• α: Learning rate step multiplier (step size)\n• Negating gradient (−∇J) drives parameters into the valley",
      23,
      INK_BLACK,
      calloutW - 80,
      1.5
    ).commands
  );

  return { bottomY: cy + 300 };
}

function renderComplexPlane(originX: number, contentY: number, totalW: number, palette: Palette, out: CanvasCommand[]): HeroResult {
  const cx = originX + 500;
  const cy = contentY + 230;
  const R = 150;

  out.push(...lineCmds(cx - 320, cy, cx + 320, cy, 3, INK_BLACK));
  out.push(...arrowCmds(cx + 310, cy, cx + 335, cy, 3, INK_BLACK));
  out.push(...labelCmd(cx + 345, cy - 14, "Re (Real)", 22, INK_BLACK, 220));

  out.push(...lineCmds(cx, cy + 220, cx, cy - 220, 3, INK_BLACK));
  out.push(...arrowCmds(cx, cy - 210, cx, cy - 235, 3, INK_BLACK));
  out.push(...labelCmd(cx - 65, cy - 265, "Im (Imaginary)", 22, INK_BLACK, 220));

  out.push(...circleCmds(cx, cy, R, 3.5, INK_BLUE));
  out.push(...labelCmd(cx + 115, cy - 120, "|z| = 1 (Unit Circle)", 20, INK_BLUE, 240));

  out.push(dotCmd(cx, cy, 14, INK_BLACK));
  out.push(...labelCmd(cx + 10, cy + 10, "0 (Additive id)", 20, INK_BLACK, 180));

  out.push(dotCmd(cx + R, cy, 15, INK_BLACK));
  out.push(...labelCmd(cx + R + 14, cy - 8, "1 (Mult. id)", 20, INK_BLACK, 200));

  out.push(dotCmd(cx, cy - R, 15, INK_BLUE));
  out.push(...labelCmd(cx + 14, cy - R - 14, "i = √(-1)", 22, INK_BLUE, 200));

  out.push(...arcCmds(cx, cy, (R + 24) * 2, (R + 24) * 2, 0, Math.PI, 4, INK_RED));
  out.push(...arrowCmds(cx - R - 24, cy - 20, cx - R - 24, cy + 4, 4, INK_RED));

  out.push(...labelCmd(cx - 80, cy - R - 75, "Rotate by π radians (180°)", 22, INK_RED, 280));

  out.push(dotCmd(cx - R, cy, 20, INK_RED));
  out.push(...labelCmd(cx - R - 240, cy - 25, "e^(iπ) = -1", 32, INK_RED, 240));

  out.push(...lineCmds(cx - R + 10, cy + 30, cx - 15, cy + 30, 3, INK_RED, false));
  out.push(...arrowCmds(cx - 30, cy + 30, cx - 10, cy + 30, 3, INK_RED));
  out.push(...labelCmd(cx - R / 2 - 40, cy + 36, "+ 1 reaches 0!", 20, INK_RED, 180));

  const calloutX = originX + 1120;
  const calloutY = contentY + 40;
  const calloutW = totalW - 1160;
  const calloutH = 380;

  for (let hy = calloutY + 40; hy <= calloutY + 110; hy += 24) {
    out.push(...lineCmds(calloutX + 30, hy, calloutX + calloutW - 30, hy, 28, INK_YELLOW_HL, false));
  }

  out.push(...burstCmds(calloutX, calloutY, calloutW, calloutH, 3, palette.red));

  out.push(...labelCmd(calloutX + 40, calloutY + 28, "THE FIVE CONSTANTS UNITED", 34, INK_BLACK, calloutW - 80));
  out.push(...labelCmd(calloutX + 40, calloutY + 80, "e^(iπ) + 1 = 0", 48, INK_RED, calloutW - 80));
  out.push(
    ...textCommands(
      calloutX + 40,
      calloutY + 160,
      "• e ≈ 2.718: The foundation of continuous exponential growth\n• i = √(-1): The imaginary unit, turning linear growth into rotation\n• π ≈ 3.14159: The circle ratio, completing a perfect half-turn\n• 1: The multiplicative identity, the unit of counting\n• 0: The additive identity, the origin and balance of all math",
      24,
      INK_BLACK,
      calloutW - 80,
      1.5
    ).commands
  );

  return { bottomY: cy + 270 };
}

function renderNeuralNet(originX: number, contentY: number, palette: Palette, out: CanvasCommand[]): HeroResult {
  const cx = originX + 540;
  const cy = contentY + 200;
  const layerX = [cx - 180, cx, cx + 180];
  const layers = [
    [cy - 70, cy, cy + 70],
    [cy - 105, cy - 35, cy + 35, cy + 105],
    [cy - 40, cy + 40],
  ];
  const layerColors = [palette.green, INK_BLUE, palette.amber];

  for (let l = 0; l < layers.length - 1; l++) {
    for (const y1 of layers[l]) {
      for (const y2 of layers[l + 1]) {
        out.push(...lineCmds(layerX[l] + 20, y1, layerX[l + 1] - 20, y2, 2, "#94a3b8", false));
      }
    }
  }

  for (let l = 0; l < layers.length; l++) {
    for (const ny of layers[l]) {
      out.push(...circleCmds(layerX[l], ny, 20, 3, layerColors[l]));
    }
  }

  out.push(...arrowCmds(cx - 160, cy - 150, cx + 160, cy - 150, 3, INK_BLUE));
  out.push(...labelCmd(cx - 90, cy - 185, "Feedforward a = σ(Wa + b)", 20, INK_BLUE, 240));

  out.push(...arrowCmds(cx + 160, cy + 160, cx - 160, cy + 160, 3, palette.red));
  out.push(...labelCmd(cx - 90, cy + 175, "Backprop ∇W = δ · aᵀ", 20, palette.red, 240));

  return { bottomY: cy + 240 };
}

function renderCycle(sections: SketchnoteSection[], originX: number, contentY: number, palette: Palette, out: CanvasCommand[]): HeroResult {
  const cx = originX + 540;
  const cy = contentY + 200;
  const R = 130;
  const defaultLabels = ["Step 1", "Step 2", "Step 3"];
  const labels = sections.slice(0, 3).map((s) => (s.heading || "").slice(0, 16) || defaultLabels[0]);
  while (labels.length < 3) labels.push(defaultLabels[labels.length]);
  const nodes = [
    { label: labels[0] || defaultLabels[0], a: -Math.PI / 2 },
    { label: labels[1] || defaultLabels[1], a: (Math.PI * 2) / 3 - Math.PI / 2 },
    { label: labels[2] || defaultLabels[2], a: (Math.PI * 4) / 3 - Math.PI / 2 },
  ];
  for (let i = 0; i < nodes.length; i++) {
    const nx = cx + R * Math.cos(nodes[i].a);
    const ny = cy + R * Math.sin(nodes[i].a);
    out.push(...circleCmds(nx, ny, 36, 3, i === 0 ? palette.red : i === 1 ? INK_BLUE : palette.green));
    out.push(...labelCmd(nx - 30, ny - 10, nodes[i].label, 18, INK_BLACK, 100));
    const nextIdx = (i + 1) % nodes.length;
    const ax1 = cx + (R + 15) * Math.cos(nodes[i].a + 0.3);
    const ay1 = cy + (R + 15) * Math.sin(nodes[i].a + 0.3);
    const ax2 = cx + (R + 15) * Math.cos(nodes[nextIdx].a - 0.3);
    const ay2 = cy + (R + 15) * Math.sin(nodes[nextIdx].a - 0.3);
    out.push(...arrowCmds(ax1, ay1, ax2, ay2, 2.5, palette.amber));
  }
  return { bottomY: cy + 220 };
}

function renderFlow(sections: SketchnoteSection[], annotation: string, originX: number, contentY: number, totalW: number, palette: Palette, out: CanvasCommand[]): HeroResult {
  const startX = originX + 120;
  const cy = contentY + 90;
  const gap = 110;
  const defaultSteps = ["1. Input", "2. Process", "3. Evaluate", "4. Output"];
  const steps =
    sections.length >= 2
      ? sections.slice(0, 4).map((s, i) => `${i + 1}. ${(s.heading || "").slice(0, 22)}`)
      : defaultSteps;
  const count = Math.max(2, steps.length);
  const stepW = Math.max(150, Math.min(260, Math.floor((totalW - 240 - (count - 1) * gap) / count)));
  const stepH = 110;
  for (let i = 0; i < count; i++) {
    const sx = startX + i * (stepW + gap);
    out.push(...rectCmds(sx, cy, stepW, stepH, 3, i === count - 1 ? palette.green : i === count - 2 ? palette.red : INK_BLUE));
    out.push(...labelCmd(sx + 18, cy + 38, steps[i] || defaultSteps[i % 4], 23, INK_BLACK, stepW - 36));
    if (i < count - 1) {
      out.push(...arrowCmds(sx + stepW + 8, cy + stepH / 2, sx + stepW + gap - 8, cy + stepH / 2, 3, palette.red));
    }
  }
  if (annotation && annotation.trim()) {
    out.push(...labelCmd(startX, cy + stepH + 24, annotation.trim().slice(0, 90), 21, INK_GRAY, totalW - 240));
  }
  return { bottomY: cy + stepH + (annotation ? 84 : 50) };
}

function elementsBox(elements: SketchnoteCustomElement[]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: unknown, y: unknown) => {
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      x0 = Math.min(x0, nx);
      y0 = Math.min(y0, ny);
      x1 = Math.max(x1, nx);
      y1 = Math.max(y1, ny);
    }
  };
  for (const el of elements) {
    take(el.x1, el.y1);
    take(el.x2, el.y2);
    take(el.cx, el.cy);
    if (Number.isFinite(Number(el.cx)) && Number.isFinite(Number(el.r))) {
      const r = Number(el.r);
      x0 = Math.min(x0, Number(el.cx) - r);
      x1 = Math.max(x1, Number(el.cx) + r);
      y0 = Math.min(y0, Number(el.cy) - r);
      y1 = Math.max(y1, Number(el.cy) + r);
    }
    if (Number.isFinite(Number(el.cx)) && Number.isFinite(Number(el.w)) && Number.isFinite(Number(el.h)) && !Number.isFinite(el.r)) {
      const w = Number(el.w);
      const h = Number(el.h);
      x0 = Math.min(x0, Number(el.cx) - w / 2);
      x1 = Math.max(x1, Number(el.cx) + w / 2);
      y0 = Math.min(y0, Number(el.cy) - h / 2);
      y1 = Math.max(y1, Number(el.cy) + h / 2);
    }
    if (Array.isArray(el.points)) {
      for (const p of el.points) take(p[0], p[1]);
    }
    if (el.type === "text" || el.type === "dot") {
      take(el.x1 ?? el.cx, el.y1 ?? el.cy);
    }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function renderCustomDiagram(
  elements: SketchnoteCustomElement[],
  annotation: string,
  originX: number,
  contentY: number,
  totalW: number,
  palette: Palette,
  out: CanvasCommand[]
): HeroResult {
  const zoneX = originX + 80;
  const zoneY = contentY + 30;
  const zoneW = Math.min(totalW - 160, 1100);
  const zoneH = 480;

  const box = elementsBox(elements);
  let scale = 1;
  let offX = 0;
  let offY = 0;
  if (box) {
    const relative = box.w < 240 && box.h < 240;
    if (relative) {
      scale = Math.min(zoneW / Math.max(1, box.w), zoneH / Math.max(1, box.h), 4);
      offX = zoneX + (zoneW - box.w * scale) / 2 - box.x * scale;
      offY = zoneY + (zoneH - box.h * scale) / 2 - box.y * scale;
    } else {
      offX = zoneX + (zoneW - box.w) / 2 - box.x;
      offY = zoneY + (zoneH - box.h) / 2 - box.y;
    }
  }
  const tx = (v: number) => (box ? v * scale + offX : v);
  const ty = (v: number) => (box ? v * scale + offY : v);

  for (const el of elements) {
    const type = String(el.type || "").toLowerCase();
    const color = typeof el.color === "string" && el.color.trim() ? el.color.trim() : INK_BLACK;
    const size = Math.max(2, Math.min(24, Number(el.size) || 3));
    if (type === "line" || type === "arrow") {
      const x1 = Number(el.x1);
      const y1 = Number(el.y1);
      const x2 = Number(el.x2);
      const y2 = Number(el.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        if (type === "arrow") {
          out.push(...arrowCmds(tx(x1), ty(y1), tx(x2), ty(y2), size, color));
        } else {
          out.push(...lineCmds(tx(x1), ty(y1), tx(x2), ty(y2), size, color));
        }
      }
    } else if (type === "circle") {
      const cx = Number(el.cx);
      const cy = Number(el.cy);
      const r = Number(el.r);
      if ([cx, cy, r].every(Number.isFinite) && r > 0) {
        out.push(...circleCmds(tx(cx), ty(cy), r * scale, size, color));
      }
    } else if (type === "ellipse") {
      const cx = Number(el.cx);
      const cy = Number(el.cy);
      const w = Number(el.w);
      const h = Number(el.h);
      if ([cx, cy, w, h].every(Number.isFinite) && w > 0 && h > 0) {
        out.push(...ellipseCmds(tx(cx), ty(cy), w * scale, h * scale, size, color));
      }
    } else if (type === "curve") {
      const pts = (el.points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) as [number, number][];
      if (pts.length >= 2) {
        out.push(...curveCmds(pts.map((p) => [tx(p[0]), ty(p[1])] as [number, number]), size, color));
      }
    } else if (type === "arc") {
      const cx = Number(el.cx);
      const cy = Number(el.cy);
      const r = Number(el.r);
      const startA = Number(el.startA);
      const endA = Number(el.endA);
      if ([cx, cy, r, startA, endA].every(Number.isFinite) && r > 0) {
        out.push(...arcCmds(tx(cx), ty(cy), r * 2 * scale, r * 2 * scale, startA, endA, size, color));
      }
    } else if (type === "text") {
      const text = String(el.text || "");
      const tx1 = Number(el.x1 ?? el.cx);
      const ty1 = Number(el.y1 ?? el.cy);
      if (text.trim() && Number.isFinite(tx1) && Number.isFinite(ty1)) {
        out.push(...labelCmd(tx(tx1), ty(ty1), text.slice(0, 200), Math.max(14, Math.min(40, Number(el.fontSize) || 21)), color, 600));
      }
    } else if (type === "dot") {
      const dx = Number(el.x1 ?? el.cx);
      const dy = Number(el.y1 ?? el.cy);
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        out.push(dotCmd(tx(dx), ty(dy), Math.max(8, Number(el.size) || 14), color));
      }
    }
  }

  const bottom = zoneY + zoneH + 24;
  if (annotation && annotation.trim()) {
    out.push(...labelCmd(zoneX, bottom, annotation.trim().slice(0, 120), 22, INK_GRAY, zoneW));
    return { bottomY: bottom + 44 };
  }
  return { bottomY: bottom };
}

function renderHeroCaption(title: string, originX: number, y: number, totalW: number, out: CanvasCommand[]): void {
  if (!title || !title.trim()) return;
  out.push(...labelCmd(originX + 80, y, title.trim().slice(0, 110), 22, INK_GRAY, Math.min(900, totalW - 160)));
}

function sectionBodyText(sec: SketchnoteSection, listStyle: string | undefined): string {
  const bullets = (Array.isArray(sec.bullets) ? sec.bullets : [])
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .slice(0, 6)
    .map((b) => b.replace(/\s*\n\s*/g, " ").slice(0, 220));
  if (!bullets.length) return "";
  const prefix = listStyle === "number" ? (idx: number) => `${idx + 1}. ` : () => "• ";
  return bullets.map((b, idx) => `${prefix(idx)}${b}`).join("\n");
}

interface SectionLayout {
  positions: Map<string, { x: number; y: number; w: number; h: number; col: number; row: number }>;
  bottomY: number;
}

function layoutSections(
  sections: SketchnoteSection[],
  layout: string,
  originX: number,
  contentY: number,
  totalW: number,
  palette: Palette,
  out: CanvasCommand[]
): SectionLayout {
  const positions = new Map<string, { x: number; y: number; w: number; h: number; col: number; row: number }>();
  const numSections = sections.length;
  if (numSections === 0) return { positions, bottomY: contentY };

  const layoutKey = (layout || "modular").toLowerCase();
  const gapX = 40;
  const gapY = 40;

  if (layoutKey === "timeline" && numSections >= 2 && numSections <= 5) {
    const spineY = contentY + 60;
    const boxW = Math.max(320, Math.floor((totalW - (numSections - 1) * gapX - 80) / numSections));
    const boxH = 150;
    let cursorX = originX + 40;
    out.push(...lineCmds(originX + 40, spineY + boxH + 30, originX + 40 + (numSections - 1) * (boxW + gapX) + boxW, spineY + boxH + 30, 3, palette.amber));
    sections.forEach((sec, i) => {
      const x = cursorX;
      const y = spineY;
      positions.set(sec.id, { x, y, w: boxW, h: boxH, col: i, row: 0 });
      cursorX += boxW + gapX;
    });
    return { positions, bottomY: spineY + boxH + 60 };
  }

  const cols = layoutKey === "columns" ? 1 : numSections <= 4 ? 2 : 3;
  const colW = Math.floor((totalW - (cols - 1) * gapX) / cols);
  const colHeights = new Array(cols).fill(contentY + 15);
  const colRowCounts = new Array(cols).fill(0);
  const stagger = layoutKey === "flowing" || layoutKey === "radial";

  for (let i = 0; i < numSections; i++) {
    const sec = sections[i];
    let targetCol = 0;
    for (let c = 1; c < cols; c++) {
      if (colHeights[c] < colHeights[targetCol]) targetCol = c;
    }
    const secX = originX + targetCol * (colW + gapX) + (stagger && targetCol > 0 ? 40 : 0);
    const secY = colHeights[targetCol] + (stagger && targetCol > 0 && colRowCounts[targetCol] === 0 ? 70 : 0);

    const heading = String(sec.heading || "").slice(0, 90);
    const bodyText = sectionBodyText(sec, sec.listStyle);
    const bodyFont = 21;
    const bodyMaxW = colW - 40;
    const bodyLines = bodyText ? estWrappedLines(bodyText, bodyFont, bodyMaxW) : 0;
    const headingLines = Math.max(1, estWrappedLines(heading || "•", 26, colW - 80));
    const secH = Math.max(180, Math.round(58 + bodyLines * bodyFont * 1.45 + headingLines * 26 * 1.25 - 26 + 34));
    const row = colRowCounts[targetCol];

    positions.set(sec.id, { x: secX, y: secY, w: colW, h: secH, col: targetCol, row });
    colHeights[targetCol] = secY + secH + gapY;
    colRowCounts[targetCol] += 1;
  }

  let bottomY = contentY + 15;
  for (let c = 0; c < cols; c++) bottomY = Math.max(bottomY, colHeights[c]);
  return { positions, bottomY };
}

function renderSection(sec: SketchnoteSection, pos: { x: number; y: number; w: number; h: number }, palette: Palette, out: CanvasCommand[]): void {
  const accent =
    sec.accentColor === "red" ? palette.red :
    sec.accentColor === "blue" ? palette.blue :
    sec.accentColor === "green" ? palette.green :
    sec.accentColor === "yellow" ? palette.amber :
    sec.accentColor === "black" ? palette.black :
    INK_BLACK;

  const cType = String(sec.container || "box").toLowerCase().trim();
  const { x: secX, y: secY, w: colW, h: secH } = pos;

  if (cType === "box" || cType === "banner") {
    out.push(...rectCmds(secX, secY, colW, secH, 2.5, cType === "banner" ? accent : INK_BLACK));
    if (cType === "banner") {
      out.push(...lineCmds(secX + 14, secY + 46, secX + colW - 14, secY + 46, 3, accent, false));
    }
  } else if (cType === "cloud" || cType === "bubble") {
    out.push(...cloudCmds(secX, secY, colW, secH, 2.5, accent === INK_BLACK ? INK_BLACK : accent));
  } else if (cType === "bracket") {
    out.push(...bracketCmds(secX + 10, secY, secH, 3, palette.amber));
  } else if (cType === "burst") {
    out.push(...burstCmds(secX, secY, colW, secH, 2.5, palette.red));
  } else if (cType === "underline") {
    out.push(...lineCmds(secX + 15, secY + 48, secX + colW - 15, secY + 48, 3, accent));
  }

  if (sec.emphasis === "highlight" || sec.highlightWord) {
    const headingChars = Array.from(String(sec.heading || "")).length;
    const swipeW = Math.min(colW - 50, Math.max(140, headingChars * 26 * 0.55 + 24));
    out.push(...lineCmds(secX + 25, secY + 30, secX + 25 + swipeW, secY + 30, 24, INK_YELLOW_HL, false));
  }

  let textStartX = secX + 20;
  if (sec.icon) {
    out.push(...renderIcon(sec.icon, secX + 32, secY + 28, 34, accent, palette));
    textStartX = secX + 56;
  }

  const heading = String(sec.heading || "•").slice(0, 90);
  out.push(...labelCmd(textStartX, secY + 14, heading, 26, accent === INK_BLACK ? INK_BLACK : accent, colW - (textStartX - secX) - 15));

  const bodyText = sectionBodyText(sec, sec.listStyle);
  if (bodyText) {
    out.push(...textCommands(secX + 20, secY + 58, bodyText, 21, INK_BLACK, colW - 40, 1.45).commands);
  }
}

function renderConnectors(
  connectors: SketchnoteConnector[],
  positions: Map<string, { x: number; y: number; w: number; h: number; col: number; row: number }>,
  palette: Palette,
  out: CanvasCommand[]
): void {
  for (const conn of connectors || []) {
    const from = positions.get(conn.from);
    const to = positions.get(conn.to);
    if (!from || !to) continue;
    const style = String(conn.style || "arrow").toLowerCase();
    const color = palette.red;

    let ax1 = 0;
    let ay1 = 0;
    let ax2 = 0;
    let ay2 = 0;
    let labelX = 0;
    let labelY = 0;

    if (from.row === to.row && to.col === from.col + 1) {
      ax1 = from.x + from.w + 4;
      ay1 = from.y + from.h / 2;
      ax2 = to.x - 4;
      ay2 = to.y + to.h / 2;
      labelX = ax1 + (ax2 - ax1) / 2 - 60;
      labelY = ay1 - 30;
    } else if (from.col === to.col && to.row === from.row + 1) {
      ax1 = from.x + from.w / 2;
      ay1 = from.y + from.h + 4;
      ax2 = to.x + to.w / 2;
      ay2 = to.y - 4;
      labelX = ax1 + 20;
      labelY = ay1 + (ay2 - ay1) / 2 - 14;
    } else if (from.row === to.row && from.col === to.col + 1) {
      ax1 = from.x - 4;
      ay1 = from.y + from.h / 2;
      ax2 = to.x + to.w + 4;
      ay2 = to.y + to.h / 2;
      labelX = ax2 + (ax1 - ax2) / 2 - 60;
      labelY = ay1 - 30;
    } else if (from.col === to.col && from.row === to.row + 1) {
      ax1 = from.x + from.w / 2;
      ay1 = from.y - 4;
      ax2 = to.x + to.w / 2;
      ay2 = to.y + to.h + 4;
      labelX = ax1 + 20;
      labelY = ay2 + (ay1 - ay2) / 2 - 14;
    } else {
      continue;
    }

    if (style === "line") {
      out.push(...lineCmds(ax1, ay1, ax2, ay2, 2.5, color, false));
    } else if (style === "curved") {
      out.push(...curvedArrowCmds(ax1, ay1, ax2, ay2, 2.5, color));
    } else {
      out.push(...arrowCmds(ax1, ay1, ax2, ay2, 2.5, color));
    }

    if (conn.label && conn.label.trim()) {
      out.push(...labelCmd(labelX, labelY, conn.label.trim().slice(0, 40), 18, color, 160));
    }
  }
}

export function renderSketchnote(spec: SketchnoteSpec): CanvasCommand[] {
  const commands: CanvasCommand[] = [];
  const totalW = Math.max(1200, Math.min(6000, spec.w || 2400));
  const originX = Math.round(Math.max(0, spec.x));
  const originY = Math.round(Math.max(0, spec.y));
  const palette = PALETTES[String(spec.palette || "cool").toLowerCase()] || PALETTES.cool;
  const layout = String(spec.layout || "modular").toLowerCase();

  const titleText = String(spec.title || "SKETCHNOTE").trim().slice(0, 80).toUpperCase();
  const bannerW = Math.min(totalW, Math.max(540, titleText.length * 36 + 140));
  const bannerH = 88;
  const bannerX = originX + 20;
  const bannerY = originY + 10;

  for (let my = bannerY + 18; my < bannerY + bannerH - 12; my += 20) {
    commands.push(...lineCmds(bannerX + 18, my, bannerX + bannerW - 18, my, 26, INK_YELLOW_FILL, false));
  }

  commands.push(...rectCmds(bannerX, bannerY, bannerW, bannerH, 4, INK_BLACK));

  commands.push(
    ...labelCmd(bannerX + 30, bannerY + 18, titleText, 42, INK_BLACK, bannerW - 60)
  );

  let contentY = bannerY + bannerH + 28;
  if (spec.subtitle && spec.subtitle.trim()) {
    commands.push(
      ...labelCmd(bannerX + 12, contentY, spec.subtitle.trim().slice(0, 200), 24, INK_GRAY, totalW - 40)
    );
    contentY += 48;
  }

  const titleLower = String(spec.title || "").toLowerCase();
  const diag = spec.visualDiagram;
  const diagType = String(diag?.type || "").toLowerCase();
  const elements = Array.isArray(diag?.elements) ? diag!.elements! : [];
  const annotation = String(diag?.annotation || "").trim();

  const isLossSurface =
    diagType === "surface_3d" ||
    diagType === "loss_surface" ||
    (!diagType && (titleLower.includes("loss surface") || titleLower.includes("gradient descent") || titleLower.includes("optimization")));
  const isComplexPlane =
    diagType === "complex_plane" ||
    diagType === "unit_circle" ||
    (!diagType && !isLossSurface && (titleLower.includes("euler") || titleLower.includes("complex plane") || titleLower.includes("unit circle")));
  const isNeuralNet =
    diagType === "neural_network" ||
    diagType === "network" ||
    (!diagType && !isLossSurface && !isComplexPlane && (titleLower.includes("neural") || titleLower.includes("deep learning")));
  const isCycle =
    diagType === "cycle" ||
    (!diagType && !isLossSurface && !isComplexPlane && !isNeuralNet && (titleLower.includes("cycle") || titleLower.includes("feedback loop")));
  const isFlow =
    diagType === "flow" ||
    (!diagType && !isLossSurface && !isComplexPlane && !isNeuralNet && !isCycle && (titleLower.includes("pipeline") || titleLower.includes("process")));
  const isCustom = diagType === "custom" && elements.length > 0;

  let hero: HeroResult | null = null;
  if (isLossSurface) {
    hero = renderLossSurface(originX, contentY, totalW, palette, commands);
  } else if (isComplexPlane) {
    hero = renderComplexPlane(originX, contentY, totalW, palette, commands);
  } else if (isNeuralNet) {
    hero = renderNeuralNet(originX, contentY, palette, commands);
  } else if (isCycle) {
    hero = renderCycle(spec.sections || [], originX, contentY, palette, commands);
  } else if (isFlow) {
    hero = renderFlow(spec.sections || [], annotation, originX, contentY, totalW, palette, commands);
  } else if (isCustom) {
    hero = renderCustomDiagram(elements, annotation, originX, contentY, totalW, palette, commands);
  }

  if (hero) {
    renderHeroCaption(String(diag?.title || ""), originX, hero.bottomY, totalW, commands);
    contentY = hero.bottomY + (diag?.title?.trim() ? 40 : 20);
  } else if (annotation) {
    const burstW = Math.min(totalW - 80, 900);
    commands.push(...burstCmds(originX + 40, contentY, burstW, 96, 2.5, palette.red));
    commands.push(...labelCmd(originX + 66, contentY + 30, annotation.slice(0, 64), 24, INK_BLACK, burstW - 52));
    contentY += 136;
  }

  const sections = (spec.sections || []).slice(0, 10);
  if (sections.length > 0) {
    const grid = layoutSections(sections, layout, originX, contentY, totalW, palette, commands);
    for (const sec of sections) {
      const pos = grid.positions.get(sec.id);
      if (pos) renderSection(sec, pos, palette, commands);
    }
    if (layout === "timeline") {
      for (let i = 0; i + 1 < sections.length; i++) {
        const a = grid.positions.get(sections[i].id);
        const b = grid.positions.get(sections[i + 1].id);
        if (a && b) {
          commands.push(dotCmd(a.x + a.w / 2, a.y + a.h + 30, 12, palette.amber));
        }
      }
    }
    renderConnectors(spec.connectors || [], grid.positions, palette, commands);
  }

  return commands;
}
