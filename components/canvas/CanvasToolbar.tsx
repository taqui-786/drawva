"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/lib/canvas/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CursorIcon,
  HandIcon,
  PencilIcon,
  EraserIcon,
  TextIcon,
  SquareIcon,
  EllipseIcon,
  ArrowRight01Icon,
  ColorsIcon,
  UndoIcon,
  RedoIcon,
  GridTableIcon,
  Delete02Icon,
  MagicWand01Icon,
  ImageAdd01Icon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

export const PALETTE = [
  "#111111",
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#f59e0b",
  "#9333ea",
  "#fbbf24",
];

const PRIMARY_TOOLS: {
  mode: CanvasMode;
  label: string;
  kbd: string;
  icon: typeof CursorIcon;
}[] = [
  { mode: "select", label: "Select", kbd: "V", icon: CursorIcon },
  { mode: "hand", label: "Hand", kbd: "H", icon: HandIcon },
  { mode: "pen", label: "Pen", kbd: "P", icon: PencilIcon },
  { mode: "eraser", label: "Eraser", kbd: "E", icon: EraserIcon },
  { mode: "text", label: "Text", kbd: "T", icon: TextIcon },
];

const SHAPE_TOOLS: {
  mode: CanvasMode;
  label: string;
  kbd: string;
  icon: typeof SquareIcon;
}[] = [
  { mode: "rect", label: "Rectangle", kbd: "R", icon: SquareIcon },
  { mode: "ellipse", label: "Ellipse", kbd: "O", icon: EllipseIcon },
  { mode: "arrow", label: "Arrow", kbd: "A", icon: ArrowRight01Icon },
];

