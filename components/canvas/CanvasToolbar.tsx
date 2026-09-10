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
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  Image01Icon,
  Download01Icon,
  Upload01Icon,
  Maximize01Icon,
  ScreenRotationIcon,
  PeerToPeer01Icon,
  TerminalIcon,
  BookOpen01Icon,
  AiChipIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { requestFullscreenLandscape } from "@/lib/canvas/orientation";

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
  onExportPng?: () => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
  onOpenConnect?: () => void;
  onOpenLogs?: () => void;
  onOpenManual?: () => void;
  onOpenModelSelect?: () => void;
  onOpenSettings?: () => void;
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
  onExportPng,
  onExportJson,
  onImportJson,
  onOpenConnect,
  onOpenLogs,
  onOpenManual,
  onOpenModelSelect,
  onOpenSettings,
  className,
}) => {
  const [styleOpen, setStyleOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

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
                  aria-label="View Canvas only"
                  className={cn(
                    "shrink-0 size-8 sm:size-9 p-0 rounded-xl transition-all",
                    viewMode && "shadow-xs"
                  )}
                >
                  <HugeiconsIcon icon={ViewIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              View Canvas <span className="kbd">Alt+V</span>
            </TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5 self-center opacity-50" />

        {/* Hand */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[1]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Pen */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[2]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Eraser */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[3]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Text */}
        <ToolButton
          mode={mode}
          tool={PRIMARY_TOOLS[4]}
          onMode={onMode}
          disabled={toolsLocked}
        />

        {/* Shapes Menu */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant={isShapeActive ? "secondaryPrimary" : "ghost"}
                      aria-pressed={isShapeActive}
                      disabled={toolsLocked}
                      data-icon="true"
                      aria-label="Shape tools"
                      className={cn(
                        "shrink-0 size-8 sm:size-9 p-0 rounded-xl transition-all",
                        isShapeActive && "shadow-xs",
                        toolsLocked && "opacity-50 pointer-events-none"
                      )}
                    />
                  }
                >
                  <HugeiconsIcon icon={activeShapeTool.icon} className="size-4" />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent side="top">
              {isShapeActive
                ? `${activeShapeTool.label} (${activeShapeTool.kbd})`
                : "Shapes (R, O, A)"}
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent align="center" side="top" sideOffset={8} className="w-36">
            {SHAPE_TOOLS.map((s) => (
              <DropdownMenuItem
                key={s.mode}
                onClick={() => onMode(s.mode)}
                className={cn("flex items-center gap-2 cursor-pointer", mode === s.mode && "font-semibold text-primary")}
              >
                <HugeiconsIcon icon={s.icon} className="size-4" />
                <span className="flex-1">{s.label}</span>
                <span className="kbd text-[10px]">{s.kbd}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-0.5 h-5 self-center opacity-50" />

        {/* Color & Stroke Popover */}
        <Popover open={styleOpen} onOpenChange={setStyleOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      data-icon="true"
                      aria-label="Color and stroke style"
                      className="shrink-0 size-8 sm:size-9 p-0 rounded-xl relative"
                    />
                  }
                >
                  <HugeiconsIcon icon={ColorsIcon} className="size-4" />
                  <span
                    className="absolute bottom-1 right-1 size-2 rounded-full border border-background"
                    style={{ backgroundColor: color }}
                  />
                </PopoverTrigger>
              }
            />
            <TooltipContent side="top">Color & Stroke</TooltipContent>
          </Tooltip>

          <PopoverContent align="center" side="top" sideOffset={8} className="w-64 p-3">
            <PopoverHeader className="mb-2">
              <PopoverTitle className="text-xs font-semibold">Stroke & Color</PopoverTitle>
            </PopoverHeader>
            <div className="space-y-3">
              {/* Palette */}
              <div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
                  Color
                </span>
                <div className="flex items-center gap-1.5">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onColor(c)}
                      aria-label={`Select color ${c}`}
                      className={cn(
                        "size-6 rounded-full transition-transform cursor-pointer border border-border/50",
                        color === c && "ring-2 ring-primary ring-offset-2 scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Stroke Width */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Width
                  </span>
                  <span className="text-xs font-mono tabular-nums">{pen}px</span>
                </div>
                <Slider
                  min={1}
                  max={24}
                  step={1}
                  value={[pen]}
                  onValueChange={(val) => {
                    const next = Array.isArray(val) ? val[0] : val;
                    if (typeof next === "number") onPen(next);
                  }}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Undo / Redo */}
        {onUndo && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!canUndo}
                  onClick={onUndo}
                  data-icon="true"
                  aria-label="Undo"
                  className={cn(
                    "shrink-0 size-8 sm:size-9 p-0 rounded-xl",
                    !canUndo && "opacity-40 pointer-events-none"
                  )}
                >
                  <HugeiconsIcon icon={UndoIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Undo <span className="kbd">Ctrl+Z</span>
            </TooltipContent>
          </Tooltip>
        )}

        {onRedo && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!canRedo}
                  onClick={onRedo}
                  data-icon="true"
                  aria-label="Redo"
                  className={cn(
                    "shrink-0 size-8 sm:size-9 p-0 rounded-xl",
                    !canRedo && "opacity-40 pointer-events-none"
                  )}
                >
                  <HugeiconsIcon icon={RedoIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Redo <span className="kbd">Ctrl+Y</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Grid toggle directly accessible */}
        {onToggleGrid && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={gridVisible ? "ghost" : "secondary"}
                  onClick={onToggleGrid}
                  data-icon="true"
                  aria-label="Toggle grid"
                  className="hidden sm:inline-flex shrink-0 size-8 sm:size-9 p-0 rounded-xl"
                >
                  <HugeiconsIcon
                    icon={GridTableIcon}
                    className={cn("size-4", !gridVisible && "opacity-40")}
                  />
                </Button>
              }
            />
            <TooltipContent side="top">
              {gridVisible ? "Hide grid" : "Show grid"}
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

        {/* More Actions Dropdown (⋯) */}
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
          <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-52">
            {/* File Section */}
            {(onExportPng || onExportJson || onImportJson) && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                    File
                  </DropdownMenuLabel>
                  {onExportPng && (
                    <DropdownMenuItem onClick={onExportPng} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={Image01Icon} className="size-4" />
                      <span>Export PNG</span>
                    </DropdownMenuItem>
                  )}
                  {onExportJson && (
                    <DropdownMenuItem onClick={onExportJson} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={Download01Icon} className="size-4" />
                      <span>Save JSON Project</span>
                    </DropdownMenuItem>
                  )}
                  {onImportJson && (
                    <DropdownMenuItem onClick={onImportJson} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={Upload01Icon} className="size-4" />
                      <span>Open JSON Project…</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Canvas / View Section */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                Canvas
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={toggleFullscreen} className="cursor-pointer gap-2">
                <HugeiconsIcon icon={Maximize01Icon} className="size-4" />
                <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void requestFullscreenLandscape()} className="cursor-pointer gap-2">
                <HugeiconsIcon icon={ScreenRotationIcon} className="size-4" />
                <span>Landscape Mode</span>
              </DropdownMenuItem>
              {onTidy && (
                <DropdownMenuItem
                  disabled={aiStatus === "thinking"}
                  onClick={onTidy}
                  className="cursor-pointer gap-2"
                >
                  <HugeiconsIcon icon={MagicWand01Icon} className="size-4" />
                  <span>Tidy layout</span>
                </DropdownMenuItem>
              )}
              {onImportImage && (
                <DropdownMenuItem onClick={onImportImage} className="cursor-pointer gap-2">
                  <HugeiconsIcon icon={ImageAdd01Icon} className="size-4" />
                  <span>Insert Image</span>
                </DropdownMenuItem>
              )}
              {onToggleGrid && (
                <DropdownMenuItem onClick={onToggleGrid} className="cursor-pointer gap-2 sm:hidden">
                  <HugeiconsIcon icon={GridTableIcon} className="size-4" />
                  <span>{gridVisible ? "Hide canvas grid" : "Show canvas grid"}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>

            {/* Collaboration & Docs */}
            {(onOpenConnect || onOpenLogs || onOpenManual) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                    Tools & Docs
                  </DropdownMenuLabel>
                  {onOpenConnect && (
                    <DropdownMenuItem onClick={onOpenConnect} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={PeerToPeer01Icon} className="size-4" />
                      <span>Live P2P Sync</span>
                    </DropdownMenuItem>
                  )}
                  {onOpenLogs && (
                    <DropdownMenuItem onClick={onOpenLogs} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={TerminalIcon} className="size-4" />
                      <span>AI Request Logs</span>
                    </DropdownMenuItem>
                  )}
                  {onOpenManual && (
                    <DropdownMenuItem onClick={onOpenManual} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={BookOpen01Icon} className="size-4" />
                      <span>User Manual</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </>
            )}

            {/* AI & Settings */}
            {(onOpenModelSelect || onOpenSettings) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                    AI & Config
                  </DropdownMenuLabel>
                  {onOpenModelSelect && (
                    <DropdownMenuItem onClick={onOpenModelSelect} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={AiChipIcon} className="size-4" />
                      <span>Select AI Model</span>
                    </DropdownMenuItem>
                  )}
                  {onOpenSettings && (
                    <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer gap-2">
                      <HugeiconsIcon icon={Settings01Icon} className="size-4" />
                      <span>AI Settings & Keys</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default CanvasToolbar;
