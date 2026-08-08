import { DEFAULT_CANVAS_BACKGROUND } from "@canvas/constants/defaults";
import type { Arrowhead, Camera, CanvasElement } from "@/canvas/model/types";
import { hachureFillForPolygon, sketchPolyline, sketchRect } from "./sketch";
import type { Rect } from "@canvas/geometry/rectangle";
import { rectsIntersect } from "@canvas/geometry/rectangle";
import { elementAABB } from "@canvas/geometry/elementGeometry";

/**
 * Dumb renderer (§109): receives element + camera and draws. It never decides
 * selection/locked/deleted state — the caller filters.
 */

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  canvasBackground: string;
  theme: "light" | "dark";
  /** device pixel ratio the backing store was sized with (§20). */
  dpr: number;
}

export function renderStaticScene(
  rc: RenderContext,
  elements: CanvasElement[],
  gridEnabled: boolean,
): void {
  const { ctx, camera, dpr } = rc;
  const width = ctx.canvas.width / dpr;
  const height = ctx.canvas.height / dpr;

  // background in screen space
  resetToScreen(ctx, dpr);
  ctx.fillStyle = resolveCanvasBackground(rc.canvasBackground, rc.theme);
  ctx.fillRect(0, 0, width, height);

  if (gridEnabled) renderGrid(rc);

  applyCamera(ctx, camera, dpr);

  const visible: Rect = {
    x: camera.x,
    y: camera.y,
    width: width / camera.zoom,
    height: height / camera.zoom,
  };
  for (const el of elements) {
    if (el.isDeleted) continue;
    const bounds = elementAABB(el);
    if (!rectsIntersect(visible, bounds)) continue; // viewport culling (§23)
    renderElement(rc, el);
  }
  resetToScreen(ctx, dpr);
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: Camera, dpr: number): void {
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, -camera.x * dpr * camera.zoom, -camera.y * dpr * camera.zoom);
}

