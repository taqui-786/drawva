// ============================================================
// Drawva Canvas Engine — Stroke & Widget Proximity Detection
// Calculates whether drawn ink strokes intersect or are near a widget.
// ============================================================

import type { WidgetItem, Point } from "./types";

export interface ProximityResult {
  distance: number;
  hits: number;
}

/**
 * Calculates proximity and overlap between a drawn stroke trail and a widget bounding box.
 * Returns null if the stroke is too far (> 50px) from the widget.
 */
export function strokeWidgetProximity(
  widget: WidgetItem,
  strokePoints: Point[],
  thresholdPx = 50
): ProximityResult | null {
  if (!strokePoints || strokePoints.length === 0) return null;

  const wx = widget.x;
  const wy = widget.y;
  const ww = widget.w;
  const wh = widget.h;

  let minDistance = Infinity;
  let hits = 0;

  for (const pt of strokePoints) {
    // Distance from point to box bounding rect
    const dx = Math.max(wx - pt.x, 0, pt.x - (wx + ww));
    const dy = Math.max(wy - pt.y, 0, pt.y - (wy + wh));
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) {
      hits++;
    }

    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  if (minDistance > thresholdPx) {
    return null;
  }

  return {
    distance: minDistance,
    hits,
  };
}

/**
 * Finds the best matching widget candidate near a drawn stroke.
 */
export function findRefineCandidateWidget(
  widgets: WidgetItem[],
  strokePoints: Point[]
): WidgetItem | null {
  if (!widgets.length || !strokePoints.length) return null;

  let bestWidget: WidgetItem | null = null;
  let bestScore = Infinity;

  for (const widget of widgets) {
    const prox = strokeWidgetProximity(widget, strokePoints);
    if (!prox) continue;

    // Score combines distance (lower is better) and hits (more hits = lower score)
    const score = prox.distance - prox.hits * 5;
    if (score < bestScore) {
      bestScore = score;
      bestWidget = widget;
    }
  }

  return bestWidget;
}
