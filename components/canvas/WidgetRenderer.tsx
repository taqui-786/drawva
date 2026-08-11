"use client";
// ============================================================
// Drawva — Seamless Canvas Widget Renderer Component (PenEcho Spec)
// Renders interactive canvas widgets directly on the grid with:
// - Transparent background (no solid cards/headers)
// - PenEcho bounding box (blue dashed rect) with rounded corners & floating controls:
//   * Top-Left: ✕ Discard button (red circular button)
//   * Top-Center: ❖ Move handle
//   * Top-Right: Dynamic Copy Pill (Copy SPICE / Copy TikZ / Copy PGFPlots / Copy Mermaid / Copy Code) + Accept (✓) or AI Refine
//   * Bottom-Right: ⇲ Dual diagonal corner resize grip handle & edge resize handles
// - Buttery smooth pointer capture drag & resize gestures
// - Drawing tool bypass (pointer-events: none during pen/highlighter)
// - AI Refining & Generation loading shimmer overlays
// ============================================================

import React, { useEffect, useRef, useState, useId, useCallback } from "react";
import type { WidgetItem, CameraState } from "@/lib/canvas/types";
import { useCanvasState } from "./CanvasProvider";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Move01Icon,
  Copy01Icon,
  AiBrain02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];
function Icon({ icon, size = 15 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

interface CommonWidgetProps {
  item: WidgetItem;
  camera: CameraState;
  onDelete?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, w: number, h: number) => void;
  onUpdate?: (id: string, updates: { x?: number; y?: number; w?: number; h?: number }) => void;
  onRefine?: (widget: WidgetItem) => void;
  onAccept?: () => void;
  onDiscard?: () => void;
  onSelect?: (id: string) => void;
  onWheel?: (screenX: number, screenY: number, deltaY: number) => void;
  isSelected?: boolean;
  isRefineCandidate?: boolean;
  isRefinementTarget?: boolean;
  isDrawingTool?: boolean;
}

/** Helper to derive PenEcho copy pill label based on source/format */
function getCopyLabel(item: WidgetItem): string {
  if (item.copyLabel) return item.copyLabel;
  const fmt = (item.sourceFormat || "").toLowerCase();
  const kind = (item.diagramKind || "").toLowerCase();
  const source = item.source || item.copyText || item.payload || "";

  if (
    fmt === "spice" ||
    kind === "spice" ||
    source.includes("VCC =") ||
    source.includes(".op") ||
    source.includes(".tran")
  ) {
    return "Copy SPICE";
  }
  if (
    fmt === "tikz" ||
    kind === "tikz" ||
    source.includes("\\begin{tikzpicture}")
  ) {
    return "Copy TikZ";
  }
  if (
    fmt === "pgfplots" ||
    kind === "pgfplots" ||
    source.includes("phase portrait") ||
    source.includes("axis")
  ) {
    return "Copy PGFPlots";
  }
  if (fmt === "mermaid" || kind === "mermaid") {
    return "Copy Mermaid";
  }
  if (fmt === "plantuml" || kind === "plantuml") {
    return "Copy PlantUML";
  }
  if (fmt === "smiles" || kind === "smiles") {
    return "Copy SMILES";
  }
  if (fmt === "vegalite" || fmt === "vega" || kind === "vegalite") {
    return "Copy Vega";
  }
  if (item.widgetKind === "diagram" || item.widgetType === "diagram_source") {
    return "Copy Source";
  }
  return "Copy Code";
}

/** PlantUML text encoder for SVG rendering URL */
function encodePlantUml(text: string): string {
  try {
    return encodeURIComponent(text);
  } catch {
    return "";
  }
}

/**
 * Unified Card Wrapper Shell that provides PenEcho dashed bounding box,
 * floating controls (Discard, Move, Copy Pill, Accept/Refine),
 * and corner/edge resizing handles.
 */
function WidgetCardShell({
  item,
  camera,
  onDelete,
  onMove,
  onResize,
  onUpdate,
  onRefine,
  onAccept,
  onDiscard,
  onSelect,
  onWheel,
  isSelected = false,
  isRefineCandidate = false,
  isRefinementTarget = false,
  isDrawingTool = false,
  children,
}: CommonWidgetProps & { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const isDraft = item.id.startsWith("draft_");
  const rawSource = item.source || item.copyText || item.payload;
  const copyLabel = getCopyLabel(item);

  // Position & dimension calculations in screen coordinates
  const left = item.x * camera.scale + camera.panX;
  const top = item.y * camera.scale + camera.panY;
  const width = Math.max(160, item.w);
  const height = Math.max(100, item.h);

  // Scale top action buttons based on camera zoom so they remain legible and easy to hit
  const btnScale = Math.min(2.5, Math.max(1, 1 / camera.scale));

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [rawSource]);

  // Pointer drag handle for moving widget
  const handleMovePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isDrawingTool) return;
      onSelect?.(item.id);
      if ((e.target as HTMLElement).closest("button")) return;

      e.preventDefault();
      e.stopPropagation();

      const pointerId = e.pointerId;
      const targetEl = e.currentTarget as HTMLElement;
      try {
        targetEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      setIsDragging(true);
      const startScreenX = e.clientX;
      const startScreenY = e.clientY;
      const startX = item.x;
      const startY = item.y;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = (moveEvent.clientX - startScreenX) / camera.scale;
        const dy = (moveEvent.clientY - startScreenY) / camera.scale;

        const newX = Math.round(startX + dx);
        const newY = Math.round(startY + dy);

        if (onMove) {
          onMove(item.id, newX, newY);
        } else if (onUpdate) {
          onUpdate(item.id, { x: newX, y: newY });
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        setIsDragging(false);
        try {
          targetEl.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [camera.scale, isDrawingTool, item.id, item.x, item.y, onMove, onSelect, onUpdate]
  );

  // Pointer gesture handler for smooth corner & edge resizing
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, resizeType: "corner" | "width" | "height") => {
      if (isDrawingTool) return;
      onSelect?.(item.id);
      e.preventDefault();
      e.stopPropagation();

      const pointerId = e.pointerId;
      const targetEl = e.currentTarget as HTMLElement;
      try {
        targetEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      setIsResizing(true);
      const startScreenX = e.clientX;
      const startScreenY = e.clientY;
      const startW = item.w;
      const startH = item.h;
      const aspect = Math.max(0.2, startW / Math.max(1, startH));

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = (moveEvent.clientX - startScreenX) / camera.scale;
        const dy = (moveEvent.clientY - startScreenY) / camera.scale;

        let newW = startW;
        let newH = startH;

        if (resizeType === "corner") {
          // Lock to proportional aspect ratio on corner drag
          newW = Math.max(160, Math.round(startW + dx));
          newH = Math.max(100, Math.round(newW / aspect));
        } else if (resizeType === "width") {
          newW = Math.max(160, Math.round(startW + dx));
        } else if (resizeType === "height") {
          newH = Math.max(100, Math.round(startH + dy));
        }

        if (onResize) {
          onResize(item.id, newW, newH);
        } else if (onUpdate) {
          onUpdate(item.id, { w: newW, h: newH });
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        setIsResizing(false);
        try {
          targetEl.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [camera.scale, isDrawingTool, item.h, item.id, item.w, onResize, onSelect, onUpdate]
  );

  // PenEcho signature dashed border styling
  const activeBorder = isDraft
    ? "border-2 border-dashed border-sky-400/90 shadow-xl bg-card/5 backdrop-blur-[2px]"
    : isSelected
    ? "border-2 border-dashed border-blue-500 shadow-lg ring-4 ring-blue-500/10"
    : isRefinementTarget || isRefineCandidate
    ? "border-2 border-dashed border-emerald-500/90 shadow-md ring-4 ring-emerald-500/10"
    : hovered
    ? "border border-dashed border-blue-400/60 shadow-sm bg-transparent"
    : "border border-transparent bg-transparent";

  const showChrome = isDraft || isSelected || hovered || isRefineCandidate || isDragging || isResizing;
  const pointerEventsClass = isDrawingTool ? "pointer-events-none" : "pointer-events-auto";

  return (
    <div
      data-widget-card={item.id}
      onMouseEnter={() => !isDrawingTool && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={() => {
        if (!isDrawingTool) {
          onSelect?.(item.id);
        }
      }}
      onClick={() => {
        if (!isDrawingTool) {
          onSelect?.(item.id);
        }
      }}
      onWheel={(e) => !isDrawingTool && onWheel?.(e.clientX, e.clientY, e.deltaY)}
      className={`absolute left-0 top-0 rounded-xl transition-shadow ${pointerEventsClass} ${activeBorder}`}
      style={{
        transform: `translate3d(${left}px, ${top}px, 0) scale(${camera.scale})`,
        transformOrigin: "0 0",
        willChange: "transform, width, height",
        width: `${width}px`,
        height: `${height}px`,
        zIndex: isDraft ? 4 : isSelected ? 4 : 3,
      }}
    >
      {/* PenEcho Floating Top Controls Bar */}
      {showChrome && !isDrawingTool && (
        <>
          {/* Top-Left: Discard / Delete Button (Red) */}
          <button
            onClick={isDraft ? (onDiscard || (() => onDelete?.(item.id))) : (() => onDelete?.(item.id))}
            title={isDraft ? "Discard AI draft" : "Delete widget"}
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className={`absolute -top-4 -left-4 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-red-300 bg-card/95 text-red-500 shadow-md transition-all hover:scale-105 hover:bg-red-50 hover:border-red-400 active:scale-95 ${pointerEventsClass}`}
          >
            <Icon icon={Cancel01Icon} size={15} />
          </button>

          {/* Top-Center: Move Handle (❖) */}
          <div
            onPointerDown={handleMovePointerDown}
            title="Drag to reposition widget"
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className={`absolute -top-4 left-1/2 -translate-x-1/2 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-card/95 text-slate-600 shadow-md cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-all hover:scale-105 ${pointerEventsClass}`}
          >
            <Icon icon={Move01Icon} size={14} />
          </div>

          {/* Top-Right: Dynamic Copy Pill & Accept/Refine Button */}
          <div
            style={{ transform: `scale(${btnScale})`, transformOrigin: "right center" }}
            className={`absolute -top-4 -right-4 z-30 flex items-center gap-1.5 ${pointerEventsClass}`}
          >
            <button
              onClick={handleCopyCode}
              title={copyLabel}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-blue-300 bg-card/95 text-blue-600 text-xs font-semibold shadow-md transition-all hover:bg-blue-50 active:scale-95"
            >
              <Icon icon={copied ? Tick02Icon : Copy01Icon} size={13} />
              <span>{copied ? "Copied!" : copyLabel}</span>
            </button>

            {isDraft ? (
              <button
                onClick={onAccept}
                title="Accept AI draft"
                className="flex size-7 items-center justify-center rounded-lg border border-dashed border-emerald-300 bg-card/95 text-emerald-600 shadow-md transition-all hover:scale-105 hover:bg-emerald-50 hover:border-emerald-400 active:scale-95"
              >
                <Icon icon={Tick02Icon} size={15} />
              </button>
            ) : (
              onRefine && (
                <button
                  onClick={() => onRefine(item)}
                  title="Refine widget with handwritten marks"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold shadow-md transition-all border border-dashed ${
                    isRefineCandidate
                      ? "bg-primary text-primary-foreground border-primary animate-pulse"
                      : "bg-card/95 backdrop-blur-md text-primary border-primary/30 hover:bg-primary/10"
                  }`}
                >
                  <Icon icon={AiBrain02Icon} size={14} />
                  <span>AI Refine</span>
                </button>
              )
            )}
          </div>

          {/* PenEcho Bottom-Right Corner Resize Grip Handle (Dual Diagonal Grip Lines) */}
          <div
            onPointerDown={(e) => handleResizePointerDown(e, "corner")}
            title="Drag corner to resize widget"
            style={{ transform: `scale(${btnScale})`, transformOrigin: "bottom right" }}
            className={`absolute -bottom-2.5 -right-2.5 z-30 flex size-6 items-center justify-center rounded-md border border-dashed border-blue-400/90 bg-card/95 text-blue-600 shadow-md cursor-nwse-resize hover:bg-blue-50 hover:scale-110 active:scale-95 transition-transform group ${pointerEventsClass}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="3" y1="11" x2="11" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="7" y1="11" x2="11" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>

          {/* Right Edge Resize Handle Zone */}
          <div
            onPointerDown={(e) => handleResizePointerDown(e, "width")}
            title="Drag edge to adjust width"
            className={`absolute top-4 bottom-4 -right-1.5 w-3 cursor-ew-resize z-20 ${pointerEventsClass}`}
          />

          {/* Bottom Edge Resize Handle Zone */}
          <div
            onPointerDown={(e) => handleResizePointerDown(e, "height")}
            title="Drag edge to adjust height"
            className={`absolute left-4 right-4 -bottom-1.5 h-3 cursor-ns-resize z-20 ${pointerEventsClass}`}
          />
        </>
      )}

      {/* Main Content Area */}
      <div
        className="w-full h-full relative bg-transparent overflow-hidden rounded-xl"
        style={{ pointerEvents: isDrawingTool ? "none" : isDragging || isResizing ? "none" : "auto" }}
      >
        {children}
      </div>

      {/* Updating Animation Overlay when refining widget */}
      {isRefinementTarget && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm rounded-xl border-2 border-dashed border-sky-400 p-4 text-center animate-pulse pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/40 text-xs font-bold shadow-lg mb-2">
            <Icon icon={AiBrain02Icon} size={16} />
            <span>AI Refining Widget...</span>
          </div>
          <div className="text-[11px] text-sky-100/90 font-medium">Updating layout & content with handwritten marks</div>
        </div>
      )}

      {/* Invisible grab overlay when unselected or actively dragging/resizing to prevent iframe focus stealing */}
      {!isDrawingTool && (!isSelected || isDragging || isResizing) && (
        <div
          className="absolute inset-0 z-10 cursor-grab"
          onPointerDown={handleMovePointerDown}
        />
      )}
    </div>
  );
}

export function DiagramCard(props: CommonWidgetProps) {
  const { item, isDrawingTool } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const elementId = useId().replace(/:/g, "_");

  const format = item.sourceFormat || "mermaid";
  const rawSource = item.source || item.copyText || item.payload;

  useEffect(() => {
    let active = true;

    async function renderDiagram() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);

      try {
        if (format === "mermaid" || !item.sourceFormat) {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "neutral",
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: "linear" },
          });

          let src = rawSource;
          if (item.w >= item.h * 1.35 && src.includes("flowchart TB")) {
            src = src.replace("flowchart TB", "flowchart LR");
          } else if (item.w >= item.h * 1.35 && src.includes("graph TB")) {
            src = src.replace("graph TB", "graph LR");
          }

          const { svg } = await mermaid.render(elementId, src);
          if (active && containerRef.current) {
            containerRef.current.innerHTML = svg;
            setLoading(false);
          }
        } else if (format === "plantuml") {
          const imgUrl = `https://www.plantuml.com/plantuml/svg/${encodePlantUml(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="PlantUML Diagram" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setLoading(false);
          }
        } else if (format === "vega-lite" || format === "vegalite") {
          const imgUrl = `https://quickchart.io/vega?bkg=transparent&v=${encodeURIComponent(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="Vega-Lite Chart" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setLoading(false);
          }
        } else if (format === "smiles") {
          const imgUrl = `https://quickchart.io/chemical/${encodeURIComponent(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="Chemical Structure" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setLoading(false);
          }
        } else {
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<div class="p-3 font-mono text-xs text-foreground/90 whitespace-pre overflow-auto max-h-full bg-muted/20 rounded-lg border border-border/40"><code>${rawSource}</code></div>`;
            setLoading(false);
          }
        }
      } catch (err) {
        if (active) {
          console.warn("[Diagram render warning]", err);
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || `Failed to render ${format} diagram`);
          setLoading(false);
        }
      }
    }

    renderDiagram();
    return () => {
      active = false;
    };
  }, [rawSource, format, item.sourceFormat, item.w, item.h, elementId]);

  return (
    <WidgetCardShell {...props}>
      <div
        className="w-full h-full p-4 flex items-center justify-center bg-transparent overflow-hidden"
        style={{ pointerEvents: isDrawingTool ? "none" : "auto" }}
      >
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse font-medium">
            Rendering {format} diagram...
          </div>
        )}

        {error ? (
          <div className="text-xs text-destructive p-2 font-mono whitespace-pre-wrap overflow-auto max-h-full">
            {error}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:h-auto"
          />
        )}
      </div>
    </WidgetCardShell>
  );
}

