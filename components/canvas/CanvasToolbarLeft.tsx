"use client";
// ============================================================
// Drawva — Left Toolbar (Primary Drawing & Object Tools)
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
  StrokeRightIcon,
  ImageUploadIcon,
} from "@hugeicons/core-free-icons";
import { useCanvasState, useCanvasApi } from "./CanvasProvider";
import type { ToolName } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

function Icon({ icon, size = 18 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

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

function Divider() {
  return <div className="h-px w-full bg-border/60 my-1.5" />;
}

export function CanvasToolbarLeft() {
  const state = useCanvasState();
  const api = useCanvasApi();

  const handleTool = useCallback(
    (tool: ToolName) => api.setTool(tool),
    [api]
  );

  return (
    <aside
      id="canvas-left-toolbar"
      role="toolbar"
      aria-label="Primary drawing tools"
      className={cn(
        "flex flex-col items-center gap-1 py-3 px-2",
        "h-full w-14 shrink-0",
        "bg-card/90 backdrop-blur-md border-r border-border/60 z-20",
        "overflow-y-auto overflow-x-hidden",
        "select-none shadow-sm"
      )}
    >
      {/* Freehand drawing tools */}
      <ToolBtn tool="pen" icon={Pen02Icon} label="Pen (P)" active={state.activeTool === "pen"} onSelect={handleTool} />
      <ToolBtn tool="highlighter" icon={Pen01Icon} label="Highlighter (H)" active={state.activeTool === "highlighter"} onSelect={handleTool} />
      <ToolBtn tool="eraser" icon={EraserIcon} label="Eraser (E)" active={state.activeTool === "eraser"} onSelect={handleTool} />
      <ToolBtn tool="hand" icon={Hand} label="Pan / Hand (Space)" active={state.activeTool === "hand"} onSelect={handleTool} />
      <ToolBtn tool="select" icon={CursorAddSelection01Icon} label="Marquee Selection (S)" active={state.activeTool === "select"} onSelect={handleTool} />

      <Divider />

      {/* Shapes & Items */}
      <ToolBtn tool="text" icon={Cursor01Icon} label="Text (T)" active={state.activeTool === "text"} onSelect={handleTool} />
      <ToolBtn tool="rect" icon={Square01Icon} label="Rectangle (R)" active={state.activeTool === "rect"} onSelect={handleTool} />
      <ToolBtn tool="ellipse" icon={OvalIcon} label="Ellipse (O)" active={state.activeTool === "ellipse"} onSelect={handleTool} />
      <ToolBtn tool="arrow" icon={ArrowRight01Icon} label="Arrow Shape (A) - Directional arrow" active={state.activeTool === "arrow"} onSelect={handleTool} />
      <ToolBtn tool="line" icon={StrokeRightIcon} label="Line (L) - Straight line" active={state.activeTool === "line"} onSelect={handleTool} />
      <ToolBtn tool="image" icon={ImageUploadIcon} label="Import Image (I)" active={state.activeTool === "image"} onSelect={handleTool} />
    </aside>
  );
}
