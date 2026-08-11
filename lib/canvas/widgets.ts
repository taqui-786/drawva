import { WidgetItem } from "./types";
import { Camera } from "./camera";
import { createDiagramHtml } from "./diagram";

export class WidgetManager {
  private container: HTMLElement;
  private mountedWidgets = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public mountWidget(
    widget: WidgetItem,
    camera: Camera,
    isDraft: boolean,
    isSelected: boolean,
    onDelete?: (id: string) => void,
    onAccept?: (id: string) => void,
    onMove?: (id: string, dx: number, dy: number) => void
  ): HTMLElement {
    const existing = this.mountedWidgets.get(widget.id);
    if (existing) {
      this.updateWidgetStyleAndTransform(widget, camera, isDraft, isSelected, existing);
      return existing;
    }

    const wrapper = document.createElement("section");
    wrapper.id = `widget-container-${widget.id}`;
    wrapper.style.transformOrigin = "top left";
    wrapper.style.boxSizing = "border-box";

    // Setup Dragging via Top Header / Move Handle
    const attachMoveHandler = (handleEl: HTMLElement) => {
      handleEl.addEventListener("pointerdown", (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        let lastScreenX = e.clientX;
        let lastScreenY = e.clientY;

        const onPointerMove = (moveEv: PointerEvent) => {
          const dxScreen = moveEv.clientX - lastScreenX;
          const dyScreen = moveEv.clientY - lastScreenY;
          lastScreenX = moveEv.clientX;
          lastScreenY = moveEv.clientY;

          const dxWorld = dxScreen / camera.zoom;
          const dyWorld = dyScreen / camera.zoom;

          if (onMove) {
            onMove(widget.id, dxWorld, dyWorld);
          }
        };

        const onPointerUp = () => {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      });
    };

    if (isDraft) {
      // -----------------------------------------------------------
      // DRAFT WIDGET UI (Green Dashed Border + Top Action Bar)
      // -----------------------------------------------------------
      wrapper.className =
        "absolute pointer-events-auto rounded-xl border-2 border-dashed border-emerald-500 bg-white dark:bg-slate-900 shadow-2xl transition-shadow";

      const topBar = document.createElement("div");
      topBar.className =
        "absolute -top-11 left-0 right-0 flex items-center justify-between pointer-events-auto select-none px-0.5 z-20";

      // Left: Discard (x)
      const leftBox = document.createElement("div");
      leftBox.className = "flex items-center gap-1";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.title = "Discard Draft Widget";
      deleteBtn.className =
        "w-7 h-7 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold text-sm shadow-sm transition-all flex items-center justify-center";
      deleteBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(widget.id);
      };
      leftBox.appendChild(deleteBtn);
      topBar.appendChild(leftBox);

      // Center: Move Handle
      const centerBox = document.createElement("div");
      centerBox.className = "flex items-center justify-center";
      const moveHandle = document.createElement("div");
      moveHandle.title = "Drag Widget";
      moveHandle.className =
        "w-7 h-7 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold text-sm shadow-sm cursor-grab active:cursor-grabbing transition-all flex items-center justify-center";
      moveHandle.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;
      attachMoveHandler(moveHandle);
      centerBox.appendChild(moveHandle);
      topBar.appendChild(centerBox);

      // Right: Copy Source + Accept (✓)
      const rightBox = document.createElement("div");
      rightBox.className = "flex items-center gap-1.5";

      const copyText = widget.copyText || widget.source || widget.html || "";
      if (copyText) {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className =
          "px-2.5 h-7 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-xs shadow-sm transition-all flex items-center gap-1";
        const label =
          widget.copyLabel ||
          (widget.widgetType === "diagram_source"
            ? `Copy ${widget.sourceFormat ? widget.sourceFormat.toUpperCase() : "Source"}`
            : "Copy Source");
        copyBtn.innerHTML = `<svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg><span>${label}</span>`;
        copyBtn.onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(copyText);
          copyBtn.querySelector("span")!.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.querySelector("span")!.textContent = label;
          }, 1500);
        };
        rightBox.appendChild(copyBtn);
      }

      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.title = "Accept Draft Widget";
      acceptBtn.className =
        "w-7 h-7 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold text-sm shadow-sm transition-all flex items-center justify-center";
      acceptBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;
      acceptBtn.onclick = (e) => {
        e.stopPropagation();
        if (onAccept) onAccept(widget.id);
      };
      rightBox.appendChild(acceptBtn);

      topBar.appendChild(rightBox);
      wrapper.appendChild(topBar);
    } else {
      // -----------------------------------------------------------
      // ACCEPTED WIDGET UI (Clean Header Bar + Normal Border)
      // -----------------------------------------------------------
      wrapper.className = `absolute pointer-events-auto rounded-xl border bg-white dark:bg-slate-900 shadow-lg transition-all ${
        isSelected ? "border-2 border-blue-500 shadow-blue-500/10" : "border-slate-200 dark:border-slate-800"
      }`;

      const header = document.createElement("div");
      header.className =
        "flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 font-medium select-none cursor-grab active:cursor-grabbing rounded-t-xl";
      attachMoveHandler(header);

      const titleEl = document.createElement("span");
      titleEl.textContent = widget.title || "Widget";
      titleEl.className = "truncate pr-2 font-semibold";
      header.appendChild(titleEl);

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1 shrink-0";

      const copyText = widget.copyText || widget.source || widget.html || "";
      if (copyText) {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className =
          "px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors";
        const label = widget.copyLabel || (widget.widgetType === "diagram_source" ? `Copy ${widget.sourceFormat?.toUpperCase() || "Source"}` : "Copy");
        copyBtn.textContent = label;
        copyBtn.onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(copyText);
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = label;
          }, 1500);
        };
        actions.appendChild(copyBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.title = "Delete Widget";
      delBtn.className =
        "p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors";
      delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(widget.id);
      };
      actions.appendChild(delBtn);

      header.appendChild(actions);
      wrapper.appendChild(header);
    }

    // Sandboxed Iframe Host
    const iframe = document.createElement("iframe");
    iframe.className = "w-full h-full border-none rounded-b-xl block";
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-popups-to-escape-sandbox"
    );
    iframe.referrerPolicy = "no-referrer";

    const htmlToMount =
      widget.widgetType === "diagram_source" && widget.source
        ? createDiagramHtml(
            widget.sourceFormat || "mermaid",
            widget.source,
            widget.title
          )
        : widget.html;

    const sendContent = () => {
      if (htmlToMount) {
        iframe.contentWindow?.postMessage(
          { type: "set-content", html: htmlToMount },
          "*"
        );
      }
    };

    // Assign onload BEFORE src assignment to prevent missing load event
    iframe.onload = sendContent;
    iframe.src = "/widget-host.html";

    // Backup postMessage retry in case iframe loaded instantly
    setTimeout(sendContent, 150);
    setTimeout(sendContent, 500);

    const wPixels = Math.max(300, widget.contentW || widget.w || 600);
    const hPixels = Math.max(200, widget.contentH || widget.h || 400);

    const contentContainer = document.createElement("div");
    contentContainer.style.width = `${wPixels}px`;
    contentContainer.style.height = `${hPixels}px`;
    contentContainer.className = "relative overflow-hidden rounded-b-xl bg-white";
    contentContainer.appendChild(iframe);
    wrapper.appendChild(contentContainer);

    widget.shell = wrapper;
    widget.frame = iframe;

    this.container.appendChild(wrapper);
    this.mountedWidgets.set(widget.id, wrapper);

    this.updateWidgetStyleAndTransform(widget, camera, isDraft, isSelected, wrapper);
    return wrapper;
  }

  public updateWidgetStyleAndTransform(
    widget: WidgetItem,
    camera: Camera,
    isDraft: boolean,
    isSelected: boolean,
    wrapper?: HTMLElement
  ): void {
    const el = wrapper || this.mountedWidgets.get(widget.id);
    if (!el) return;

    const screenPos = camera.worldToScreen({ x: widget.x, y: widget.y });
    const zoom = camera.zoom;

    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    el.style.transform = `scale(${zoom})`;

    // Re-mount if draft state transitioned to accepted state
    const currentIsDraft = el.classList.contains("border-dashed");
    if (currentIsDraft !== isDraft) {
      el.remove();
      this.mountedWidgets.delete(widget.id);
    }
  }

  public unmountWidget(widgetId: string): void {
    const el = this.mountedWidgets.get(widgetId);
    if (el) {
      el.remove();
      this.mountedWidgets.delete(widgetId);
    }
  }

  public updateAll(
    items: WidgetItem[] = [],
    draftItems: WidgetItem[] = [],
    selectedIds: string[] = [],
    camera: Camera,
    onDelete?: (id: string) => void,
    onAccept?: (id: string) => void,
    onMove?: (id: string, dx: number, dy: number) => void
  ): void {
    const safeItems = Array.isArray(items) ? items : [];
    const safeDraftItems = Array.isArray(draftItems) ? draftItems : [];
    const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

    const activeIds = new Set([
      ...safeItems.map((w) => w.id),
      ...safeDraftItems.map((w) => w.id),
    ]);

    for (const [id] of this.mountedWidgets) {
      if (!activeIds.has(id)) {
        this.unmountWidget(id);
      }
    }

    for (const widget of safeItems) {
      const isSelected = safeSelectedIds.includes(widget.id);
      this.mountWidget(widget, camera, false, isSelected, onDelete, onAccept, onMove);
    }

    for (const widget of safeDraftItems) {
      const isSelected = safeSelectedIds.includes(widget.id);
      this.mountWidget(widget, camera, true, isSelected, onDelete, onAccept, onMove);
    }
  }

  public clear(): void {
    for (const [id] of this.mountedWidgets) {
      this.unmountWidget(id);
    }
  }
}
