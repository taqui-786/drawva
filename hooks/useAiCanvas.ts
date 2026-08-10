  "use client";
// ============================================================
// Drawva AI System — React Client Hook (PenEcho Spec)
// Controls AI requests, atlas building, draft preview & in-place refinement
// ============================================================

import { useState, useRef, useCallback } from "react";
import type { CanvasEngine } from "@/lib/canvas/engine";
import type { CanvasItem, WidgetItem } from "@/lib/canvas/types";
import type { AiUserAction, AiRequest, AiReply, WidgetEditContext } from "@/lib/ai/types";
import { buildAtlasImage } from "@/lib/canvas/atlas";
import { extractSceneJson } from "@/lib/canvas/sceneText";

export interface UseAiCanvasReturn {
  isThinking: boolean;
  statusMessage: string | null;
  draftItems: CanvasItem[];
  hasDraft: boolean;
  error: string | null;
  triggerAi: (userPrompt: string, action?: AiUserAction, reasoningEffort?: "none" | "low" | "medium" | "high" | "max") => Promise<void>;
  triggerRefinement: (widget: WidgetItem) => Promise<void>;
  acceptDraft: () => void;
  discardDraft: () => void;
  clearError: () => void;
}

export function useAiCanvas(engine: CanvasEngine | null): UseAiCanvasReturn {
  const [isThinking, setIsThinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<CanvasItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const triggerAi = useCallback(
    async (
      userPrompt: string,
      action: AiUserAction = "auto",
      reasoningEffort: "none" | "low" | "medium" | "high" | "max" = "medium",
      widgetEditContext?: WidgetEditContext,
      widgetEditTargetId?: string
    ) => {
      if (!engine) {
        setError("Canvas engine is not initialized yet.");
        return;
      }

      // Abort previous in-flight AI request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsThinking(true);
      setStatusMessage(widgetEditContext ? "Refining widget in-place..." : "Capturing canvas vision...");
      setError(null);

      try {
        const engineWithItems = engine as unknown as { items: CanvasItem[] };
        const activeItems = engineWithItems.items || [];
        const atlas = buildAtlasImage(engine.tiles, activeItems);
        const scene = extractSceneJson(activeItems);

        const canvasSize = {
          w: engine.layers.cssWidth || 1200,
          h: engine.layers.cssHeight || 800,
        };

        const requestBody: AiRequest = {
          atlasImage: atlas ? atlas.dataUrl : "",
          atlasRect: atlas ? { ...atlas.worldRect, scale: atlas.scale } : undefined,
          scene,
          userAction: action,
          userPrompt,
          canvasSize,
          reasoningEffort,
          widgetEditTargetId,
          widgetEditContext,
        };

        setStatusMessage(widgetEditContext ? "Applying AI refinements..." : "Thinking & reasoning with MiMo...");

        const response = await fetch("/api/canvas/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `AI route returned status ${response.status}`);
        }

        const data: AiReply = await response.json();

        if (!data.commands || data.commands.length === 0) {
          setStatusMessage("AI returned no action commands.");
          setIsThinking(false);
          return;
        }

        // Compute visible world center & scale-aware dimensions
        const camScale = Math.max(0.05, engine.camera.scale);
        const visibleWorld = engine.camera.visibleWorldRect(canvasSize.w, canvasSize.h);
        
        // Target dimensions relative to visible world rect so it always fills ~65% x 55% of the screen
        const targetW = Math.max(360, Math.round(visibleWorld.w * 0.65));
        const targetH = Math.max(240, Math.round(visibleWorld.h * 0.55));
        
        const startX = Math.round(visibleWorld.x + (visibleWorld.w - targetW) / 2);
        const startY = Math.round(visibleWorld.y + (visibleWorld.h - targetH) / 2);

        // Convert commands to draft items
        const newDraftItems: CanvasItem[] = [];
        const baseTime = Date.now();

        data.commands.forEach((cmd, idx) => {
          const id = widgetEditTargetId || `draft_${baseTime}_${idx}`;
          
          const rawCmdX = typeof (cmd as { x?: number }).x === "number" ? (cmd as { x: number }).x : undefined;
          const rawCmdY = typeof (cmd as { y?: number }).y === "number" ? (cmd as { y: number }).y : undefined;
          const rawCmdW = typeof (cmd as { w?: number }).w === "number" ? (cmd as { w: number }).w : undefined;
          const rawCmdH = typeof (cmd as { h?: number }).h === "number" ? (cmd as { h: number }).h : undefined;

          // Check if returned command coordinates are within visible world bounds
          const isInVisibleX = rawCmdX !== undefined && rawCmdX >= visibleWorld.x - 200 && rawCmdX <= visibleWorld.x + visibleWorld.w + 200;
          const isInVisibleY = rawCmdY !== undefined && rawCmdY >= visibleWorld.y - 200 && rawCmdY <= visibleWorld.y + visibleWorld.h + 200;

          // If AI command placement is off-screen or missing, place in center of current viewport
          const itemX = widgetEditContext?.box?.x ?? (isInVisibleX ? rawCmdX! : startX);
          let itemY = widgetEditContext?.box?.y ?? (isInVisibleY ? rawCmdY! : startY);

          // Calculate scale-aware item size
          let itemW = widgetEditContext?.box?.w ?? rawCmdW ?? targetW;
          let itemH = widgetEditContext?.box?.h ?? rawCmdH ?? targetH;

          // Ensure generated size is comfortably readable at current zoom level (screen size >= 320x200px)
          if (itemW * camScale < 320 || itemH * camScale < 200) {
            const sizeRatio = Math.max(320 / (itemW * camScale), 200 / (itemH * camScale));
            itemW = Math.round(itemW * sizeRatio);
            itemH = Math.round(itemH * sizeRatio);
          }

          // Resolve vertical overlap for multi-item drafts
          if (newDraftItems.length > 0) {
            const lastItem = newDraftItems[newDraftItems.length - 1];
            const lastBottom = ("y" in lastItem ? lastItem.y : startY) + ("h" in lastItem ? lastItem.h : ("height" in lastItem ? lastItem.height : targetH));
            if (itemY < lastBottom + 30) {
              itemY = lastBottom + 30;
            }
          }

          if (cmd.tool === "diagram_source") {
            const widget: WidgetItem = {
              id,
              kind: "widget",
              widgetKind: "diagram",
              widgetType: "diagram_source",
              pluginId: cmd.pluginId || "flowchart",
              diagramKind: cmd.diagramKind || "flowchart",
              sourceFormat: cmd.sourceFormat || "mermaid",
              source: cmd.source,
              copyText: cmd.copyText || cmd.source,
              copyLabel: cmd.copyLabel || `Copy ${cmd.sourceFormat?.toUpperCase() || "MERMAID"}`,
              frameworkVersion: cmd.frameworkVersion,
              x: itemX,
              y: itemY,
              w: itemW,
              h: itemH,
              payload: cmd.source,
              title: cmd.title || "AI Generated Diagram",
            };
            newDraftItems.push(widget);
          } else if (cmd.tool === "html_widget") {
            const widget: WidgetItem = {
              id,
              kind: "widget",
              widgetKind: "html",
              widgetType: "html_widget",
              pluginId: cmd.pluginId || "flowchart",
              diagramKind: cmd.diagramKind,
              sourceFormat: cmd.sourceFormat,
              source: cmd.copyText || cmd.html,
              copyText: cmd.copyText,
              copyLabel: cmd.copyLabel,
              frameworkVersion: cmd.frameworkVersion,
              x: itemX,
              y: itemY,
              w: itemW,
              h: itemH,
              payload: cmd.html,
              title: cmd.title || "HTML Widget",
            };
            newDraftItems.push(widget);
          } else if (cmd.tool === "write_text") {
            newDraftItems.push({
              id,
              kind: "text",
              x: itemX,
              y: itemY,
              text: cmd.text,
              fontSize: cmd.fontSize || Math.round(20 / camScale),
              color: "#1a1a1a",
              width: itemW,
              height: Math.round((cmd.fontSize || 20) * 1.5),
            });
          } else if (cmd.tool === "draw_formula") {
            newDraftItems.push({
              id,
              kind: "text",
              x: itemX,
              y: itemY,
              text: cmd.latex,
              fontSize: cmd.fontSize || Math.round(22 / camScale),
              color: "#2563eb",
              width: itemW,
              height: Math.round((cmd.fontSize || 22) * 1.5),
            });
          }
        });

        setDraftItems(newDraftItems);
        setStatusMessage(
          data.message || (widgetEditContext ? "Widget refined!" : `AI generated ${newDraftItems.length} element(s)`)
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.info("[AI Hook] Request aborted by newer call");
          return;
        }
        console.error("[AI Hook Error]", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to communicate with AI endpoint");
      } finally {
        setIsThinking(false);
      }
    },
    [engine]
  );

  const triggerRefinement = useCallback(
    async (widget: WidgetItem) => {
      const editContext: WidgetEditContext = {
        mode: "replace",
        widgetType: widget.widgetType || (widget.widgetKind === "diagram" ? "diagram_source" : "html_widget"),
        pluginId: widget.pluginId || "flowchart",
        title: widget.title,
        instructionMode: "handwriting",
        box: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
        diagramKind: widget.diagramKind,
        sourceFormat: widget.sourceFormat,
        frameworkVersion: widget.frameworkVersion,
        source: widget.source || widget.copyText || widget.payload,
        copyText: widget.copyText,
        copyLabel: widget.copyLabel,
      };

      await triggerAi("", "refine", "medium", editContext, widget.id);
    },
    [triggerAi]
  );

  const acceptDraft = useCallback(() => {
    if (!engine || draftItems.length === 0) return;
    draftItems.forEach((item) => {
      const committedId = item.id.startsWith("draft_")
        ? item.id.replace(/^draft_/, "widget_")
        : item.id;
      const committedItem = { ...item, id: committedId };
      const existing = engine.getItem(item.id) || engine.getItem(committedId);
      if (existing) {
        engine.updateItem(existing.id, committedItem);
      } else {
        engine.addItem(committedItem);
      }
    });
    setDraftItems([]);
    setStatusMessage("Draft applied to canvas!");
  }, [engine, draftItems]);

  const discardDraft = useCallback(() => {
    setDraftItems([]);
    setStatusMessage("Draft discarded.");
  }, []);

  return {
    isThinking,
    statusMessage,
    draftItems,
    hasDraft: draftItems.length > 0,
    error,
    triggerAi,
    triggerRefinement,
    acceptDraft,
    discardDraft,
    clearError,
  };
}
