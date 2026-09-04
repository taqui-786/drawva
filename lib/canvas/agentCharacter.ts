/**
 * AgentCharacterController — a tiny pixel-art AI worker living on the canvas.
 *
 * The character is NOT decorative: it is driven entirely by real Conductor
 * agent/tool events. It spawns when a turn starts, walks (in world coords) to
 * the canvas region the current tool touches, plays a per-tool working pose,
 * celebrates on completion and fades out.
 *
 * Rendering uses a dedicated overlay canvas (pointer-events: none, above the
 * widget/object DOM hosts) driven by its own rAF loop that only runs while a
 * character exists. World coordinates come from the same camera transform as
 * the engine layers, so pan/zoom keep the character glued to the canvas.
 * No new dependencies.
 *
 * The character map is keyed by agentId so sub-agent characters can be added
 * later without restructuring (only "main" is fed today).
 */

import type { CanvasEngine } from "./engine";
import type { WidgetManager } from "./widgets";
import type { ObjectManager } from "./objects";
import type { Rect } from "./types";
import { SIZE } from "./constants";
import { getSpriteFrame, SPRITE_H, SPRITE_W, type SpriteFrameName } from "./pixelSprites";

/** Spatial hint extracted from a tool call / result: what the tool touches. */
export interface ToolTargetHint {
  objectId?: string;
  objectIds?: string[];
  region?: { x: number; y: number; w: number; h: number };
  boxes?: { x: number; y: number; w: number; h: number }[];
}

export type AgentCharacterInput =
  | { kind: "turn_start" }
  | { kind: "tool_start"; tool: string; target?: ToolTargetHint }
  | { kind: "tool_end"; tool: string; ok: boolean; target?: ToolTargetHint }
  | { kind: "text_delta" }
  | { kind: "reasoning_delta" }
  | { kind: "turn_end"; reason: "done" | "cancelled" | "error" };

export interface AgentCharacterDeps {
  engine: CanvasEngine;
  widgets: () => WidgetManager | null;
  objects: () => ObjectManager | null;
  /** Newest user ink bounding box, or null. */
  getInkBox: () => Rect | null;
  /** Currently selected element boxes (widgets/objects/ink selection). */
  getSelectionBoxes: () => Rect[];
}

type CharState =
  | "walking"
  | "idle"
  | "reading"
  | "working"
  | "thinking"
  | "celebrating"
  | "sad"
  | "stumble";

interface Character {
  id: string;
  /** World position of the character's feet (bottom-center). */
  pos: { x: number; y: number };
  landing: { x: number; y: number } | null;
  targetBox: Rect | null;
  state: CharState;
  /** Animation to switch to once the walk finishes. */
  queuedState: CharState | null;
  /** State to resume after a stumble. */
  resumeState: CharState | null;
  facing: 1 | -1;
  /** Dominant walk axis — picks side sprites (h) or front sprites (v). */
  walkDir: "h" | "v";
  stateSince: number;
  alpha: number;
  fadingOut: boolean;
  /** Live agent narration shown in the thought bubble (null = hidden). */
  narration: string | null;
  /** User is hand-carrying the character — freeze autonomous behavior. */
  dragging: boolean;
  /** Turn ended while the user was dragging; wrap up (celebrate/fade) on drop. */
  pendingEnd: "done" | "cancelled" | "error" | null;
}

