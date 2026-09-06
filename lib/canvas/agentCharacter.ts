
import type { CanvasEngine } from "./engine";
import type { WidgetManager } from "./widgets";
import type { ObjectManager } from "./objects";
import type { Rect } from "./types";
import { SIZE } from "./constants";
import { getSpriteFrame, SPRITE_H, SPRITE_W, type SpriteFrameName } from "./pixelSprites";

export interface ToolTargetHint {
  objectId?: string;
  objectIds?: string[];
  region?: { x: number; y: number; w: number; h: number };
  boxes?: { x: number; y: number; w: number; h: number }[];
}

export type AgentCharacterInput =
  | { kind: "turn_start" }
  | { kind: "tool_start"; tool: string; target?: ToolTargetHint }
  | { kind: "tool_end"; tool: string; ok: boolean; summary?: string; target?: ToolTargetHint }
  | { kind: "text_delta"; text?: string }
  | { kind: "reasoning_delta"; text?: string }
  | { kind: "turn_end"; reason: "done" | "cancelled" | "error"; message?: string };

export interface AgentCharacterDeps {
  engine: CanvasEngine;
  widgets: () => WidgetManager | null;
  objects: () => ObjectManager | null;
  getInkBox: () => Rect | null;
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

export interface CharacterSpeech {
  text: string;
  since: number;
  duration: number;
}

interface Character {
  id: string;
  pos: { x: number; y: number };
  landing: { x: number; y: number } | null;
  targetBox: Rect | null;
  lastWorkBox: Rect | null;
  state: CharState;
  queuedState: CharState | null;
  resumeState: CharState | null;
  facing: 1 | -1;
  walkDir: "h" | "v";
  stateSince: number;
  alpha: number;
  fadingOut: boolean;
  narration: string | null;
  thinkingBuffer: string;
  speech: CharacterSpeech | null;
  dragging: boolean;
  pendingEnd: "done" | "cancelled" | "error" | null;
  turnActive: boolean;
  completedCount: number;
  idleSince: number;
}

const READ_TOOLS = new Set(["canvas_scan", "canvas_snapshot", "canvas_read", "canvas_focus"]);
const WORK_TOOLS = new Set([
  "canvas_apply",
  "canvas_edit",
  "canvas_patch_widget",
  "canvas_undo",
  "load_plugin",
  "visual_explainer",
  "load_visual_skill",
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
  jump: number;
  shake: number;
}

export function cleanSpeechText(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();
  // Strip markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Strip bold/italic formatting
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  // Strip inline code backticks
  text = text.replace(/`([^`]+)`/g, "$1");
  // Strip markdown headers
  text = text.replace(/^#+\s+/gm, "");
  // Strip list bullet markers
  text = text.replace(/^[\s]*[•\-\*]\s+/gm, "");
  // Normalize newlines and whitespace
  text = text.replace(/\n\s*\n+/g, " ");
  text = text.replace(/\r?\n/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  // If the model produced something too long, cap gracefully
  if (text.length > 220) {
    text = text.slice(0, 217).trim() + "…";
  }
  return text;
}

export function formatThinkingStream(raw: string): string {
  if (!raw) return "Thinking…";
  let cleaned = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Thinking…";
  // Keep the most recent window so the thought bubble displays the active thinking stream
  const maxLen = 58;
  if (cleaned.length > maxLen) {
    const start = cleaned.length - maxLen;
    const spaceIdx = cleaned.indexOf(" ", start);
    if (spaceIdx !== -1 && spaceIdx < start + 12) {
      cleaned = `…${cleaned.slice(spaceIdx + 1).trim()}`;
    } else {
      cleaned = `…${cleaned.slice(start).trim()}`;
    }
  }
  return cleaned;
}

interface SpeechBubbleLayout {
  rect: Rect;
  lines: string[];
  fs: number;
  padH: number;
  padV: number;
  lineH: number;
  beakBaseX: number;
  beakWidth: number;
  beakTipX: number;
  beakTipY: number;
}

export class AgentCharacterController {
  private chars = new Map<string, Character>();
  private lastT = typeof performance !== "undefined" ? performance.now() : 0;
  private reduced = false;
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

  get size(): number {
    return this.chars.size;
  }

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

  speak(text: string, durationMs?: number, id = "main"): void {
    const ch = this.chars.get(id);
    if (!ch) return;
    this.speakToCharacter(ch, text, durationMs);
    this.ensureLoop();
  }

  private speakToCharacter(ch: Character, raw: string, durationMs?: number): void {
    const clean = cleanSpeechText(raw);
    if (!clean) {
      ch.speech = null;
      return;
    }
    const duration = durationMs ?? clamp(clean.length * 75, 7000, 18000);
    ch.speech = {
      text: clean,
      since: performance.now(),
      duration,
    };
    ch.narration = null;
  }

  setNarration(text: string | null): void {
    if (!text || !text.trim()) {
      for (const ch of this.chars.values()) {
        if (!ch.turnActive && (ch.state === "celebrating" || ch.speech)) continue;
        ch.narration = null;
      }
      this.ensureLoop();
      return;
    }

    const clean = text.trim();
    let changed = false;
    for (const ch of this.chars.values()) {
      if (!ch.turnActive && ch.speech) continue;
      // Do not overwrite live streaming thinking buffer while reasoning deltas are actively streaming
      if (ch.thinkingBuffer && ch.turnActive && ch.state === "thinking") {
        continue;
      }
      let speech = clean;
      if (ch.turnActive) {
        // Prevent premature / deceptive "Done:" messages while agent turn is still running
        if (/^Done[:\s·-]/i.test(speech)) {
          const detail = speech.replace(/^Done[:\s·-]*/i, "").trim();
          speech = this.formatIntermediateStep(detail);
        } else if (/^All done/i.test(speech)) {
          speech = "Working on it…";
        }
      }
      speech = speech.slice(0, 160);
      if (ch.narration !== speech) {
        ch.narration = speech;
        changed = true;
      }
    }
    if (changed) this.ensureLoop();
  }

  private formatIntermediateStep(raw: string): string {
    const text = raw.trim();
    if (!text) return "Step complete ✓";
    if (/^applied\s*(\d+)?/i.test(text)) {
      return "Placed on canvas ✓";
    }
    if (/^snapshot/i.test(text)) {
      return "Inspecting layout…";
    }
    if (/^ok$/i.test(text)) {
      return "Updated ✓";
    }
    if (/^\d+\s*items/i.test(text)) {
      return "Surveyed canvas ✓";
    }
    if (/REVISION_CONFLICT/i.test(text)) {
      return "Syncing canvas revision…";
    }
    if (/LAYOUT_REVIEW_REQUIRED/i.test(text)) {
      return "Reviewing layout…";
    }
    const stripped = text.replace(/^Done[:\s·-]*/i, "").trim();
    if (!stripped) return "Step complete ✓";
    return stripped.length > 35 ? `${stripped.slice(0, 32)}…` : stripped;
  }

  private dragId: string | null = null;
  private dragNarration: string | null = null;
  private dragSpeech: CharacterSpeech | null = null;
  private dragStartPos: { x: number; y: number } | null = null;
  private dragStartTime = 0;

  private hitTestSpeechBubble(ch: Character, world: { x: number; y: number }): boolean {
    const b = this.speechBubbleFor(ch, null);
    if (!b) return false;
    return (
      world.x >= b.rect.x &&
      world.x <= b.rect.x + b.rect.w &&
      world.y >= b.rect.y &&
      world.y <= b.rect.y + b.rect.h
    );
  }

  hitTest(world: { x: number; y: number }): boolean {
    for (const ch of this.chars.values()) {
      if (ch.alpha <= 0.1) continue;
      if (ch.speech && this.hitTestSpeechBubble(ch, world)) {
        return true;
      }
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

  beginDrag(world: { x: number; y: number }): boolean {
    for (const [id, ch] of this.chars.entries()) {
      if (ch.alpha <= 0.1) continue;
      if (ch.speech && this.hitTestSpeechBubble(ch, world)) {
        ch.speech = null;
        this.ensureLoop();
        return true;
      }
      const w = this.charWorldWidth();
      const h = w * (SPRITE_H / SPRITE_W);
      if (
        world.x >= ch.pos.x - w * 0.7 &&
        world.x <= ch.pos.x + w * 0.7 &&
        world.y >= ch.pos.y - h &&
        world.y <= ch.pos.y
      ) {
        this.dragId = id;
        this.dragStartPos = { x: world.x, y: world.y };
        this.dragStartTime = performance.now();
        ch.dragging = true;
        this.dragNarration = ch.narration;
        this.dragSpeech = ch.speech;
        ch.narration = null;
        ch.speech = null;
        this.setState(ch, "idle");
        this.ensureLoop();
        return true;
      }
    }
    return false;
  }

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
      ch.speech = this.dragSpeech;
      if (this.dragStartPos) {
        const dist = Math.hypot(ch.pos.x - this.dragStartPos.x, ch.pos.y - this.dragStartPos.y);
        const dur = performance.now() - this.dragStartTime;
        if (dist < 8 && dur < 350 && !ch.turnActive) {
          this.poke(ch);
          this.dragStartPos = null;
          this.dragNarration = null;
          this.dragSpeech = null;
          this.ensureLoop();
          return;
        }
      }
      if (ch.pendingEnd) {
        const reason = ch.pendingEnd;
        ch.pendingEnd = null;
        this.dragNarration = null;
        this.dragSpeech = null;
        const msg = reason === "done" ? "All done! Take a look ✨" : "Hit a snag — try again!";
        this.speakToCharacter(ch, msg);
        ch.landing = null;
        this.setState(ch, reason === "done" ? "celebrating" : "sad");
      }
    }
    this.dragStartPos = null;
    this.dragNarration = null;
    this.dragSpeech = null;
    if (ch) this.ensureLoop();
  }

  private poke(ch: Character): void {
    if (ch.turnActive) return;
    this.setState(ch, "celebrating");
    this.speakToCharacter(ch, "Hi! 👋 Ready to draw!", 2500);
    ch.stateSince = performance.now();
    setTimeout(() => {
      if (ch.state === "celebrating" && !ch.turnActive) {
        ch.fadingOut = true;
        ch.speech = null;
        ch.narration = null;
      }
    }, 2200);
  }

  onEvent(e: AgentCharacterInput & { agentId?: string }): void {
    const id = e.agentId ?? "main";
    if (e.kind === "turn_start") {
      let ch = this.chars.get(id);
      const target = this.resolveTarget(undefined);
      if (!ch) {
        ch = this.spawn(id, target);
        this.chars.set(id, ch);
        ch.turnActive = true;
        ch.thinkingBuffer = "";
        ch.speech = null;
        ch.narration = "Taking a look at your board…";
        this.ensureLoop();
        return;
      }
      ch.fadingOut = false;
      ch.alpha = Math.max(ch.alpha, 0.85);
      ch.turnActive = true;
      ch.thinkingBuffer = "";
      ch.speech = null;
      ch.completedCount = 0;
      ch.idleSince = 0;
      ch.narration = "Taking a look at your board…";
      this.retarget(ch, target, "thinking");
      this.ensureLoop();
      return;
    }
    const ch = this.chars.get(id);
    if (!ch) return;
    if (ch.dragging) {
      if (e.kind === "turn_end") {
        ch.turnActive = false;
        ch.thinkingBuffer = "";
        ch.pendingEnd = e.reason;
        ch.narration = null;
        ch.speech = null;
      }
      return;
    }
    switch (e.kind) {
      case "tool_start": {
        ch.turnActive = true;
        ch.thinkingBuffer = "";
        ch.speech = null;
        const anim = animForTool(e.tool);
        const resolved = this.resolveTarget(e.target);
        if (resolved) ch.lastWorkBox = resolved.box;
        this.retarget(ch, resolved, anim);
        if (e.tool === "canvas_apply" || e.tool === "visual_explainer") {
          ch.narration = "Drawing onto the board…";
        } else if (e.tool === "canvas_snapshot") {
          ch.narration = "Inspecting board layout…";
        } else if (e.tool === "canvas_edit" || e.tool === "canvas_patch_widget") {
          ch.narration = "Adjusting elements…";
        } else if (e.tool === "canvas_scan") {
          ch.narration = "Surveying the canvas…";
        } else if (e.tool === "canvas_read") {
          ch.narration = "Reading closely…";
        }
        this.ensureLoop();
        break;
      }
      case "tool_end": {
        ch.completedCount = (ch.completedCount || 0) + 1;
        if (!e.ok) {
          this.stumble(ch);
          ch.narration = e.tool === "canvas_edit" ? "Syncing canvas updates…" : "Hit a slight snag…";
        } else {
          // Tool finished! Turn is still running, so provide informative step progress
          if (e.summary) {
            ch.narration = this.formatIntermediateStep(e.summary);
          } else if (e.tool === "canvas_apply" || e.tool === "visual_explainer") {
            ch.narration = "Placed on canvas ✓";
          } else if (e.tool === "canvas_snapshot") {
            ch.narration = "Layout looking good…";
          } else if (e.tool === "canvas_edit") {
            ch.narration = "Updated layout ✓";
          } else if (e.tool === "canvas_scan") {
            ch.narration = "Surveyed canvas ✓";
          }

          if (e.target) {
            const resolved = this.resolveTarget(e.target);
            if (resolved) {
              ch.lastWorkBox = resolved.box;
              // Transition from hammering to admiring/inspecting the result
              this.retarget(ch, resolved, e.tool === "canvas_snapshot" ? "reading" : "thinking");
            }
          } else if (ch.state === "working") {
            // Finished current work command; transition to thoughtful waiting pose
            this.setState(ch, "thinking");
          }
        }
        this.ensureLoop();
        break;
      }
      case "reasoning_delta": {
        ch.turnActive = true;
        if (ch.state === "walking") {
          ch.queuedState = "thinking";
        } else if (ch.state !== "celebrating" && ch.state !== "sad" && ch.state !== "stumble") {
          this.setState(ch, "thinking");
        }
        if (e.text) {
          ch.thinkingBuffer = (ch.thinkingBuffer + e.text).slice(-400);
          ch.narration = formatThinkingStream(ch.thinkingBuffer);
          this.ensureLoop();
        }
        break;
      }
      case "text_delta": {
        ch.turnActive = true;
        if (ch.state === "walking") {
          ch.queuedState = "thinking";
        } else if (ch.state !== "celebrating" && ch.state !== "sad" && ch.state !== "stumble") {
          this.setState(ch, "thinking");
        }
        if (!ch.narration?.startsWith("Writing") && !ch.speech) {
          ch.narration = "Writing the answer…";
        }
        break;
      }
      case "turn_end": {
        ch.turnActive = false;
        ch.thinkingBuffer = "";
        ch.narration = null;
        if (e.reason === "done") {
          const msg = e.message?.trim() || "All done! Take a look ✨";
          this.speakToCharacter(ch, msg);
          if (ch.state === "walking" && ch.landing) {
            ch.queuedState = "celebrating";
          } else {
            ch.landing = null;
            this.setState(ch, "celebrating");
          }
        } else if (e.reason === "error") {
          const msg = e.message?.trim() || "Hit a snag — let's try again!";
          this.speakToCharacter(ch, msg);
          ch.landing = null;
          this.setState(ch, "sad");
        } else {
          this.speakToCharacter(ch, "Paused.");
          ch.landing = null;
          this.setState(ch, "idle");
        }
        this.ensureLoop();
        break;
      }
    }
  }

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
      const best = realBoxes.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
      if (!this.isWholeViewport(best)) return { box: best, source: "boxes" };
    }

    const sel = this.deps.getSelectionBoxes();
    if (sel.length) return { box: unionAll(sel), source: "selection" };

    const ink = this.deps.getInkBox();
    if (ink && ink.w > 4 && ink.h > 4 && !this.isWholeViewport(ink)) {
      return { box: ink, source: "ink" };
    }

    if (hint?.boxes?.length) {
      const points = hint.boxes
        .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && !b.w && !b.h)
        .map(normRect);
      if (points.length) {
        const best = points[0];
        return { box: { x: best.x - 60, y: best.y - 60, w: 120, h: 120 }, source: "point" };
      }
    }

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

  private landingFor(box: Rect, ch: Character): { x: number; y: number } {
    const scale = this.deps.engine.camera.scale || 1;
    const charW = this.charWorldWidth();
    const pad = charW * 0.6 + clamp(20 / scale, 12, 200);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const candidates = [
      { x: box.x + box.w + pad, y: cy },
      { x: cx, y: box.y + box.h + pad },
      { x: box.x - pad, y: cy },
      { x: cx, y: box.y - pad },
    ];

    const wm = this.deps.widgets();
    const om = this.deps.objects();
    const ink = this.deps.getInkBox();

    const overlapsBox = (pt: { x: number; y: number }, b: Rect, margin = 20): boolean => {
      return (
        pt.x >= b.x - margin &&
        pt.x <= b.x + b.w + margin &&
        pt.y >= b.y - margin &&
        pt.y <= b.y + b.h + margin
      );
    };

    const collidesOther = (pt: { x: number; y: number }): boolean => {
      if (wm) {
        for (const w of wm.all()) {
          if (w.x === box.x && w.y === box.y) continue;
          if (overlapsBox(pt, { x: w.x, y: w.y, w: w.w, h: w.h })) return true;
        }
      }
      if (om) {
        for (const o of om.all()) {
          if (o.x === box.x && o.y === box.y) continue;
          if (overlapsBox(pt, { x: o.x, y: o.y, w: o.w, h: o.h })) return true;
        }
      }
      if (ink && overlapsBox(pt, ink)) {
        return true;
      }
      return false;
    };

    let best = candidates[0];
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = (c.x - ch.pos.x) ** 2 + (c.y - ch.pos.y) ** 2;
      const penalty = collidesOther(c) ? 10000000 : 0;
      const score = d + penalty;
      if (score < bestScore) {
        bestScore = score;
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
      lastWorkBox: null,
      state: "idle",
      queuedState: "thinking",
      resumeState: null,
      facing: 1,
      walkDir: "h",
      stateSince: performance.now(),
      alpha: 0,
      fadingOut: false,
      narration: null,
      thinkingBuffer: "",
      speech: null,
      dragging: false,
      pendingEnd: null,
      turnActive: true,
      completedCount: 0,
      idleSince: 0,
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

  private charWorldWidth(): number {
    const engine = this.deps.engine;
    const target = engine.cssWidth > 0 && engine.cssWidth < 640 ? SPRITE_W * 2 : SPRITE_W * 3;
    return clamp(target / (engine.camera.scale || 1), SPRITE_W, 6000);
  }

  private updateCharacter(ch: Character, dt: number, now: number): void {
    if (ch.fadingOut) {
      ch.alpha = Math.max(0, ch.alpha - dt / 0.3);
      return;
    }
    if (ch.alpha < 1) ch.alpha = Math.min(1, ch.alpha + dt / 0.25);
    if (ch.dragging) return;

    if (ch.state !== "walking") this.faceContent(ch);

    const elapsed = now - ch.stateSince;
    if (ch.speech && now - ch.speech.since > ch.speech.duration) {
      ch.speech = null;
    }
    if (ch.state === "stumble" && elapsed > 650) {
      const resume = ch.resumeState ?? (ch.turnActive ? "thinking" : "idle");
      this.setState(ch, resume);
    } else if (ch.state === "celebrating" && elapsed > 2500) {
      // Jump yay celebration animation completed: instantly wipe out!
      ch.fadingOut = true;
      ch.speech = null;
      ch.narration = null;
    } else if (ch.state === "sad" && elapsed > 2500) {
      ch.fadingOut = true;
      ch.speech = null;
      ch.narration = null;
    } else if (ch.state === "idle" && !ch.turnActive && !ch.speech && ch.idleSince > 0 && (now - ch.idleSince > 600)) {
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
      ctx.fillRect(cx - px * 1.5, cy - px * 0.5, px, px);
      ctx.fillRect(cx - px * 0.5, cy + px * 0.5, px, px);
      ctx.fillRect(cx + px * 0.5, cy - px * 1.5, px, px);
      ctx.fillRect(cx + px * 1.5, cy - px * 2.5, px, px);
    } else if (kind === "working") {
      const phase = Math.floor(now / 150) % 2;
      ctx.fillRect(cx - px, cy - phase * px, px, px);
      ctx.fillRect(cx + phase * px, cy, px, px);
      ctx.fillRect(cx, cy + phase * px, px, px);
      ctx.fillRect(cx - px, cy + px, px, px);
    } else {
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

  private speechBubbleFor(
    ch: Character,
    measureCtx: CanvasRenderingContext2D | null
  ): SpeechBubbleLayout | null {
    if (!ch.speech || ch.dragging || ch.state === "walking") {
      return null;
    }
    const scale = this.deps.engine.camera.scale || 1;
    const fs = clamp(13 / scale, 6, 450);
    const lineH = fs * 1.35;
    const padH = fs * 0.95;
    const padV = fs * 0.75;
    const maxW = clamp(260 / scale, fs * 12, 10000);
    const font = `600 ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    const lines: string[] = [];

    if (measureCtx) {
      measureCtx.font = font;
      const words = ch.speech.text.split(" ");
      let currentLine = "";
      for (const word of words) {
        if (!word) continue;
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (measureCtx.measureText(testLine).width <= maxW) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
          if (lines.length >= 4) break;
        }
      }
      if (currentLine && lines.length < 4) {
        lines.push(currentLine);
      }
      if (lines.length === 4) {
        let last = lines[3];
        while (last.length > 1 && measureCtx.measureText(`${last}…`).width > maxW) {
          last = last.slice(0, -1).trim();
        }
        lines[3] = `${last}…`;
      }
    } else {
      lines.push(ch.speech.text);
    }

