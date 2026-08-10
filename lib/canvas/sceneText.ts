// ============================================================
// Drawva Canvas Engine — Machine-readable Scene Text
// Formats canvas items into structured JSON string for AI prompt
// Specified in public/canvas-build-plan/07-AI-LANGCHAIN-MIMO.md §4
// ============================================================

import type { CanvasItem } from "./types";
import type { SceneJson } from "@/lib/ai/types";

function sortTopToBottomLeftToRight(a: CanvasItem, b: CanvasItem): number {
  const ay = "y" in a ? (a.y as number) : 0;
  const by = "y" in b ? (b.y as number) : 0;
  if (Math.abs(ay - by) > 20) return ay - by;
  const ax = "x" in a ? (a.x as number) : 0;
  const bx = "x" in b ? (b.x as number) : 0;
  return ax - bx;
}

export function extractSceneJson(items: CanvasItem[]): SceneJson {
  const sorted = [...items].sort(sortTopToBottomLeftToRight);
  return {
    items: sorted.map((item) => {
      // Strip bulky fields if any
      const copy = { ...item };
      if ("imageDataUrl" in copy) delete copy.imageDataUrl;
      return copy;
    }),
  };
}
