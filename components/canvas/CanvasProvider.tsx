"use client";
// ============================================================
// Drawva — Canvas React Context + State
// Engine state mirrors to React only for toolbar display.
// The engine never re-renders from React — it owns its state.
// ============================================================

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ToolName } from "@/lib/canvas/types";

export interface CanvasUIState {
  activeTool: ToolName;
  color: string;
  size: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  gridVisible: boolean;
  saved: boolean;
}

export interface CanvasContextValue {
  state: CanvasUIState;
  setState: React.Dispatch<React.SetStateAction<CanvasUIState>>;
  engineRef: React.MutableRefObject<import("@/lib/canvas/engine").CanvasEngine | null>;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

const DEFAULT_STATE: CanvasUIState = {
  activeTool: "pen",
  color: "#1a1a1a",
  size: 3,
  zoom: 1,
  canUndo: false,
  canRedo: false,
  gridVisible: true,
  saved: true,
};

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CanvasUIState>(DEFAULT_STATE);
  const engineRef = useRef<import("@/lib/canvas/engine").CanvasEngine | null>(null);

  return (
    <CanvasContext.Provider value={{ state, setState, engineRef }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvasContext must be used inside <CanvasProvider>");
  return ctx;
}

/** Hook: get the UI state snapshot */
export function useCanvasState(): CanvasUIState {
  return useCanvasContext().state;
}

/** Hook: imperative API that delegates to engine */
export function useCanvasApi() {
  const { engineRef, setState } = useCanvasContext();

  const setTool = useCallback((tool: ToolName) => {
    engineRef.current?.setTool(tool);
    setState((s) => ({ ...s, activeTool: tool }));
  }, [engineRef, setState]);

  const setColor = useCallback((color: string) => {
    engineRef.current?.setColor(color);
    setState((s) => ({ ...s, color }));
  }, [engineRef, setState]);

  const setSize = useCallback((size: number) => {
    engineRef.current?.setSize(size);
    setState((s) => ({ ...s, size }));
  }, [engineRef, setState]);

  const undo = useCallback(() => {
    engineRef.current?.undo();
  }, [engineRef]);

  const redo = useCallback(() => {
    engineRef.current?.redo();
  }, [engineRef]);

  const clearAll = useCallback(async () => {
    if (confirm("Clear the entire canvas? This will wipe the board and storage.")) {
      await engineRef.current?.clearAll();
    }
  }, [engineRef]);

  const fitContent = useCallback(() => {
    engineRef.current?.fitContent();
  }, [engineRef]);

  const zoomIn = useCallback(() => {
    engineRef.current?.zoomIn();
  }, [engineRef]);

  const zoomOut = useCallback(() => {
    engineRef.current?.zoomOut();
  }, [engineRef]);

  const resetZoom = useCallback(() => {
    engineRef.current?.resetZoom();
  }, [engineRef]);

  const exportPng = useCallback(async () => {
    await engineRef.current?.exportPng();
  }, [engineRef]);

  const copyToClipboard = useCallback(async () => {
    const ok = await engineRef.current?.copyToClipboard();
    return ok ?? false;
  }, [engineRef]);

  const toggleGrid = useCallback(() => {
    const visible = engineRef.current?.toggleGrid();
    setState((s) => ({ ...s, gridVisible: visible ?? s.gridVisible }));
  }, [engineRef, setState]);

  const saveNow = useCallback(async () => {
    await engineRef.current?.saveNow();
    setState((s) => ({ ...s, saved: true }));
  }, [engineRef, setState]);

  return {
    setTool,
    setColor,
    setSize,
    undo,
    redo,
    clearAll,
    fitContent,
    zoomIn,
    zoomOut,
    resetZoom,
    exportPng,
    copyToClipboard,
    toggleGrid,
    saveNow,
  };
}
