// ============================================================
// Drawva Canvas Engine — Text Tool
// DOM <textarea> overlay at world point. IME-compatible.
// Enter → rasterize to offscreen canvas → store as TextItem.
// ============================================================

import type { Camera } from "./camera";
import type { TextItem } from "./types";

let _nextId = 1;
function newId(): string {
  return `text_${Date.now()}_${_nextId++}`;
}

export class TextTool {
  private overlay: HTMLTextAreaElement | null = null;
  private worldX = 0;
  private worldY = 0;
  private container: HTMLElement;
  private camera: Camera;
  private color = "#1a1a1a";
  private fontSize = 20;
  private onCommit: (item: TextItem) => void;
  private onCancel: () => void;

  constructor(
    container: HTMLElement,
    camera: Camera,
    onCommit: (item: TextItem) => void,
    onCancel: () => void
  ) {
    this.container = container;
    this.camera = camera;
    this.onCommit = onCommit;
    this.onCancel = onCancel;
  }

  setColor(color: string): void {
    this.color = color;
    if (this.overlay) this.overlay.style.color = color;
  }

  setFontSize(size: number): void {
    this.fontSize = size;
    if (this.overlay) {
      const screenSize = size * this.camera.scale;
      this.overlay.style.fontSize = `${screenSize}px`;
    }
  }

  /** Start a text edit at the given screen position */
  startAt(screenX: number, screenY: number): void {
    // If already editing, commit the current one first
    if (this.overlay) this.commit();

    const world = this.camera.screenToWorld({ x: screenX, y: screenY });
    this.worldX = world.x;
    this.worldY = world.y;

    const textarea = document.createElement("textarea");
    textarea.style.cssText = `
      position: absolute;
      left: ${screenX}px;
      top: ${screenY}px;
      min-width: 4px;
      min-height: ${this.fontSize * this.camera.scale * 1.4}px;
      padding: 2px 4px;
      background: transparent;
      border: none;
      outline: 2px dashed rgba(59,130,246,0.7);
      outline-offset: 2px;
      font-family: sans-serif;
      font-size: ${this.fontSize * this.camera.scale}px;
      color: ${this.color};
      resize: none;
      overflow: hidden;
      white-space: pre;
      z-index: 1000;
      caret-color: ${this.color};
      line-height: 1.4;
    `;
    textarea.rows = 1;
    textarea.spellcheck = false;

    // Auto-grow
    const grow = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.width = "auto";
      textarea.style.width = `${Math.max(textarea.scrollWidth, 40)}px`;
    };
    textarea.addEventListener("input", grow);

    // Commit on Enter (without shift), Cancel on Escape
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    // Commit on blur
    textarea.addEventListener("blur", () => {
      if (this.overlay === textarea) {
        this.commit();
      }
    });

    this.container.style.position ||= "relative";
    this.container.appendChild(textarea);
    textarea.focus();
    this.overlay = textarea;
  }

  commit(): void {
    if (!this.overlay) return;
    const text = this.overlay.value.trim();
    const el = this.overlay;
    this.overlay = null;

    if (el.parentElement) el.parentElement.removeChild(el);

    if (!text) {
      this.onCancel();
      return;
    }

    // Rasterize text to measure actual pixel dimensions
    const screenFontSize = this.fontSize * this.camera.scale;
    const measureCanvas = document.createElement("canvas");
    const mCtx = measureCanvas.getContext("2d")!;
    mCtx.font = `${screenFontSize}px sans-serif`;

    const lines = text.split("\n");
    const lineHeight = screenFontSize * 1.4;
    const measuredWidths = lines.map((l) => mCtx.measureText(l).width);
    const canvasW = Math.ceil(Math.max(...measuredWidths, 10)) + 8;
    const canvasH = Math.ceil(lines.length * lineHeight) + 4;

    const offscreen = document.createElement("canvas");
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    const ctx = offscreen.getContext("2d")!;
    ctx.font = `${screenFontSize}px sans-serif`;
    ctx.fillStyle = this.color;
    ctx.textBaseline = "top";

    lines.forEach((line, i) => {
      ctx.fillText(line, 4, i * lineHeight + 2);
    });

    const imageDataUrl = offscreen.toDataURL("image/png");

    // Convert pixel dimensions back to world units
    const worldW = canvasW / this.camera.scale;
    const worldH = canvasH / this.camera.scale;

    const item: TextItem = {
      id: newId(),
      kind: "text",
      x: this.worldX,
      y: this.worldY,
      text,
      fontSize: this.fontSize,
      color: this.color,
      width: worldW,
      height: worldH,
      imageDataUrl,
    };

    this.onCommit(item);
  }

  cancel(): void {
    if (!this.overlay) return;
    const el = this.overlay;
    this.overlay = null;
    if (el.parentElement) el.parentElement.removeChild(el);
    this.onCancel();
  }

  /** Update overlay position when camera changes */
  updateCameraTransform(): void {
    if (!this.overlay) return;
    const screen = this.camera.worldToScreen({ x: this.worldX, y: this.worldY });
    this.overlay.style.left = `${screen.x}px`;
    this.overlay.style.top = `${screen.y}px`;
    const screenSize = this.fontSize * this.camera.scale;
    this.overlay.style.fontSize = `${screenSize}px`;
  }

  get isEditing(): boolean {
    return this.overlay !== null;
  }

  destroy(): void {
    this.cancel();
  }
}
