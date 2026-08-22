export const MAX_ANIMATION_OBJECTS = 32;
export const MAX_ANIMATION_MOTIONS = 32;
export const MAX_ANIMATION_PATH_POINTS = 128;
export const MAX_ANIMATION_TEXT_LENGTH = 240;

export const ANIMATION_OBJECT_TYPES = new Set([
  "group",
  "circle",
  "ellipse",
  "rect",
  "line",
  "path",
  "text",
]);

export const ANIMATION_MOTION_TYPES = new Set([
  "orbit",
  "spin",
  "translate",
  "pulse",
  "fade",
  "keyframes",
]);

export const ANIMATION_PALETTE = [
  "#f59e0b",
  "#2563eb",
  "#ef4444",
  "#10b981",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
];

const COLOR_NAMES = new Set([
  "black",
  "white",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
  "grey",
  "transparent",
]);

export interface AnimationStyle {
  fill?: string | null;
  stroke?: string | null;
  lineWidth?: number;
  opacity?: number;
}

export interface BaseAnimationObject extends AnimationStyle {
  id: string;
  type: string;
}

export interface GroupAnimationObject extends BaseAnimationObject {
  type: "group";
  x: number;
  y: number;
  rotation: number;
  scale: number;
  children: string[];
}

export interface CircleAnimationObject extends BaseAnimationObject {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface EllipseAnimationObject extends BaseAnimationObject {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RectAnimationObject extends BaseAnimationObject {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export interface LineAnimationObject extends BaseAnimationObject {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathAnimationObject extends BaseAnimationObject {
  type: "path";
  points: [number, number][];
  closed?: boolean;
  smooth?: boolean;
}

export interface TextAnimationObject extends BaseAnimationObject {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  align: CanvasTextAlign;
}

export type AnimationObject =
  | GroupAnimationObject
  | CircleAnimationObject
  | EllipseAnimationObject
  | RectAnimationObject
  | LineAnimationObject
  | PathAnimationObject
  | TextAnimationObject;

export interface AnimationKeyframe {
  at: number;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  opacity?: number;
}

export interface AnimationMotion {
  type: "orbit" | "spin" | "translate" | "pulse" | "fade" | "keyframes";
  target: string;
  periodMs: number;
  phase: number;
  center?: string | [number, number];
  rx?: number;
  ry?: number;
  clockwise?: boolean;
  from?: [number, number] | number;
  to?: [number, number] | number;
  alternate?: boolean;
  frames?: AnimationKeyframe[];
}

export interface AnimationScene {
  tool: "animate_scene";
  version: 1;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
  loop: boolean;
  objects: AnimationObject[];
  motions: AnimationMotion[];
  dynamicObjectCount?: number;
}

export interface AnimationTransformState {
  dx: number;
  dy: number;
  rotation: number;
  scale: number;
  opacity: number;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  return finite(value) ? value : fallback;
}

function safePoint(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1])) {
    return [value[0], value[1]];
  }
  return null;
}

function safePeriod(value: unknown, fallback: number): number {
  return clamp(finite(value) ? value : fallback, 250, 600000);
}

function safeColor(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const color = value.trim().toLowerCase();
  if (
    /^#[0-9a-f]{3,8}$/i.test(color) ||
    /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)$/i.test(color) ||
    COLOR_NAMES.has(color)
  ) {
    return color;
  }
  return fallback;
}

function normalizeStyle(source: Record<string, unknown>, index: number, type: string): AnimationStyle {
  const outlined = type === "line" || type === "path";
  const fill = safeColor(source.fill, outlined ? null : ANIMATION_PALETTE[index % ANIMATION_PALETTE.length]);
  const stroke = safeColor(source.stroke, outlined ? ANIMATION_PALETTE[index % ANIMATION_PALETTE.length] : null);
  const lineWidth = clamp(safeNumber(source.lineWidth, outlined ? 4 : 2), 0.5, 80);
  const opacity = clamp(safeNumber(source.opacity, 1), 0, 1);
  return { fill, stroke, lineWidth, opacity };
}

