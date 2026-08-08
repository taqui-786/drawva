import {
  HANDLE_SIZE_SCREEN_PX,
  ROTATION_HANDLE_OFFSET_SCREEN_PX,
  SELECTION_ELEMENT_PADDING_PX,
} from "@canvas/constants/defaults";
import type { Camera, CanvasElement, Point } from "@/canvas/model/types";
import { elementCenter } from "./elementGeometry";
import { distanceToSegment, rotatePoint } from "./point";
import type { ResizeHandle } from "./transform";

/**
 * Selection geometry in SCREEN space so handles stay a constant pixel size at
 * any zoom (§40). Single source of truth: the hit test and the renderer must
 * construct the same coordinates.
 */

export interface SelectionGeometryScreen {
  /** rotated element corners, clockwise from top-left, screen px */
  corners: [Point, Point, Point, Point];
  /** 8 resize handles in screen px, aligned with RESIZE_HANDLE order */
  handles: Point[];
  handleOrder: Exclude<ResizeHandle, "rotation">[];
  rotationHandle: Point | null;
}

export function resizeHandlePositions(el: CanvasElement, camera: Camera): SelectionGeometryScreen {
  const corners = elementCornersScreen(el, camera);
  const [tl, tr, br, bl] = corners;

  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const t = mid(tl, tr);
  const r = mid(tr, br);
  const b = mid(br, bl);
  const l = mid(bl, tl);

  const handleOrder: Exclude<ResizeHandle, "rotation">[] = [
    "nw", "n", "ne", "e", "se", "s", "sw", "w",
  ];
  const handles: Point[] = [tl, t, tr, r, br, b, bl, l];

  // rotation handle sits above the top edge (§40), rotated with the element
  let rotationHandle: Point | null = null;
  {
    const sceneC = elementCenter(el);
    const sceneTopMid: Point = [el.x + el.width / 2, el.y];
    const rotatedTop =
      el.angle === 0 ? sceneTopMid : rotatePoint(sceneTopMid, sceneC, el.angle);
    const dirX = rotatedTop[0] - sceneC[0];
    const dirY = rotatedTop[1] - sceneC[1];
    const len = Math.hypot(dirX, dirY) || 1;
    const scenePos: Point = [
      rotatedTop[0] + (dirX / len) * (ROTATION_HANDLE_OFFSET_SCREEN_PX / camera.zoom),
      rotatedTop[1] + (dirY / len) * (ROTATION_HANDLE_OFFSET_SCREEN_PX / camera.zoom),
    ];
    rotationHandle = [
      (scenePos[0] - camera.x) * camera.zoom,
      (scenePos[1] - camera.y) * camera.zoom,
    ];
  }

  return { corners, handles, handleOrder, rotationHandle };
}

export function elementCornersScreen(el: CanvasElement, camera: Camera): [Point, Point, Point, Point] {
  const pad = SELECTION_ELEMENT_PADDING_PX / camera.zoom;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const local: Point[] = [
    [el.x - pad, el.y - pad],
    [el.x + el.width + pad, el.y - pad],
    [el.x + el.width + pad, el.y + el.height + pad],
    [el.x - pad, el.y + el.height + pad],
  ];
  const rotated = local.map((p) =>
    el.angle === 0 ? p : rotatePoint(p, [cx, cy], el.angle),
  );
  return rotated.map((p): Point => [
    (p[0] - camera.x) * camera.zoom,
    (p[1] - camera.y) * camera.zoom,
  ]) as [Point, Point, Point, Point];
}

const HANDLE_CLICK_RADIUS = HANDLE_SIZE_SCREEN_PX;

/**
 * Hit-test a screen-space pointer against selection handles (§24). Handles are
 * checked before any element hit test.
 */
export function hitTestHandles(
  el: CanvasElement,
  camera: Camera,
  pointerScreen: Point,
): ResizeHandle | null {
  if (el.locked) return null; // §50
  const geo = resizeHandlePositions(el, camera);

  if (geo.rotationHandle) {
    const d = Math.hypot(
      geo.rotationHandle[0] - pointerScreen[0],
      geo.rotationHandle[1] - pointerScreen[1],
    );
    if (d <= HANDLE_CLICK_RADIUS) return "rotation";
  }
  for (let i = 0; i < geo.handles.length; i++) {
    const d = Math.hypot(
      geo.handles[i][0] - pointerScreen[0],
      geo.handles[i][1] - pointerScreen[1],
    );
    if (d <= HANDLE_CLICK_RADIUS) return geo.handleOrder[i];
  }
  return null;
}

/**
 * Selection outline hit test: returns true if the pointer is within tolerance
 * of the rotated outline stroke (used for precise hover/click-throughs).
 */
export function pointNearOutline(el: CanvasElement, camera: Camera, pointerScreen: Point, tolerancePx: number): boolean {
  const corners = elementCornersScreen(el, camera);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    if (distanceToSegment(pointerScreen, a, b) <= tolerancePx) return true;
  }
  return false;
}