export function resetToScreen(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resolveCanvasBackground(color: string, theme: "light" | "dark"): string {
  if (theme === "dark" && color === DEFAULT_CANVAS_BACKGROUND) return "#16161a";
  return color;
}

export function renderGrid(rc: RenderContext): void {
  const { ctx, camera, dpr } = rc;
  const width = ctx.canvas.width / dpr;
  const height = ctx.canvas.height / dpr;

  const base = 20;
  let step = base;
  while (step * camera.zoom < 24) step *= 2; // zoom-aware (§46)
  while (step * camera.zoom > 96) step /= 2;

  const startX = Math.floor(camera.x / step) * step;
  const startY = Math.floor(camera.y / step) * step;
  const endX = camera.x + width / camera.zoom;
  const endY = camera.y + height / camera.zoom;

  ctx.strokeStyle = rc.theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step) {
    const sx = (x - camera.x) * camera.zoom;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let y = startY; y <= endY; y += step) {
    const sy = (y - camera.y) * camera.zoom;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
}

export function renderElement(rc: RenderContext, el: CanvasElement): void {
  const { ctx } = rc;
  if (el.isDeleted) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, el.opacity));

  // rotate around element center
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  if (el.angle !== 0) {
    ctx.translate(cx, cy);
    ctx.rotate(el.angle);
    ctx.translate(-cx, -cy);
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = el.strokeColor;
  ctx.fillStyle = el.backgroundColor;
  ctx.lineWidth = el.strokeWidth;
  applyStrokeStyle(ctx, el.strokeStyle, el.strokeWidth);

  const rough = el.roughness > 0 ? el.roughness : 0;
  const sketchOpts = { seed: el.seed, roughness: rough, doubleStroke: rough > 0 };
  const w = el.width;
  const h = el.height;

  switch (el.type) {
    case "rectangle": {
      fillShape(ctx, el, [
        [el.x, el.y],
        [el.x + w, el.y],
        [el.x + w, el.y + h],
        [el.x, el.y + h],
      ]);
      if (rough > 0) {
        for (const pass of sketchRect(el.x, el.y, w, h, sketchOpts)) {
          sketchClosedPath(ctx, pass);
        }
      } else {
        strokeRectPath(ctx, el);
      }
      break;
    }
    case "ellipse": {
      fillEllipse(ctx, el);
      ctx.beginPath();
      ctx.ellipse(el.x + w / 2, el.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "diamond": {
      const cxD = el.x + w / 2;
      const cyD = el.y + h / 2;
      const pts: MutPoint[] = [
        [cxD, el.y],
        [el.x + w, cyD],
        [cxD, el.y + h],
        [el.x, cyD],
      ];
      fillShape(ctx, el, pts);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "line": {
      if (el.points.length > 1) {
        const absolutePts: [number, number][] = el.points.map((p) => [el.x + p[0], el.y + p[1]]);
        if (el.roughness > 0) {
          const passes = sketchPolyline(absolutePts, {
            seed: el.seed,
            roughness: el.roughness,
            doubleStroke: el.roughness > 1,
          });
          for (const pass of passes) {
            ctx.beginPath();
            ctx.moveTo(pass[0][0], pass[0][1]);
            for (let i = 1; i < pass.length; i++) ctx.lineTo(pass[i][0], pass[i][1]);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(absolutePts[0][0], absolutePts[0][1]);
          for (let i = 1; i < absolutePts.length; i++) {
            ctx.lineTo(absolutePts[i][0], absolutePts[i][1]);
          }
          ctx.stroke();
        }
      }
      break;
    }
    case "arrow": {
      if (el.points.length > 1) {
        const absolutePts: [number, number][] = el.points.map((p) => [el.x + p[0], el.y + p[1]]);
        if (el.roughness > 0) {
          const passes = sketchPolyline(absolutePts, {
            seed: el.seed,
            roughness: el.roughness,
            doubleStroke: el.roughness > 1,
          });
          for (const pass of passes) {
            ctx.beginPath();
            ctx.moveTo(pass[0][0], pass[0][1]);
            for (let i = 1; i < pass.length; i++) ctx.lineTo(pass[i][0], pass[i][1]);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(absolutePts[0][0], absolutePts[0][1]);
          for (let i = 1; i < absolutePts.length; i++) {
            ctx.lineTo(absolutePts[i][0], absolutePts[i][1]);
          }
          ctx.stroke();
        }

        // Draw start and end arrowheads
        const n = absolutePts.length;
        if (el.startArrowhead && el.startArrowhead !== "none") {
          const p0 = absolutePts[0];
          const p1 = absolutePts[1];
          const angle = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]);
          drawArrowhead(ctx, p0, angle, el.startArrowhead, el.strokeWidth, el.strokeColor, el.backgroundColor);
        }
        if (el.endArrowhead && el.endArrowhead !== "none") {
          const pn = absolutePts[n - 1];
          const pnPrev = absolutePts[n - 2];
          const angle = Math.atan2(pn[1] - pnPrev[1], pn[0] - pnPrev[0]);
          drawArrowhead(ctx, pn, angle, el.endArrowhead, el.strokeWidth, el.strokeColor, el.backgroundColor);
        }
      }
      break;
    }
    case "freedraw": {
      if (el.points.length > 1) {
        const absolutePts: [number, number][] = el.points.map((p) => [el.x + p[0], el.y + p[1]]);
        ctx.beginPath();
        ctx.moveTo(absolutePts[0][0], absolutePts[0][1]);
        for (let i = 1; i < absolutePts.length - 1; i++) {
          const xc = (absolutePts[i][0] + absolutePts[i + 1][0]) / 2;
          const yc = (absolutePts[i][1] + absolutePts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(absolutePts[i][0], absolutePts[i][1], xc, yc);
        }
        const last = absolutePts[absolutePts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      }
      break;
    }
    case "text": {
      // minimal placeholder until Phase 6 text system
      ctx.fillStyle = el.strokeColor;
      ctx.font = `${el.fontSize}px ${el.fontFamily}, sans-serif`;
      ctx.textBaseline = "top";
      for (const [i, line] of (el.text || "").split("\n").entries()) {
        ctx.fillText(line, el.x, el.y + i * el.fontSize * 1.25);
      }
      break;
    }
    case "frame": {
      // named container: dashed border + label, children render normally (Phase 10)
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(el.x, el.y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = el.strokeColor;
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText(el.name, el.x, el.y - 4);
      ctx.restore();
      break;
    }
    case "image":
      break; // Phase 9
  }
  ctx.restore();
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, style: string, width: number): void {
  if (style === "solid") ctx.setLineDash([]);
  else if (style === "dashed") ctx.setLineDash([width * 4, width * 3]);
  else ctx.setLineDash([width, width * 2.2]);
}

type MutPoint = [number, number];
function toMut(polygon: readonly (readonly [number, number])[]): MutPoint[] {
  return polygon.map((p) => [p[0], p[1]] as MutPoint);
}
function sketchClosedPath(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function fillShape(ctx: CanvasRenderingContext2D, el: CanvasElement, polygon: readonly (readonly [number, number])[]): void {
  if (el.backgroundColor === "transparent") return;
  const mut = toMut(polygon);
  if (el.fillStyle === "solid") {
    sketchPath(ctx, mut, true);
    ctx.fillStyle = el.backgroundColor;
    ctx.fill();
    return;
  }
  // hachure / cross-hatch (§13) — deterministic via seed
  ctx.save();
  sketchPath(ctx, mut, true);
  ctx.clip();
  const gap = Math.max(3, 6 - el.strokeWidth);
  ctx.strokeStyle = el.backgroundColor;
  ctx.lineWidth = Math.max(0.5, el.strokeWidth * 0.5);
  drawHatchLines(ctx, el, mut, -Math.PI / 4, gap);
  if (el.fillStyle === "cross-hatch") {
    drawHatchLines(ctx, el, mut, Math.PI / 4, gap);
  }
  ctx.restore();
}

function fillEllipse(ctx: CanvasRenderingContext2D, el: CanvasElement): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  if (el.backgroundColor === "transparent") return;
  if (el.fillStyle === "solid") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, Math.PI * 2);
    ctx.fillStyle = el.backgroundColor;
    ctx.fill();
    return;
  }
  // approximate hatch via bounding polygon of the ellipse
  const pts: [number, number][] = [];
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * (el.width / 2), cy + Math.sin(t) * (el.height / 2)]);
  }
  fillShape(ctx, el, pts);
}

function drawHatchLines(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  polygon: [number, number][],
  angle: number,
  gap: number,
): void {
  const lines = hachureFillForPolygon(
    polygon,
    angle,
    gap,
    { seed: el.seed, roughness: el.roughness, doubleStroke: false },
  );
  ctx.beginPath();
  for (const [a, b] of lines) {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}

function strokeRectPath(ctx: CanvasRenderingContext2D, el: CanvasElement): void {
  ctx.beginPath();
  const radius = el.rounded ? Math.min(10, Math.abs(el.width) / 4, Math.abs(el.height) / 4) : 0;
  if (radius > 0) {
    ctx.roundRect(el.x, el.y, el.width, el.height, radius);
  } else {
    ctx.rect(el.x, el.y, el.width, el.height);
  }
  ctx.stroke();
}

function sketchPath(
  ctx: CanvasRenderingContext2D,
  polygon: [number, number][],
  close: boolean,
): void {
  ctx.beginPath();
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
  if (close) ctx.closePath();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: [number, number],
  angle: number,
  style: Arrowhead,
  strokeWidth: number,
  strokeColor: string,
  backgroundColor: string,
): void {
  if (style === "none") return;

  const size = Math.max(10, strokeWidth * 4);
  ctx.save();
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;

  switch (style) {
    case "arrow": {
      ctx.moveTo(-size, -size / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-size, size / 2);
      ctx.stroke();
      break;
    }
    case "triangle": {
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.fillStyle = backgroundColor !== "transparent" ? backgroundColor : strokeColor;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "circle": {
      const radius = size / 3;
      ctx.arc(-radius, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = backgroundColor !== "transparent" ? backgroundColor : strokeColor;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "bar": {
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(0, size / 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
