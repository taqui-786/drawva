import { CANVA_FILE_TYPE, CANVA_FILE_VERSION } from "@canvas/constants/defaults";
import type { Camera, CanvasDocument, CanvasElement } from "@/canvas/model/types";

export function serializeDocument(
  elements: CanvasElement[],
  camera: Camera,
  canvasBackground: string,
): CanvasDocument {
  return {
    type: CANVA_FILE_TYPE,
    version: CANVA_FILE_VERSION,
    elements,
    appState: { camera, canvasBackground },
  };
}

export const DRAWVA_EXTENSION = "drawva";

export function documentToJson(doc: CanvasDocument): string {
  return JSON.stringify(doc, null, 2);
}