    if (lines.length === 0) return null;

    let maxLineWidth = fs * 6;
    if (measureCtx) {
      for (const line of lines) {
        const lw = measureCtx.measureText(line).width;
        if (lw > maxLineWidth) maxLineWidth = lw;
      }
    }

    const w = maxLineWidth + padH * 2;
    const h = padV * 2 + lines.length * lineH;
    const charW = this.charWorldWidth();
    const charH = charW * (SPRITE_H / SPRITE_W);
    const gap = fs * 1.8;

    let left =
      ch.facing === 1
        ? ch.pos.x + charW * 0.15
        : ch.pos.x - charW * 0.15 - w;
    let top = ch.pos.y - charH - gap - h;

    left = clamp(left, 10, SIZE - w - 10);
    top = clamp(top, 10, SIZE - h - 10);

    const r = fs * 0.55;
    const beakWidth = fs * 0.9;
    const beakTipX = ch.pos.x + (ch.facing === 1 ? charW * 0.12 : -charW * 0.12);
    const beakTipY = ch.pos.y - charH * 0.85;
    const beakBaseX = clamp(beakTipX, left + r + beakWidth, left + w - r - beakWidth);

    return {
      rect: { x: left, y: top, w, h },
      lines,
      fs,
      padH,
      padV,
      lineH,
      beakBaseX,
      beakWidth,
      beakTipX,
      beakTipY,
    };
  }

  private speechBubblePath(
    ctx: CanvasRenderingContext2D,
    b: SpeechBubbleLayout,
    r: number
  ): void {
    const { x, y, w, h } = b.rect;
    const bw = b.beakWidth;
    const bx = b.beakBaseX;
    const tx = b.beakTipX;
    const ty = b.beakTipY;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);

    // Bottom edge with beak pointer pointing to character
    ctx.lineTo(bx + bw / 2, y + h);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx - bw / 2, y + h);

    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawSpeechBubble(ctx: CanvasRenderingContext2D, ch: Character): void {
    const b = this.speechBubbleFor(ch, ctx);
    if (!b) return;
    const scale = this.deps.engine.camera.scale || 1;

    ctx.save();
    ctx.globalAlpha = ch.alpha;

    // Drop shadow
    ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
    ctx.shadowBlur = b.fs * 0.45;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = b.fs * 0.18;

    ctx.fillStyle = "#ffffff";
    this.speechBubblePath(ctx, b, b.fs * 0.55);
    ctx.fill();

    // Solid crisp speech border
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = Math.max(1.2 / scale, b.fs * 0.09);
    ctx.stroke();

    // Typography
    ctx.font = `600 ${b.fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";
    let ty = b.rect.y + b.padV;
    for (const line of b.lines) {
      ctx.fillText(line, b.rect.x + b.padH, ty);
      ty += b.lineH;
    }

    ctx.restore();
  }

  private bubbleFor(
    ch: Character,
    measureCtx: CanvasRenderingContext2D | null
  ): { rect: Rect; lines: string[]; fs: number; pad: number; lineH: number } | null {
    if (
      !ch.narration ||
      ch.dragging ||
      ch.state === "walking"
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
    const hasGlyph = ch.state === "celebrating" || ch.state === "working" || ch.state === "sad" || ch.state === "stumble";
    const px = clamp(4 / scale, 2, 60);
    const gap = fs * 1.9 + (hasGlyph ? px * 4.5 : 0);
    const h = pad * 2 + lines.length * lineH;
    const left =
      ch.facing === 1
        ? ch.pos.x + charW * 0.35
        : ch.pos.x - charW * 0.35 - w;
    const top = ch.pos.y - charH - gap - h;
    return { rect: { x: left, y: top, w, h }, lines, fs, pad, lineH };
  }

  private drawThoughtBubble(ctx: CanvasRenderingContext2D, ch: Character): void {
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

    const cam = this.deps.engine.camera;
    const rawSx = ch.pos.x * cam.scale + cam.panX;
    const rawSy = (ch.pos.y + lift) * cam.scale + cam.panY;
    const snapX = (Math.round(rawSx) - rawSx) / (cam.scale || 1);
    const snapY = (Math.round(rawSy) - rawSy) / (cam.scale || 1);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = ch.alpha;

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

    if (ch.state === "celebrating") this.drawGlyph(ctx, ch, "done", now);
    else if (ch.state === "working") this.drawGlyph(ctx, ch, "working", now);
    else if (ch.state === "sad" || ch.state === "stumble") this.drawGlyph(ctx, ch, "error", now);

    if (ch.speech && now - ch.speech.since <= ch.speech.duration) {
      this.drawSpeechBubble(ctx, ch);
    } else {
      this.drawThoughtBubble(ctx, ch);
    }

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