export function HtmlWidgetCard(props: CommonWidgetProps) {
  const { item, isDrawingTool, isSelected } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const width = Math.max(160, item.w);
  const height = Math.max(100, item.h);

  const sendInitToIframe = useCallback(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: "drawva-widget-init",
          html: item.payload,
          widgetId: item.id,
        },
        "*"
      );
    }
  }, [item.payload, item.id]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "drawva-host-ready") {
        sendInitToIframe();
      }
    };
    window.addEventListener("message", handleMessage);
    sendInitToIframe();
    return () => window.removeEventListener("message", handleMessage);
  }, [sendInitToIframe]);

  return (
    <WidgetCardShell {...props}>
      <iframe
        ref={iframeRef}
        src="/widget-host.html"
        title={item.title || "Drawva Widget"}
        className="w-full h-full border-none bg-transparent rounded-xl"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: isDrawingTool ? "none" : isSelected ? "auto" : "none",
        }}
        sandbox="allow-scripts allow-same-origin"
        onLoad={sendInitToIframe}
      />
    </WidgetCardShell>
  );
}

export function WidgetRenderer({
  items,
  camera,
  onDeleteWidget,
  onMoveWidget,
  onResizeWidget,
  onUpdateWidget,
  onRefineWidget,
  onAcceptDraft,
  onDiscardDraft,
  onWheel,
  refineCandidateId,
  isThinking = false,
  refiningTargetId = null,
}: {
  items: WidgetItem[];
  camera: CameraState;
  onDeleteWidget?: (id: string) => void;
  onMoveWidget?: (id: string, x: number, y: number) => void;
  onResizeWidget?: (id: string, w: number, h: number) => void;
  onUpdateWidget?: (id: string, updates: { x?: number; y?: number; w?: number; h?: number }) => void;
  onRefineWidget?: (widget: WidgetItem) => void;
  onAcceptDraft?: () => void;
  onDiscardDraft?: () => void;
  onWheel?: (screenX: number, screenY: number, deltaY: number) => void;
  refineCandidateId?: string | null;
  isThinking?: boolean;
  refiningTargetId?: string | null;
}) {
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const canvasState = useCanvasState();
  const isDrawingTool = canvasState.activeTool !== "select" && canvasState.activeTool !== "hand";

  useEffect(() => {
    const handleGlobalClick = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-widget-card]")) {
        setSelectedWidgetId(null);
      }
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    return () => window.removeEventListener("pointerdown", handleGlobalClick);
  }, []);

  if ((!items || items.length === 0) && !isThinking) return null;

  const hasDraftItems = items?.some((it) => it.id.startsWith("draft_")) ?? false;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10 }}>
      {items.map((item) => {
        const isRefineCandidate = refineCandidateId === item.id;
        const isRefinementTarget = isThinking && refiningTargetId === item.id;
        const isSelected = selectedWidgetId === item.id;

        const commonProps: CommonWidgetProps = {
          item,
          camera,
          onDelete: onDeleteWidget,
          onMove: onMoveWidget,
          onResize: onResizeWidget,
          onUpdate: onUpdateWidget,
          onRefine: onRefineWidget,
          onAccept: onAcceptDraft,
          onDiscard: onDiscardDraft,
          onSelect: setSelectedWidgetId,
          onWheel,
          isSelected,
          isRefineCandidate,
          isRefinementTarget,
          isDrawingTool,
        };

        if (item.widgetKind === "diagram" || item.widgetType === "diagram_source") {
          return <DiagramCard key={item.id} {...commonProps} />;
        }
        return <HtmlWidgetCard key={item.id} {...commonProps} />;
      })}

      {/* AI Generation Loading Placeholder Card on canvas when creating new widget */}
      {isThinking && !refiningTargetId && !hasDraftItems && (
        <div
          className="absolute rounded-xl border-2 border-dashed border-sky-400 bg-sky-500/10 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center shadow-2xl animate-pulse z-30 pointer-events-none"
          style={{
            left: `${camera.panX + 160 * camera.scale}px`,
            top: `${camera.panY + 120 * camera.scale}px`,
            width: `${Math.max(320, 480 * camera.scale)}px`,
            height: `${Math.max(220, 320 * camera.scale)}px`,
            transform: `scale(${camera.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/95 text-sky-600 border border-sky-300 text-xs font-extrabold shadow-md mb-3">
            <Icon icon={AiBrain02Icon} size={16} />
            <span>Generating AI Canvas Card...</span>
          </div>
          <div className="w-3/4 h-3 bg-sky-400/30 rounded mb-2 animate-pulse" />
          <div className="w-1/2 h-3 bg-sky-400/20 rounded animate-pulse" />
        </div>
      )}
    </div>
  );
}
