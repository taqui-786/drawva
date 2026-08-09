"use client";
// ============================================================
// Drawva — Canvas Toolbar
// shadcn/Base UI + HugeIcons. Full tool palette.
// ============================================================

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Pen02Icon,
  Pen01Icon,
  EraserIcon,
  Hand,
  CursorAddSelection01Icon,
  Cursor01Icon,
  Square01Icon,
  OvalIcon,
  ArrowRight01Icon,
  ImageUploadIcon,
  Delete01Icon,
  UndoIcon,
  RedoIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  ArrowExpand01Icon,
  Download01Icon,
  Copy01Icon,
  GridIcon,
  Moon01Icon,
  Sun01Icon,
  SaveEnergy01Icon,
} from "@hugeicons/core-free-icons";
import { useCanvasState, useCanvasApi } from "./CanvasProvider";
import type { ToolName } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

function Icon({ icon, size = 18 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

// ── Color palette ──────────────────────────────────────────

const PALETTE = [
  "#1a1a1a",  // near-black
  "#ef4444",  // red
  "#f97316",  // orange
  "#eab308",  // yellow
  "#22c55e",  // green
  "#3b82f6",  // blue
  "#8b5cf6",  // violet
  "#ec4899",  // pink
  "#06b6d4",  // cyan
  "#ffffff",  // white
];

// ── Tool button ────────────────────────────────────────────

interface ToolBtnProps {
  tool: ToolName;
  icon: HugeIcon;
  label: string;
  active: boolean;
  onSelect: (t: ToolName) => void;
}

function ToolBtn({ tool, icon, label, active, onSelect }: ToolBtnProps) {
  return (
    <button
      id={`tool-${tool}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
        "hover:bg-muted/80 active:scale-95",
        active
          ? "bg-primary/15 text-primary ring-1 ring-primary/40 shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon icon={icon} size={18} />
    </button>
  );
}

// ── Divider ─────────────────────────────────────────────────

function Divider() {
  return <div className="h-px w-full bg-border/60 my-1" />;
}

// ── Size slider ─────────────────────────────────────────────

function SizeSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-1">
      <span className="text-[10px] text-muted-foreground font-medium">Size</span>
      <input
        id="brush-size-slider"
        type="range"
        min={1}
        max={40}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Brush size"
        className="h-1 w-full cursor-pointer accent-primary"
        style={{ writingMode: "horizontal-tb" }}
      />
      <span className="text-[10px] text-muted-foreground tabular-nums">{value}px</span>
    </div>
  );
}

// ── Zoom display ────────────────────────────────────────────

function ZoomLabel({ zoom }: { zoom: number }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground tabular-nums min-w-[36px] text-center">
      {Math.round(zoom * 100)}%
    </span>
  );
}

// ── Main Toolbar ────────────────────────────────────────────

export function CanvasToolbar() {
  const state = useCanvasState();
  const api = useCanvasApi();
  const [darkMode, setDarkMode] = useState(false);

  const handleTool = useCallback(
    (tool: ToolName) => api.setTool(tool),
    [api]
  );

  const toggleDark = useCallback(() => {
    setDarkMode((d) => {
      document.documentElement.classList.toggle("dark", !d);
      return !d;
    });
  }, []);

  return (
    <aside
      id="canvas-toolbar"
      role="toolbar"
      aria-label="Canvas tools"
      className={cn(
        "flex flex-col items-center gap-1 py-3 px-2",
        "h-full w-14 shrink-0",
        "bg-card border-r border-border/60",
        "overflow-y-auto overflow-x-hidden",
        "select-none"
      )}
    >
      {/* Drawing tools */}
      <ToolBtn tool="pen" icon={Pen02Icon} label="Pen (P)" active={state.activeTool === "pen"} onSelect={handleTool} />
      <ToolBtn tool="highlighter" icon={Pen01Icon} label="Highlighter (H)" active={state.activeTool === "highlighter"} onSelect={handleTool} />
      <ToolBtn tool="eraser" icon={EraserIcon} label="Eraser (E)" active={state.activeTool === "eraser"} onSelect={handleTool} />
      <ToolBtn tool="hand" icon={Hand} label="Pan / Hand (Space)" active={state.activeTool === "hand"} onSelect={handleTool} />
      <ToolBtn tool="select" icon={CursorAddSelection01Icon} label="Lasso Select (S)" active={state.activeTool === "select"} onSelect={handleTool} />

      <Divider />

      {/* Object tools */}
      <ToolBtn tool="text" icon={Cursor01Icon} label="Text (T)" active={state.activeTool === "text"} onSelect={handleTool} />
      <ToolBtn tool="rect" icon={Square01Icon} label="Rectangle (R)" active={state.activeTool === "rect"} onSelect={handleTool} />
      <ToolBtn tool="ellipse" icon={OvalIcon} label="Ellipse (O)" active={state.activeTool === "ellipse"} onSelect={handleTool} />
      <ToolBtn tool="arrow" icon={ArrowRight01Icon} label="Arrow (A)" active={state.activeTool === "arrow"} onSelect={handleTool} />
      <ToolBtn tool="image" icon={ImageUploadIcon} label="Import Image (I)" active={state.activeTool === "image"} onSelect={handleTool} />

      <Divider />

      {/* Size slider */}
      <SizeSlider value={state.size} onChange={api.setSize} />

      <Divider />

      {/* Color palette */}
      <div className="flex flex-col items-center gap-1.5 py-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            id={`color-${c.replace("#", "")}`}
            title={c}
            aria-label={`Color ${c}`}
            aria-pressed={state.color === c}
            onClick={() => api.setColor(c)}
            className={cn(
              "size-6 rounded-full transition-all",
              "ring-offset-1 hover:scale-110 active:scale-95",
              state.color === c
                ? "ring-2 ring-primary ring-offset-background scale-110"
                : "ring-1 ring-border/60"
            )}
            style={{
              background: c,
              boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.12)" : undefined,
            }}
          />
        ))}
        {/* Custom color picker */}
        <label
          title="Custom color"
          aria-label="Custom color picker"
          className="relative size-6 rounded-full border border-border/60 overflow-hidden cursor-pointer hover:scale-110 transition-transform"
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
              opacity: 0.8,
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

      <Divider />

      {/* Undo / Redo */}
      <button
        id="btn-undo"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={api.undo}
        disabled={!state.canUndo}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
          "hover:bg-muted/80 active:scale-95",
          state.canUndo ? "text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
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
          state.canRedo ? "text-foreground" : "text-muted-foreground/40 cursor-not-allowed"
        )}
      >
        <Icon icon={RedoIcon} size={18} />
      </button>

      <Divider />

      {/* Zoom controls */}
      <button id="btn-zoom-in" title="Zoom in (Ctrl+=)" aria-label="Zoom in" onClick={api.zoomIn}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={ZoomInAreaIcon} size={18} />
      </button>

      <ZoomLabel zoom={state.zoom} />

      <button id="btn-zoom-out" title="Zoom out (Ctrl+-)" aria-label="Zoom out" onClick={api.zoomOut}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={ZoomOutAreaIcon} size={18} />
      </button>

      <button id="btn-fit" title="Fit content (0)" aria-label="Fit content" onClick={api.fitContent}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={ArrowExpand01Icon} size={18} />
      </button>

      <Divider />

      {/* Grid, Save, Export */}
      <button id="btn-grid" title="Toggle grid" aria-label="Toggle grid" onClick={api.toggleGrid}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
          "hover:bg-muted/80 active:scale-95",
          state.gridVisible ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}>
        <Icon icon={GridIcon} size={18} />
      </button>

      <button id="btn-save" title="Save" aria-label="Save canvas" onClick={api.saveNow}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={SaveEnergy01Icon} size={18} />
      </button>

      <button id="btn-export" title="Export PNG" aria-label="Export as PNG" onClick={api.exportPng}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={Download01Icon} size={18} />
      </button>

      <button id="btn-copy" title="Copy to clipboard" aria-label="Copy to clipboard" onClick={api.copyToClipboard}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={Copy01Icon} size={18} />
      </button>

      <button id="btn-clear" title="Clear all" aria-label="Clear canvas" onClick={api.clearAll}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-destructive/10 active:scale-95 text-muted-foreground hover:text-destructive transition-all">
        <Icon icon={Delete01Icon} size={18} />
      </button>

      <Divider />

      {/* Dark mode toggle */}
      <button id="btn-dark" title={darkMode ? "Light mode" : "Dark mode"} aria-label="Toggle dark mode"
        onClick={toggleDark}
        className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted/80 active:scale-95 text-muted-foreground hover:text-foreground transition-all">
        <Icon icon={darkMode ? Sun01Icon : Moon01Icon} size={18} />
      </button>
    </aside>
  );
}
