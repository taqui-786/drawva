import { SIZE } from "./constants";
import type { Rect } from "./types";

export const PLACE_GAP = 48;
const MAX_SLOT_ATTEMPTS = 20;

export interface TidyItemInput {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status?: "draft" | "accepted";
  locked?: boolean;
  createdAt?: number;
}

export interface ComputeTidyInput {
  widgets: TidyItemInput[];
  objects: TidyItemInput[];
  visibleRect: Rect;
  inkRect?: Rect | null;
  pendingDrafts?: Rect[];
}

export interface TidyMove {
  kind: "widget" | "object";
  id: string;
  x: number;
  y: number;
}

export interface TidyResult {
  moves: TidyMove[];
  movedCount: number;
  totalCandidates: number;
  cappedAt150: boolean;
  skippedLocked: number;
  partialFailures: number;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function getItemCreatedAt(item: { id: string; createdAt?: number }): number {
  if (typeof item.createdAt === "number" && Number.isFinite(item.createdAt)) {
    return item.createdAt;
  }
  const match = item.id.match(/\b(\d{12,15})\b/);
  if (match) {
    const ts = Number(match[1]);
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

interface CandidateInternal extends Rect {
  id: string;
  kind: "widget" | "object";
  createdAt: number;
}

export function computeTidyMoves(input: ComputeTidyInput): TidyResult | null {
  const { visibleRect, inkRect } = input;

  // 1. Detect locked items in viewport
  const lockedInViewport: Array<Rect & { id: string }> = [];
  for (const w of input.widgets) {
    if (w.locked && rectsIntersect(w, visibleRect)) {
      lockedInViewport.push({ id: w.id, x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) });
    }
  }
  for (const o of input.objects) {
    if (o.locked && rectsIntersect(o, visibleRect)) {
      lockedInViewport.push({ id: o.id, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) });
    }
  }

  // 2. Draft items & ink blockers
  const drafts: Rect[] = [];
  for (const w of input.widgets) {
    if (w.status === "draft") {
      drafts.push({ x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) });
    }
  }
  for (const o of input.objects) {
    if (o.status === "draft") {
      drafts.push({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) });
    }
  }
  if (Array.isArray(input.pendingDrafts)) {
    for (const d of input.pendingDrafts) {
      drafts.push({ x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h) });
    }
  }

  // Count locked items colliding with other locked items, drafts, or ink
  const overlappingLockedIds = new Set<string>();
  for (let i = 0; i < lockedInViewport.length; i++) {
    for (let j = i + 1; j < lockedInViewport.length; j++) {
      if (rectsIntersect(lockedInViewport[i], lockedInViewport[j])) {
        overlappingLockedIds.add(lockedInViewport[i].id);
        overlappingLockedIds.add(lockedInViewport[j].id);
      }
    }
    if (inkRect && inkRect.w > 0 && inkRect.h > 0 && rectsIntersect(lockedInViewport[i], inkRect)) {
      overlappingLockedIds.add(lockedInViewport[i].id);
    }
    for (const d of drafts) {
      if (rectsIntersect(lockedInViewport[i], d)) {
        overlappingLockedIds.add(lockedInViewport[i].id);
      }
    }
  }
  const skippedLocked = overlappingLockedIds.size;

  // 3. Collect candidates (accepted, !locked, in viewport)
  let candidates: CandidateInternal[] = [];
  const blockers: Rect[] = [...drafts];

  if (inkRect && inkRect.w > 0 && inkRect.h > 0) {
    blockers.push({
      x: Math.round(inkRect.x),
      y: Math.round(inkRect.y),
      w: Math.round(inkRect.w),
      h: Math.round(inkRect.h),
    });
  }

  // Add all locked items to blockers (locked items never move)
  for (const w of input.widgets) {
    if (w.locked) {
      blockers.push({ x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) });
    }
  }
  for (const o of input.objects) {
    if (o.locked) {
      blockers.push({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) });
    }
  }

  // Collect candidate items vs accepted items outside viewport
  for (const w of input.widgets) {
    if (w.status === "accepted" && !w.locked) {
      const box = { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) };
      if (rectsIntersect(box, visibleRect)) {
        candidates.push({ ...box, id: w.id, kind: "widget", createdAt: getItemCreatedAt(w) });
      } else {
        blockers.push(box);
      }
    }
  }
  for (const o of input.objects) {
    if (o.status === "accepted" && !o.locked) {
      const box = { x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) };
      if (rectsIntersect(box, visibleRect)) {
        candidates.push({ ...box, id: o.id, kind: "object", createdAt: getItemCreatedAt(o) });
      } else {
        blockers.push(box);
      }
    }
  }

  const totalCandidates = candidates.length;
  if (totalCandidates === 0) {
    if (skippedLocked > 0) {
      return {
        moves: [],
        movedCount: 0,
        totalCandidates: 0,
        cappedAt150: false,
        skippedLocked,
        partialFailures: 0,
      };
    }
    return null;
  }

  // 4. Cap at 150 candidates to avoid janking rAF loop; spatial hash if ever needed
  let cappedAt150 = false;
  if (candidates.length > 150) {
    cappedAt150 = true;
    const allForScoring = [...candidates, ...blockers];
    const scored = candidates.map((c) => {
      let area = 0;
      let count = 0;
      for (const b of allForScoring) {
        if (b === c) continue;
        const ix = Math.max(0, Math.min(c.x + c.w, b.x + b.w) - Math.max(c.x, b.x));
        const iy = Math.max(0, Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y));
        if (ix > 0 && iy > 0) {
          area += ix * iy;
          count++;
        }
      }
      return { candidate: c, area, count };
    });

    scored.sort((a, b) => (b.area !== a.area ? b.area - a.area : b.count - a.count));
    candidates = scored.slice(0, 150).map((s) => s.candidate);
    const overflow = scored.slice(150).map((s) => s.candidate);
    blockers.push(...overflow);
  }

  // 5. Check if there are any overlaps at all
  let hasAnyOverlap = false;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (rectsIntersect(candidates[i], candidates[j])) {
        hasAnyOverlap = true;
        break;
      }
    }
    if (hasAnyOverlap) break;
    for (const b of blockers) {
      if (rectsIntersect(candidates[i], b)) {
        hasAnyOverlap = true;
        break;
      }
    }
    if (hasAnyOverlap) break;
  }

  if (!hasAnyOverlap) {
    if (skippedLocked > 0) {
      return {
        moves: [],
        movedCount: 0,
        totalCandidates,
        cappedAt150,
        skippedLocked,
        partialFailures: 0,
      };
    }
    return null;
  }

  // 6. Sort candidates by createdAt ascending (oldest stays put)
  candidates.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id);
  });

  // 7. Sliding algorithm
  const placed: Rect[] = [...blockers];
  const moves: TidyMove[] = [];
  let partialFailures = 0;

  for (const c of candidates) {
    // If rect does NOT collide with already-placed items or blockers, leave it put
    if (!placed.some((b) => rectsIntersect(c, b))) {
      placed.push({ x: c.x, y: c.y, w: c.w, h: c.h });
      continue;
    }

    let next: Rect = { x: c.x, y: c.y, w: c.w, h: c.h };
    let resolved = false;

    // Try sliding downward in increments (reuse slot/slide idea)
    for (let step = 0; step < MAX_SLOT_ATTEMPTS; step++) {
      const hits = placed.filter((b) => rectsIntersect(next, b));
      if (hits.length === 0) {
        resolved = true;
        break;
      }
      let maxBottom = 0;
      for (const h of hits) {
        if (h.y + h.h > maxBottom) maxBottom = h.y + h.h;
      }
      next.y = maxBottom + PLACE_GAP;

      // Downward slide clamps at SIZE - h
      if (next.y + next.h > SIZE) {
        next.y = Math.max(0, SIZE - next.h);
        if (!placed.some((b) => rectsIntersect(next, b))) {
          resolved = true;
        }
        break;
      }
    }

    // Fall back to "below southernmost content" after failed slots
    if (!resolved) {
      let southernmost = 0;
      for (const b of placed) {
        if (b.y + b.h > southernmost) southernmost = b.y + b.h;
      }
      const fallbackY = southernmost + PLACE_GAP;
      if (fallbackY + next.h <= SIZE) {
        const fallbackBox: Rect = { ...next, y: fallbackY };
        if (!placed.some((b) => rectsIntersect(fallbackBox, b))) {
          next = fallbackBox;
          resolved = true;
        }
      }
    }

    // If still blocked, try upward slide
    if (!resolved) {
      const upBox: Rect = { x: c.x, y: c.y, w: c.w, h: c.h };
      for (let step = 0; step < MAX_SLOT_ATTEMPTS; step++) {
        const hits = placed.filter((b) => rectsIntersect(upBox, b));
        if (hits.length === 0) {
          next = upBox;
          resolved = true;
          break;
        }
        let minTop = SIZE;
        for (const h of hits) {
          if (h.y < minTop) minTop = h.y;
        }
        upBox.y = minTop - upBox.h - PLACE_GAP;
        if (upBox.y < 0) {
          upBox.y = 0;
          if (!placed.some((b) => rectsIntersect(upBox, b))) {
            next = upBox;
            resolved = true;
          }
          break;
        }
      }
    }

    if (resolved) {
      if (next.x !== c.x || next.y !== c.y) {
        moves.push({ kind: c.kind, id: c.id, x: next.x, y: next.y });
      }
      placed.push(next);
    } else {
      // Partial failure: could not find open slot without collision
      partialFailures++;
      placed.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }
  }

  if (moves.length === 0) {
    if (skippedLocked > 0) {
      return {
        moves: [],
        movedCount: 0,
        totalCandidates,
        cappedAt150,
        skippedLocked,
        partialFailures,
      };
    }
    return null;
  }

  return {
    moves,
    movedCount: moves.length,
    totalCandidates,
    cappedAt150,
    skippedLocked,
    partialFailures,
  };
}
