import { DEFAULT_CANVAS_BACKGROUND } from "@canvas/constants/defaults";
import { elementsAABB } from "@canvas/geometry/elementGeometry";
import { rectCenter } from "@canvas/geometry/rectangle";
import { createElement } from "@canvas/model/elementFactory";
import type {
  CanvasElement,
  ElementId,
  ElementStyle,
  Point,
  ToolType,
} from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";
import { CanvasEngine } from "./CanvasEngine";
import { EventEmitter } from "./events";
import { History } from "./History";
import { Scene } from "./Scene";
import { CameraController } from "@canvas/viewport/Camera";
import { renderOverlayScene } from "@canvas/rendering/renderOverlay";
import { renderStaticScene } from "@canvas/rendering/renderElement";
import { PointerManager } from "@canvas/interaction/PointerManager";
import { KeyboardManager } from "@canvas/interaction/KeyboardManager";
import { HandTool } from "@canvas/tools/HandTool";
import { SelectTool } from "@canvas/tools/SelectTool";
import { ShapeTool } from "@canvas/tools/ShapeTool";
import { LineTool } from "@canvas/tools/LineTool";
import { ArrowTool } from "@canvas/tools/ArrowTool";
import { FreedrawTool } from "@canvas/tools/FreedrawTool";
import type { ToolHandler } from "@canvas/tools/Tool";
import { LocalPersistence } from "@canvas/persistence/localPersistence";
import { documentToJson, DRAWVA_EXTENSION, serializeDocument } from "@canvas/persistence/serializer";
import { parseDocumentJson, restoreDocument } from "@canvas/persistence/deserializer";

export interface EditorOptions {
  staticCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
}

/**
 * Editor is the single public API surface between the React UI and the engine
 * (§1, §100). UI never reaches into Scene/History directly.
 */
export class Editor {
  readonly scene = new Scene();
  readonly history = new History();
  readonly camera = new CameraController();
  readonly events = new EventEmitter();

  private engine: CanvasEngine;
  private pointer: PointerManager;
  private keyboard: KeyboardManager;
  private persistence = new LocalPersistence();

  private tools = new Map<ToolType, ToolHandler>();
  private activeToolType: ToolType = "select";
  private toolLocked = false;

  private selectedIds = new Set<ElementId>();
  private marquee: import("@canvas/geometry/rectangle").Rect | null = null;
  private gridEnabled = false;
  private theme: "light" | "dark" = "light";
  private canvasBackground = DEFAULT_CANVAS_BACKGROUND;

  private destroyed = false;

  constructor(options: EditorOptions) {
    this.engine = new CanvasEngine(options.staticCanvas, options.overlayCanvas);

    this.tools.set("select", new SelectTool());
    this.tools.set("hand", new HandTool());
    this.tools.set("rectangle", new ShapeTool("rectangle", "rectangle"));
    this.tools.set("ellipse", new ShapeTool("ellipse", "ellipse"));
    this.tools.set("diamond", new ShapeTool("diamond", "diamond"));
    this.tools.set("line", new LineTool());
    this.tools.set("arrow", new ArrowTool());
    this.tools.set("freedraw", new FreedrawTool());

    this.pointer = new PointerManager(this, options.overlayCanvas);
    this.keyboard = new KeyboardManager(this);

    this.engine.setRenderCallback(() => this.renderFrame());
  }

  attach(): void {
    this.engine.mount();
    this.camera.setViewportSize(this.engine.size);
    this.loadFromStorage();
    this.pointer.mount();
    this.keyboard.mount(window);
    this.requestRender();
  }

  destroy(): void {
    this.destroyed = true;
    this.pointer.destroy();
    this.keyboard.destroy();
    this.engine.destroy();
    this.persistence.destroy();
    this.events.clear();
  }

  // ---------------------------------------------------------------- events
  on = this.events.on.bind(this.events);

  // internal helpers used during construction before the engine exists
  private afterDocumentMutation(): void {
    this.engine.requestRender("both");
    this.events.emit("change");
    this.persistence.saveDebounced(
      this.scene.getElements(),
      this.camera.get(),
      this.canvasBackground,
    );
  }

