import {
  HANDLE_SIZE_SCREEN_PX,
  SELECTION_COLOR,
} from "@canvas/constants/defaults";
import { elementCornersScreen, resizeHandlePositions } from "@canvas/geometry/selectionGeometry";
import type { CanvasElement } from "@/canvas/model/types";
import type { Rect } from "@canvas/geometry/rectangle";
import { resetToScreen, type RenderContext } from "./renderElement";

/** Interactive layer: selection boxes, handles, tool previews, lasso (§21). */

export interface OverlayState {
  selectedElements: CanvasElement[];
  /** element being constructed by a draw tool */
  pendingElement: CanvasElement | null;
  /** marquee rect in scene space while box-selecting */
  marqueeRect: Rect | null;
  /** hovered element (e.g. arrow-binding/eraser preview) */
  hoveredElement: CanvasElement | null;
}

export function renderOverlayScene(rc: RenderContext, state: OverlayState): void {
  const { ctx, dpr } = rc;
  const width = ctx.canvas.width / dpr;
  const height = ctx.canvas.height / dpr;
  resetToScreen(ctx, dpr);
  ctx.clearRect(0, 0, width, height);

  const { camera } = rc;

  // marquee (box selection) — §26
  if (state.marqueeRect) {
    const x = (state.marqueeRect.x - camera.x) * camera.zoom;
    const y = (state.marqueeRect.y - camera.y) * camera.zoom;
    ctx.fillStyle = "rgba(76,111,255,0.08)";
    ctx.strokeStyle = "rgba(76,111,255,0.7)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, state.marqueeRect.width * camera.zoom, state.marqueeRect.height * camera.zoom);
    ctx.strokeRect(x, y, state.marqueeRect.width * camera.zoom, state.marqueeRect.height * camera.zoom);
  }

  for (const el of state.selectedElements) {
    drawSelection(rc, el);
  }

  if (state.pendingElement) {
    drawGhostOutline(rc, state.pendingElement);
  }

  if (state.hoveredElement) {
    drawHover(rc, state.hoveredElement);
  }
}

function drawSelection(rc: RenderContext, el: CanvasElement): void {
  const { ctx, camera } = rc;
  const pts = elementCornersScreen(el, camera);
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  tracePath(ctx, pts, true);
  ctx.stroke();

  // resize + rotation handles (§40) — locked elements show a bare outline (§50)
  if (!el.locked) {
    const { handles, rotationHandle } = resizeHandlePositions(el, camera);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;

    const half = HANDLE_SIZE_SCREEN_PX / 2;
    for (const h of handles) {
      ctx.beginPath();
      ctx.roundRect(h[0] - half, h[1] - half, HANDLE_SIZE_SCREEN_PX, HANDLE_SIZE_SCREEN_PX, 2);
      ctx.fill();
      ctx.stroke();
    }

    if (rotationHandle) {
      // Connector line from top-center edge to rotation handle
      const topMid: [number, number] = [
        (pts[0][0] + pts[1][0]) / 2,
        (pts[0][1] + pts[1][1]) / 2,
      ];
      ctx.beginPath();
      ctx.moveTo(topMid[0], topMid[1]);
      ctx.lineTo(rotationHandle[0], rotationHandle[1]);
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rotationHandle[0], rotationHandle[1], HANDLE_SIZE_SCREEN_PX / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGhostOutline(rc: RenderContext, el: CanvasElement): void {
  const { ctx } = rc;
  const pts = elementCornersScreen(el, rc.camera);
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  tracePath(ctx, pts, true);
  ctx.stroke();
  ctx.restore();
}

function drawHover(rc: RenderContext, el: CanvasElement): void {
  const { ctx } = rc;
  const pts = elementCornersScreen(el, rc.camera);
  ctx.save();
  ctx.strokeStyle = "rgba(76,111,255,0.5)";
  ctx.lineWidth = 1;
  tracePath(ctx, pts, true);
  ctx.stroke();
  ctx.restore();
}

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], close: boolean): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