function ToolButton({
  mode,
  tool,
  onMode,
  disabled = false,
}: {
  mode: CanvasMode;
  tool: {
    mode: CanvasMode;
    label: string;
    kbd: string;
    icon: typeof CursorIcon;
  };
  onMode: (m: CanvasMode) => void;
  disabled?: boolean;
}) {
  const active = mode === tool.mode;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant={active ? "secondaryPrimary" : "ghost"}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onMode(tool.mode);
            }}
            data-icon="true"
            className={cn(
              "shrink-0 size-8 sm:size-9 p-0 rounded-xl transition-all",
              active && "shadow-xs",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            <HugeiconsIcon icon={tool.icon} className="size-4" />
          </Button>
        }
      />
      <TooltipContent side="top">
        {disabled ? (
          "Tools locked during refinement"
        ) : (
          <>
            {tool.label} <span className="kbd">{tool.kbd}</span>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export interface CanvasToolbarProps {
  mode: CanvasMode;
  onMode: (m: CanvasMode) => void;
  toolsLocked?: boolean;
  viewMode?: boolean;
  onToggleViewMode?: () => void;
  color: string;
  onColor: (c: string) => void;
  pen: number;
  onPen: (p: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClear?: () => void;
  gridVisible?: boolean;
  onToggleGrid?: () => void;
  onImportImage?: () => void;
  onTidy?: () => void;
  aiStatus?: "idle" | "thinking" | "done" | "error";
  className?: string;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  mode,
  onMode,
  toolsLocked = false,
  viewMode = false,
  onToggleViewMode,
  color,
  onColor,
  pen,
  onPen,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onClear,
  gridVisible = true,
  onToggleGrid,
  onImportImage,
  onTidy,
  aiStatus = "idle",
  className,
}) => {
  const [styleOpen, setStyleOpen] = useState(false);

  if (viewMode) return null;

  const isShapeActive = ["rect", "ellipse", "arrow"].includes(mode);
  const activeShapeTool =
    SHAPE_TOOLS.find((s) => s.mode === mode) || SHAPE_TOOLS[0];

  return (
    <div
      role="toolbar"
      aria-label="Canvas Drawing Tools"
      className={cn(
        "fixed bottom-5 left-1/2 -translate-x-1/2 z-40 select-none transition-all duration-300 max-w-[calc(100vw-5rem)]",
        className
      )}
    >
      <div className="flex items-center gap-0.5 sm:gap-1 rounded-2xl border border-border/80 bg-background/95 dark:bg-zinc-950/90 backdrop-blur-md px-1.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        {/* Select */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[0]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* View Canvas (Eye icon) */}
        {onToggleViewMode && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={viewMode ? "secondaryPrimary" : "ghost"}
                  onClick={onToggleViewMode}
                  data-icon="true"
                  aria-label="View canvas"
                  aria-pressed={viewMode}
                  disabled={toolsLocked}
                  className={cn(
                    "shrink-0 size-8 sm:size-9 p-0 rounded-xl",
                    viewMode && "shadow-xs",
                    toolsLocked && "opacity-50 pointer-events-none"
                  )}
                >
                  <HugeiconsIcon icon={ViewIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              {viewMode ? "Exit view canvas (Esc)" : "View canvas"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Hand */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[1]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        <Separator orientation="vertical" className="mx-0.5 h-5 self-center" />

        {/* Drawing Tools: Pen, Eraser */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[2]}
          onMode={onMode}
          disabled={toolsLocked}
        />
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[3]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Shape Tools Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant={isShapeActive ? "secondaryPrimary" : "ghost"}
                aria-label="Shapes"
                data-icon="true"
                disabled={toolsLocked}
                className={cn(
                  "shrink-0 size-8 sm:size-9 p-0 rounded-xl",
                  isShapeActive && "shadow-xs",
                  toolsLocked && "opacity-50 pointer-events-none"
                )}
              >
                <HugeiconsIcon icon={activeShapeTool.icon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="center" side="top" sideOffset={8}>
            {SHAPE_TOOLS.map((s) => (
              <DropdownMenuItem
                key={s.mode}
                onClick={() => {
                  if (!toolsLocked) onMode(s.mode);
                }}
                disabled={toolsLocked}
                className="gap-2"
              >
                <HugeiconsIcon icon={s.icon} />
                <span>{s.label}</span>
                <span className="kbd ml-auto">{s.kbd}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Text Tool */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[4]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Style Popover (Color & Stroke Width) */}
        <Popover open={styleOpen} onOpenChange={setStyleOpen}>
          <PopoverTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                data-icon="true"
                aria-label="Colors & Stroke"
                className="shrink-0 size-8 sm:size-9 p-0 rounded-xl relative"
              >
                <HugeiconsIcon icon={ColorsIcon} className="size-4" />
                <span
                  className="absolute bottom-1.5 right-1.5 size-2 rounded-full border border-background shadow-xs"
                  style={{ backgroundColor: color }}
                />
              </Button>
            }
          />
          <PopoverContent
            align="center"
            side="top"
            sideOffset={8}
            className="w-56 items-start gap-3 p-3"
          >
            <PopoverHeader>
              <PopoverTitle className="text-xs font-semibold">Style</PopoverTitle>
            </PopoverHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onColor(c);
                    setStyleOpen(false);
                  }}
                  title={c}
                  aria-label={`Color ${c}`}
                  className="size-6 rounded-full border transition-transform hover:scale-110 cursor-pointer"
                  style={{
                    background: c,
                    borderColor:
                      color === c ? "var(--foreground)" : "var(--border)",
                    outline: color === c ? "2px solid var(--ring)" : "none",
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2 w-full mt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Stroke width</span>
                <span className="font-mono">{pen}px</span>
              </div>
              <Slider
                min={1}
                max={16}
                step={1}
                value={[pen]}
                onValueChange={(v) =>
                  onPen(Number(Array.isArray(v) ? v[0] : v))
                }
              />
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-0.5 h-5 self-center" />

        {/* Undo / Redo */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onUndo}
                disabled={!canUndo}
                data-icon="true"
                aria-label="Undo"
                className="shrink-0 size-8 sm:size-9 p-0 rounded-xl"
              >
                <HugeiconsIcon icon={UndoIcon} className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="top">
            Undo <span className="kbd">⌘Z</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onRedo}
                disabled={!canRedo}
                data-icon="true"
                aria-label="Redo"
                className="shrink-0 size-8 sm:size-9 p-0 rounded-xl"
              >
                <HugeiconsIcon icon={RedoIcon} className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="top">
            Redo <span className="kbd">⇧⌘Z</span>
          </TooltipContent>
        </Tooltip>

        {/* Grid Toggle */}
        {onToggleGrid && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={gridVisible ? "secondaryPrimary" : "ghost"}
                  onClick={onToggleGrid}
                  data-icon="true"
                  aria-label={gridVisible ? "Hide canvas grid" : "Show canvas grid"}
                  aria-pressed={gridVisible}
                  disabled={toolsLocked}
                  className={cn(
                    "hidden sm:flex shrink-0 size-8 sm:size-9 p-0 rounded-xl",
                    gridVisible && "shadow-xs"
                  )}
                >
                  <HugeiconsIcon icon={GridTableIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              {gridVisible ? "Hide canvas grid" : "Show canvas grid"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Clear Board - directly visible outside menu */}
        {onClear && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={onClear}
                  data-icon="true"
                  aria-label="Clear Board"
                  className="shrink-0 size-8 sm:size-9 p-0 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Clear Board
            </TooltipContent>
          </Tooltip>
        )}

        {/* More Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                data-icon="true"
                aria-label="More actions"
                className="shrink-0 size-8 sm:size-9 p-0 rounded-xl"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-48">
            {onTidy && (
              <DropdownMenuItem
                disabled={aiStatus === "thinking"}
                onClick={onTidy}
              >
                <HugeiconsIcon icon={MagicWand01Icon} />
                Tidy layout
              </DropdownMenuItem>
            )}
            {onImportImage && (
              <DropdownMenuItem onClick={onImportImage}>
                <HugeiconsIcon icon={ImageAdd01Icon} />
                Insert Image
              </DropdownMenuItem>
            )}
            {onToggleGrid && (
              <DropdownMenuItem onClick={onToggleGrid} className="sm:hidden">
                <HugeiconsIcon icon={GridTableIcon} />
                {gridVisible ? "Hide canvas grid" : "Show canvas grid"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default CanvasToolbar;
