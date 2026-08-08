import { randomSeed } from "@canvas/utils/random";
import type {
  ArrowElement,
  Arrowhead,
  CanvasElement,
  ElementId,
  ElementStyle,
  ElementType,
  FreedrawElement,
  LineElement,
  Point,
  RectangleElement,
} from "./types";

const versionNonce = (): number => Math.floor(Math.random() * 2 ** 31);

export function defaultStyle(): ElementStyle {
  return {
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 1,
    rounded: true,
  };
}

export interface BaseProps {
  id: ElementId;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  groupIds?: string[];
  frameId?: string | null;
  link?: string | null;
  locked?: boolean;
}

export function createElementBase(props: BaseProps): Omit<RectangleElement, "type"> {
  return {
    ...defaultStyle(),
    id: props.id,
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
    angle: props.angle ?? 0,
    seed: randomSeed(),
    version: 1,
    versionNonce: versionNonce(),
    isDeleted: false,
    groupIds: props.groupIds ?? [],
    frameId: props.frameId ?? null,
    boundElements: [],
    updated: Date.now(),
    link: props.link ?? null,
    locked: props.locked ?? false,
  };
}

export function createRectangle(props: BaseProps): RectangleElement {
  return {
    ...createElementBase(props),
    type: "rectangle",
  };
}

export function createLine(props: BaseProps & { points?: Point[] }): LineElement {
  return {
    ...createElementBase(props),
    type: "line",
    points: props.points ?? [[0, 0], [props.width, props.height]],
  };
}

export function createArrow(
  props: BaseProps & {
    points?: Point[];
    startArrowhead?: Arrowhead;
    endArrowhead?: Arrowhead;
  },
): ArrowElement {
  return {
    ...createElementBase(props),
    type: "arrow",
    points: props.points ?? [[0, 0], [props.width, props.height]],
    startArrowhead: props.startArrowhead ?? "none",
    endArrowhead: props.endArrowhead ?? "arrow",
    startBinding: null,
    endBinding: null,
  };
}

export function createFreedraw(
  props: BaseProps & { points?: Point[]; pressures?: number[] },
): FreedrawElement {
  return {
    ...createElementBase(props),
    type: "freedraw",
    points: props.points ?? [],
    pressures: props.pressures ?? [],
    lastCommittedPoint: null,
  };
}

export function createElement(
  type: ElementType,
  props: BaseProps,
): CanvasElement {
  switch (type) {
    case "rectangle":
      return createRectangle(props);
    case "ellipse":
    case "diamond":
      return { ...createElementBase(props), type };
    case "line":
      return createLine(props);
    case "arrow":
      return createArrow(props);
    case "freedraw":
      return createFreedraw(props);
    case "text":
      return {
        ...createElementBase(props),
        type: "text",
        text: "",
        fontSize: 20,
        fontFamily: "Virgil",
        textAlign: "left",
        containerId: null,
      };
    case "image":
      return {
        ...createElementBase(props),
        type: "image",
        fileId: null,
      };
    case "frame":
      return {
        ...createElementBase(props),
        type: "frame",
        name: "Frame",
      };
    default:
      throw new Error(`createElement: type "${type}" not implemented`);
  }
}

export function bumpVersion(el: CanvasElement): void {
  el.version += 1;
  el.versionNonce = versionNonce();
  el.updated = Date.now();
}