  requestRender(): void {
    this.engine.requestRender("both");
  }

  // ---------------------------------------------------------------- tools
  hasTool(type: ToolType): boolean {
    return this.tools.has(type);
  }

  setActiveTool(type: ToolType): void {
    if (!this.tools.has(type) || type === this.activeToolType) return;
    this.getActiveTool().onExit?.(this);
    this.activeToolType = type;
    this.getActiveTool().onEnter?.(this);
    this.setCursor(this.getActiveTool().cursor ?? "default");
    this.events.emit("toolChange");
    this.markInteractiveDirty();
  }

  getActiveTool(): ToolHandler {
    const tool = this.tools.get(this.activeToolType);
    if (!tool) return this.tools.get("select")!;
    return tool;
  }

  getActiveToolType(): ToolType {
    return this.activeToolType;
  }

  isToolLocked(): boolean {
    return this.toolLocked;
  }

  toggleToolLock(): void {
    this.toolLocked = !this.toolLocked;
    this.events.emit("toolChange");
  }

  // ---------------------------------------------------------------- selection (§25-§28)
  getSelectedIds(): ReadonlySet<ElementId> {
    return this.selectedIds;
  }

  getSelectedElements(): CanvasElement[] {
    return this.scene.getElementsByIds(this.selectedIds);
  }

  isSelected(id: ElementId): boolean {
    return this.selectedIds.has(id);
  }

  selectOnly(id: ElementId): void {
    const el = this.scene.getElement(id);
    if (!el || el.isDeleted) return;
    this.selectedIds = new Set([id]);
    this.events.emit("selectionChange");
    this.markInteractiveDirty();
  }

  setSelection(ids: ElementId[]): void {
    this.selectedIds = new Set(ids.filter((id) => {
      const el = this.scene.getElement(id);
      return el && !el.isDeleted;
    }));
    this.events.emit("selectionChange");
    this.markInteractiveDirty();
  }

  addToSelection(ids: ElementId[]): void {
    let changed = false;
    for (const id of ids) {
      const el = this.scene.getElement(id);
      if (el && !el.isDeleted && !this.selectedIds.has(id)) {
        this.selectedIds.add(id);
        changed = true;
      }
    }
    if (changed) {
      this.events.emit("selectionChange");
      this.markInteractiveDirty();
    }
  }

