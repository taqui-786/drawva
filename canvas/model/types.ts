/**
 * Core document model. All element data must stay JSON-serializable:
 * no functions, no class instances, no DOM references (§3, §56).
 */

import { CANVA_FILE_TYPE } from "@/canvas/constants/defaults";

export type ElementId = string;

export type FillStyle = "solid" | "hachure" | "cross-hatch";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export type Point = readonly [number, number];

export interface ElementStyle {
  strokeColor: string;
  backgroundColor: string; // "transparent" for none
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number; // 0..1
  rounded: boolean;
}

interface CanvasElementBase extends ElementStyle {
  id: ElementId;
  x: number;
  y: number;
  width: number;
  height: number;
  /** rotation in radians, around the element center */
  angle: number;
  /** deterministic seed for sketch rendering */
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  groupIds: string[];
  frameId: string | null;
  boundElements: unknown[];
  updated: number; // ms timestamp
  link: string | null;
  locked: boolean;
}

export interface RectangleElement extends CanvasElementBase {
  type: "rectangle";
}

export interface EllipseElement extends CanvasElementBase {
  type: "ellipse";
}

export interface DiamondElement extends CanvasElementBase {
  type: "diamond";
}

export interface LineElement extends CanvasElementBase {
  type: "line";
  /** points relative to element origin, first point normally [0,0] (§7) */
  points: Point[];
}

export type Arrowhead = "none" | "arrow" | "triangle" | "circle" | "bar";

export interface ArrowBinding {
  elementId: ElementId;
  /** normalized point on target shape: [0.5, 0] = top-center (§9) */
  fixedPoint: Point;
}

export interface ArrowElement extends CanvasElementBase {
  type: "arrow";
  points: Point[];
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  startBinding: ArrowBinding | null;
  endBinding: ArrowBinding | null;
}

export interface FreedrawElement extends CanvasElementBase {
  type: "freedraw";
  points: Point[];
  pressures: number[];
  lastCommittedPoint: Point | null;
}

export interface TextElement extends CanvasElementBase {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  containerId: ElementId | null;
}

export interface ImageElement extends CanvasElementBase {
  type: "image";
  fileId: string | null;
}

export interface FrameElement extends CanvasElementBase {
  type: "frame";
  name: string;
}

export type CanvasElement =
  | RectangleElement
  | EllipseElement
  | DiamondElement
  | LineElement
  | ArrowElement
  | FreedrawElement
  | TextElement
  | ImageElement
  | FrameElement;

export type ElementType = CanvasElement["type"];

export type ToolType =
  | "select"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "frame"
  | "laser";

export interface Camera {
  /** scene-space coordinate shown at the viewport's top-left */
  x: number;
  y: number;
  zoom: number;
}

/** Versioned on-disk document (§75, §76). `type` must be the literal "drawva". */
export interface CanvasDocument {
  type: typeof CANVA_FILE_TYPE;
  version: number;
  elements: CanvasElement[];
  /** editor view state that is worth persisting (camera, background) */
  appState: {
    camera: Camera;
    canvasBackground: string;
  };
}

export interface CanvasSize {
  width: number;
  height: number;
}
