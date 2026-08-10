"use client";
// ============================================================
// Drawva — Seamless Canvas Widget Renderer Component (PenEcho Spec)
// Renders interactive canvas widgets directly on the grid with:
// - Transparent background (no solid cards/headers)
// - PenEcho draft bounding box (blue dashed rect) with floating controls:
//   * Top-Left: ✕ Discard button (red)
//   * Top-Center: ⊕ Move handle
//   * Top-Right: ✓ Accept button (green)
//   * Floating Copy Pill (Copy Mermaid / Copy SMILES / Copy Code)
// - Hover/Active Committed state with floating ✨ AI Refine button
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

interface SingleWidgetProps {
  item: WidgetItem;
  camera: CameraState;
  onDelete?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onRefine?: (widget: WidgetItem) => void;
  onAccept?: () => void;
  onDiscard?: () => void;
  onSelect?: (id: string) => void;
  onWheel?: (screenX: number, screenY: number, deltaY: number) => void;
  isSelected?: boolean;
  isRefineCandidate?: boolean;
  isDrawingTool?: boolean;
}

/** PlantUML text encoder for SVG rendering URL */
function encodePlantUml(text: string): string {
  try {
    return encodeURIComponent(text);
  } catch {
    return "";
  }
}

export function DiagramCard({
  item,
  camera,
  onDelete,
  onMove,
  onRefine,
  onAccept,
  onDiscard,
  onSelect,
  onWheel,
  isSelected = false,
  isRefineCandidate = false,
  isDrawingTool = false,
}: SingleWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [hovered, setHovered] = useState<boolean>(false);
  const elementId = useId().replace(/:/g, "_");

  // Dragging state
  const isDraggingRef = useRef(false);
  const dragStartScreen = useRef({ x: 0, y: 0 });
  const dragStartItemPos = useRef({ x: item.x, y: item.y });

  const isDraft = item.id.startsWith("draft_");
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
            setSvgHtml(svg);
            setLoading(false);
          }
        } else if (format === "plantuml") {
          const imgUrl = `https://www.plantuml.com/plantuml/svg/${encodePlantUml(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="PlantUML Diagram" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setSvgHtml(`<img src="${imgUrl}" alt="PlantUML Diagram" />`);
            setLoading(false);
          }
        } else if (format === "vega-lite" || format === "vegalite") {
          const imgUrl = `https://quickchart.io/vega?bkg=transparent&v=${encodeURIComponent(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="Vega-Lite Chart" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setSvgHtml(`<img src="${imgUrl}" alt="Vega-Lite Chart" />`);
            setLoading(false);
          }
        } else if (format === "smiles") {
          const imgUrl = `https://quickchart.io/chemical/${encodeURIComponent(rawSource)}`;
          if (active && containerRef.current) {
            containerRef.current.innerHTML = `<img src="${imgUrl}" alt="Chemical Structure" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
            setSvgHtml(`<img src="${imgUrl}" alt="Chemical Structure" />`);
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

  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onSelect?.(item.id);
      if ((e.target as HTMLElement).closest("button")) return;

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartScreen.current = { x: e.clientX, y: e.clientY };
      dragStartItemPos.current = { x: item.x, y: item.y };

      const onGlobalPointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current || !onMove) return;
        const dx = (moveEvent.clientX - dragStartScreen.current.x) / camera.scale;
        const dy = (moveEvent.clientY - dragStartScreen.current.y) / camera.scale;
        onMove(item.id, dragStartItemPos.current.x + dx, dragStartItemPos.current.y + dy);
      };

      const onGlobalPointerUp = () => {
        isDraggingRef.current = false;
        setIsDragging(false);
        window.removeEventListener("pointermove", onGlobalPointerMove);
        window.removeEventListener("pointerup", onGlobalPointerUp);
        window.removeEventListener("pointercancel", onGlobalPointerUp);
      };

      window.addEventListener("pointermove", onGlobalPointerMove);
      window.addEventListener("pointerup", onGlobalPointerUp);
      window.addEventListener("pointercancel", onGlobalPointerUp);
    },
    [camera.scale, item.id, item.x, item.y, onMove, onSelect]
  );

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [rawSource]);

  const left = item.x * camera.scale + camera.panX;
  const top = item.y * camera.scale + camera.panY;
  const width = Math.max(120, item.w);
  const height = Math.max(80, item.h);

  const copyLabel = item.copyLabel || `Copy ${format.toUpperCase()}`;
  const btnScale = Math.min(2.5, Math.max(1, 1 / camera.scale));

  const activeBorder = isDraft
    ? "border-2 border-dashed border-blue-500/90 shadow-xl bg-card/10 backdrop-blur-[2px]"
    : isSelected || isRefineCandidate
    ? "border-2 border-dashed border-blue-400/90 shadow-lg bg-card/5 ring-4 ring-blue-400/10"
    : hovered
    ? "border border-dashed border-blue-300/60 shadow-sm bg-transparent"
    : "border border-transparent bg-transparent";

  return (
    <div
      data-widget-card={item.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isDrawingTool && onSelect?.(item.id)}
      onWheel={(e) => onWheel?.(e.clientX, e.clientY, e.deltaY)}
      className={`absolute left-0 top-0 rounded-xl transition-shadow ${
        isDrawingTool ? "pointer-events-none" : "pointer-events-auto"
      } ${activeBorder}`}
      style={{
        transform: `translate3d(${left}px, ${top}px, 0) scale(${camera.scale})`,
        transformOrigin: "0 0",
        willChange: "transform",
        width: `${width}px`,
        height: `${height}px`,
        zIndex: isDraft ? 25 : isSelected ? 20 : 15,
      }}
    >
      {/* PenEcho Spec Floating Controls Bar */}
      {(isDraft || isSelected || hovered || isRefineCandidate) && (
        <>
          {/* Top-Left: Discard / Delete Button */}
          <button
            onClick={isDraft ? (onDiscard || (() => onDelete?.(item.id))) : (() => onDelete?.(item.id))}
            title={isDraft ? "Discard AI draft" : "Delete diagram"}
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className="absolute -top-4 -left-4 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-red-300 bg-card/95 text-red-500 shadow-md transition-all hover:scale-105 hover:bg-red-50 hover:border-red-400 active:scale-95 pointer-events-auto"
          >
            <Icon icon={Cancel01Icon} size={15} />
          </button>

          {/* Top-Center: Move Handle */}
          <div
            onPointerDown={handlePointerDown}
            title="Drag to reposition diagram"
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-card/95 text-slate-600 shadow-md cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-all hover:scale-105 pointer-events-auto"
          >
            <Icon icon={Move01Icon} size={14} />
          </div>

          {/* Top-Right: Copy Pill & Accept/Refine Button */}
          <div
            style={{ transform: `scale(${btnScale})`, transformOrigin: "right center" }}
            className="absolute -top-4 -right-4 z-30 flex items-center gap-1.5 pointer-events-auto"
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
                  title="Refine diagram with handwritten marks"
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
        </>
      )}

      {/* Interior Centered Content Box with Padding */}
      <div
        className="w-full h-full p-6 flex items-center justify-center bg-transparent overflow-hidden"
        style={{ pointerEvents: isDragging ? "none" : "auto" }}
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
    </div>
  );
}

export function HtmlWidgetCard({
  item,
  camera,
  onDelete,
  onMove,
  onRefine,
  onAccept,
  onDiscard,
  onSelect,
  onWheel,
  isSelected = false,
  isRefineCandidate = false,
  isDrawingTool = false,
}: SingleWidgetProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartScreen = useRef({ x: 0, y: 0 });
  const dragStartItemPos = useRef({ x: item.x, y: item.y });
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isDraft = item.id.startsWith("draft_");

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onSelect?.(item.id);
      if ((e.target as HTMLElement).closest("button")) return;

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartScreen.current = { x: e.clientX, y: e.clientY };
      dragStartItemPos.current = { x: item.x, y: item.y };

      const onGlobalPointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current || !onMove) return;
        const dx = (moveEvent.clientX - dragStartScreen.current.x) / camera.scale;
        const dy = (moveEvent.clientY - dragStartScreen.current.y) / camera.scale;
        onMove(item.id, dragStartItemPos.current.x + dx, dragStartItemPos.current.y + dy);
      };

      const onGlobalPointerUp = () => {
        isDraggingRef.current = false;
        setIsDragging(false);
        window.removeEventListener("pointermove", onGlobalPointerMove);
        window.removeEventListener("pointerup", onGlobalPointerUp);
        window.removeEventListener("pointercancel", onGlobalPointerUp);
      };

      window.addEventListener("pointermove", onGlobalPointerMove);
      window.addEventListener("pointerup", onGlobalPointerUp);
      window.addEventListener("pointercancel", onGlobalPointerUp);
    },
    [camera.scale, item.id, item.x, item.y, onMove, onSelect]
  );

  const handleCopyCode = useCallback(async () => {
    const textToCopy = item.copyText || item.source || item.payload;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [item.copyText, item.source, item.payload]);

  const left = item.x * camera.scale + camera.panX;
  const top = item.y * camera.scale + camera.panY;
  const width = Math.max(120, item.w);
  const height = Math.max(80, item.h);

  const copyLabel = item.copyLabel || "Copy Source";
  const btnScale = Math.min(2.5, Math.max(1, 1 / camera.scale));

  const activeBorder = isDraft
    ? "border-2 border-dashed border-blue-500/90 shadow-xl bg-card/10 backdrop-blur-[2px]"
    : isSelected || isRefineCandidate
    ? "border-2 border-dashed border-blue-400/90 shadow-lg bg-card/5 ring-4 ring-blue-400/10"
    : hovered
    ? "border border-dashed border-blue-300/60 shadow-sm bg-transparent"
    : "border border-transparent bg-transparent";

  return (
    <div
      data-widget-card={item.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isDrawingTool && onSelect?.(item.id)}
      onWheel={(e) => onWheel?.(e.clientX, e.clientY, e.deltaY)}
      className={`absolute left-0 top-0 rounded-xl transition-shadow ${
        isDrawingTool ? "pointer-events-none" : "pointer-events-auto"
      } ${activeBorder}`}
      style={{
        transform: `translate3d(${left}px, ${top}px, 0) scale(${camera.scale})`,
        transformOrigin: "0 0",
        willChange: "transform",
        width: `${width}px`,
        height: `${height}px`,
        zIndex: isDraft ? 25 : isSelected ? 20 : 15,
      }}
    >
      {/* PenEcho Spec Floating Controls Bar */}
      {(isDraft || isSelected || hovered || isRefineCandidate) && (
        <>
          {/* Top-Left: Discard / Delete Button */}
          <button
            onClick={isDraft ? (onDiscard || (() => onDelete?.(item.id))) : (() => onDelete?.(item.id))}
            title={isDraft ? "Discard AI draft" : "Delete widget"}
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className="absolute -top-4 -left-4 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-red-300 bg-card/95 text-red-500 shadow-md transition-all hover:scale-105 hover:bg-red-50 hover:border-red-400 active:scale-95 pointer-events-auto"
          >
            <Icon icon={Cancel01Icon} size={15} />
          </button>

          {/* Top-Center: Move Handle */}
          <div
            onPointerDown={handlePointerDown}
            title="Drag to reposition widget"
            style={{ transform: `scale(${btnScale})`, transformOrigin: "center center" }}
            className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 flex size-7 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-card/95 text-slate-600 shadow-md cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-all hover:scale-105 pointer-events-auto"
          >
            <Icon icon={Move01Icon} size={14} />
          </div>

          {/* Top-Right: Copy Pill & Accept/Refine Button */}
          <div
            style={{ transform: `scale(${btnScale})`, transformOrigin: "right center" }}
            className="absolute -top-4 -right-4 z-30 flex items-center gap-1.5 pointer-events-auto"
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
        </>
      )}

      <div className="w-full h-full relative bg-transparent" style={{ overflow: "visible" }}>
        <iframe
          ref={iframeRef}
          src="/widget-host.html"
          title={item.title || "Drawva Widget"}
          className="border-none bg-transparent"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            pointerEvents: isSelected && !isDragging ? "auto" : "none",
          }}
          sandbox="allow-scripts allow-same-origin"
          onLoad={sendInitToIframe}
        />
        {/* Transparent overlay for unselected widgets or during active dragging */}
        {(!isSelected || isDragging) && (
          <div
            className="absolute inset-0 z-10 cursor-grab"
            onPointerDown={handlePointerDown}
          />
        )}
      </div>
    </div>
  );
}

export function WidgetRenderer({
  items,
  camera,
  onDeleteWidget,
  onMoveWidget,
  onRefineWidget,
  onAcceptDraft,
  onDiscardDraft,
  onWheel,
  refineCandidateId,
}: {
  items: WidgetItem[];
  camera: CameraState;
  onDeleteWidget?: (id: string) => void;
  onMoveWidget?: (id: string, x: number, y: number) => void;
  onRefineWidget?: (widget: WidgetItem) => void;
  onAcceptDraft?: () => void;
  onDiscardDraft?: () => void;
  onWheel?: (screenX: number, screenY: number, deltaY: number) => void;
  refineCandidateId?: string | null;
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

  if (!items || items.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {items.map((item) => {
        const isRefining = refineCandidateId === item.id;
        const isSelected = selectedWidgetId === item.id;

        if (item.widgetKind === "diagram" || item.widgetType === "diagram_source") {
          return (
            <DiagramCard
              key={item.id}
              item={item}
              camera={camera}
              onDelete={onDeleteWidget}
              onMove={onMoveWidget}
              onRefine={onRefineWidget}
              onAccept={onAcceptDraft}
              onDiscard={onDiscardDraft}
              onSelect={setSelectedWidgetId}
              onWheel={onWheel}
              isSelected={isSelected}
              isRefineCandidate={isRefining}
              isDrawingTool={isDrawingTool}
            />
          );
        }
        return (
          <HtmlWidgetCard
            key={item.id}
            item={item}
            camera={camera}
            onDelete={onDeleteWidget}
            onMove={onMoveWidget}
            onRefine={onRefineWidget}
            onAccept={onAcceptDraft}
            onDiscard={onDiscardDraft}
            onSelect={setSelectedWidgetId}
            onWheel={onWheel}
            isSelected={isSelected}
            isRefineCandidate={isRefining}
            isDrawingTool={isDrawingTool}
          />
        );
      })}
    </div>
  );
}