  toggleSelected(id: ElementId): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.addToSelection([id]);
    this.events.emit("selectionChange");
    this.markInteractiveDirty();
  }

  clearSelection(): void {
    if (this.selectedIds.size === 0) return;
    this.selectedIds.clear();
    this.events.emit("selectionChange");
    this.markInteractiveDirty();
  }

  selectAll(): void {
    const ids = this.scene
      .getNonDeletedElements()
      .filter((el) => !el.locked)
      .map((el) => el.id);
    this.selectedIds = new Set(ids);
    this.events.emit("selectionChange");
    this.markInteractiveDirty();
  }

  selectionCenter(): Point {
    const bounds = elementsAABB(this.getSelectedElements());
    return bounds ? rectCenter(bounds) : [0, 0];
  }

  // ---------------------------------------------------------------- marquee
  getMarquee() {
    return this.marquee;
  }
  setMarquee(rect: import("@canvas/geometry/rectangle").Rect | null): void {
    this.marquee = rect;
    this.markInteractiveDirty();
  }

  // ---------------------------------------------------------------- history + mutations (§54-§55, §102)
  beginTransaction(): void {
    this.history.beginTransaction();
  }

  commitHistory(): void {
    this.history.commit(this.scene);
    this.afterDocumentMutation();
    this.events.emit("historyChange");
  }

  undo(): boolean {
    const ok = this.history.undo(this.scene);
    if (ok) {
      this.repairSelection();
      this.afterDocumentMutation();
      this.events.emit("historyChange");
    }
    return ok;
  }

  redo(): boolean {
    const ok = this.history.redo(this.scene);
    if (ok) {
      this.repairSelection();
      this.afterDocumentMutation();
      this.events.emit("historyChange");
    }
    return ok;
  }

  private repairSelection(): void {
    for (const id of [...this.selectedIds]) {
      const el = this.scene.getElement(id);
      if (!el || el.isDeleted) this.selectedIds.delete(id);
    }
  }

  deleteSelection(): void {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;
    this.beginTransaction();
    for (const id of ids) {
      const el = this.scene.getElement(id);
      if (!el || el.locked) continue;
      this.history.captureSnapshot(el);
      this.history.markDeleted(el);
    }
    this.commitHistory();
  }

  duplicateSelection(): CanvasElement[] {
    const source = this.getSelectedElements().filter((el) => !el.locked);
    if (source.length === 0) return [];
    this.beginTransaction();
    const clones: CanvasElement[] = [];
    for (const el of source) {
      const clone: CanvasElement = structuredClone(el);
      clone.id = createId(clone.type);
      clone.seed = Math.floor(Math.random() * 2 ** 31) >>> 0;
      clone.x = el.x + 16;
      clone.y = el.y + 16;
      clone.version = 1;
      clone.updated = Date.now();
      this.scene.addElement(clone);
      clones.push(clone);
    }
    this.commitHistory();
    this.setSelection(clones.map((c) => c.id));
    return clones;
  }

  nudgeSelection(dx: number, dy: number): void {
    const movable = this.getSelectedElements().filter((el) => !el.locked);
    if (movable.length === 0) return;
    this.beginTransaction();
    for (const el of movable) {
      this.history.captureSnapshot(el);
      this.scene.updateElement(el.id, (target) => {
        target.x += dx;
        target.y += dy;
      });
    }
    this.commitHistory();
  }

  updateSelectedStyle(partial: Partial<ElementStyle>): void {
    const selected = this.getSelectedElements().filter((el) => !el.locked);
    if (selected.length === 0) return;
    this.beginTransaction();
    for (const el of selected) {
      this.history.captureSnapshot(el);
      this.scene.updateElement(el.id, (target) => {
        Object.assign(target, partial);
      });
    }
    this.commitHistory();
  }

  // ---------------------------------------------------------------- camera + zoom (§18, §83)
  zoomIn(): void {
    this.camera.setZoomAtCenter(this.camera.get().zoom * 1.1);
    this.markCameraDirty();
  }

  zoomOut(): void {
    this.camera.setZoomAtCenter(this.camera.get().zoom / 1.1);
    this.markCameraDirty();
  }

  resetZoom(): void {
    this.camera.resetZoom();
    this.markCameraDirty();
  }

  zoomToFit(): void {
    const bounds = elementsAABB(this.scene.getNonDeletedElements());
    if (!bounds) {
      this.camera.setCamera({ x: 0, y: 0, zoom: 1 });
      this.markCameraDirty();
      return;
    }
    this.camera.zoomToRect(bounds);
    this.markCameraDirty();
  }

  zoomToSelection(): void {
    const bounds = elementsAABB(this.getSelectedElements());
    if (!bounds) return;
    this.camera.zoomToRect(bounds);
    this.markCameraDirty();
  }

  // ---------------------------------------------------------------- engine wiring
  createElement(type: ToolType, props: Parameters<typeof createElement>[1]): CanvasElement {
    const el = createElement(type as never, props);
    this.scene.addElement(el);
    this.afterDocumentMutation();
    return el;
  }

  updateElement(id: ElementId, fn: (el: CanvasElement) => void): void {
    this.scene.updateElement(id, fn);
    this.afterDocumentMutation();
  }

  getElement(id: ElementId): CanvasElement | undefined {
    return this.scene.getElement(id);
  }

  getElements(): CanvasElement[] {
    return this.scene.getElements();
  }

  markDocumentDirty(): void {
    this.engine.requestRender("both");
    this.events.emit("change");
    this.persistDebounced();
  }

  markInteractiveDirty(): void {
    this.engine.requestRender("interactive");
  }

  markCameraDirty(): void {
    this.engine.requestRender("both");
    this.events.emit("cameraChange");
    this.persistDebounced();
  }

  setCursor(cursor: string): void {
    if (this.engine.overlayCanvas.style.cursor !== cursor) {
      this.engine.overlayCanvas.style.cursor = cursor;
    }
  }

  capturePointer(pointerId: number): void {
    try {
      this.engine.overlayCanvas.setPointerCapture(pointerId);
    } catch {
      // pointer may already be released
    }
  }

  releasePointer(): void {
    // pointer capture auto-releases on pointerup; kept as a hook
  }

  setSpaceHeld(held: boolean): void {
    this.pointer.setSpaceHeld(held);
    if (held) this.setCursor("grab");
    else this.setCursor(this.getActiveTool().cursor ?? "default");
  }

  // ---------------------------------------------------------------- persistence (§75-§78)
  saveToJson(): string {
    this.persistDebounced(); // ensure latest camera/background captured
    this.persistence.flush();
    const doc = serializeDocument(
      this.scene.getNonDeletedElements(),
      this.camera.get(),
      this.canvasBackground,
    );
    return documentToJson(doc);
  }

  loadFromJson(json: string): boolean {
    const raw = parseDocumentJson(json);
    if (raw === null) return false;
    const restored = restoreDocument(raw);
    this.scene.replaceAll(restored.elements);
    this.camera.setCamera(restored.camera);
    this.canvasBackground = restored.canvasBackground;
    this.history.clear();
    this.clearSelection();
    this.afterDocumentMutation();
    this.events.emit("cameraChange");
    return restored.errors.length === 0 || restored.elements.length > 0;
  }

  saveToFile(filename?: string): void {
    const json = this.saveToJson();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename ?? "drawva"}.${DRAWVA_EXTENSION}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  openFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${DRAWVA_EXTENSION},application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      this.loadFromJson(text);
    };
    input.click();
  }

  private loadFromStorage(): void {
    const stored = this.persistence.load();
    if (stored && stored.elements.length > 0) {
      this.scene.replaceAll(stored.elements);
      this.camera.setCamera(stored.camera);
      this.canvasBackground = stored.canvasBackground;
      this.afterDocumentMutation();
    }
  }

  private persistDebounced(): void {
    this.persistence.saveDebounced(
      this.scene.getElements(),
      this.camera.get(),
      this.canvasBackground,
    );
  }

  // ---------------------------------------------------------------- canvas view state
  setGridEnabled(enabled: boolean): void {
    this.gridEnabled = enabled;
    this.markDocumentDirty();
  }

  isGridEnabled(): boolean {
    return this.gridEnabled;
  }

  setTheme(theme: "light" | "dark"): void {
    this.theme = theme;
    this.markDocumentDirty();
  }

  getTheme(): "light" | "dark" {
    return this.theme;
  }

  getCanvasBackground(): string {
    return this.canvasBackground;
  }

  // ---------------------------------------------------------------- render loop (§21, §92, §93)
  private renderFrame(): void {
    if (this.destroyed) return;
    if (!this.engine.staticDirty && !this.engine.interactiveDirty) return;

    const camera = this.camera.get();
    const rc = (ctx: CanvasRenderingContext2D) => ({
      ctx,
      camera,
      canvasBackground: this.canvasBackground,
      theme: this.theme,
      dpr: this.engine.dpr,
    });

    if (this.engine.staticDirty) {
      renderStaticScene(rc(this.engine.staticCtx), this.scene.getElements(), this.gridEnabled);
      this.engine.staticDirty = false;
    }

    if (this.engine.interactiveDirty) {
      renderOverlayScene(rc(this.engine.overlayCtx), {
        selectedElements: this.getSelectedElements(),
        pendingElement: null,
        marqueeRect: this.marquee,
        hoveredElement: null,
      });
      this.engine.interactiveDirty = false;
    }
  }
}

export function createCanvasEditor(options: EditorOptions): Editor {
  return new Editor(options);
}
