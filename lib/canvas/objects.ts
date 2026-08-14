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
  onSelect?: (id: string) => void;
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

// Chrome icons (matching widget shell glyph set).
const REMOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M12.75,22.75 C6.813,22.75 2,17.937 2,12 C2,6.063 6.813,1.25 12.75,1.25 C18.687,1.25 23.5,6.063 23.5,12 C23.5,17.937 18.687,22.75 12.75,22.75 Z M3.5,12 C3.5,17.109 7.641,21.25 12.75,21.25 C17.859,21.25 21.25,17.1 21.25,12 C21.25,6.9 17.1,2.75 12,2.75 C6.9,2.75 2.75,6.9 2.75,12 Z M9.757,15.385 C9.071,14.239 7.642,13.409 7.628,13.401 C7.269,13.195 7.145,12.737 7.35,12.378 C7.556,12.019 8.013,11.894 8.372,12.099 C8.426,12.13 9.405,12.695 10.266,13.605 C11.18,11.911 13.156,8.701 15.641,7.342 C16.004,7.143 16.46,7.277 16.659,7.64 C16.858,8.003 16.724,8.459 16.361,8.658 C13.42,10.266 11.106,15.262 11.083,15.312 C10.967,15.565 10.72,15.733 10.442,15.749 C10.435,15.749 10.428,15.749 10.421,15.75 C10.414,15.75 10.407,15.75 10.401,15.75 L10.4,15.75 C10.137,15.75 9.892,15.612 9.757,15.385 Z"></path></svg>`;
const DRAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M12.25 3.25C13.2174 3.25 14.0541 3.80066 14.4697 4.60449C14.8444 4.38042 15.2817 4.25 15.75 4.25C17.0349 4.25 18.0917 5.21952 18.2324 6.4668C18.5434 6.328 18.8875 6.25 19.25 6.25C20.6307 6.25 21.75 7.36929 21.75 8.75V12.7998C21.75 17.1905 18.1905 20.75 13.7998 20.75H10.0586C5.74608 20.7499 2.25012 17.2539 2.25 12.9414V12C2.25 10.4812 3.48122 9.25 5 9.25C5.45058 9.25 5.87468 9.36065 6.25 9.55273V6.75C6.25 5.36929 7.36929 4.25 8.75 4.25C9.21802 4.25 9.65476 4.38069 10.0293 4.60449C10.4449 3.80044 11.2825 3.25 12.25 3.25ZM12.25 4.75C11.6977 4.75 11.25 5.19772 11.25 5.75V8C11.25 8.41421 10.9142 8.75 10.5 8.75C10.0858 8.75 9.75 8.41421 9.75 8V6.75C9.75 6.19772 9.30228 5.75 8.75 5.75C8.19772 5.75 7.75 6.19772 7.75 6.75V12.9414C7.74988 13.3555 7.41414 13.6914 7 13.6914C6.58586 13.6914 6.25012 13.3555 6.25 12.9414V12C6.25 11.3096 5.69036 10.75 5 10.75C4.30964 10.75 3.75 11.3096 3.75 12V12.9414C3.75012 16.4255 6.57451 19.2499 10.0586 19.25H13.7998C17.362 19.25 20.25 16.362 20.25 12.7998V8.75C20.25 8.19772 19.8023 7.75 19.25 7.75C18.6977 7.75 18.25 8.19772 18.25 8.75V9.5C18.25 9.91421 17.9142 10.25 17.5 10.25C17.0858 10.25 16.75 9.91421 16.75 9.5V6.75C16.75 6.19772 16.3023 5.75 15.75 5.75C15.1977 5.75 14.75 6.19772 14.75 6.75V8.5C14.75 8.91421 14.4142 9.25 14 9.25C13.5858 9.25 13.25 8.91421 13.25 8.5V5.75C13.25 5.19772 12.8023 4.75 12.25 4.75Z" fill="currentColor"></path></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M3 5.25C3.41421 5.25 3.75 5.58579 3.75 6V15C3.75 16.6709 3.75128 17.8488 3.87109 18.7402C3.98805 19.6102 4.20568 20.0943 4.55566 20.4443C4.90565 20.7943 5.38983 21.0119 6.25977 21.1289C7.15123 21.2487 8.32908 21.25 10 21.25H17C17.4142 21.25 17.75 21.5858 17.75 22C17.75 22.4142 17.4142 22.75 17 22.75H10C8.37129 22.75 7.07426 22.7517 6.05957 22.6152C5.02332 22.4759 4.17025 22.18 3.49512 21.5049C2.81999 20.8298 2.52409 19.9767 2.38477 18.9404C2.24834 17.9257 2.25 16.6287 2.25 15V6C2.25 5.58579 2.58579 5.25 3 5.25ZM14 1.25C15.6287 1.25 16.9257 1.24834 17.9404 1.38477C18.9767 1.52409 19.8298 1.81999 20.5049 2.49512C21.18 3.17025 21.4759 4.02332 21.6152 5.05957C21.7517 6.07426 21.75 7.37129 21.75 9V11C21.75 12.6287 21.7517 13.9257 21.6152 14.9404C21.4759 15.9767 21.18 16.8298 20.5049 17.5049C19.8298 18.18 18.9767 18.4759 17.9404 18.6152C16.9257 18.7517 15.6287 18.75 14 18.75C12.3713 18.75 11.0743 18.7517 10.0596 18.6152C9.02332 18.4759 8.17025 18.18 7.49512 17.5049C6.81998 16.8298 6.52409 15.9767 6.38477 14.9404C6.24834 13.9257 6.25 12.6287 6.25 11V9C6.25 7.37129 6.24834 6.07426 6.38477 5.05957C6.52409 4.02332 6.81998 3.17025 7.49512 2.49512C8.17025 1.81998 9.02332 1.52409 10.0596 1.38477C11.0743 1.24834 12.3713 1.25 14 1.25ZM14 2.75C12.3291 2.75 11.1512 2.75128 10.2598 2.87109C9.38983 2.98805 8.90565 3.20568 8.55566 3.55566C8.20568 3.90565 7.98805 4.38983 7.87109 5.25977C7.75128 6.15123 7.75 7.32908 7.75 9V11C7.75 12.6709 7.75128 13.8488 7.87109 14.7402C7.98805 15.6102 8.20568 16.0943 8.55566 16.4443C8.90565 16.7943 9.38983 17.0119 10.2598 17.1289C11.1512 17.2487 12.3291 17.25 14 17.25C15.6709 17.25 16.8488 17.2487 17.7402 17.1289C18.6102 17.0119 19.0943 16.7943 19.4443 16.4443C19.7943 16.0943 20.0119 15.6102 20.1289 14.7402C20.2487 13.8488 20.25 12.6709 20.25 11V9C20.25 7.32908 20.2487 6.15123 20.1289 5.25977C20.0119 4.38983 19.7943 3.90565 19.4443 3.55566C19.0943 3.20568 18.6102 2.98805 17.7402 2.87109C16.8488 2.75128 15.6709 2.75 14 2.75Z" fill="currentColor"></path></svg>`;
const RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M16.435 18.7485C16.245 18.7485 16.055 18.6785 15.905 18.5285C15.615 18.2385 15.615 17.7585 15.905 17.4685L17.905 15.4685C18.195 15.1785 18.675 15.1785 18.965 15.4685C19.255 15.7585 19.255 16.2385 18.965 16.5285L16.965 18.5285C16.815 18.6785 16.625 18.7485 16.435 18.7485ZM11.435 18.7485C11.245 18.7485 11.055 18.6785 10.905 18.5285C10.615 18.2385 10.615 17.7585 10.905 17.4685L17.905 10.4685C18.195 10.1785 18.675 10.1785 18.965 10.4685C19.255 10.7585 19.255 11.2385 18.965 11.5285L11.965 18.5285C11.815 18.6785 11.625 18.7485 11.435 18.7485ZM6.435 18.7485C6.245 18.7485 6.055 18.6785 5.905 18.5285C5.615 18.2385 5.615 17.7585 5.905 17.4685L17.905 5.46848C18.195 5.17848 18.675 5.17848 18.965 5.46848C19.255 5.75848 19.255 6.23848 18.965 6.52848L6.965 18.5285C6.815 18.6785 6.625 18.7485 6.435 18.7485Z" fill="currentColor"></path></svg>`;
const MERGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M12 3l-4 4M12 3l4 4"/><path d="M4 21h16"/></svg>`;

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
  private mode: CanvasMode = "hand";
  private selectedId: string | null = null;

  constructor(private opts: ObjectMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.className = "drawva-object-host";
    this.hostRoot.dataset.mode = this.mode;
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
      .drawva-object-host:not([data-mode="hand"]) > .drawva-object-shell:hover,
      .drawva-object-shell[data-selected="true"] {
        border-color: var(--primary) !important;
        border-style: dotted !important;
        box-shadow: none !important;
      }
      .drawva-object-host:not([data-mode="hand"]) > .drawva-object-shell:hover .drawva-object-chrome,
      .drawva-object-shell[data-selected="true"] .drawva-object-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-host:not([data-mode="hand"]) > .drawva-object-shell:hover .drawva-object-resize,
      .drawva-object-shell[data-selected="true"] .drawva-object-resize {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-btn,
      .drawva-object-drag,
      .drawva-object-resize {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        color: #0f172a;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, transform 0.15s ease;
        cursor: pointer;
        padding: 0 !important;
        margin: 0 !important;
      }
      :is(.dark *) .drawva-object-btn,
      :is(.dark *) .drawva-object-drag,
      :is(.dark *) .drawva-object-resize {
        color: #f8fafc;
      }
      .drawva-object-btn:hover,
      .drawva-object-drag:hover,
      .drawva-object-resize:hover {
        color: var(--primary) !important;
        background: transparent !important;
        transform: scale(1.15) !important;
      }
      .drawva-object-btn:active,
      .drawva-object-drag:active,
      .drawva-object-resize:active {
        transform: scale(0.95) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
  }

  add(item: ObjectItem): void {
    if (this.shells.has(item.id)) {
      this.unmount(item.id);
    }
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
    if (id) {
      this.applyMode(id);
      (this.opts.callbacks ?? {}).onSelect?.(id);
    }
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    this.hostRoot.dataset.mode = mode;
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
    const isHovered = !hand && shell?.dataset.hovered === "true";
    const active = isSelected || isHovered;
    // Live objects are always interactive in hand/select mode (Penecho parity).
    this.hostRoot.style.zIndex = active || hand || select ? "40" : "1";
    if (shell) {
      shell.dataset.selected = isSelected ? "true" : "false";
      shell.style.pointerEvents = active || hand || select ? "auto" : "none";
      shell.style.cursor = hand || select ? "grab" : "default";
      shell.style.borderColor = active ? "var(--primary)" : "transparent";
      shell.style.borderStyle = active ? "dotted" : "none";
      shell.style.borderWidth = "2px";
      shell.style.boxShadow = "none";
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
      "position:absolute;left:0;right:0;top:-30px;height:24px;display:none;align-items:center;justify-content:space-between;padding:0 2px;z-index:10;pointer-events:none;";

    const dragBar = document.createElement("div");
    dragBar.className = "drawva-object-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${item.kind}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:grab;background:transparent;border:none;pointer-events:auto;user-select:none;";

    const rightGroup = document.createElement("div");
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "drawva-object-btn";
    copyBtn.innerHTML = COPY_SVG;
    copyBtn.title = "Copy source";
    copyBtn.style.cssText =
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
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
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
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
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
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
      "position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;cursor:nwse-resize;z-index:10;display:none;align-items:center;justify-content:center;background:transparent;border:none;pointer-events:auto;user-select:none;";

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
        e.stopPropagation();
        this.setSelected(item.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      e.stopPropagation();
      this.setSelected(item.id);
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(item.id, e);
    };
    const beginResize = (e: PointerEvent) => {
      e.stopPropagation();
      this.setSelected(item.id);
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