import { Camera } from "./camera";
import { SIZE } from "./constants";
import type { CanvasMode, Point } from "./types";

export type WidgetKind = "html" | "diagram";
export type WidgetStatus = "draft" | "accepted";

export interface WidgetItem {
  id: string;
  kind: WidgetKind;
  pluginId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  contentW: number;
  contentH: number;
  title: string;
  html: string;
  copyText?: string;
  copyLabel?: string;
  status: WidgetStatus;
}

export interface WidgetCallbacks {
  onDragStart?: (id: string, e: PointerEvent) => void;
  onDragMove?: (id: string, e: PointerEvent) => void;
  onDragEnd?: (id: string) => void;
  onResizeStart?: (id: string, e: PointerEvent) => void;
  onResizeMove?: (id: string, e: PointerEvent) => void;
  onResizeEnd?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAccept?: (id: string) => void;
  onAiRefine?: (id: string) => void;
}

export interface WidgetMountOptions {
  engineContainer: HTMLElement;
  camera: Camera;
  hostUrl?: string;
  callbacks?: WidgetCallbacks;
}

const WIDGET_HOST_URL = "/widget-host.html";

// SVG Icon Definitions for drawva-widget-shell controls
const ACCEPT_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const DRAG_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
const REMOVE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const COPY_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const RESIZE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"><polygon points="12 2 22 12 12 22 2 12"/></svg>`;

/**
 * DOM lifecycle + screen positioning for sandboxed widget iframes.
 * Represents drawva-widget-shell: an outer dashed shell container wrapping
 * an inner iframe plugin box with 12px inset padding, floating top SVG action
 * controls, and bottom-right corner resize handles.
 */
export class WidgetManager {
  private widgets = new Map<string, WidgetItem>();
  private shells = new Map<string, HTMLElement>();
  private toolbars = new Map<
    string,
    {
      chrome: HTMLElement;
      dragBar: HTMLElement;
      resizeHandle: HTMLElement;
      refine: HTMLElement;
      overlay: HTMLElement;
      acceptBtn: HTMLElement;
    }
  >();
  private hostRoot: HTMLDivElement;
  private style: HTMLStyleElement;
  private mode: CanvasMode = "pen";
  private selectedId: string | null = null;

