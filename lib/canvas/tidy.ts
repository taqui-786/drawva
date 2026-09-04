import { SIZE } from "./constants";
import type { Rect } from "./types";

export const PLACE_GAP = 48;
const MAX_SLOT_ATTEMPTS = 20;
const MAX_CANDIDATES = 150;

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
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function getItemCreatedAt(item: { id: string; createdAt?: number }): number {
  if (typeof item.createdAt === "number" && Number.isFinite(item.createdAt)) return item.createdAt;
  const match = item.id.match(/(\d{12,15})/);
  return match ? Number(match[1]) || 0 : 0;
}

function boxOf(item: TidyItemInput): Rect {
  return { x: Math.round(item.x), y: Math.round(item.y), w: Math.round(item.w), h: Math.round(item.h) };
}

function inView(b: Rect, view: Rect): boolean {
  return rectsIntersect(b, view);
}

function isSelfInk(item: Rect, ink: Rect): boolean {
  const ix = Math.max(0, Math.min(item.x + item.w, ink.x + ink.w) - Math.max(item.x, ink.x));
  const iy = Math.max(0, Math.min(item.y + item.h, ink.y + ink.h) - Math.max(item.y, ink.y));
  return (ix * iy) / Math.max(1, ink.w * ink.h) >= 0.5;
}

function hits(item: Rect, blockers: Rect[]): Rect[] {
  return blockers.filter((b) => rectsIntersect(item, b));
}

function clampBox(b: Rect): Rect {
  const w = Math.max(1, Math.min(b.w, SIZE));
  const h = Math.max(1, Math.min(b.h, SIZE));
  return { x: Math.max(0, Math.min(SIZE - w, b.x)), y: Math.max(0, Math.min(SIZE - h, b.y)), w, h };
}

function slide(item: Rect, blockers: Rect[], dir: 1 | -1): Rect | null {
  const next = { ...item };
  for (let step = 0; step < MAX_SLOT_ATTEMPTS; step++) {
    const hit = hits(next, blockers);
    if (!hit.length) return clampBox(next);
    if (dir === 1) {
      next.y = Math.max(...hit.map((b) => b.y + b.h)) + PLACE_GAP;
      if (next.y + next.h > SIZE) {
        next.y = SIZE - next.h;
        return hits(next, blockers).length ? null : clampBox(next);
      }
    } else {
      next.y = Math.min(...hit.map((b) => b.y)) - next.h - PLACE_GAP;
      if (next.y < 0) {
        next.y = 0;
        return hits(next, blockers).length ? null : clampBox(next);
      }
    }
  }
  return null;
}

interface Cand extends Rect {
  id: string;
  kind: "widget" | "object";
  createdAt: number;
}