const READ_TOOLS = new Set(["canvas_scan", "canvas_snapshot", "canvas_read", "canvas_focus"]);
const WORK_TOOLS = new Set([
  "canvas_apply",
  "canvas_edit",
  "canvas_patch_widget",
  "canvas_undo",
  "load_plugin",
]);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function unionAll(boxes: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    const bx0 = Math.min(b.x, b.x + b.w);
    const bx1 = Math.max(b.x, b.x + b.w);
    const by0 = Math.min(b.y, b.y + b.h);
    const by1 = Math.max(b.y, b.y + b.h);
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function normRect(b: { x: number; y: number; w: number; h: number }): Rect {
  return {
    x: Math.min(b.x, b.x + b.w),
    y: Math.min(b.y, b.y + b.h),
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

function animForTool(tool: string): CharState {
  if (READ_TOOLS.has(tool)) return "reading";
  if (WORK_TOOLS.has(tool)) return "working";
  return "thinking";
}

interface FrameChoice {
  name: SpriteFrameName;
  /** Jump arc while celebrating (fraction of sprite height). */
  jump: number;
  /** Horizontal shiver while stumbling (fraction of sprite width). */
  shake: number;
}

export class AgentCharacterController {
  private chars = new Map<string, Character>();
  private lastT = typeof performance !== "undefined" ? performance.now() : 0;
  private reduced = false;
  /**
   * Dedicated overlay canvas above all canvas content (widgets/objects are
   * DOM hosts at z-index 20/40; the engine's interaction layer sits below
   * them). The character and his bubble must never hide behind content.
   */
  private overlay: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D | null;
  private rafId: number | null = null;

  constructor(private deps: AgentCharacterDeps) {
    this.overlay = document.createElement("canvas");
    this.overlay.style.position = "absolute";
    this.overlay.style.inset = "0";
    this.overlay.style.pointerEvents = "none";
    this.overlay.style.zIndex = "60";
    deps.engine.rootElement.appendChild(this.overlay);
    this.overlayCtx = this.overlay.getContext("2d");
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay.remove();
    this.chars.clear();
  }

  /** Visible character count (tests / debugging). */
  get size(): number {
    return this.chars.size;
  }

  /** Run the paint loop while any character exists. */
  private ensureLoop(): void {
    if (this.rafId !== null || this.chars.size === 0) return;
    this.rafId = requestAnimationFrame(() => this.paintOverlay());
  }

  private paintOverlay(): void {
    this.rafId = null;
    if (this.chars.size === 0) return;
    const engine = this.deps.engine;
    const rect = engine.rootElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const ctx = this.overlayCtx;
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);
        if (this.overlay.width !== w || this.overlay.height !== h) {
          this.overlay.width = w;
          this.overlay.height = h;
        }
        const now = performance.now();
        const dt = clamp((now - this.lastT) / 1000, 0, 0.05);
        this.lastT = now;
        const cam = engine.camera;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.translate(cam.panX, cam.panY);
        ctx.scale(cam.scale, cam.scale);
        const dead: string[] = [];
        for (const ch of this.chars.values()) {
          this.updateCharacter(ch, dt, now);
          if (ch.fadingOut && ch.alpha <= 0) {
            dead.push(ch.id);
            continue;
          }
          this.drawCharacter(ctx, ch, now);
        }
        for (const id of dead) this.chars.delete(id);
        ctx.restore();
      }
    }
    this.ensureLoop();
  }

  /**
   * Feed the live agent narration (ticker message + stream tail).
   * null/empty hides the bubble immediately. The bubble only renders while
   * the character is stationary — never mid-walk.
   */
  setNarration(text: string | null): void {
    const clean = text && text.trim() ? text.trim().slice(0, 160) : null;
    let changed = false;
    for (const ch of this.chars.values()) {
      if (ch.narration !== clean) {
        ch.narration = clean;
        changed = true;
      }
    }
    if (changed) this.ensureLoop();
  }

  // ── Interactive dragging (user carries the character) ─────────

  private dragId: string | null = null;
  /** Narration captured at pick-up so endDrag can restore it. */
  private dragNarration: string | null = null;

  /** Pointer (world coords) over any character's sprite? */
  hitTest(world: { x: number; y: number }): boolean {
    for (const ch of this.chars.values()) {
      if (ch.alpha <= 0.1) continue;
      const w = this.charWorldWidth();
      const h = w * (SPRITE_H / SPRITE_W);
      const box = {
        x: ch.pos.x - w * 0.7,
        y: ch.pos.y - h,
        w: w * 1.4,
        h: h,
      };
      if (
        world.x >= box.x &&
        world.x <= box.x + box.w &&
        world.y >= box.y &&
        world.y <= box.y + box.h
      ) {
        return true;
      }
    }
    return false;
  }

  isDragging(): boolean {
    return this.dragId !== null;
  }

  /** Pick the character up at the pointer. Returns false when none hit. */
  beginDrag(world: { x: number; y: number }): boolean {
    for (const [id, ch] of this.chars.entries()) {
      if (ch.alpha <= 0.1) continue;
      const w = this.charWorldWidth();
      const h = w * (SPRITE_H / SPRITE_W);
      if (
        world.x >= ch.pos.x - w * 0.7 &&
        world.x <= ch.pos.x + w * 0.7 &&
        world.y >= ch.pos.y - h &&
        world.y <= ch.pos.y
      ) {
        this.dragId = id;
        ch.dragging = true;
        // Hide the bubble while carried, but remember it so dropping
        // restores the live narration instead of losing it forever.
        this.dragNarration = ch.narration;
        ch.narration = null;
        this.setState(ch, "idle");
        this.ensureLoop();
        return true;
      }
    }
    return false;
  }

  /** Carry the character under the pointer. */
  dragTo(world: { x: number; y: number }): void {
    const ch = this.dragId ? this.chars.get(this.dragId) : null;
    if (!ch) return;
    const m = this.charWorldWidth() / 2 + 8;
    const nextX = clamp(world.x, m, SIZE - m);
    if (Math.abs(nextX - ch.pos.x) > 1) ch.facing = nextX < ch.pos.x ? -1 : 1;
    ch.pos.x = nextX;
    ch.pos.y = clamp(world.y, m, SIZE - m);
    this.ensureLoop();
  }

  endDrag(): void {
    const ch = this.dragId ? this.chars.get(this.dragId) : null;
    this.dragId = null;
    if (ch) {
      ch.dragging = false;
      ch.narration = this.dragNarration;
      // If the turn ended while the user was carrying him, wrap up now.
      if (ch.pendingEnd) {
        const reason = ch.pendingEnd;
        ch.pendingEnd = null;
        this.dragNarration = null;
        ch.narration = null;
        ch.landing = null;
        this.setState(ch, reason === "done" ? "celebrating" : "sad");
      }
    }
    this.dragNarration = null;
    if (ch) this.ensureLoop();
  }

  onEvent(e: AgentCharacterInput & { agentId?: string }): void {
    const id = e.agentId ?? "main";
    if (e.kind === "turn_start") {
      let ch = this.chars.get(id);
      const target = this.resolveTarget(undefined);
      if (!ch) {
        ch = this.spawn(id, target);
        this.chars.set(id, ch);
        this.ensureLoop();
        return;
      }
      ch.fadingOut = false;
      if (ch.alpha < 1) ch.alpha = Math.max(ch.alpha, 0.3);
      this.retarget(ch, target, "thinking");
      this.ensureLoop();
      return;
    }
    const ch = this.chars.get(id);
    if (!ch) return;
    // While the user is carrying him, his body is theirs — defer autonomous
    // behavior until he is dropped. A turn_end is remembered so the drop
    // still triggers the wrap-up (celebrate/sad → fade out); otherwise a
    // generation finishing mid-drag left the character on the board forever.
    if (ch.dragging) {
      if (e.kind === "turn_end") {
        ch.pendingEnd = e.reason;
        ch.narration = null;
      }
      return;
    }
    switch (e.kind) {
      case "tool_start": {
        this.retarget(ch, this.resolveTarget(e.target), animForTool(e.tool));
        this.ensureLoop();
        break;
      }
      case "tool_end": {
        if (!e.ok) {
          this.stumble(ch);
        } else if (e.target) {
          this.retarget(ch, this.resolveTarget(e.target), animForTool(e.tool));
        }
        this.ensureLoop();
        break;
      }
      case "text_delta":
      case "reasoning_delta": {
        if (ch.state === "walking") ch.queuedState = "thinking";
        else if (ch.state !== "celebrating" && ch.state !== "sad" && ch.state !== "stumble") {
          this.setState(ch, "thinking");
        }
        break;
      }
      case "turn_end": {
        // Turn over: the bubble is no longer meaningful — drop it now.
        ch.narration = null;
        const final: CharState = e.reason === "done" ? "celebrating" : "sad";
        if (ch.state === "walking" && ch.landing) {
          // Finish the walk to the result, then celebrate/droop there.
          ch.queuedState = final;
        } else {
          ch.landing = null;
          this.setState(ch, final);
        }
        break;
      }
    }
  }

  // ── Target resolution ─────────────────────────────────────────

  /**
   * True when a box is so large it covers (nearly) the whole viewport —
   * e.g. canvas_scan / canvas_snapshot with target=viewport. Those regions
   * describe what the agent is LOOKING at, not a place to walk to; treating
   * them as walk targets sends the character to the edge of the screen.
   */
  private isWholeViewport(box: Rect): boolean {
    const v = this.deps.engine.camera.visibleWorldRect();
    if (v.w <= 0 || v.h <= 0) return false;
    return box.x <= v.x + v.w * 0.05 && box.y <= v.y + v.h * 0.05 &&
      box.x + box.w >= v.x + v.w * 0.95 && box.y + box.h >= v.y + v.h * 0.95;
  }

  private resolveTarget(hint?: ToolTargetHint): { box: Rect; source: string } | null {
    const wm = this.deps.widgets();
    const om = this.deps.objects();
    const boxOf = (id: string): Rect | null => {
      const w = wm?.get(id);
      if (w) return { x: w.x, y: w.y, w: w.w, h: w.h };
      const o = om?.get(id);
      if (o) return { x: o.x, y: o.y, w: o.w, h: o.h };
      return null;
    };

    // 1. Live referenced elements — always the most authoritative target.
    const elementBoxes: Rect[] = [];
    if (hint?.objectId) {
      const b = boxOf(hint.objectId);
      if (b) elementBoxes.push(b);
    }
    if (hint?.objectIds?.length) {
      for (const id of hint.objectIds) {
        const b = boxOf(id);
        if (b) elementBoxes.push(b);
      }
    }
    if (elementBoxes.length) {
      const box = unionAll(elementBoxes);
      if (!this.isWholeViewport(box)) return { box, source: "element" };
    }

    // 2. Real-area boxes (tool results / planned widgets). Point-only
    //    requested coords (w=h=0) are kept as a weak last resort below.
    const realBoxes: Rect[] = [];
    if (hint?.region && Number.isFinite(hint.region.x) && Number.isFinite(hint.region.y)) {
      const r = normRect(hint.region);
      if (r.w > 4 && r.h > 4) realBoxes.push(r);
    }
    if (hint?.boxes?.length) {
      for (const b of hint.boxes) {
        if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
          const r = normRect(b);
          if (r.w > 4 && r.h > 4) realBoxes.push(r);
        }
      }
    }
    if (realBoxes.length) {
      // Several boxes → prefer the most specific (smallest area), not the
      // union: a far-flung union pulls the character between contents.
      const best = realBoxes.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
      if (!this.isWholeViewport(best)) return { box: best, source: "boxes" };
    }

    // 3. User's current selection.
    const sel = this.deps.getSelectionBoxes();
    if (sel.length) return { box: unionAll(sel), source: "selection" };

    // 4. Newest user ink.
    const ink = this.deps.getInkBox();
    if (ink && ink.w > 4 && ink.h > 4 && !this.isWholeViewport(ink)) {
      return { box: ink, source: "ink" };
    }

    // 5. Weak: point-only command coords (w=h=0) — where content is ABOUT to land.
    if (hint?.boxes?.length) {
      const points = hint.boxes
        .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && !b.w && !b.h)
        .map(normRect);
      if (points.length) {
        const best = points[0];
        return { box: { x: best.x - 60, y: best.y - 60, w: 120, h: 120 }, source: "point" };
      }
    }

    // 6. Fallback: viewport — but never "walk" to a whole-viewport ring;
    //    stand where you are and just look at it.
    const v = this.deps.engine.camera.visibleWorldRect();
    if (v.w > 0 && v.h > 0) {
      const focus: Rect = {
        x: v.x + v.w * 0.3,
        y: v.y + v.h * 0.55,
        w: v.w * 0.4,
        h: v.h * 0.3,
      };
      return { box: focus, source: "viewport" };
    }
    return null;
  }

  /**
   * Stand-off landing: the character stops beside the content, never on top.
   * Candidates ring the box (below → right → above → left); nearest wins so
   * back-to-back tools produce short, natural hops.
   */
  private landingFor(box: Rect, ch: Character): { x: number; y: number } {
    const scale = this.deps.engine.camera.scale || 1;
    const charW = this.charWorldWidth();
    // Stand close enough to read as "working on it" (~a body's width away),
    // never touching the content itself.
    const pad = charW * 0.55 + clamp(18 / scale, 12, 200);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const candidates = [
      { x: cx, y: box.y + box.h + pad },
      { x: box.x + box.w + pad, y: cy },
      { x: cx, y: box.y - pad },
      { x: box.x - pad, y: cy },
    ];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = (c.x - ch.pos.x) ** 2 + (c.y - ch.pos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const m = charW / 2 + 8;
    return { x: clamp(best.x, m, SIZE - m), y: clamp(best.y, m, SIZE - m) };
  }

  private retarget(
    ch: Character,
    target: { box: Rect; source: string } | null,
    anim: CharState
  ): void {
    ch.queuedState = anim;
    if (!target) {
      if (ch.state === "walking") {
        ch.landing = null;
        this.setState(ch, anim);
      }
      return;
    }

    // Observation targets (scan/snapshot of what's visible): the character
    // is already looking at that area. Never cancel an in-flight walk — the
    // first scan of a turn used to strand him mid-route far from the ink.
    if (target.source === "viewport" || this.isWholeViewport(target.box)) {
      ch.targetBox = target.box;
      if (ch.state === "walking" && ch.landing) {
        ch.queuedState = anim;
      } else {
        ch.landing = null;
        if (ch.state !== "celebrating" && ch.state !== "sad" && ch.state !== "stumble") {
          this.setState(ch, anim);
        }
      }
      return;
    }

    ch.targetBox = target.box;
    const landing = this.landingFor(target.box, ch);
    const scale = this.deps.engine.camera.scale || 1;
    const dist = Math.hypot(landing.x - ch.pos.x, landing.y - ch.pos.y);
    if (dist > Math.max(8 / scale, 12)) {
      ch.landing = landing;
      if (ch.state !== "walking") this.setState(ch, "walking");
    } else {
      ch.landing = null;
      if (ch.state !== "celebrating" && ch.state !== "sad" && ch.state !== "stumble") {
        this.setState(ch, anim);
      }
    }
  }

  private stumble(ch: Character): void {
    ch.resumeState = ch.state === "walking" ? "walking" : ch.queuedState ?? "idle";
    this.setState(ch, "stumble");
  }

  private spawn(id: string, target: { box: Rect; source: string } | null): Character {
    const cam = this.deps.engine.camera;
    const v = cam.visibleWorldRect();
    const scale = cam.scale || 1;
    const inset = clamp(70 / scale, 40, 1600);
    const m = this.charWorldWidth() / 2 + 8;
    const ch: Character = {
      id,
      pos: {
        x: clamp(v.x + inset, m, SIZE - m),
        y: clamp(v.y + v.h - inset, m, SIZE - m),
      },
      landing: null,
      targetBox: target?.box ?? null,
      state: "idle",
      queuedState: "thinking",
      resumeState: null,
      facing: 1,
      walkDir: "h",
      stateSince: performance.now(),
      alpha: 0,
      fadingOut: false,
      narration: null,
      dragging: false,
      pendingEnd: null,
    };
    if (target && target.source !== "viewport" && !this.isWholeViewport(target.box)) {
      ch.landing = this.landingFor(target.box, ch);
      ch.state = "walking";
    } else if (target) {
      ch.targetBox = target.box;
    }
    return ch;
  }

  private setState(ch: Character, s: CharState): void {
    if (ch.state === s) return;
    ch.state = s;
    ch.stateSince = performance.now();
  }

  // ── Simulation + rendering ────────────────────────────────────

  private charWorldWidth(): number {
    const engine = this.deps.engine;
    // Integer multiple of the 24px grid (3×24 / 2×24 screen px) so every
    // sprite pixel maps to exactly N whole screen pixels — crisp at any zoom.
    const target = engine.cssWidth > 0 && engine.cssWidth < 640 ? SPRITE_W * 2 : SPRITE_W * 3;
    return clamp(target / (engine.camera.scale || 1), SPRITE_W, 6000);
  }

  private updateCharacter(ch: Character, dt: number, now: number): void {
    if (ch.fadingOut) {
      ch.alpha = Math.max(0, ch.alpha - dt / 0.45);
      return;
    }
    if (ch.alpha < 1) ch.alpha = Math.min(1, ch.alpha + dt / 0.25);
    if (ch.dragging) return;

    // Stationary characters face the content they are working on — never a
    // stale walk direction (that made the hammer point away from the target).
    if (ch.state !== "walking") this.faceContent(ch);

    const elapsed = now - ch.stateSince;
    if (ch.state === "stumble" && elapsed > 650) {
      const resume = ch.resumeState ?? "idle";
      this.setState(ch, resume);
    } else if (ch.state === "celebrating" && elapsed > 1500) {
      // Task done: wrap up and leave immediately — no idle lingering.
      ch.fadingOut = true;
    } else if (ch.state === "sad" && elapsed > 1700) {
      ch.fadingOut = true;
    }

    if (ch.state === "walking" && ch.landing) {
      const scale = this.deps.engine.camera.scale || 1;
      if (this.reduced) {
        ch.pos = { ...ch.landing };
        ch.landing = null;
        this.setState(ch, ch.queuedState ?? "idle");
        this.faceContent(ch);
        return;
      }
      const speed = clamp(560 / scale, 60, 24000);
      const dx = ch.landing.x - ch.pos.x;
      const dy = ch.landing.y - ch.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = speed * dt;
      if (Math.abs(dx) > 1) ch.facing = dx < 0 ? -1 : 1;
      // Side sprites when walking across the board, front when walking
      // toward/away (top-down whiteboard has no true "back").
      ch.walkDir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      if (dist <= step || dist < 4 / scale) {
        ch.pos = { ...ch.landing };
        ch.landing = null;
        this.setState(ch, ch.queuedState ?? "idle");
        this.faceContent(ch);
      } else {
        ch.pos.x += (dx / dist) * step;
        ch.pos.y += (dy / dist) * step;
      }
    }
  }

  /** Aim the character (and thus his tool side) at the target content. */
  private faceContent(ch: Character): void {
    if (!ch.targetBox) return;
    const cx = ch.targetBox.x + ch.targetBox.w / 2;
    const threshold = this.charWorldWidth() * 0.2;
    if (cx > ch.pos.x + threshold) ch.facing = 1;
    else if (cx < ch.pos.x - threshold) ch.facing = -1;
  }

  private frameFor(ch: Character, now: number): FrameChoice {
    const none = { jump: 0, shake: 0 } as const;
    if (this.reduced) {
      const map: Partial<Record<CharState, SpriteFrameName>> = {
        walking: ch.walkDir === "h" ? "side_walk0" : "front_walk0",
        reading: "side_read0",
        working: "side_work0",
        thinking: "front_think0",
        celebrating: "front_celebrate",
        sad: "front_sad",
        stumble: "front_idle0",
        idle: "front_idle0",
      };
      return { name: map[ch.state] ?? "front_idle0", jump: 0, shake: 0 };
    }
    switch (ch.state) {
      case "walking": {
        const f = Math.floor(now / 130) % 4;
        const side: SpriteFrameName[] = ["side_walk0", "side_walk1", "side_walk2", "side_walk3"];
        const front: SpriteFrameName = f % 2 ? "front_walk1" : "front_walk0";
        return { name: ch.walkDir === "h" ? side[f] : front, ...none };
      }
      case "idle": {
        const cycle = ((now - ch.stateSince) % 3200) / 3200;
        return { name: cycle < 0.91 ? "front_idle0" : "front_idle1", ...none };
      }
      case "reading":
        return { name: Math.floor(now / 380) % 2 ? "side_read1" : "side_read0", ...none };
      case "working":
        return { name: Math.floor(now / 150) % 2 ? "side_work1" : "side_work0", ...none };
      case "thinking":
        return { name: Math.floor(now / 600) % 2 ? "front_think1" : "front_think0", ...none };
      case "celebrating": {
        const up = Math.floor(now / 160) % 2 === 1;
        return { name: "front_celebrate", jump: up ? 0.18 : 0, shake: 0 };
      }
      case "stumble":
        return { name: "front_idle0", jump: 0, shake: 1 };
      case "sad":
        return { name: "front_sad", ...none };
    }
  }

  /**
   * Tiny pixel activity glyph above the head — ✓ done, ✦ working, ! sad.
   * Drawn as crisp pixel squares so it reads as pixel-art, not emoji.
   */
  private drawGlyph(
    ctx: CanvasRenderingContext2D,
    ch: Character,
    kind: "done" | "working" | "error",
    now: number
  ): void {
    const w = this.charWorldWidth();
    const px = clamp(4 / (this.deps.engine.camera.scale || 1), 2, 60);
    const cx = ch.pos.x;
    const cy = ch.pos.y - w * (SPRITE_H / SPRITE_W) - px * 2;
    ctx.save();
    ctx.globalAlpha = ch.alpha;
    ctx.fillStyle = kind === "done" ? "#22c55e" : kind === "working" ? "#f59e0b" : "#ef4444";
    if (kind === "done") {
      // 5×5 pixel check mark
      ctx.fillRect(cx - px * 1.5, cy - px * 0.5, px, px);
      ctx.fillRect(cx - px * 0.5, cy + px * 0.5, px, px);
      ctx.fillRect(cx + px * 0.5, cy - px * 1.5, px, px);
      ctx.fillRect(cx + px * 1.5, cy - px * 2.5, px, px);
    } else if (kind === "working") {
      // two 4-point pixel sparkles pulsing out from center
      const phase = Math.floor(now / 150) % 2;
      ctx.fillRect(cx - px, cy - phase * px, px, px);
      ctx.fillRect(cx + phase * px, cy, px, px);
      ctx.fillRect(cx, cy + phase * px, px, px);
      ctx.fillRect(cx - px, cy + px, px, px);
    } else {
      // 1×5 exclamation bar + dot
      ctx.fillRect(cx - px * 0.5, cy - px * 2, px, px * 2.5);
      ctx.fillRect(cx - px * 0.5, cy + px, px, px);
    }
    ctx.restore();
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Thought-bubble geometry + wrapped text. Returns null whenever the bubble
   * must not show: no narration, mid-walk, or terminal poses.
   * When `measureCtx` is null only the rect is needed (dirty-box path).
   */
  private bubbleFor(
    ch: Character,
    measureCtx: CanvasRenderingContext2D | null
  ): { rect: Rect; lines: string[]; fs: number; pad: number; lineH: number } | null {
    if (
      !ch.narration ||
      ch.dragging ||
      ch.state === "walking" ||
      ch.state === "celebrating" ||
      ch.state === "sad"
    ) {
      return null;
    }
    const scale = this.deps.engine.camera.scale || 1;
    const fs = clamp(11 / scale, 4, 400);
    const lineH = fs * 1.3;
    const pad = fs * 0.6;
    const maxW = clamp(185 / scale, fs * 8, 8000);
    const font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const lines: string[] = [];
    if (measureCtx) {
      measureCtx.font = font;
      let rest = ch.narration.replace(/\s+/g, " ").trim();
      while (rest && lines.length < 2) {
        let take = rest;
        while (take.length > 1 && measureCtx.measureText(take).width > maxW) {
          take = take.slice(0, -1);
        }
        if (take.length > 1) {
          const sp = take.lastIndexOf(" ");
          if (sp > 0) take = take.slice(0, sp);
        }
        lines.push(take);
        rest = rest.slice(take.length).trim();
      }
      if (rest) {
        const last = lines[lines.length - 1] || "";
        let candidate = `${last.slice(0, Math.max(0, last.length - 1))}…`;
        while (candidate.length > 1 && measureCtx.measureText(candidate).width > maxW) {
          candidate = `${candidate.slice(0, Math.max(0, candidate.length - 2))}…`;
        }
        lines[lines.length - 1] = candidate;
      }
    } else {
      lines.push("", "");
    }
    const w = Math.max(fs * 3, maxW) + pad * 2;
    const charW = this.charWorldWidth();
    const charH = charW * (SPRITE_H / SPRITE_W);
    const gap = fs * 1.9;
    const h = pad * 2 + lines.length * lineH;
    const left =
      ch.facing === 1
        ? ch.pos.x + charW * 0.35
        : ch.pos.x - charW * 0.35 - w;
    const top = ch.pos.y - charH - gap - h;
    return { rect: { x: left, y: top, w, h }, lines, fs, pad, lineH };
  }

  private drawBubble(ctx: CanvasRenderingContext2D, ch: Character): void {
    const b = this.bubbleFor(ch, ctx);
    if (!b) return;
    const scale = this.deps.engine.camera.scale || 1;
    const charW = this.charWorldWidth();
    const charH = charW * (SPRITE_H / SPRITE_W);

    ctx.save();
    ctx.globalAlpha = ch.alpha;
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.strokeStyle = "rgba(38,48,56,0.85)";
    ctx.lineWidth = Math.max(1 / scale, b.fs * 0.1);

    // Thought tail: two shrinking circles from the head to the bubble.
    const tailX = ch.facing === 1 ? b.rect.x + b.fs * 0.6 : b.rect.x + b.rect.w - b.fs * 0.6;
    const r1 = b.fs * 0.42;
    const r2 = b.fs * 0.24;
    const c2y = b.rect.y + b.rect.h + b.fs * 0.35;
    const c1y = (ch.pos.y - charH + c2y) / 2;
    ctx.beginPath();
    ctx.arc(tailX, c2y, r2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tailX - ch.facing * b.fs * 0.25, c1y, r1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.roundRectPath(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, b.fs * 0.45);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 ${b.fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = "#263038";
    ctx.textBaseline = "top";
    let ty = b.rect.y + b.pad;
    for (const line of b.lines) {
      ctx.fillText(line, b.rect.x + b.pad, ty);
      ty += b.lineH;
    }
    ctx.restore();
  }

  private drawCharacter(ctx: CanvasRenderingContext2D, ch: Character, now: number): void {
    const w = this.charWorldWidth();
    const h = w * (SPRITE_H / SPRITE_W);
    const { name, jump, shake } = this.frameFor(ch, now);
    const lift = ch.dragging ? h * 0.14 : 0;
    const dy = -h * jump - lift;
    const dx = shake ? Math.sin(now / 25) * w * 0.06 : 0;

    // Snap to whole screen pixels so nearest-neighbor scaling stays crisp.
    const cam = this.deps.engine.camera;
    const rawSx = ch.pos.x * cam.scale + cam.panX;
    const rawSy = (ch.pos.y + lift) * cam.scale + cam.panY;
    const snapX = (Math.round(rawSx) - rawSx) / (cam.scale || 1);
    const snapY = (Math.round(rawSy) - rawSy) / (cam.scale || 1);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = ch.alpha;

    // Grounding shadow (stays on the floor; shrinks while carried).
    ctx.fillStyle = "rgba(15, 23, 42, 0.16)";
    ctx.beginPath();
    ctx.ellipse(
      ch.pos.x,
      ch.pos.y,
      w * (ch.dragging ? 0.22 : 0.3),
      w * (ch.dragging ? 0.06 : 0.09),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.translate(ch.pos.x + snapX + dx, ch.pos.y + snapY + dy);
    if (ch.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(getSpriteFrame(name), -w / 2, -h, w, h);
    ctx.restore();

    // Pixel activity indicator above the head.
    if (ch.state === "celebrating") this.drawGlyph(ctx, ch, "done", now);
    else if (ch.state === "working") this.drawGlyph(ctx, ch, "working", now);
    else if (ch.state === "sad" || ch.state === "stumble") this.drawGlyph(ctx, ch, "error", now);

    // Thought bubble (skipped automatically while walking).
    this.drawBubble(ctx, ch);

    // Pencil sparks at the nearest edge of the content being drawn on.
    if (ch.state === "working" && ch.targetBox) {
      const b = ch.targetBox;
      const px = clamp(ch.pos.x, b.x, b.x + b.w);
      const py = clamp(ch.pos.y, b.y, b.y + b.h);
      const scale = this.deps.engine.camera.scale || 1;
      const s = clamp(4 / scale, 2, 60);
      ctx.save();
      ctx.globalAlpha = ch.alpha;
      ctx.fillStyle = "#22c55e";
      const phase = Math.floor(now / 150) % 3;
      const offs = [
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      for (let i = 0; i < 3; i++) {
        if ((phase + i) % 3 === 2) continue;
        const o = offs[i];
        ctx.fillRect(px + o[0] * s * 1.6 - s / 2, py + o[1] * s * 1.6 - s / 2, s, s);
      }
      ctx.restore();
    }
  }
}
