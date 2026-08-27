/**
 * Tiny SVG path `d` sampler. Used by animate_scene salvage so model-emitted
 * SVG paths (`d`, translate.path) become polylines the canvas renderer can draw.
 * No DOM / Path2D — must run in the Node validator too.
 */

export type Polyline = [number, number][];

export function parseSvgPathToPolylines(d: unknown, maxPoints = 128): Polyline[] | null {
  if (typeof d !== "string") return null;
  const src = d.trim();
  if (!src) return null;

  const tokens = tokenize(src);
  if (!tokens.length) return null;

  const subpaths: Polyline[] = [];
  let current: Polyline = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCmd = "";
  let prevCpx = 0;
  let prevCpy = 0;
  let i = 0;
  let total = 0;

  const pushPoint = (x: number, y: number, force = false) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const last = current[current.length - 1];
    if (!force && last && Math.abs(last[0] - x) < 0.4 && Math.abs(last[1] - y) < 0.4) return;
    if (total >= maxPoints) return;
    current.push([x, y]);
    total += 1;
    cx = x;
    cy = y;
  };

  const closeCurrent = () => {
    if (current.length >= 2) subpaths.push(current);
    current = [];
  };

  const sampleCubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const steps = curveSteps(cx, cy, x1, y1, x2, y2, x, y);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = cubicPoint(cx, cy, x1, y1, x2, y2, x, y, t);
      pushPoint(p[0], p[1], s === steps);
    }
    prevCpx = x2;
    prevCpy = y2;
  };

  const sampleQuad = (x1: number, y1: number, x: number, y: number) => {
    const steps = Math.max(4, Math.min(12, Math.round(Math.hypot(x - cx, y - cy) / 40)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = quadPoint(cx, cy, x1, y1, x, y, t);
      pushPoint(p[0], p[1], s === steps);
    }
    prevCpx = x1;
    prevCpy = y1;
  };

  const sampleArc = (
    rx: number,
    ry: number,
    phiDeg: number,
    large: number,
    sweep: number,
    x: number,
    y: number
  ) => {
    const pts = arcToPoints(cx, cy, rx, ry, phiDeg, large, sweep, x, y);
    for (let s = 0; s < pts.length; s++) {
      pushPoint(pts[s][0], pts[s][1], s === pts.length - 1);
    }
  };

  while (i < tokens.length && total < maxPoints) {
    const tok = tokens[i];
    let cmd: string;
    if (typeof tok === "string") {
      cmd = tok;
      i += 1;
    } else {
      cmd = implicitCommand(lastCmd);
      if (!cmd) break;
    }
    const rel = cmd === cmd.toLowerCase();
    const abs = cmd.toUpperCase();

    const num = (): number => {
      const v = tokens[i];
      if (typeof v !== "number") return NaN;
      i += 1;
      return v;
    };

    if (abs === "Z") {
      pushPoint(startX, startY, true);
      closeCurrent();
      cx = startX;
      cy = startY;
      lastCmd = cmd;
      continue;
    }

    if (abs === "M") {
      closeCurrent();
      const x = num();
      const y = num();
      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      current = [];
      pushPoint(nx, ny, true);
      startX = nx;
      startY = ny;
      lastCmd = rel ? "l" : "L";
      while (typeof tokens[i] === "number") {
        const lx = num();
        const ly = num();
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) break;
        pushPoint(rel ? cx + lx : lx, rel ? cy + ly : ly, true);
      }
      continue;
    }

    if (abs === "L") {
      const x = num();
      const y = num();
      pushPoint(rel ? cx + x : x, rel ? cy + y : y, true);
    } else if (abs === "H") {
      const x = num();
      pushPoint(rel ? cx + x : x, cy, true);
    } else if (abs === "V") {
      const y = num();
      pushPoint(cx, rel ? cy + y : y, true);
    } else if (abs === "C") {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      sampleCubic(
        rel ? cx + x1 : x1,
        rel ? cy + y1 : y1,
        rel ? cx + x2 : x2,
        rel ? cy + y2 : y2,
        rel ? cx + x : x,
        rel ? cy + y : y
      );
    } else if (abs === "S") {
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      const reflect = "CcSs".includes(lastCmd);
      const x1 = reflect ? 2 * cx - prevCpx : cx;
      const y1 = reflect ? 2 * cy - prevCpy : cy;
      sampleCubic(x1, y1, rel ? cx + x2 : x2, rel ? cy + y2 : y2, rel ? cx + x : x, rel ? cy + y : y);
    } else if (abs === "Q") {
      const x1 = num();
      const y1 = num();
      const x = num();
      const y = num();
      sampleQuad(rel ? cx + x1 : x1, rel ? cy + y1 : y1, rel ? cx + x : x, rel ? cy + y : y);
    } else if (abs === "T") {
      const x = num();
      const y = num();
      const reflect = "QqTt".includes(lastCmd);
      const x1 = reflect ? 2 * cx - prevCpx : cx;
      const y1 = reflect ? 2 * cy - prevCpy : cy;
      sampleQuad(x1, y1, rel ? cx + x : x, rel ? cy + y : y);
    } else if (abs === "A") {
      const rx = num();
      const ry = num();
      const phi = num();
      const large = num();
      const sweep = num();
      const x = num();
      const y = num();
      sampleArc(rx, ry, phi, large, sweep, rel ? cx + x : x, rel ? cy + y : y);
    } else {
      break;
    }
    lastCmd = cmd;
  }

  closeCurrent();
  return subpaths.length ? subpaths : null;
}

export function sampleSvgPath(d: unknown, maxPoints = 128): Polyline | null {
  const subs = parseSvgPathToPolylines(d, maxPoints);
  if (!subs) return null;
  if (subs.length === 1) return subs[0];
  const flat: Polyline = [];
  for (const sub of subs) {
    for (const p of sub) {
      if (flat.length >= maxPoints) return flat;
      const last = flat[flat.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      flat.push(p);
    }
  }
  return flat.length >= 2 ? flat : null;
}

function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)|,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) out.push(m[1]);
    else if (m[2]) out.push(Number(m[2]));
  }
  return out;
}

function implicitCommand(last: string): string {
  if (!last) return "";
  const abs = last.toUpperCase();
  if (abs === "M") return last === "M" ? "L" : "l";
  if (abs === "Z") return "";
  return last;
}

function cubicPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  t: number
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

function quadPoint(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
}

function curveSteps(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): number {
  const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  return Math.max(4, Math.min(16, Math.round(len / 36)));
}

function arcToPoints(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number
): Polyline {
  if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) return [[x2, y2]];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-6 || ry < 1e-6) return [[x2, y2]];

  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const start = vectorAngle(1, 0, ux, uy);
  let delta = vectorAngle(ux, uy, vx, vy);
  if (sweep === 0 && delta > 0) delta -= Math.PI * 2;
  if (sweep === 1 && delta < 0) delta += Math.PI * 2;

  const steps = Math.max(4, Math.min(16, Math.round((Math.abs(delta) * Math.max(rx, ry)) / 28)));
  const pts: Polyline = [];
  for (let s = 1; s <= steps; s++) {
    const t = start + (delta * s) / steps;
    const x = cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx;
    const y = sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy;
    pts.push([x, y]);
  }
  return pts;
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot / Math.max(1e-12, len))));
  return ux * vy - uy * vx < 0 ? -ang : ang;
}

