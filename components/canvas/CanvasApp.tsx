"use client";

import React, { useEffect } from "react";
import { CanvasProvider, useCanvas } from "./CanvasProvider";
import { CanvasHeader } from "./CanvasHeader";
import { WidgetManager } from "@/lib/canvas/widgets";
import { WidgetItem } from "@/lib/canvas/types";
import { moveItem } from "@/lib/canvas/selection";

function CanvasInner() {
  const { engine, setActiveTool } = useCanvas();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (key === "v") setActiveTool("select");
      else if (key === "l") setActiveTool("lasso");
      else if (key === "p") setActiveTool("pen");
      else if (key === "h") setActiveTool("hand");
      else if (key === "e") setActiveTool("eraser");
      else if (key === "t") setActiveTool("text");
      else if (key === "r") setActiveTool("rect");
      else if (key === "o") setActiveTool("ellipse");
      else if (key === "a") setActiveTool("arrow");
      else if (e.key === "Delete" || e.key === "Backspace") {
        if (engine && engine.selectedItemIds.length > 0) {
          engine.items = engine.items.filter((item) => !engine.selectedItemIds.includes(item.id));
          engine.selectedItemIds = [];
          engine.requestRender();
          engine.notifyStateChange();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [engine, setActiveTool]);

  // Sync widget manager with engine items
  useEffect(() => {
    if (!engine) return;

    const widgetContainer = document.createElement("div");
    widgetContainer.id = "drawva-widget-layer";
    widgetContainer.className = "absolute inset-0 pointer-events-none z-10";
    const targetParent = (engine as unknown as { container: HTMLElement }).container || engine.layerManager.layers?.interactionCanvas.parentElement || document.body;
    targetParent.appendChild(widgetContainer);

    const widgetManager = new WidgetManager(widgetContainer);

    const handleDelete = (id: string) => {
      engine.items = engine.items.filter((item) => item.id !== id);
      engine.draftItems = engine.draftItems.filter((item) => item.id !== id);
      engine.selectedItemIds = engine.selectedItemIds.filter((selId) => selId !== id);
      engine.requestRender();
      engine.notifyStateChange();
    };

    const handleAccept = (id: string) => {
      const draftWidget = engine.draftItems.find((item) => item.id === id);
      if (draftWidget) {
        engine.items.push(draftWidget);
        engine.draftItems = engine.draftItems.filter((item) => item.id !== id);
        engine.selectedItemIds = []; // Clear selection on acceptance
        engine.requestRender();
        engine.notifyStateChange();
      }
    };

    const handleMove = (id: string, dx: number, dy: number) => {
      engine.items = engine.items.map((item) => (item.id === id ? (moveItem(item, dx, dy) as WidgetItem) : item));
      engine.draftItems = engine.draftItems.map((item) => (item.id === id ? (moveItem(item, dx, dy) as WidgetItem) : item));
      engine.requestRender();
    };

    const updateWidgets = () => {
      const itemWidgets = engine.items.filter((item): item is WidgetItem => item.kind === "widget");
      const draftWidgets = engine.draftItems.filter((item): item is WidgetItem => item.kind === "widget");
      widgetManager.updateAll(
        itemWidgets,
        draftWidgets,
        engine.selectedItemIds,
        engine.camera,
        handleDelete,
        handleAccept,
        handleMove
      );
    };

    const interval = setInterval(updateWidgets, 50);

    return () => {
      clearInterval(interval);
      widgetManager.clear();
      widgetContainer.remove();
    };
  }, [engine]);

  return <CanvasHeader />;
}

export function CanvasApp() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-background text-foreground relative select-none">
      <CanvasProvider>
        <CanvasInner />
      </CanvasProvider>
    </div>
  );
}
