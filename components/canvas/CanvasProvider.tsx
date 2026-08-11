"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { CanvasEngine } from "@/lib/canvas/engine";
import { ToolType } from "@/lib/canvas/types";
import { captureViewportAtlas } from "@/lib/canvas/atlas";
import { buildCompactSceneJson } from "@/lib/canvas/scene";
import { saveCanvasToIndexedDb, loadCanvasFromIndexedDb } from "@/lib/canvas/persistence";

interface CanvasContextType {
  engine: CanvasEngine | null;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
  activeSize: number;
  setActiveSize: (size: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  isAutoMode: boolean;
  setAutoMode: (auto: boolean) => void;
  isAiThinking: boolean;
  triggerAiAnalysis: (userAction?: string) => Promise<void>;
  acceptDraft: () => void;
  discardDraft: () => void;
  hasDraft: boolean;
  alertState: { open: boolean; title: string; message: string };
  showAlert: (title: string, message: string) => void;
  closeAlert: () => void;
}

const CanvasContext = createContext<CanvasContextType | null>(null);

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<CanvasEngine | null>(null);

  const [activeTool, setActiveToolState] = useState<ToolType>("pen");
  const [activeColor, setActiveColorState] = useState<string>("#1e293b");
  const [activeSize, setActiveSizeState] = useState<number>(4);
  const [zoom, setZoomState] = useState<number>(1.0);
  const [isAutoMode, setAutoMode] = useState<boolean>(false);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [alertState, setAlertState] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const showAlert = useCallback((title: string, message: string) => {
    setAlertState({ open: true, title, message });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }));
  }, []);

  const isAutoModeRef = useRef<boolean>(isAutoMode);
  useEffect(() => {
    isAutoModeRef.current = isAutoMode;
  }, [isAutoMode]);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const autoDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdCounterRef = useRef<number>(0);

  const triggerAiAnalysis = useCallback(
    async (userAction: string = "manual") => {
      if (!engine) return;

      // Supersede any active in-flight request
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }

      const controller = new AbortController();
      activeAbortControllerRef.current = controller;
      const currentRequestId = ++requestIdCounterRef.current;

      setIsAiThinking(true);

      try {
        const atlas = captureViewportAtlas(engine);
        const scene = buildCompactSceneJson(engine.items);

        const res = await fetch("/api/canvas/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            image: atlas?.dataUrl,
            visibleRect: atlas?.visibleRect,
            scene,
            userAction,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (currentRequestId === requestIdCounterRef.current && Array.isArray(data.commands)) {
          engine.setDraftCommands(data.commands);
          setHasDraft(engine.draftItems.length > 0);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[AI Provider] 🛑 Superseded in-flight request");
        } else {
          console.error("[AI Provider] Error during AI analysis:", err);
        }
      } finally {
        if (currentRequestId === requestIdCounterRef.current) {
          setIsAiThinking(false);
          activeAbortControllerRef.current = null;
        }
      }
    },
    [engine]
  );

  const triggerAiAnalysisRef = useRef(triggerAiAnalysis);
  useEffect(() => {
    triggerAiAnalysisRef.current = triggerAiAnalysis;
  }, [triggerAiAnalysis]);

  useEffect(() => {
    if (!containerRef.current) return;

    const canvasEngine = new CanvasEngine({
      container: containerRef.current,
      initialTool: activeTool,
      onToolChange: (tool) => setActiveToolState(tool),
      onStateChange: (eng) => {
        if (eng) {
          setZoomState(eng.camera.zoom);
          setHasDraft(eng.draftItems.length > 0);

          // IndexedDB Autosave
          if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = setTimeout(() => {
            saveCanvasToIndexedDb(eng);
          }, 1000);

          // Auto-trigger debounce 1200ms after stroke completion
          if (isAutoModeRef.current) {
            if (autoDebounceTimerRef.current) clearTimeout(autoDebounceTimerRef.current);
            autoDebounceTimerRef.current = setTimeout(() => {
              triggerAiAnalysisRef.current("auto");
            }, 1200);
          }
        }
      },
    });

    // Restore autosaved canvas state
    loadCanvasFromIndexedDb(canvasEngine);

    setEngine(canvasEngine);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (autoDebounceTimerRef.current) clearTimeout(autoDebounceTimerRef.current);
      if (activeAbortControllerRef.current) activeAbortControllerRef.current.abort();
      canvasEngine.destroy();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveTool = (tool: ToolType) => {
    setActiveToolState(tool);
    if (engine) engine.setTool(tool);
  };

  const setActiveColor = (color: string) => {
    setActiveColorState(color);
    if (engine) engine.setColor(color);
  };

  const setActiveSize = (size: number) => {
    setActiveSizeState(size);
    if (engine) engine.setSize(size);
  };

  const setZoom = (newZoom: number) => {
    if (engine) {
      engine.camera.setState({ zoom: newZoom });
      engine.requestRender();
      engine.notifyStateChange();
      setZoomState(engine.camera.zoom);
    }
  };

  const acceptDraft = () => {
    if (engine) {
      engine.acceptDraft();
      setHasDraft(false);
    }
  };

  const discardDraft = () => {
    if (engine) {
      engine.discardDraft();
      setHasDraft(false);
    }
  };

  return (
    <CanvasContext.Provider
      value={{
        engine,
        activeTool,
        setActiveTool,
        activeColor,
        setActiveColor,
        activeSize,
        setActiveSize,
        zoom,
        setZoom,
        isAutoMode,
        setAutoMode,
        isAiThinking,
        triggerAiAnalysis,
        acceptDraft,
        discardDraft,
        hasDraft,
        alertState,
        showAlert,
        closeAlert,
      }}
    >
      <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none touch-none">
        {children}
      </div>
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvas must be used within CanvasProvider");
  return ctx;
}