function bounded(value: unknown, min: number, max: number): value is number {
  return finite(value) && value >= min && value <= max;
}

function normalizeObject(
  source: unknown,
  index: number,
  width: number,
  height: number
): AnimationObject | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const rec = source as Record<string, unknown>;
  const type = String(rec.type || "").toLowerCase();
  if (!ANIMATION_OBJECT_TYPES.has(type)) return null;

  const id = typeof rec.id === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(rec.id) ? rec.id : null;
  if (!id) return null;

  const style = normalizeStyle(rec, index, type);
  const base = { id, type, ...style };

  if (type === "group") {
    const children = Array.isArray(rec.children)
      ? (rec.children as unknown[])
          .filter((child): child is string => typeof child === "string")
          .slice(0, 32)
      : [];
    if (!children.length) return null;
    return {
      ...base,
      type: "group",
      x: safeNumber(rec.x),
      y: safeNumber(rec.y),
      rotation: safeNumber(rec.rotation),
      scale: clamp(safeNumber(rec.scale, 1), 0.05, 20),
      children,
    };
  }

  if (type === "circle") {
    const cx = Number(rec.cx);
    const cy = Number(rec.cy);
    const r = Number(rec.r);
    if (![cx, cy, r].every(finite) || r <= 0 || r > Math.max(width, height) * 2) return null;
    return { ...base, type: "circle", cx, cy, r };
  }

  if (type === "ellipse") {
    const cx = Number(rec.cx);
    const cy = Number(rec.cy);
    const rx = Number(rec.rx);
    const ry = Number(rec.ry);
    if (![cx, cy, rx, ry].every(finite) || rx <= 0 || ry <= 0 || rx > width * 2 || ry > height * 2) return null;
    return { ...base, type: "ellipse", cx, cy, rx, ry };
  }

  if (type === "rect") {
    const x = Number(rec.x);
    const y = Number(rec.y);
    const w = Number(rec.w);
    const h = Number(rec.h);
    if (![x, y, w, h].every(finite) || w <= 0 || h <= 0 || w > width * 3 || h > height * 3) return null;
    return {
      ...base,
      type: "rect",
      x,
      y,
      w,
      h,
      radius: clamp(safeNumber(rec.radius), 0, Math.min(w, h) / 2),
    };
  }

  if (type === "line") {
    const x1 = Number(rec.x1);
    const y1 = Number(rec.y1);
    const x2 = Number(rec.x2);
    const y2 = Number(rec.y2);
    if (![x1, y1, x2, y2].every(finite)) return null;
    return { ...base, type: "line", x1, y1, x2, y2 };
  }

  if (type === "path") {
    const rawPts = Array.isArray(rec.points) ? rec.points : [];
    const points: [number, number][] = [];
    for (const pt of rawPts.slice(0, MAX_ANIMATION_PATH_POINTS)) {
      const p = safePoint(pt);
      if (p) points.push(p);
    }
    if (points.length < 2) return null;
    return {
      ...base,
      type: "path",
      points,
      closed: Boolean(rec.closed),
      smooth: Boolean(rec.smooth),
    };
  }

  if (type === "text") {
    const x = Number(rec.x);
    const y = Number(rec.y);
    const text = typeof rec.text === "string" ? rec.text : "";
    if (!finite(x) || !finite(y) || !text.length) return null;
    const align: CanvasTextAlign =
      rec.align === "center" || rec.align === "right" ? rec.align : "left";
    return {
      ...base,
      type: "text",
      x,
      y,
      text: text.slice(0, MAX_ANIMATION_TEXT_LENGTH),
      fontSize: clamp(safeNumber(rec.fontSize, 32), 6, 400),
      fontFamily:
        typeof rec.fontFamily === "string" && rec.fontFamily.length <= 80
          ? rec.fontFamily
          : "system-ui, sans-serif",
      fontWeight: rec.fontWeight === "bold" || rec.fontWeight === 700 ? "700" : "500",
      align,
    };
  }

  return null;
}