export function computeTidyMoves(input: ComputeTidyInput): TidyResult | null {
  const view = input.visibleRect;
  const ink =
    input.inkRect && input.inkRect.w > 4 && input.inkRect.h > 4
      ? {
          x: Math.round(input.inkRect.x),
          y: Math.round(input.inkRect.y),
          w: Math.round(input.inkRect.w),
          h: Math.round(input.inkRect.h),
        }
      : null;

  const locked: Array<Rect & { id: string }> = [];
  const drafts: Rect[] = [...(input.pendingDrafts ?? [])];
  const outside: Rect[] = [];
  const candidates: Cand[] = [];

  const ingest = (item: TidyItemInput, kind: "widget" | "object") => {
    const b = boxOf(item);
    if (item.locked) {
      if (inView(b, view)) locked.push({ ...b, id: item.id });
      outside.push(b);
      return;
    }
    if (item.status === "draft") {
      drafts.push(b);
      return;
    }
    if (!inView(b, view)) {
      outside.push(b);
      return;
    }
    candidates.push({ ...b, id: item.id, kind, createdAt: getItemCreatedAt(item) });
  };

  for (const w of input.widgets) ingest(w, "widget");
  for (const o of input.objects) ingest(o, "object");

  const skippedLocked = new Set(
    locked.flatMap((a, i) => locked.filter((b, j) => j > i && rectsIntersect(a, b)).flatMap((b) => [a.id, b.id]))
  ).size;

  const totalCandidates = candidates.length;
  if (!totalCandidates) {
    return skippedLocked ? { moves: [], movedCount: 0, totalCandidates: 0, cappedAt150: false, skippedLocked, partialFailures: 0 } : null;
  }

  const staticBlockers = [...drafts, ...outside, ...locked];
  let cappedAt150 = false;
  if (candidates.length > MAX_CANDIDATES) {
    cappedAt150 = true;
    candidates.sort((a, b) => {
      const score = (c: Cand) =>
        candidates.reduce((n, o) => n + (o !== c && rectsIntersect(c, o) ? 1 : 0), 0) +
        staticBlockers.reduce((n, o) => n + (rectsIntersect(c, o) ? 1 : 0), 0);
      return score(b) - score(a);
    });
    staticBlockers.push(...candidates.splice(MAX_CANDIDATES));
  }

  candidates.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const blockersFor = (c: Cand, placed: Rect[]): Rect[] => {
    const extra = ink && !isSelfInk(c, ink) ? [ink] : [];
    return [...staticBlockers, ...placed, ...extra];
  };

  const needsMove = candidates.some((c, i) => {
    const others = candidates.filter((_, j) => j !== i);
    return hits(c, blockersFor(c, others)).length > 0;
  });
  if (!needsMove) {
    return skippedLocked
      ? { moves: [], movedCount: 0, totalCandidates, cappedAt150, skippedLocked, partialFailures: 0 }
      : null;
  }

  const placed: Rect[] = [];
  const moves: TidyMove[] = [];
  let partialFailures = 0;

  for (const c of candidates) {
    const here = { x: c.x, y: c.y, w: c.w, h: c.h };
    const walls = blockersFor(c, placed);
    if (!hits(here, walls).length) {
      placed.push(here);
      continue;
    }
    let next = slide(here, walls, 1);
    if (!next) {
      let south = 0;
      for (const b of [...placed, ...walls]) south = Math.max(south, b.y + b.h);
      const below = clampBox({ ...here, y: south + PLACE_GAP });
      if (below.y + below.h <= SIZE && !hits(below, walls).length) next = below;
    }
    if (!next) next = slide(here, walls, -1);
    if (!next) {
      partialFailures++;
      placed.push(here);
      continue;
    }
    if (next.x !== c.x || next.y !== c.y) moves.push({ kind: c.kind, id: c.id, x: next.x, y: next.y });
    placed.push(next);
  }

  if (!moves.length) {
    return skippedLocked || partialFailures
      ? { moves: [], movedCount: 0, totalCandidates, cappedAt150, skippedLocked, partialFailures }
      : null;
  }
  return { moves, movedCount: moves.length, totalCandidates, cappedAt150, skippedLocked, partialFailures };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function demo(): void {
  const view = { x: 0, y: 0, w: 4000, h: 3000 };
  assert(computeTidyMoves({ widgets: [], objects: [], visibleRect: view }) === null, "empty");

  const one = { id: "text-1000000000000", x: 100, y: 100, w: 200, h: 80, status: "accepted" as const };
  assert(computeTidyMoves({ widgets: [], objects: [one], visibleRect: view }) === null, "single");

  const a = { id: "text-1000000000001", x: 100, y: 100, w: 200, h: 80, status: "accepted" as const };
  const b = { id: "text-1000000000002", x: 110, y: 110, w: 200, h: 80, status: "accepted" as const };
  const pair = computeTidyMoves({ widgets: [], objects: [a, b], visibleRect: view, inkRect: { x: 100, y: 100, w: 210, h: 90 } });
  assert(pair && pair.moves.length === 1 && pair.moves[0].id === b.id && pair.moves[0].y >= a.y + a.h + PLACE_GAP, "pair slides younger");

  const lockedOld = { ...a, id: "text-1000000000003", locked: true };
  const young = { ...b, id: "text-1000000000004" };
  const lockedPair = computeTidyMoves({ widgets: [], objects: [lockedOld, young], visibleRect: view });
  assert(lockedPair && lockedPair.moves.length === 1 && lockedPair.moves[0].id === young.id, "locked oldest stays");

  const l1 = { ...a, id: "text-1000000000005", locked: true };
  const l2 = { ...b, id: "text-1000000000006", locked: true };
  const bothLocked = computeTidyMoves({ widgets: [], objects: [l1, l2], visibleRect: view });
  assert(bothLocked && bothLocked.moves.length === 0 && bothLocked.skippedLocked === 2, "both locked skipped");

  const draft = { id: "plot-1000000000007", x: 100, y: 100, w: 200, h: 80, status: "draft" as const };
  const acc = { id: "text-1000000000008", x: 110, y: 110, w: 200, h: 80, status: "accepted" as const };
  const vsDraft = computeTidyMoves({ widgets: [], objects: [draft, acc], visibleRect: view });
  assert(vsDraft && vsDraft.moves.length === 1 && vsDraft.moves[0].id === acc.id, "draft is blocker");

  console.log("tidy self-check ok");
}

if (typeof process !== "undefined" && process.argv[1]?.includes("tidy.ts")) {
  demo();
}
