import type { Point } from "@/canvas/model/types";
import { createRng } from "@canvas/utils/random";

/**
 * Small internal sketch renderer (§12) — deterministic seeded perturbation of
 * clean geometry into hand-drawn style polylines. NOT Rough.js. Cache-friendly
 * since the same element+seed always produces the same outline.
 *
 * Uses a seeded RNG keyed off `element.seed + geometry signature` so renders
 * are stable across refresh/zoom/save/load (§95).
 */

export interface SketchOptions {
  seed: number;
  roughness: number; // 0 = clean, 2 = very sketchy
  /** render the outline twice with slight offsets (classic double-stroke) */
  doubleStroke: boolean;
}

export function seededInt(seed: number, salt: number): number {
  let h = seed ^ salt;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic per-point jitter for a polyline (§12). */
export function sketchPolyline(points: Point[], opts: SketchOptions): Point[][] {
  const { seed, roughness, doubleStroke } = opts;
  const passes = doubleStroke && points.length > 1 ? 2 : 1;
  const out: Point[][] = [];
  const amplitude = Math.max(0.3, roughness) * 0.9;

  for (let pass = 0; pass < passes; pass++) {
    const rng = createRng(seededInt(seed, pass * 101 + points.length));
    const jittered = points.map<Point>((p) => {
      const scale = pass === 0 ? 0.6 : amplitude * 1.6;
      return [
        p[0] + (rng() - 0.5) * scale * 2,
        p[1] + (rng() - 0.5) * scale * 2,
      ];
    });
    out.push(jittered);
  }
  return out;
}

/** Sketch-styled rectangle outline as closed polylines (§12). */
export function sketchRect(
  x: number,
  y: number,
  width: number,
  height: number,
  opts: SketchOptions,
): Point[][] {
  const corners: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y], // close
  ];
  return sketchPolyline(corners, opts);
}

/** Sketch ellipse: subdivided polygon through the sketch jitter. */
export function sketchEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  opts: SketchOptions,
): Point[][] {
  const steps = Math.max(16, Math.min(64, Math.round((rx + ry) * 0.4)));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return sketchPolyline(pts, opts);
}

/**
 * Hachure fill (§13): scan-line intersections clipped to a polygon, drawn as
 * jittered strokes. Angle in radians, gap in scene px.
 */
export function hachureFillForPolygon(
  polygon: Point[],
  angle: number,
  gap: number,
  opts: SketchOptions,
): Point[][] {
  if (polygon.length < 3 || gap <= 0) return [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // project onto scanline normal
  const rotated = polygon.map<Point>((p) => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos]);
  const ys = rotated.map((p) => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rng = createRng(seededInt(opts.seed, 7919));
  const lines: Point[][] = [];

  for (let y = minY; y <= maxY; y += Math.max(2, gap)) {
    const intersections: number[] = [];
    for (let i = 0, j = rotated.length - 1; i < rotated.length; j = i++) {
      const yi = rotated[i][1];
      const yj = rotated[j][1];
      if (yi > y !== yj > y) {
        const t = (y - yi) / (yj - yi);
        intersections.push(rotated[i][0] + t * (rotated[j][0] - rotated[i][0]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const aR: Point = [intersections[k], y];
      const bR: Point = [intersections[k + 1], y];
      // rotate back into original space
      const a: Point = [aR[0] * cos - aR[1] * sin, aR[0] * sin + aR[1] * cos];
      const b: Point = [bR[0] * cos - bR[1] * sin, bR[0] * sin + bR[1] * cos];
      const jitter = (opts.roughness * 0.5) || 0;
      lines.push([
        [a[0] + (rng() - 0.5) * jitter, a[1] + (rng() - 0.5) * jitter],
        [b[0] + (rng() - 0.5) * jitter, b[1] + (rng() - 0.5) * jitter],
      ]);
    }
  }
  return lines;
}