function normalizeKeyframes(source: unknown): AnimationKeyframe[] | null {
  if (!Array.isArray(source) || source.length < 2 || source.length > 16) return null;
  const frames: AnimationKeyframe[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;
    const at = Number(rec.at);
    if (!bounded(at, 0, 1)) return null;
    const norm: AnimationKeyframe = { at };
    if (finite(rec.x)) norm.x = rec.x;
    if (finite(rec.y)) norm.y = rec.y;
    if (finite(rec.rotation)) norm.rotation = rec.rotation;
    if (finite(rec.scale)) norm.scale = clamp(rec.scale, 0.05, 20);
    if (finite(rec.opacity)) norm.opacity = clamp(rec.opacity, 0, 1);
    if (Object.keys(norm).length <= 1) return null;
    frames.push(norm);
  }
  frames.sort((a, b) => a.at - b.at);
  if (frames.some((frame, index) => index > 0 && frame.at <= frames[index - 1].at)) return null;
  return frames;
}

function normalizeMotion(
  source: unknown,
  ids: Set<string>,
  durationMs: number,
  width: number,
  height: number
): AnimationMotion | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const rec = source as Record<string, unknown>;
  const type = String(rec.type || "").toLowerCase() as AnimationMotion["type"];
  const target = String(rec.target || "");
  if (!ANIMATION_MOTION_TYPES.has(type) || !ids.has(target)) return null;

  const base = {
    type,
    target,
    periodMs: safePeriod(rec.periodMs, durationMs),
    phase: (safeNumber(rec.phaseDeg) * Math.PI) / 180,
  };

  if (type === "orbit") {
    const center = typeof rec.center === "string" && ids.has(rec.center) ? rec.center : safePoint(rec.center);
    const rx = Number(rec.rx);
    const ry = Number(rec.ry);
    if (!center || !finite(rx) || !finite(ry) || rx <= 0 || ry <= 0 || rx > width * 2 || ry > height * 2) {
      return null;
    }
    return { ...base, type: "orbit", center, rx, ry, clockwise: rec.clockwise !== false };
  }

  if (type === "spin") {
    return { ...base, type: "spin", clockwise: rec.clockwise !== false };
  }

  if (type === "translate") {
    const from = safePoint(rec.from) || [0, 0];
    const to = safePoint(rec.to);
    if (!to) return null;
    return { ...base, type: "translate", from, to, alternate: rec.alternate !== false };
  }

  if (type === "pulse") {
    return {
      ...base,
      type: "pulse",
      from: clamp(safeNumber(rec.from, 0.85), 0.05, 20),
      to: clamp(safeNumber(rec.to, 1.15), 0.05, 20),
    };
  }

  if (type === "fade") {
    return {
      ...base,
      type: "fade",
      from: clamp(safeNumber(rec.from, 0.25), 0, 1),
      to: clamp(safeNumber(rec.to, 1), 0, 1),
    };
  }

  const frames = normalizeKeyframes(rec.frames);
  if (!frames) return null;
  return { ...base, type: "keyframes", frames };
}

