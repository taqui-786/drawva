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
import { SnapshotDebug } from "./SnapshotDebug";
import { useAiCanvas } from "@/hooks/useAiCanvas";
import { findRefineCandidateWidget } from "@/lib/canvas/proximity";

const AUTO_OBSERVE_DELAY_MS = 2500;

export function CanvasViewport({ aiMode }: { aiMode: "auto" | "manual" }) {
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

  const [refineCandidateId, setRefineCandidateId] = useState<string | null>(null);

  const ai = useAiCanvas(engineInstance);

  // ── Auto-observation & Stroke Proximity Refinement ──
  const autoObserveRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    thinking: false,
    hasDraft: false,
  });
  const aiModeRef = useRef(aiMode);
  const observeRef = useRef(ai.triggerAi);

  useEffect(() => {
    aiModeRef.current = aiMode;
  }, [aiMode]);

  useEffect(() => {
    observeRef.current = ai.triggerAi;
  }, [ai.triggerAi]);

  useEffect(() => {
    autoObserveRef.current.thinking = ai.isThinking;
    autoObserveRef.current.hasDraft = ai.hasDraft;
  }, [ai.isThinking, ai.hasDraft]);

  const refineCandidateIdRef = useRef(refineCandidateId);
  useEffect(() => {
    refineCandidateIdRef.current = refineCandidateId;
  }, [refineCandidateId]);

  const triggerRefinementRef = useRef(ai.triggerRefinement);
  useEffect(() => {
    triggerRefinementRef.current = ai.triggerRefinement;
  }, [ai.triggerRefinement]);

  useEffect(() => {
    if (!engineInstance) return;

    const s = autoObserveRef.current;

    const unsubStroke = engineInstance.on("strokeEnd", (evt) => {
      // Find if stroke was drawn over/near an existing widget
      const currentWidgets = engineInstance.getItems().filter(
        (it): it is WidgetItem => it.kind === "widget"
      );
      let candId: string | null = null;
      if (evt && evt.points && evt.points.length > 0) {
        const candidate = findRefineCandidateWidget(currentWidgets, evt.points);
        if (candidate) {
          candId = candidate.id;
          setRefineCandidateId(candidate.id);
        }
      }

      if (aiModeRef.current !== "auto") return;
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = null;
        if (s.thinking || s.hasDraft) return;

        // If stroke was drawn on a widget, trigger refinement of that widget
        const targetId = candId || refineCandidateIdRef.current;
        if (targetId) {
          const target = currentWidgets.find((w) => w.id === targetId);
          if (target) {
            triggerRefinementRef.current(target);
            setRefineCandidateId(null);
            return;
          }
        }
        observeRef.current("", "auto", "medium");
      }, AUTO_OBSERVE_DELAY_MS);
    });

    return () => {
      unsubStroke();
      if (s.timer) {
        clearTimeout(s.timer);
        s.timer = null;
      }
    };
  }, [engineInstance]);

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
        setRefineCandidateId(null);
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

  const handleUpdateWidget = useCallback(
    (id: string, updates: { x?: number; y?: number; w?: number; h?: number }) => {
      if (id.startsWith("draft_")) {
        ai.updateDraftItem(id, updates);
      } else {
        engineInstance?.updateItem(id, updates);
      }
    },
    [engineInstance, ai],
  );

  const handleMoveWidget = useCallback(
    (id: string, x: number, y: number) => {
      handleUpdateWidget(id, { x, y });
    },
    [handleUpdateWidget],
  );

  const handleResizeWidget = useCallback(
    (id: string, w: number, h: number) => {
      handleUpdateWidget(id, { w, h });
    },
    [handleUpdateWidget],
  );

  // Combine committed widget items and draft widget items.
  // Only hide original widget if a draft replacement is active and ready for preview.
  const committedWidgets = items.filter(
    (it): it is WidgetItem => it.kind === "widget" && (!ai.hasDraft || it.id !== ai.refiningTargetId),
  );
  const draftWidgets = ai.draftItems.filter(
    (it): it is WidgetItem => it.kind === "widget",
  );
  const allWidgets = [...committedWidgets, ...draftWidgets];

  const handleViewportPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-widget-card]")) {
        setRefineCandidateId(null);
      }
    },
    []
  );

  return (
    <div
      ref={containerRef}
      id="canvas-viewport"
      className="flex-1 relative overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={handleViewportPointerDown}
      aria-label="Infinite canvas whiteboard"
    >
      {/* HTML / Mermaid diagram widgets. Engine layers use explicit
          z-indexes (see lib/canvas/layers.ts) so strokes paint on top
          of the iframes (PenEcho-style). Widget controls keep z-index:30
          so they remain above the engine's interaction layer. */}
      <WidgetRenderer
        items={allWidgets}
        camera={cameraState}
        onDeleteWidget={handleDeleteWidget}
        onMoveWidget={handleMoveWidget}
        onResizeWidget={handleResizeWidget}
        onUpdateWidget={handleUpdateWidget}
        onRefineWidget={ai.triggerRefinement}
        onAcceptDraft={ai.acceptDraft}
        onDiscardDraft={ai.discardDraft}
        onWheel={(x, y, deltaY) => engineInstance?.processWheelAtPoint(x, y, deltaY)}
        refineCandidateId={refineCandidateId}
        isThinking={ai.isThinking}
        refiningTargetId={ai.refiningTargetId}
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

      {/* Snapshot debug viewer (testing tool): shows the atlas sent to the AI */}
      <SnapshotDebug snapshots={ai.snapshots} onClear={ai.clearSnapshots} />
    </div>
  );
}