  constructor(private opts: WidgetMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;";
    this.style = document.createElement("style");
    this.style.textContent = `
      .drawva-widget-shell {
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .drawva-widget-shell:hover,
      .drawva-widget-shell[data-selected="true"] {
        border-color: #3b82f6 !important;
        box-shadow: 0 8px 28px rgba(37,99,235,0.18) !important;
      }
      .drawva-widget-shell:hover .drawva-widget-chrome,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell:hover .drawva-widget-resize,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-resize {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell[data-status="draft"] iframe {
        filter: grayscale(0.15) brightness(0.98);
      }
      .drawva-widget-shell[data-status="draft"] .drawva-widget-draft-overlay {
        display: block !important;
      }
      .drawva-widget-btn {
        transition: transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
      }
      .drawva-widget-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 14px rgba(0,0,0,0.18) !important;
      }
      .drawva-widget-btn:active {
        transform: scale(0.95);
      }
      .drawva-widget-drag:hover {
        transform: translateX(-50%) scale(1.06) !important;
        box-shadow: 0 4px 14px rgba(37,99,235,0.2) !important;
      }
      .drawva-widget-resize:hover {
        transform: scale(1.15) !important;
        box-shadow: 0 4px 14px rgba(217,119,6,0.25) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
  }

  add(widget: WidgetItem): void {
    this.widgets.set(widget.id, widget);
    this.mount(widget);
    this.position(widget);
  }

  remove(id: string): void {
    this.unmount(id);
    this.widgets.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  has(id: string): boolean {
    return this.widgets.has(id);
  }

  get(id: string): WidgetItem | null {
    return this.widgets.get(id) ?? null;
  }

  getShell(id: string): HTMLElement | null {
    return this.shells.get(id) ?? null;
  }

  getToolbars(id: string) {
    return this.toolbars.get(id) ?? null;
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

  setStatus(id: string, status: WidgetStatus): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.status = status;
    const shell = this.shells.get(id);
    if (shell) shell.dataset.status = status;
    const tb = this.toolbars.get(id);
    if (tb?.overlay) tb.overlay.style.display = status === "draft" ? "block" : "none";
    this.applyMode(id);
  }

  /** Match PenEcho's input model: widgets are interactive in hand/select mode or when active/hovered. */
  setMode(mode: CanvasMode): void {
    this.mode = mode;
    for (const id of this.toolbars.keys()) this.applyMode(id);
  }

  private applyMode(id: string): void {
    const tb = this.toolbars.get(id);
    if (!tb) return;
    const { chrome, dragBar, resizeHandle, refine, overlay, acceptBtn } = tb;
    const shell = this.shells.get(id);
    const hand = this.mode === "hand";
    const select = this.mode === "select";
    const isSelected = this.selectedId === id;
    const isHovered = shell?.dataset.hovered === "true";
    const widget = this.widgets.get(id);
    const isDraft = widget?.status === "draft";
    // Active ONLY when in draft state, hovered, or selected
    const active = isDraft || isSelected || isHovered;
    const frame = shell?.querySelector("iframe") as HTMLIFrameElement | null;

    this.hostRoot.style.zIndex = active || hand || select ? "40" : "1";

    if (shell) {
      shell.dataset.selected = isSelected ? "true" : "false";
      shell.style.pointerEvents = active || hand || select ? "auto" : "none";
      shell.style.cursor = hand || select ? "grab" : "default";
      shell.style.borderColor = isDraft
        ? "#3b82f6"
        : active
        ? "#2563eb"
        : "transparent";
      shell.style.borderStyle = active ? "dashed" : "solid";
      shell.style.borderWidth = "2px";
      shell.style.boxShadow = active
        ? isSelected || isHovered
          ? "0 8px 28px rgba(37,99,235,0.18)"
          : "0 8px 24px rgba(0,0,0,0.12)"
        : "none";
    }

    if (frame) {
      frame.style.pointerEvents = active || hand || select ? "auto" : "none";
    }

    if (chrome) {
      chrome.style.display = active ? "flex" : "none";
    }
    if (dragBar) {
      dragBar.style.display = active ? "inline-flex" : "none";
    }
    if (acceptBtn) {
      // RULE: Accept button ONLY shows on initial generation (draft status)
      acceptBtn.style.display = isDraft && active ? "inline-flex" : "none";
    }
    if (resizeHandle) {
      resizeHandle.style.display = active ? "inline-flex" : "none";
    }
    if (refine) {
      refine.style.display = active ? "inline-flex" : "none";
    }
    if (overlay) {
      overlay.style.display = isDraft ? "block" : "none";
    }
  }

  all(): WidgetItem[] {
    return [...this.widgets.values()];
  }

  clear(): void {
    for (const id of [...this.widgets.keys()]) this.remove(id);
    this.selectedId = null;
  }

  destroy(): void {
    this.clear();
    this.hostRoot.remove();
    this.style.remove();
  }

  sync(): void {
    for (const widget of this.widgets.values()) this.position(widget);
  }

  hitTest(point: Point): WidgetItem | null {
    let hit: WidgetItem | null = null;
    for (const w of this.widgets.values()) {
      if (point.x >= w.x && point.x <= w.x + w.w && point.y >= w.y && point.y <= w.y + w.h) hit = w;
    }
    return hit;
  }

  move(id: string, dx: number, dy: number): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.x = Math.max(0, Math.min(SIZE - w.w, w.x + dx));
    w.y = Math.max(0, Math.min(SIZE - w.h, w.y + dy));
    this.position(w);
  }

  resize(id: string, newW: number, newH: number): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.w = Math.max(300, Math.min(SIZE - w.x, Math.round(newW)));
    w.h = Math.max(200, Math.min(SIZE - w.y, Math.round(newH)));
    this.position(w);
  }

  private mount(widget: WidgetItem): void {
    if (this.shells.has(widget.id)) return;

    // ---- Outer dashed shell section with 12px inset padding ----
    const shell = document.createElement("section");
    shell.dataset.widgetId = widget.id;
    shell.dataset.status = widget.status;
    shell.dataset.selected = "false";
    shell.dataset.hovered = "false";
    shell.className = "drawva-widget-shell";
    shell.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;contain:layout style;background:transparent;border:2px dashed #3b82f6;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:12px;overflow:visible;display:flex;flex-direction:column;";

    // ---- Inner plugin body wrapper ----
    const body = document.createElement("div");
    body.className = "drawva-widget-body";
    body.style.cssText =
      "width:100%;height:100%;flex:1;position:relative;border-radius:8px;overflow:hidden;background:transparent;";

    const frame = document.createElement("iframe");
    frame.style.cssText =
      "width:100%;height:100%;border:0;display:block;background:transparent;";
    frame.referrerPolicy = "no-referrer";
    frame.title = widget.title;

    let initSent = false;
    const sendInit = (targetWindow: Window | null, origin?: string) => {
      if (initSent || !targetWindow) return;
      initSent = true;
      const target = typeof origin === "string" && origin !== "null" ? origin : location.origin;
      targetWindow.postMessage(
        { type: "penecho-widget-init", title: widget.title, html: widget.html },
        target
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "penecho-widget-host-ready") {
        sendInit(frame.contentWindow, event.origin);
      } else if (event.data?.type === "drawva-widget-resize-content") {
        const { width, height } = event.data;
        if (typeof width === "number" && typeof height === "number") {
          const w = this.widgets.get(widget.id);
          if (w) {
            const shellW = Math.min(900, Math.max(220, Math.round(width + 24)));
            const shellH = Math.min(700, Math.max(140, Math.round(height + 24)));
            if (Math.abs(w.w - shellW) > 6 || Math.abs(w.h - shellH) > 6) {
              w.w = shellW;
              w.h = shellH;
              w.contentW = shellW;
              w.contentH = shellH;
              this.position(w);
            }
          }
        }
      }
    };
    window.addEventListener("message", onMessage);

    frame.onload = () => {
      setTimeout(() => sendInit(frame.contentWindow), 50);
    };

    frame.src = `${WIDGET_HOST_URL}?parent-origin=${encodeURIComponent(location.origin)}`;

    // ---- Draft overlay (dim shimmer so the widget reads as "pending") ----
    const overlay = document.createElement("div");
    overlay.className = "drawva-widget-draft-overlay";
    overlay.style.cssText =
      "position:absolute;inset:0;display:none;pointer-events:none;background:repeating-linear-gradient(45deg,rgba(59,130,246,0.03) 0 8px,transparent 8px 16px);border-radius:inherit;";

    body.append(frame, overlay);

    // ---- Top Action Chrome (Floating controls positioned along top border) ----
    const chrome = document.createElement("div");
    chrome.className = "drawva-widget-chrome";
    chrome.style.cssText =
      "position:absolute;left:0;right:0;top:-18px;height:34px;display:none;align-items:center;justify-content:space-between;padding:0 4px;z-index:10;pointer-events:none;";

    // Top-Left: Accept Button (ONLY renders on initial draft generation)
    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "drawva-widget-btn drawva-widget-accept";
    acceptBtn.innerHTML = ACCEPT_SVG;
    acceptBtn.title = "Accept & keep widget";
    acceptBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #86efac;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    acceptBtn.style.display = widget.status === "draft" ? "inline-flex" : "none";
    acceptBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    acceptBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onAccept?.(widget.id);
    });

    // Top-Center: Drag / Move Handle (Hand SVG)
    const dragBar = document.createElement("div");
    dragBar.className = "drawva-widget-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${widget.title}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);height:32px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;cursor:grab;background:#ffffff;border:1.5px solid #93c5fd;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.12);pointer-events:auto;user-select:none;transition:transform 0.12s ease;";

    // Top-Right Group: Copy + Remove / Reject Button
    const rightGroup = document.createElement("div");
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "drawva-widget-btn";
    copyBtn.innerHTML = COPY_SVG;
    copyBtn.title = widget.copyLabel ? `Copy ${widget.copyLabel}` : "Copy source code";
    copyBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #93c5fd;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    copyBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard?.writeText(widget.copyText || widget.html);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "drawva-widget-btn drawva-widget-remove";
    closeBtn.innerHTML = REMOVE_SVG;
    closeBtn.title = "Remove widget";
    closeBtn.style.cssText =
      "width:32px;height:32px;border-radius:50%;background:#ffffff;border:1.5px solid #fca5a5;box-shadow:0 4px 12px rgba(0,0,0,0.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onRemove?.(widget.id);
    });

    rightGroup.append(copyBtn, closeBtn);
    chrome.append(acceptBtn, dragBar, rightGroup);

    // ---- AI Refine pill ----
    const refine = document.createElement("button");
    refine.type = "button";
    refine.textContent = "✦ AI Refine";
    refine.title = "Re-run AI on the marks near this widget";
    refine.style.cssText =
      "position:absolute;right:0;top:100%;margin-top:12px;height:30px;padding:0 12px;border:1px solid rgba(124,58,237,0.45);border-radius:15px;background:#ffffff;color:#7c3aed;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.10);font:700 11px/1 system-ui;display:none;align-items:center;gap:6px;z-index:4;";
    refine.addEventListener("pointerdown", (e) => e.stopPropagation());
    refine.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onAiRefine?.(widget.id);
    });

    // ---- Bottom-Right Resizable handle (Diamond SVG) ----
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "drawva-widget-resize";
    resizeHandle.innerHTML = RESIZE_SVG;
    resizeHandle.title = "Resize widget";
    resizeHandle.style.cssText =
      "position:absolute;right:-12px;bottom:-12px;width:28px;height:28px;cursor:nwse-resize;z-index:10;display:none;align-items:center;justify-content:center;background:#ffffff;border:1.5px solid #fcd34d;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.14);pointer-events:auto;user-select:none;transition:transform 0.12s ease;";

    shell.append(body, chrome, resizeHandle, refine);

    // ---- Hover & Pointer selection listeners ----
    shell.addEventListener("pointerenter", () => {
      shell.dataset.hovered = "true";
      this.applyMode(widget.id);
    });
    shell.addEventListener("pointerleave", () => {
      shell.dataset.hovered = "false";
      this.applyMode(widget.id);
    });
    shell.addEventListener("pointerdown", (e) => {
      // Don't intercept if clicking action buttons or resize handle
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".drawva-widget-btn") && !target?.closest(".drawva-widget-resize")) {
        this.setSelected(widget.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(widget.id, e);
    };
    const beginResize = (e: PointerEvent) => {
      resizeHandle.setPointerCapture?.(e.pointerId);
      cb.onResizeStart?.(widget.id, e);
    };
    dragBar.addEventListener("pointerdown", beginDrag);
    resizeHandle.addEventListener("pointerdown", beginResize);
    window.addEventListener("pointermove", (e) => {
      cb.onDragMove?.(widget.id, e);
      cb.onResizeMove?.(widget.id, e);
    });
    window.addEventListener("pointerup", (e) => {
      cb.onDragEnd?.(widget.id);
      cb.onResizeEnd?.(widget.id);
      void e;
    });

    this.hostRoot.append(shell);
    this.shells.set(widget.id, shell);
    this.toolbars.set(widget.id, { chrome, dragBar, resizeHandle, refine, overlay, acceptBtn });
    this.applyMode(widget.id);
  }

  private unmount(id: string): void {
    this.shells.get(id)?.remove();
    this.shells.delete(id);
    this.toolbars.delete(id);
  }

  private position(widget: WidgetItem): void {
    const shell = this.shells.get(widget.id);
    if (!shell) return;
    const cam = this.opts.camera;
    const rect = this.opts.engineContainer.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;
    const relativeX = cam.panX + widget.x * cam.scale;
    const relativeY = cam.panY + widget.y * cam.scale;
    const scaleX = (cam.scale * widget.w) / widget.contentW;
    const scaleY = (cam.scale * widget.h) / widget.contentH;

    shell.style.width = `${widget.contentW}px`;
    shell.style.height = `${widget.contentH}px`;
    shell.style.transform = `translate3d(${relativeX}px,${relativeY}px,0) scale(${scaleX},${scaleY})`;

    const offscreen =
      relativeX > viewportW ||
      relativeY > viewportH ||
      relativeX + widget.w * cam.scale < 0 ||
      relativeY + widget.h * cam.scale < 0;
    shell.style.visibility = offscreen ? "hidden" : "visible";
    this.applyMode(widget.id);
  }
}

export { WIDGET_HOST_URL };
