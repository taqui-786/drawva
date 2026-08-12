import { Camera } from "./camera";
import { SIZE } from "./constants";
import type { CanvasMode, Point } from "./types";

/**
 * Living-object host for text / formula / plot attachments.
 *
 * Port of penecho's textBox/image object model into drawva: instead of baking
 * these into the ink tiles at accept time, they stay "live" above the paper as
 * DOM shells with camera-aware transforms and per-object chrome (move/resize/
 * delete/merge/copy). The render is a rasterized bitmap held on the item —
 * exactly like penecho keeps `image` on a text box — so it can move/resize
 * freely, get re-rendered on restore, and be merged back into erasable ink.
 */

export type ObjectKind = "text" | "formula" | "plot";
export type ObjectStatus = "draft" | "accepted";

export interface ObjectItem {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Native render size (CSS px) the bitmap was rasterized at. */
  contentW: number;
  contentH: number;
  /** Source payload: raw text, LaTeX, or plot expression. */
  source: string;
  color: string;
  fontSize: number;
  /** Text-only: world-units wrap width the block was laid out with. */
  maxWidth?: number;
  status: ObjectStatus;
  /** Transient raster; not persisted. Re-rendered from source on restore. */
  image?: HTMLCanvasElement;
}

export interface ObjectCallbacks {
  onDragStart?: (id: string, e: PointerEvent) => void;
  onDragMove?: (id: string, e: PointerEvent) => void;
  onDragEnd?: (id: string) => void;
  onResizeStart?: (id: string, e: PointerEvent) => void;
  onResizeMove?: (id: string, e: PointerEvent) => void;
  onResizeEnd?: (id: string) => void;
  onRemove?: (id: string) => void;
  /** Bake the object back into the ink tiles, then drop the live object. */
  onMerge?: (id: string) => void;
}

export interface ObjectMountOptions {
  engineContainer: HTMLElement;
  camera: Camera;
  callbacks?: ObjectCallbacks;
}

// Chrome icons (duplicate of widget shell glyph set).
const DRAG_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
const REMOVE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const COPY_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const RESIZE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"><polygon points="12 2 22 12 12 22 2 12"/></svg>`;
const MERGE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M12 3l-4 4M12 3l4 4"/><path d="M4 21h16"/></svg>`;

const MIN_W: Record<ObjectKind, number> = { text: 40, formula: 60, plot: 240 };
const MIN_H: Record<ObjectKind, number> = { text: 40, formula: 40, plot: 180 };

export function minimumObjectSize(kind: ObjectKind): { w: number; h: number } {
  return { w: MIN_W[kind], h: MIN_H[kind] };
}

/**
 * DOM + screen positioning for living objects. Mirrors the WidgetManager shell
 * pattern (dashed shell, floating top drag bar, corner resize handle, action
 * buttons) but hosts a bitmap body instead of a sandboxed iframe.
 */
export class ObjectManager {
  private items = new Map<string, ObjectItem>();
  private shells = new Map<string, HTMLElement>();
  private toolbars = new Map<string, { chrome: HTMLElement; dragBar: HTMLElement; resizeHandle: HTMLElement }>();
  private hostRoot: HTMLDivElement;
  private style: HTMLStyleElement;
  private mode: CanvasMode = "pen";
  private selectedId: string | null = null;

