"use client";
// ============================================================
// Drawva — Canvas Viewport Component (PenEcho Spec)
// Mounts the canvas container, creates the engine, wires events,
// and renders AI widgets & prompt bar overlays.
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { useCanvasContext } from "./CanvasProvider";
import { CanvasEngine } from "@/lib/canvas/engine";
import type {
  ToolName,
  CanvasItem,
  WidgetItem,
  CameraState,
} from "@/lib/canvas/types";
import { WidgetRenderer } from "./WidgetRenderer";
import { AiPromptBar } from "./AiPromptBar";
import { useAiCanvas } from "@/hooks/useAiCanvas";

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engineRef, setState } = useCanvasContext();
  const [engineInstance, setEngineInstance] = useState<CanvasEngine | null>(
    null,
  );

  const [items, setItems] = useState<CanvasItem[]>([]);
  const [cameraState, setCameraState] = useState<CameraState>({
    scale: 1,
    panX: 0,
    panY: 0,
  });

  const ai = useAiCanvas(engineInstance);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // Synchronously instantiate engine on browser client
    const engine = new CanvasEngine(containerRef.current);
    engineRef.current = engine;
    setEngineInstance(engine);

    // Subscribe engine events → mirror to React state
    const unsubs = [
      engine.on("toolChanged", (tool: ToolName) => {
        setState((s) => ({ ...s, activeTool: tool }));
      }),
      engine.on("colorChanged", (color: string) => {
        setState((s) => ({ ...s, color }));
      }),
      engine.on("sizeChanged", (size: number) => {
        setState((s) => ({ ...s, size }));
      }),
      engine.on("zoomChanged", (zoom: number) => {
        setState((s) => ({ ...s, zoom }));
      }),
      engine.on("canUndoChanged", (canUndo: boolean) => {
        setState((s) => ({ ...s, canUndo }));
      }),
      engine.on("canRedoChanged", (canRedo: boolean) => {
        setState((s) => ({ ...s, canRedo }));
      }),
      engine.on("itemsChanged", (newItems: CanvasItem[]) => {
        setItems(newItems);
      }),
      engine.on("cameraChanged", (cam: CameraState) => {
        setCameraState(cam);
      }),
      engine.on("saved", () => {
        setState((s) => ({ ...s, saved: true }));
      }),
    ];

    const handleWidgetMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "drawva-widget-resize") {
        const { widgetId, w, h } = e.data;
        if (widgetId && typeof w === "number" && typeof h === "number") {
          engine.updateItem(widgetId, { w, h });
        }
      } else if (e.data && e.data.type === "drawva-widget-wheel") {
        const { widgetId, deltaY } = e.data;
        if (typeof deltaY === "number" && engineRef.current) {
          const targetWidget = widgetId
            ? engineRef.current.getItem(widgetId)
            : null;
          let screenX = engineRef.current.layers.cssWidth / 2;
          let screenY = engineRef.current.layers.cssHeight / 2;
          if (targetWidget && "w" in targetWidget && "h" in targetWidget) {
            screenX =
              targetWidget.x * engineRef.current.camera.scale +
              engineRef.current.camera.panX +
              ((targetWidget.w as number) * engineRef.current.camera.scale) / 2;
            screenY =
              targetWidget.y * engineRef.current.camera.scale +
              engineRef.current.camera.panY +
              ((targetWidget.h as number) * engineRef.current.camera.scale) / 2;
          }
          engineRef.current.processWheelAtPoint(screenX, screenY, deltaY);
        }
      }
    };
    window.addEventListener("message", handleWidgetMessage);

    // Initial render call
    engine.requestRender();

    return () => {
      window.removeEventListener("message", handleWidgetMessage);
      unsubs.forEach((u) => u());
      engine.destroy();
      engineRef.current = null;
      setEngineInstance(null);
    };
  }, [engineRef, setState]);

  const handleDeleteWidget = useCallback(
    (id: string) => {
      engineInstance?.deleteItem(id);
    },
    [engineInstance],
  );

  const handleMoveWidget = useCallback(
    (id: string, x: number, y: number) => {
      engineInstance?.updateItem(id, { x, y });
    },
    [engineInstance],
  );

  // Combine committed widget items and draft widget items
  const committedWidgets = items.filter(
    (it): it is WidgetItem => it.kind === "widget",
  );
  const draftWidgets = ai.draftItems.filter(
    (it): it is WidgetItem => it.kind === "widget",
  );
  const allWidgets = [...committedWidgets, ...draftWidgets];

  return (
    <div
      ref={containerRef}
      id="canvas-viewport"
      className="flex-1 relative overflow-hidden"
      style={{ touchAction: "none" }}
      aria-label="Infinite canvas whiteboard"
    >
      {/* HTML / Mermaid diagram widgets */}
      <WidgetRenderer
        items={allWidgets}
        camera={cameraState}
        onDeleteWidget={handleDeleteWidget}
        onMoveWidget={handleMoveWidget}
        onRefineWidget={ai.triggerRefinement}
        onAcceptDraft={ai.acceptDraft}
        onDiscardDraft={ai.discardDraft}
        onWheel={(x, y, deltaY) => engineInstance?.processWheelAtPoint(x, y, deltaY)}
      />

      {/* Floating AI Prompt Bar & Draft Controls */}
      <AiPromptBar
        isThinking={ai.isThinking}
        statusMessage={ai.statusMessage}
        hasDraft={ai.hasDraft}
        draftCount={ai.draftItems.length}
        error={ai.error}
        onTriggerAi={ai.triggerAi}
        onAcceptDraft={ai.acceptDraft}
        onDiscardDraft={ai.discardDraft}
        onClearError={ai.clearError}
      />
    </div>
  );
}