export function normalizeAnimationScene(
  command: unknown,
  canvasSize = 20000
): AnimationScene | null {
  if (!command || typeof command !== "object" || Array.isArray(command)) return null;
  const rec = command as Record<string, unknown>;
  const tool = String(rec.tool || rec.type || rec.name || "").toLowerCase().replace(/[-_]/g, "");
  if (tool !== "animatescene") return null;

  const x = Number(rec.x);
  const y = Number(rec.y);
  const width = Number(rec.w);
  const height = Number(rec.h);
  const durationMs = safePeriod(rec.durationMs, 8000);

  if (
    ![x, y, width, height].every(finite) ||
    x < 0 ||
    y < 0 ||
    width < 120 ||
    height < 90 ||
    width > 6000 ||
    height > 6000 ||
    x + width > canvasSize ||
    y + height > canvasSize
  ) {
    return null;
  }

  if (
    !Array.isArray(rec.objects) ||
    !rec.objects.length ||
    rec.objects.length > MAX_ANIMATION_OBJECTS ||
    !Array.isArray(rec.motions) ||
    !rec.motions.length ||
    rec.motions.length > MAX_ANIMATION_MOTIONS
  ) {
    return null;
  }

  const objects: AnimationObject[] = [];
  for (let i = 0; i < rec.objects.length; i++) {
    const obj = normalizeObject(rec.objects[i], i, width, height);
    if (!obj) return null;
    objects.push(obj);
  }

  const ids = new Set(objects.map((o) => o.id));
  if (ids.size !== objects.length) return null;

  const byId = new Map(objects.map((o) => [o.id, o]));
  const childIds = new Set<string>();

  for (const obj of objects) {
    if (obj.type !== "group") continue;
    const localChildren = new Set<string>();
    for (const child of obj.children) {
      if (!ids.has(child) || child === obj.id || localChildren.has(child) || childIds.has(child)) {
        return null;
      }
      localChildren.add(child);
      childIds.add(child);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visitGroup(id: string): boolean {
    const obj = byId.get(id);
    if (!obj || obj.type !== "group" || visited.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const child of obj.children) {
      if (!visitGroup(child)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }

  for (const obj of objects) {
    if (obj.type === "group" && !visitGroup(obj.id)) return null;
  }

  const motions: AnimationMotion[] = [];
  for (const m of rec.motions) {
    const motion = normalizeMotion(m, ids, durationMs, width, height);
    if (!motion) return null;
    motions.push(motion);
  }

  return {
    tool: "animate_scene",
    version: 1,
    x,
    y,
    w: width,
    h: height,
    durationMs,
    loop: rec.loop !== false,
    objects,
    motions,
    dynamicObjectCount: new Set(motions.map((m) => m.target)).size,
  };
}

export function objectAnchor(object: AnimationObject): { x: number; y: number } {
  if (object.type === "circle" || object.type === "ellipse") {
    return { x: object.cx, y: object.cy };
  }
  if (object.type === "rect") {
    return { x: object.x + object.w / 2, y: object.y + object.h / 2 };
  }
  if (object.type === "line") {
    return { x: (object.x1 + object.x2) / 2, y: (object.y1 + object.y2) / 2 };
  }
  if (object.type === "path") {
    const sumX = object.points.reduce((sum, item) => sum + item[0], 0);
    const sumY = object.points.reduce((sum, item) => sum + item[1], 0);
    return { x: sumX / object.points.length, y: sumY / object.points.length };
  }
  if (object.type === "text") {
    return { x: object.x, y: object.y };
  }
  return { x: object.x || 0, y: object.y || 0 };
}

function motionProgress(motion: AnimationMotion, timeMs: number, loop = true): number {
  const raw = timeMs / motion.periodMs + motion.phase / (Math.PI * 2);
  if (!loop) return clamp(raw, 0, 1);
  const cycle = raw % 1;
  return cycle < 0 ? cycle + 1 : cycle;
}

function interpolateFrames(frames: AnimationKeyframe[], progress: number): Partial<AnimationTransformState> {
  let left = frames[0];
  let right = frames[frames.length - 1];
  if (progress <= left.at) {
    right = left;
  } else if (progress >= right.at) {
    left = right;
  } else {
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].at >= progress) {
        left = frames[i - 1];
        right = frames[i];
        break;
      }
    }
  }
  const ratio = left === right ? 0 : (progress - left.at) / (right.at - left.at);
  const result: Partial<AnimationTransformState> = {};
  for (const key of ["x", "y", "rotation", "scale", "opacity"] as const) {
    const lVal = left[key];
    const rVal = right[key];
    const a = finite(lVal) ? lVal : key === "scale" || key === "opacity" ? 1 : 0;
    const b = finite(rVal) ? rVal : a;
    if (key === "x") result.dx = a + (b - a) * ratio;
    else if (key === "y") result.dy = a + (b - a) * ratio;
    else (result as Record<string, number>)[key] = a + (b - a) * ratio;
  }
  return result;
}

export function animationStates(
  scene: AnimationScene,
  timeMs: number
): Map<string, AnimationTransformState> {
  const byId = new Map(scene.objects.map((o) => [o.id, o]));
  const states = new Map<string, AnimationTransformState>(
    scene.objects.map((o) => [o.id, { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 }])
  );

  for (const motion of scene.motions) {
    const target = byId.get(motion.target);
    const state = states.get(motion.target);
    const progress = motionProgress(motion, timeMs, scene.loop);
    if (!target || !state) continue;

    if (motion.type === "orbit") {
      const centerObject = typeof motion.center === "string" ? byId.get(motion.center) : null;
      const center = centerObject
        ? objectAnchor(centerObject)
        : Array.isArray(motion.center)
          ? { x: motion.center[0], y: motion.center[1] }
          : { x: 0, y: 0 };
      const anchor = objectAnchor(target);
      const rx = motion.rx ?? 100;
      const ry = motion.ry ?? 100;
      const angle = (motion.clockwise ? 1 : -1) * progress * Math.PI * 2;
      state.dx += center.x + Math.cos(angle) * rx - anchor.x;
      state.dy += center.y + Math.sin(angle) * ry - anchor.y;
    } else if (motion.type === "spin") {
      state.rotation += (motion.clockwise ? 1 : -1) * progress * Math.PI * 2;
    } else if (motion.type === "translate") {
      const from = Array.isArray(motion.from) ? motion.from : [0, 0];
      const to = Array.isArray(motion.to) ? motion.to : [0, 0];
      const ratio = motion.alternate ? 0.5 - Math.cos(progress * Math.PI * 2) / 2 : progress;
      state.dx += from[0] + (to[0] - from[0]) * ratio;
      state.dy += from[1] + (to[1] - from[1]) * ratio;
    } else if (motion.type === "pulse") {
      const from = typeof motion.from === "number" ? motion.from : 0.85;
      const to = typeof motion.to === "number" ? motion.to : 1.15;
      state.scale *= from + (to - from) * (0.5 - Math.cos(progress * Math.PI * 2) / 2);
    } else if (motion.type === "fade") {
      const from = typeof motion.from === "number" ? motion.from : 0.25;
      const to = typeof motion.to === "number" ? motion.to : 1;
      state.opacity *= from + (to - from) * (0.5 - Math.cos(progress * Math.PI * 2) / 2);
    } else if (motion.type === "keyframes" && motion.frames) {
      const frame = interpolateFrames(motion.frames, progress);
      if (frame.dx !== undefined) state.dx += frame.dx;
      if (frame.dy !== undefined) state.dy += frame.dy;
      if (frame.rotation !== undefined) state.rotation += (frame.rotation * Math.PI) / 180;
      if (frame.scale !== undefined) state.scale *= frame.scale;
      if (frame.opacity !== undefined) state.opacity *= frame.opacity;
    }
  }

  return states;
}

function roundedRect(context: CanvasRenderingContext2D, object: RectAnimationObject): void {
  if (object.radius && typeof context.roundRect === "function") {
    context.roundRect(object.x, object.y, object.w, object.h, object.radius);
  } else {
    context.rect(object.x, object.y, object.w, object.h);
  }
}

function drawPath(context: CanvasRenderingContext2D, object: PathAnimationObject): void {
  const points = object.points;
  context.moveTo(points[0][0], points[0][1]);
  if (!object.smooth || points.length < 3) {
    for (let i = 1; i < points.length; i++) {
      context.lineTo(points[i][0], points[i][1]);
    }
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      context.quadraticCurveTo(curr[0], curr[1], (curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2);
    }
    context.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
  }
  if (object.closed) context.closePath();
}

function drawShape(context: CanvasRenderingContext2D, object: AnimationObject): void {
  if (object.type === "text") {
    context.fillStyle = object.fill || object.stroke || "#1f2937";
    context.font = `${object.fontWeight} ${object.fontSize}px ${object.fontFamily}`;
    context.textAlign = object.align;
    context.textBaseline = "middle";
    context.fillText(object.text, object.x, object.y);
    return;
  }

  context.beginPath();
  if (object.type === "circle") {
    context.arc(object.cx, object.cy, object.r, 0, Math.PI * 2);
  } else if (object.type === "ellipse") {
    context.ellipse(object.cx, object.cy, object.rx, object.ry, 0, 0, Math.PI * 2);
  } else if (object.type === "rect") {
    roundedRect(context, object);
  } else if (object.type === "line") {
    context.moveTo(object.x1, object.y1);
    context.lineTo(object.x2, object.y2);
  } else if (object.type === "path") {
    drawPath(context, object);
  }

  if (object.fill && object.type !== "line") {
    context.fillStyle = object.fill;
    context.fill();
  }
  if (object.stroke) {
    context.strokeStyle = object.stroke;
    context.lineWidth = object.lineWidth || 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }
}

export function renderAnimationScene(
  context: CanvasRenderingContext2D,
  scene: AnimationScene,
  timeMs = 0
): boolean {
  const normalized =
    scene?.tool === "animate_scene" && scene.version === 1 ? scene : normalizeAnimationScene(scene);
  if (!normalized || !context) return false;

  const byId = new Map(normalized.objects.map((o) => [o.id, o]));
  const states = animationStates(normalized, timeMs);
  const childIds = new Set(
    normalized.objects
      .filter((o): o is GroupAnimationObject => o.type === "group")
      .flatMap((o) => o.children)
  );
  const rendering = new Set<string>();

  function renderObject(object: AnimationObject | undefined): void {
    if (!object || rendering.has(object.id)) return;
    rendering.add(object.id);
    const state = states.get(object.id) || { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 };
    context.save();
    context.globalAlpha *= (object.opacity ?? 1) * state.opacity;

    if (object.type === "group") {
      context.translate(object.x + state.dx, object.y + state.dy);
      context.rotate(((object.rotation || 0) * Math.PI) / 180 + state.rotation);
      context.scale(object.scale * state.scale, object.scale * state.scale);
      object.children.forEach((id) => renderObject(byId.get(id)));
    } else {
      const anchor = objectAnchor(object);
      context.translate(anchor.x + state.dx, anchor.y + state.dy);
      context.rotate(state.rotation);
      context.scale(state.scale, state.scale);
      context.translate(-anchor.x, -anchor.y);
      drawShape(context, object);
    }
    context.restore();
    rendering.delete(object.id);
  }

  context.save();
  context.beginPath();
  context.rect(0, 0, normalized.w, normalized.h);
  context.clip();
  normalized.objects.filter((o) => !childIds.has(o.id)).forEach(renderObject);
  context.restore();
  return true;
}

export function rasterizeAnimationScene(
  scene: AnimationScene,
  timeMs = 0,
  pixelRatio = 1,
  maxPixels = 4000000
): HTMLCanvasElement | null {
  const normalized =
    scene?.tool === "animate_scene" && scene.version === 1 ? scene : normalizeAnimationScene(scene);
  if (!normalized || typeof document === "undefined") return null;

  const ratio = Math.max(
    0.1,
    Math.min(pixelRatio, 2048 / normalized.w, 1536 / normalized.h, Math.sqrt(maxPixels / (normalized.w * normalized.h)))
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(normalized.w * ratio));
  canvas.height = Math.max(1, Math.ceil(normalized.h * ratio));
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderAnimationScene(context, normalized, timeMs);
  return canvas;
}

export function serializeAnimationScene(scene: AnimationScene): Record<string, unknown> | null {
  const normalized =
    scene?.tool === "animate_scene" && scene.version === 1 ? scene : normalizeAnimationScene(scene);
  if (!normalized) return null;
  const copy = { ...normalized };
  delete copy.dynamicObjectCount;
  return JSON.parse(JSON.stringify(copy));
}