  constructor(private opts: ObjectMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;";
    this.style = document.createElement("style");
    this.style.textContent = `
      .drawva-object-shell {
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        border: 2px solid transparent !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      .drawva-object-shell:hover,
      .drawva-object-shell[data-selected="true"] {
        border-color: #7c3aed !important;
        box-shadow: 0 4px 16px rgba(124,58,237,0.12) !important;
      }
      .drawva-object-shell:hover .drawva-object-chrome,
      .drawva-object-shell[data-selected="true"] .drawva-object-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-shell:hover .drawva-object-resize,
      .drawva-object-shell[data-selected="true"] .drawva-object-resize {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-btn {
        transition: transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
      }
      .drawva-object-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 14px rgba(0,0,0,0.18) !important;
      }
      .drawva-object-btn:active {
        transform: scale(0.95);
      }
      .drawva-object-drag:hover {
        transform: translateX(-50%) scale(1.06) !important;
        box-shadow: 0 4px 14px rgba(37,99,235,0.2) !important;
      }
      .drawva-object-resize:hover {
        transform: scale(1.15) !important;
        box-shadow: 0 4px 14px rgba(217,119,6,0.25) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
  }

  add(item: ObjectItem): void {
    this.items.set(item.id, item);
    this.mount(item);
    this.position(item);
  }

  remove(id: string): void {
    this.unmount(id);
    this.items.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): ObjectItem | null {
    return this.items.get(id) ?? null;
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    const prev = this.selectedId;
    this.selectedId = id;
    if (prev) this.applyMode(prev);
    if (id) this.applyMode(id);
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    for (const id of this.toolbars.keys()) this.applyMode(id);
  }

  private applyMode(id: string): void {
    const tb = this.toolbars.get(id);
    if (!tb) return;
    const { chrome, dragBar, resizeHandle } = tb;
    const shell = this.shells.get(id);
    const hand = this.mode === "hand";
    const select = this.mode === "select";
    const isSelected = this.selectedId === id;
    const isHovered = shell?.dataset.hovered === "true";
    const active = isSelected || isHovered;
    // Live objects are always interactive in hand/select mode (Penecho parity).
    this.hostRoot.style.zIndex = active || hand || select ? "40" : "1";
    if (shell) {
      shell.dataset.selected = isSelected ? "true" : "false";
      shell.style.pointerEvents = active || hand || select ? "auto" : "none";
      shell.style.cursor = hand || select ? "grab" : "default";
      shell.style.borderColor = active ? "#7c3aed" : "transparent";
      shell.style.borderStyle = active ? "dashed" : "solid";
      shell.style.borderWidth = "2px";
    }
    if (chrome) chrome.style.display = active ? "flex" : "none";
    if (dragBar) dragBar.style.display = active ? "inline-flex" : "none";
    if (resizeHandle) resizeHandle.style.display = active ? "inline-flex" : "none";
  }

  all(): ObjectItem[] {
    return [...this.items.values()];
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.selectedId = null;
  }

  destroy(): void {
    this.clear();
    this.hostRoot.remove();
    this.style.remove();
  }

  sync(): void {
    for (const item of this.items.values()) this.position(item);
  }

  hitTest(point: Point): ObjectItem | null {
    let hit: ObjectItem | null = null;
    for (const i of this.items.values()) {
      if (point.x >= i.x && point.x <= i.x + i.w && point.y >= i.y && point.y <= i.y + i.h) hit = i;
    }
    return hit;
  }

  move(id: string, dx: number, dy: number): void {
    const i = this.items.get(id);
    if (!i) return;
    i.x = Math.max(0, Math.min(SIZE - i.w, i.x + dx));
    i.y = Math.max(0, Math.min(SIZE - i.h, i.y + dy));
    this.position(i);
  }

  resize(id: string, newW: number, newH: number): void {
    const i = this.items.get(id);
    if (!i) return;
    const min = minimumObjectSize(i.kind);
    i.w = Math.max(min.w, Math.min(SIZE - i.x, Math.round(newW)));
    i.h = Math.max(min.h, Math.min(SIZE - i.y, Math.round(newH)));
    this.position(i);
  }

  private mount(item: ObjectItem): void {
    if (this.shells.has(item.id)) return;

    const shell = document.createElement("section");
    shell.dataset.objectId = item.id;
    shell.dataset.selected = "false";
    shell.dataset.hovered = "false";
    shell.className = "drawva-object-shell";
    shell.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;contain:layout style;background:transparent;border:2px solid transparent;border-radius:8px;box-shadow:none;padding:0;overflow:visible;display:flex;flex-direction:column;user-select:none;";

    const body = document.createElement("div");
    body.className = "drawva-object-body";
    body.style.cssText =
      "width:100%;height:100%;flex:1;position:relative;border-radius:6px;overflow:hidden;";

    const img = document.createElement("img");
    img.draggable = false;
    img.style.cssText =
      "width:100%;height:100%;border:0;display:block;pointer-events:none;object-fit:fill;";
    img.alt = "";
    if (item.image) img.src = item.image.toDataURL();

    body.append(img);

    const chrome = document.createElement("div");
    chrome.className = "drawva-object-chrome";
    chrome.style.cssText =
      "position:absolute;left:0;right:0;top:-18px;height:34px;display:none;align-items:center;justify-content:space-between;padding:0 4px;z-index:10;pointer-events:none;";

    const dragBar = document.createElement("div");
    dragBar.className = "drawva-object-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${item.kind}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);height:32px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;cursor:grab;background:#ffffff;border:1.5px solid #93c5fd;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.12);pointer-events:auto;user-select:none;transition:transform 0.12s ease;";

    const rightGroup = document.createElement("div");
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "drawva-object-btn";
    copyBtn.innerHTML = COPY_SVG;
    copyBtn.title = "Copy source";
    copyBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #93c5fd;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    copyBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard?.writeText(item.source);
    });

    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.className = "drawva-object-btn";
    mergeBtn.innerHTML = MERGE_SVG;
    mergeBtn.title = "Merge to ink (erasable)";
    mergeBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #ddd6fe;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    mergeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    mergeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onMerge?.(item.id);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "drawva-object-btn drawva-object-remove";
    removeBtn.innerHTML = REMOVE_SVG;
    removeBtn.title = "Remove";
    removeBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #fca5a5;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onRemove?.(item.id);
    });

    rightGroup.append(copyBtn, mergeBtn, removeBtn);
    chrome.append(dragBar, rightGroup);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "drawva-object-resize";
    resizeHandle.innerHTML = RESIZE_SVG;
    resizeHandle.title = "Resize";
    resizeHandle.style.cssText =
      "position:absolute;right:-12px;bottom:-12px;width:28px;height:28px;cursor:nwse-resize;z-index:10;display:none;align-items:center;justify-content:center;background:#ffffff;border:1.5px solid #fcd34d;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.14);pointer-events:auto;user-select:none;transition:transform 0.12s ease;";

    shell.append(body, chrome, resizeHandle);

    shell.addEventListener("pointerenter", () => {
      shell.dataset.hovered = "true";
      this.applyMode(item.id);
    });
    shell.addEventListener("pointerleave", () => {
      shell.dataset.hovered = "false";
      this.applyMode(item.id);
    });
    shell.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".drawva-object-btn") && !target?.closest(".drawva-object-resize")) {
        this.setSelected(item.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(item.id, e);
    };
    const beginResize = (e: PointerEvent) => {
      resizeHandle.setPointerCapture?.(e.pointerId);
      cb.onResizeStart?.(item.id, e);
    };
    dragBar.addEventListener("pointerdown", beginDrag);
    resizeHandle.addEventListener("pointerdown", beginResize);
    window.addEventListener("pointermove", (e) => {
      cb.onDragMove?.(item.id, e);
      cb.onResizeMove?.(item.id, e);
    });
    window.addEventListener("pointerup", (e) => {
      cb.onDragEnd?.(item.id);
      cb.onResizeEnd?.(item.id);
      void e;
    });

    this.hostRoot.append(shell);
    this.shells.set(item.id, shell);
    this.toolbars.set(item.id, { chrome, dragBar, resizeHandle });
    this.applyMode(item.id);
  }

  private unmount(id: string): void {
    this.shells.get(id)?.remove();
    this.shells.delete(id);
    this.toolbars.delete(id);
  }

  private position(item: ObjectItem): void {
    const shell = this.shells.get(item.id);
    if (!shell) return;
    const cam = this.opts.camera;
    const rect = this.opts.engineContainer.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;
    const relativeX = cam.panX + item.x * cam.scale;
    const relativeY = cam.panY + item.y * cam.scale;
    const scaleX = (cam.scale * item.w) / item.contentW;
    const scaleY = (cam.scale * item.h) / item.contentH;

    shell.style.width = `${item.contentW}px`;
    shell.style.height = `${item.contentH}px`;
    shell.style.transform = `translate3d(${relativeX}px,${relativeY}px,0) scale(${scaleX},${scaleY})`;

    const offscreen =
      relativeX > viewportW ||
      relativeY > viewportH ||
      relativeX + item.w * cam.scale < 0 ||
      relativeY + item.h * cam.scale < 0;
    shell.style.visibility = offscreen ? "hidden" : "visible";
    this.applyMode(item.id);
  }
}