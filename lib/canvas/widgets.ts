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
  userResized?: boolean;
  cachedImage?: HTMLImageElement | HTMLCanvasElement;
}

export interface WidgetCallbacks {
  onSelect?: (id: string) => void;
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

const ACCEPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M1.25,12 C1.25,6.072 6.072,1.25 12,1.25 C17.928,1.25 22.75,6.072 22.75,12 C22.75,17.928 17.928,22.75 12,22.75 C6.072,22.75 1.25,17.928 1.25,12 Z M2.75,12 C2.75,17.1 6.9,21.25 12,21.25 C17.1,21.25 21.25,17.1 21.25,12 C21.25,6.9 17.1,2.75 12,2.75 C6.9,2.75 2.75,6.9 2.75,12 Z M9.757,15.385 C9.071,14.239 7.642,13.409 7.628,13.401 C7.269,13.195 7.145,12.737 7.35,12.378 C7.556,12.019 8.013,11.894 8.372,12.099 C8.426,12.13 9.405,12.695 10.266,13.605 C11.18,11.911 13.156,8.701 15.641,7.342 C16.004,7.143 16.46,7.277 16.659,7.64 C16.858,8.003 16.724,8.459 16.361,8.658 C13.42,10.266 11.106,15.262 11.083,15.312 C10.967,15.565 10.72,15.733 10.442,15.749 C10.435,15.749 10.428,15.749 10.421,15.75 C10.414,15.75 10.407,15.75 10.401,15.75 L10.4,15.75 C10.137,15.75 9.892,15.612 9.757,15.385 Z"></path></svg>`;
const REMOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M12.75,22.75 C6.813,22.75 2,17.937 2,12 C2,6.063 6.813,1.25 12.75,1.25 C18.687,1.25 23.5,6.063 23.5,12 C23.5,17.937 18.687,22.75 12.75,22.75 Z M3.5,12 C3.5,17.109 7.641,21.25 12.75,21.25 C17.859,21.25 22,17.109 22,12 C22,6.891 17.859,2.75 12.75,2.75 C7.641,2.75 3.5,6.891 3.5,12 Z M10.28,8.47 L12.75,10.94 L15.22,8.47 C15.512,8.177 15.987,8.177 16.28,8.47 C16.573,8.763 16.573,9.237 16.28,9.53 L13.811,12 L16.28,14.47 C16.573,14.763 16.573,15.238 16.28,15.53 C15.987,15.823 15.512,15.823 15.219,15.53 L12.75,13.061 L10.281,15.53 C9.988,15.823 9.513,15.823 9.22,15.53 C8.927,15.238 8.927,14.763 9.22,14.47 L11.689,12 L9.22,9.53 C8.927,9.237 8.927,8.763 9.22,8.47 C9.513,8.177 9.987,8.177 10.28,8.47 Z"></path></svg>`;
const DRAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M12.25 3.25C13.2174 3.25 14.0541 3.80066 14.4697 4.60449C14.8444 4.38042 15.2817 4.25 15.75 4.25C17.0349 4.25 18.0917 5.21952 18.2324 6.4668C18.5434 6.328 18.8875 6.25 19.25 6.25C20.6307 6.25 21.75 7.36929 21.75 8.75V12.7998C21.75 17.1905 18.1905 20.75 13.7998 20.75H10.0586C5.74608 20.7499 2.25012 17.2539 2.25 12.9414V12C2.25 10.4812 3.48122 9.25 5 9.25C5.45058 9.25 5.87468 9.36065 6.25 9.55273V6.75C6.25 5.36929 7.36929 4.25 8.75 4.25C9.21802 4.25 9.65476 4.38069 10.0293 4.60449C10.4449 3.80044 11.2825 3.25 12.25 3.25ZM12.25 4.75C11.6977 4.75 11.25 5.19772 11.25 5.75V8C11.25 8.41421 10.9142 8.75 10.5 8.75C10.0858 8.75 9.75 8.41421 9.75 8V6.75C9.75 6.19772 9.30228 5.75 8.75 5.75C8.19772 5.75 7.75 6.19772 7.75 6.75V12.9414C7.74988 13.3555 7.41414 13.6914 7 13.6914C6.58586 13.6914 6.25012 13.3555 6.25 12.9414V12C6.25 11.3096 5.69036 10.75 5 10.75C4.30964 10.75 3.75 11.3096 3.75 12V12.9414C3.75012 16.4255 6.57451 19.2499 10.0586 19.25H13.7998C17.362 19.25 20.25 16.362 20.25 12.7998V8.75C20.25 8.19772 19.8023 7.75 19.25 7.75C18.6977 7.75 18.25 8.19772 18.25 8.75V9.5C18.25 9.91421 17.9142 10.25 17.5 10.25C17.0858 10.25 16.75 9.91421 16.75 9.5V6.75C16.75 6.19772 16.3023 5.75 15.75 5.75C15.1977 5.75 14.75 6.19772 14.75 6.75V8.5C14.75 8.91421 14.4142 9.25 14 9.25C13.5858 9.25 13.25 8.91421 13.25 8.5V5.75C13.25 5.19772 12.8023 4.75 12.25 4.75Z" fill="currentColor"></path></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M3 5.25C3.41421 5.25 3.75 5.58579 3.75 6V15C3.75 16.6709 3.75128 17.8488 3.87109 18.7402C3.98805 19.6102 4.20568 20.0943 4.55566 20.4443C4.90565 20.7943 5.38983 21.0119 6.25977 21.1289C7.15123 21.2487 8.32908 21.25 10 21.25H17C17.4142 21.25 17.75 21.5858 17.75 22C17.75 22.4142 17.4142 22.75 17 22.75H10C8.37129 22.75 7.07426 22.7517 6.05957 22.6152C5.02332 22.4759 4.17025 22.18 3.49512 21.5049C2.81999 20.8298 2.52409 19.9767 2.38477 18.9404C2.24834 17.9257 2.25 16.6287 2.25 15V6C2.25 5.58579 2.58579 5.25 3 5.25ZM14 1.25C15.6287 1.25 16.9257 1.24834 17.9404 1.38477C18.9767 1.52409 19.8298 1.81999 20.5049 2.49512C21.18 3.17025 21.4759 4.02332 21.6152 5.05957C21.7517 6.07426 21.75 7.37129 21.75 9V11C21.75 12.6287 21.7517 13.9257 21.6152 14.9404C21.4759 15.9767 21.18 16.8298 20.5049 17.5049C19.8298 18.18 18.9767 18.4759 17.9404 18.6152C16.9257 18.7517 15.6287 18.75 14 18.75C12.3713 18.75 11.0743 18.7517 10.0596 18.6152C9.02332 18.4759 8.17025 18.18 7.49512 17.5049C6.81998 16.8298 6.52409 15.9767 6.38477 14.9404C6.24834 13.9257 6.25 12.6287 6.25 11V9C6.25 7.37129 6.24834 6.07426 6.38477 5.05957C6.52409 4.02332 6.81998 3.17025 7.49512 2.49512C8.17025 1.81998 9.02332 1.52409 10.0596 1.38477C11.0743 1.24834 12.3713 1.25 14 1.25ZM14 2.75C12.3291 2.75 11.1512 2.75128 10.2598 2.87109C9.38983 2.98805 8.90565 3.20568 8.55566 3.55566C8.20568 3.90565 7.98805 4.38983 7.87109 5.25977C7.75128 6.15123 7.75 7.32908 7.75 9V11C7.75 12.6709 7.75128 13.8488 7.87109 14.7402C7.98805 15.6102 8.20568 16.0943 8.55566 16.4443C8.90565 16.7943 9.38983 17.0119 10.2598 17.1289C11.1512 17.2487 12.3291 17.25 14 17.25C15.6709 17.25 16.8488 17.2487 17.7402 17.1289C18.6102 17.0119 19.0943 16.7943 19.4443 16.4443C19.7943 16.0943 20.0119 15.6102 20.1289 14.7402C20.2487 13.8488 20.25 12.6709 20.25 11V9C20.25 7.32908 20.2487 6.15123 20.1289 5.25977C20.0119 4.38983 19.7943 3.90565 19.4443 3.55566C19.0943 3.20568 18.6102 2.98805 17.7402 2.87109C16.8488 2.75128 15.6709 2.75 14 2.75Z" fill="currentColor"></path></svg>`;
const RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M16.435 18.7485C16.245 18.7485 16.055 18.6785 15.905 18.5285C15.615 18.2385 15.615 17.7585 15.905 17.4685L17.905 15.4685C18.195 15.1785 18.675 15.1785 18.965 15.4685C19.255 15.7585 19.255 16.2385 18.965 16.5285L16.965 18.5285C16.815 18.6785 16.625 18.7485 16.435 18.7485ZM11.435 18.7485C11.245 18.7485 11.055 18.6785 10.905 18.5285C10.615 18.2385 10.615 17.7585 10.905 17.4685L17.905 10.4685C18.195 10.1785 18.675 10.1785 18.965 10.4685C19.255 10.7585 19.255 11.2385 18.965 11.5285L11.965 18.5285C11.815 18.6785 11.625 18.7485 11.435 18.7485ZM6.435 18.7485C6.245 18.7485 6.055 18.6785 5.905 18.5285C5.615 18.2385 5.615 17.7585 5.905 17.4685L17.905 5.46848C18.195 5.17848 18.675 5.17848 18.965 5.46848C19.255 5.75848 19.255 6.23848 18.965 6.52848L6.965 18.5285C6.815 18.6785 6.625 18.7485 6.435 18.7485Z" fill="currentColor"></path></svg>`;

export class WidgetManager {
  private widgets = new Map<string, WidgetItem>();
  private shells = new Map<string, HTMLElement>();
  private toolbars = new Map<
    string,
    {
      chrome: HTMLElement;
      dragBar: HTMLElement;
      resizeHandle: HTMLElement;
      refine?: HTMLElement;
      overlay: HTMLElement;
      acceptBtn: HTMLElement;
    }
  >();
  private hostRoot: HTMLDivElement;
  private style: HTMLStyleElement;
  private mode: CanvasMode = "hand";
  private selectedId: string | null = null;

