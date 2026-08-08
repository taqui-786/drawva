import { CANVA_FILE_TYPE, CANVA_FILE_VERSION, DEFAULT_CANVAS_BACKGROUND } from "@canvas/constants/defaults";
import { defaultStyle } from "@canvas/model/elementFactory";
import type {
  Camera,
  CanvasElement,
  ElementId,
} from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";

/**
 * Restoration pipeline (§77): parse → validate → migrate → restore defaults →
 * repair relationships → validate numerics. Never trust imported JSON.
 */

export interface RestoreResult {
  elements: CanvasElement[];
  camera: Camera;
  canvasBackground: string;
  errors: string[];
}

const VALID_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
  "frame",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fin(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

export function restoreDocument(raw: unknown): RestoreResult {
  const errors: string[] = [];
  const result: RestoreResult = {
    elements: [],
    camera: { x: 0, y: 0, zoom: 1 },
    canvasBackground: DEFAULT_CANVAS_BACKGROUND,
    errors,
  };

  if (!isRecord(raw)) {
    errors.push("Document is not an object");
    return result;
  }
  if (raw.type !== CANVA_FILE_TYPE) {
    errors.push(`Unknown document type "${String(raw.type)}"`);
    return result;
  }
  if (fin(raw.version, 0) > CANVA_FILE_VERSION) {
    errors.push(`Unsupported document version ${String(raw.version)}`);
    return result;
  }
  // migrations would run here keyed off raw.version (§76)

  // appState
  if (isRecord(raw.appState)) {
    const cam = raw.appState.camera;
    if (isRecord(cam)) {
      result.camera = {
        x: fin(cam.x, 0),
        y: fin(cam.y, 0),
        zoom: Math.min(30, Math.max(0.1, fin(cam.zoom, 1))),
      };
    }
    result.canvasBackground = str(raw.appState.canvasBackground, DEFAULT_CANVAS_BACKGROUND);
  }

  if (!Array.isArray(raw.elements)) {
    errors.push("elements missing or not an array");
    return result;
  }

  const seenIds = new Set<ElementId>();
  for (const item of raw.elements) {
    const el = sanitizeElement(item, seenIds, errors);
    if (el) result.elements.push(el);
  }

  return result;
}

function sanitizeElement(
  raw: unknown,
  seenIds: Set<ElementId>,
  errors: string[],
): CanvasElement | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.type !== "string" || !VALID_TYPES.has(raw.type)) {
    errors.push(`Element with unknown type dropped: ${String(raw.type)}`);
    return null;
  }

  let id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : createId();
  if (seenIds.has(id)) {
    id = createId();
    errors.push("Duplicate element id repaired");
  }
  seenIds.add(id);

  const style = defaultStyle();
  const base = {
    id,
    x: fin(raw.x, 0),
    y: fin(raw.y, 0),
    width: Math.max(0, fin(raw.width, 0)),
    height: Math.max(0, fin(raw.height, 0)),
    angle: fin(raw.angle, 0),
    seed: fin(raw.seed, Math.floor(Math.random() * 2 ** 31)),
    version: Math.max(1, fin(raw.version, 1)),
    versionNonce: fin(raw.versionNonce, Math.floor(Math.random() * 2 ** 31)),
    isDeleted: raw.isDeleted === true,
    groupIds: Array.isArray(raw.groupIds)
      ? raw.groupIds.filter((g): g is string => typeof g === "string")
      : [],
    frameId: typeof raw.frameId === "string" ? raw.frameId : null,
    boundElements: [] as unknown[],
    updated: fin(raw.updated, Date.now()),
    link: sanitizeLink(raw.link),
    locked: raw.locked === true,
    strokeColor: str(raw.strokeColor, style.strokeColor),
    backgroundColor: str(raw.backgroundColor, style.backgroundColor),
    fillStyle: raw.fillStyle === "solid" || raw.fillStyle === "hachure" || raw.fillStyle === "cross-hatch" ? raw.fillStyle : style.fillStyle,
    strokeWidth: Math.max(0.5, fin(raw.strokeWidth, style.strokeWidth)),
    strokeStyle: (raw.strokeStyle === "dashed" || raw.strokeStyle === "dotted" ? raw.strokeStyle : "solid") as "solid" | "dashed" | "dotted",
    roughness: fin(raw.roughness, style.roughness),
    opacity: Math.min(1, Math.max(0, fin(raw.opacity, 1))),
    rounded: raw.rounded !== false,
  };

  switch (raw.type) {
    case "rectangle":
      return { ...base, type: "rectangle" };
    case "ellipse":
      return { ...base, type: "ellipse" };
    case "diamond":
      return { ...base, type: "diamond" };
    case "frame":
      return { ...base, type: "frame", name: str(raw.name, "Frame") };
    case "text":
      return {
        ...base,
        type: "text",
        text: str(raw.text, ""),
        fontSize: fin(raw.fontSize, 20),
        fontFamily: str(raw.fontFamily, "Virgil"),
        textAlign: raw.textAlign === "center" || raw.textAlign === "right" ? raw.textAlign : "left",
        containerId: typeof raw.containerId === "string" ? raw.containerId : null,
      };
    default:
      // not yet implemented element types are preserved minimally as rectangles would
      errors.push(`Element type "${raw.type}" not yet supported, dropped`);
      return null;
  }
}

export function sanitizeLink(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("javascript:")) return null;
  return trimmed;
}

export function parseDocumentJson(json: string): unknown | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
