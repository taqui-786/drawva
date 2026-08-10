"use client";
// ============================================================
// Drawva — Right Toolbar (Control Panel & Conditional Tool Options)
// ============================================================

import { HugeiconsIcon } from "@hugeicons/react";
import {
  UndoIcon,
  RedoIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  ArrowExpand01Icon,
  GridIcon,
  SaveEnergy01Icon,
  Download01Icon,
  Copy01Icon,
  Delete01Icon,
  Moon01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
import { useCanvasState, useCanvasApi } from "./CanvasProvider";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

function Icon({ icon, size = 18 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

const PALETTE = [
  "#1a1a1a",  // near-black
  "#ef4444",  // red
  "#f97316",  // orange
  "#eab308",  // yellow
  "#22c55e",  // green
  "#3b82f6",  // blue
  "#8b5cf6",  // violet
  "#ec4899",  // pink
  "#ffffff",  // white
];

// Tools that use color/size styling
const STYLED_TOOLS = new Set([
  "pen",
  "highlighter",
  "eraser",
  "text",
  "rect",
  "ellipse",
  "arrow",
  "line",
]);

function Divider() {
  return <div className="h-px w-full bg-border/60 my-2" />;
}

export function CanvasToolbarRight() {
  const state = useCanvasState();
  const api = useCanvasApi();
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = useCallback(() => {
    setDarkMode((d) => {
      document.documentElement.classList.toggle("dark", !d);
      return !d;
    });
  }, []);

  const isConditionalToolActive = STYLED_TOOLS.has(state.activeTool);

  return (
    <aside
      id="canvas-right-toolbar"
      role="toolbar"
      aria-label="Canvas controls and options"
      className={cn(
        "flex flex-col items-center gap-1 py-3 px-2",
        "h-full w-14 shrink-0",
        "bg-card/90 backdrop-blur-md border-l border-border/60 z-20",
        "overflow-y-auto overflow-x-hidden",
        "select-none shadow-sm"
      )}
    >
      {/* Permanent Utility Actions */}
      <button
        id="btn-undo"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={api.undo}
        disabled={!state.canUndo}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
          "hover:bg-muted/80 active:scale-95",
          state.canUndo ? "text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
        )}
      >
        <Icon icon={UndoIcon} size={18} />
      </button>

      <button
        id="btn-redo"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        onClick={api.redo}
        disabled={!state.canRedo}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
          "hover:bg-muted/80 active:scale-95",
          state.canRedo ? "text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
        )}
      >
        <Icon icon={RedoIcon} size={18} />
      </button>

      <Divider />

      {/* Zoom controls */}
      <button
        id="btn-zoom-in"
        title="Zoom in (Ctrl+=)"
        aria-label="Zoom in"
        onClick={api.zoomIn}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={ZoomInAreaIcon} size={18} />
      </button>

      <span className="text-[10px] font-mono text-muted-foreground tabular-nums min-w-[36px] text-center my-0.5">
        {Math.round(state.zoom * 100)}%
      </span>

      <button
        id="btn-zoom-out"
        title="Zoom out (Ctrl+-)"
        aria-label="Zoom out"
        onClick={api.zoomOut}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={ZoomOutAreaIcon} size={18} />
      </button>

      <button
        id="btn-fit"
        title="Fit Screen (0) - Auto-zoom to fit content"
        aria-label="Fit Screen"
        onClick={api.fitContent}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={ArrowExpand01Icon} size={18} />
      </button>

      <Divider />

      {/* Canvas Utilities */}
      <button
        id="btn-grid"
        title="Toggle grid"
        aria-label="Toggle grid"
        onClick={api.toggleGrid}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
          "hover:bg-muted/80 active:scale-95",
          state.gridVisible ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon icon={GridIcon} size={18} />
      </button>

      <button
        id="btn-save"
        title="Save document"
        aria-label="Save canvas"
        onClick={api.saveNow}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={SaveEnergy01Icon} size={18} />
      </button>

      <button
        id="btn-export"
        title="Export PNG image"
        aria-label="Export as PNG"
        onClick={api.exportPng}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={Download01Icon} size={18} />
      </button>

      <button
        id="btn-copy"
        title="Copy canvas image to clipboard"
        aria-label="Copy to clipboard"
        onClick={api.copyToClipboard}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={Copy01Icon} size={18} />
      </button>

      <button
        id="btn-clear"
        title="Clear Canvas Bin (Permanently wipes canvas & saved storage)"
        aria-label="Clear canvas"
        onClick={api.clearAll}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-destructive/10 active:scale-95 text-muted-foreground hover:text-destructive transition-all"
      >
        <Icon icon={Delete01Icon} size={18} />
      </button>

      <button
        id="btn-dark"
        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle dark mode"
        onClick={toggleDark}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all"
      >
        <Icon icon={darkMode ? Sun01Icon : Moon01Icon} size={18} />
      </button>

      {/* CONDITIONAL TOOL PROPERTIES PANEL */}
      {isConditionalToolActive && (
        <>
          <Divider />

          {/* Size slider */}
          <div className="flex flex-col items-center gap-1 py-1 w-full">
            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
              Size
            </span>
            <input
              id="brush-size-slider"
              type="range"
              min={1}
              max={40}
              value={state.size}
              onChange={(e) => api.setSize(Number(e.target.value))}
              aria-label="Brush size"
              className="h-1 w-full cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {state.size}px
            </span>
          </div>

          <Divider />

          {/* Color palette */}
          <div className="flex flex-col items-center gap-1.5 py-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
              Color
            </span>
            {PALETTE.map((c) => (
              <button
                key={c}
                id={`color-${c.replace("#", "")}`}
                title={c}
                aria-label={`Color ${c}`}
                aria-pressed={state.color === c}
                onClick={() => api.setColor(c)}
                className={cn(
                  "size-5.5 rounded-full transition-all",
                  "ring-offset-1 hover:scale-110 active:scale-95",
                  state.color === c
                    ? "ring-2 ring-primary ring-offset-background scale-110"
                    : "ring-1 ring-border/60"
                )}
                style={{
                  background: c,
                  boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.15)" : undefined,
                }}
              />
            ))}
            {/* Custom color wheel picker */}
            <label
              title="Custom color picker"
              aria-label="Custom color picker"
              className="relative size-5.5 rounded-full border border-border/60 overflow-hidden cursor-pointer hover:scale-110 transition-transform mt-0.5"
            >
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
                  opacity: 0.85,
                }}
              />
              <input
                id="custom-color-picker"
                type="color"
                value={state.color}
                onChange={(e) => api.setColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Custom color"
              />
            </label>
          </div>
        </>
      )}
    </aside>
  );
}