  constructor(private opts: WidgetMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.className = "drawva-widget-host";
    this.hostRoot.dataset.mode = this.mode;
    this.hostRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;";
    this.style = document.createElement("style");
    this.style.textContent = `
      .drawva-widget-shell {
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        border: 2px solid transparent !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      .drawva-widget-host:not([data-mode="hand"]) > .drawva-widget-shell:hover,
      .drawva-widget-shell[data-selected="true"],
      .drawva-widget-shell[data-status="draft"] {
        border-color: var(--primary) !important;
        border-style: dotted !important;
        box-shadow: none !important;
      }
      .drawva-widget-host:not([data-mode="hand"]) > .drawva-widget-shell:hover .drawva-widget-chrome,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-chrome,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-host:not([data-mode="hand"]) > .drawva-widget-shell:hover .drawva-widget-resize,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-resize,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-resize {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell[data-status="draft"] iframe {
        filter: grayscale(0.15) brightness(0.98);
      }
      .drawva-widget-shell[data-status="draft"] .drawva-widget-draft-overlay {
        display: block !important;
      }
      .drawva-widget-btn,
      .drawva-widget-drag,
      .drawva-widget-resize {
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
      :is(.dark *) .drawva-widget-btn,
      :is(.dark *) .drawva-widget-drag,
      :is(.dark *) .drawva-widget-resize {
        color: #f8fafc;
      }
      .drawva-widget-btn:hover,
      .drawva-widget-drag:hover,
      .drawva-widget-resize:hover {
        color: var(--primary) !important;
        background: transparent !important;
        transform: scale(1.15) !important;
      }
      .drawva-widget-btn:active,
      .drawva-widget-drag:active,
      .drawva-widget-resize:active {
        transform: scale(0.95) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
    window.addEventListener("message", this.onMessage);
  }

  private onMessage = (e: MessageEvent) => {
    if (e.data?.type === "drawva-widget-pointerdown") {
      for (const [id, shell] of this.shells) {
        const iframe = shell.querySelector("iframe");
        if (iframe && iframe.contentWindow === e.source) {
          this.setSelected(id);
          break;
        }
      }
    } else if (e.data?.type === "drawva-widget-snapshot") {
      // Inner iframe posted a rendered-SVG dataURL back — store it for atlas capture.
      const { dataUrl } = e.data as { dataUrl: string | null };
      if (!dataUrl) return;
      // Find which widget this snapshot belongs to by matching the source iframe.
      for (const [id, shell] of this.shells) {
        const iframe = shell.querySelector("iframe");
        if (iframe && iframe.contentWindow === e.source) {
          const widget = this.widgets.get(id);
          if (widget) {
            const img = new Image();
            img.onload = () => { widget.cachedImage = img; };
            img.src = dataUrl;
          }
          break;
        }
      }
    }
  };


  add(widget: WidgetItem): void {
    if (this.shells.has(widget.id)) {
      this.unmount(widget.id);
    }
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
    if (id) {
      this.applyMode(id);
      (this.opts.callbacks ?? {}).onSelect?.(id);
    }
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

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    this.hostRoot.dataset.mode = mode;
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
    const widget = this.widgets.get(id);
    const isDraft = widget?.status === "draft";
    const active = isDraft || isSelected;
    const frame = shell?.querySelector("iframe") as HTMLIFrameElement | null;

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

    if (frame) {
      const passThrough = !active && !hand && !select;
      frame.style.pointerEvents = passThrough ? "none" : "auto";
      // Hide iframe completely when it must not intercept events — CSS pointer-events
      // alone doesn't reliably block nested browsing-context event capture.
      frame.style.visibility = passThrough ? "hidden" : "visible";
    }

    if (chrome) {
      chrome.style.display = active ? "flex" : "none";
    }
    if (dragBar) {
      dragBar.style.display = active ? "inline-flex" : "none";
    }
    if (acceptBtn) {
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
    window.removeEventListener("message", this.onMessage);
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
    w.userResized = true;
    w.w = Math.max(300, Math.min(SIZE - w.x, Math.round(newW)));
    w.h = Math.max(200, Math.min(SIZE - w.y, Math.round(newH)));
    this.position(w);
  }

  private mount(widget: WidgetItem): void {
    if (this.shells.has(widget.id)) return;

    const shell = document.createElement("section");
    shell.dataset.widgetId = widget.id;
    shell.dataset.status = widget.status;
    shell.dataset.selected = "false";
    shell.dataset.hovered = "false";
    shell.className = "drawva-widget-shell";
    shell.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;contain:layout style;background:transparent;border:2px solid transparent;border-radius:12px;box-shadow:none;padding:0;overflow:visible;display:flex;flex-direction:column;";

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
        { type: "drawva-widget-init", title: widget.title, html: widget.html },
        target
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "drawva-widget-host-ready") {
        sendInit(frame.contentWindow, event.origin);
      } else if (event.data?.type === "drawva-widget-resize-content") {
        const { width, height } = event.data;
        if (typeof height === "number" && height > 0) {
          const w = this.widgets.get(widget.id);
          if (w) {
            const shellH = Math.min(6000, Math.max(120, Math.round(height)));
            const shellW = typeof width === "number" && width > 0
              ? Math.min(3200, Math.max(220, Math.round(width)))
              : w.w;

            if (!w.userResized) {
              if (Math.abs(w.w - shellW) > 4 || Math.abs(w.h - shellH) > 4) {
                w.w = shellW;
                w.h = shellH;
                w.contentW = shellW;
                w.contentH = shellH;
                this.position(w);
              }
            } else {
              if (w.contentW < shellW || w.contentH < shellH) {
                w.contentW = Math.max(w.contentW, shellW);
                w.contentH = Math.max(w.contentH, shellH);
                this.position(w);
              }
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

    const overlay = document.createElement("div");
    overlay.className = "drawva-widget-draft-overlay";
    overlay.style.cssText =
      "position:absolute;inset:0;display:none;pointer-events:none;background:repeating-linear-gradient(45deg,rgba(59,130,246,0.03) 0 8px,transparent 8px 16px);border-radius:inherit;";

    body.append(frame, overlay);

    const chrome = document.createElement("div");
    chrome.className = "drawva-widget-chrome";
    chrome.style.cssText =
      "position:absolute;left:0;right:0;top:-30px;height:24px;display:none;align-items:center;justify-content:space-between;padding:0 2px;z-index:10;pointer-events:none;";

    const leftGroup = document.createElement("div");
    leftGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "drawva-widget-btn drawva-widget-accept";
    acceptBtn.innerHTML = ACCEPT_SVG;
    acceptBtn.title = "Accept & keep widget";
    acceptBtn.style.cssText =
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    acceptBtn.style.display = widget.status === "draft" ? "inline-flex" : "none";
    acceptBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    acceptBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onAccept?.(widget.id);
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "drawva-widget-btn";
    copyBtn.innerHTML = COPY_SVG;
    copyBtn.title = widget.copyLabel ? `Copy ${widget.copyLabel}` : "Copy source code";
    copyBtn.style.cssText =
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    copyBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard?.writeText(widget.copyText || widget.html);
    });

    leftGroup.append(acceptBtn, copyBtn);

    const dragBar = document.createElement("div");
    dragBar.className = "drawva-widget-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${widget.title}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:grab;background:transparent;border:none;pointer-events:auto;user-select:none;";

    const rightGroup = document.createElement("div");
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "drawva-widget-btn drawva-widget-remove";
    closeBtn.innerHTML = REMOVE_SVG;
    closeBtn.title = "Remove widget";
    closeBtn.style.cssText =
      "width:24px;height:24px;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;user-select:none;";
    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onRemove?.(widget.id);
    });

    rightGroup.append(closeBtn);
    chrome.append(leftGroup, dragBar, rightGroup);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "drawva-widget-resize";
    resizeHandle.innerHTML = RESIZE_SVG;
    resizeHandle.title = "Resize widget";
    resizeHandle.style.cssText =
      "position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;cursor:nwse-resize;z-index:10;display:none;align-items:center;justify-content:center;background:transparent;border:none;pointer-events:auto;user-select:none;";

    shell.append(body, chrome, resizeHandle);

    shell.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".drawva-widget-btn") && !target?.closest(".drawva-widget-resize")) {
        e.stopPropagation();
        this.setSelected(widget.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      e.stopPropagation();
      this.setSelected(widget.id);
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(widget.id, e);
    };
    const beginResize = (e: PointerEvent) => {
      e.stopPropagation();
      this.setSelected(widget.id);
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
    this.toolbars.set(widget.id, { chrome, dragBar, resizeHandle, refine: undefined, overlay, acceptBtn });
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
