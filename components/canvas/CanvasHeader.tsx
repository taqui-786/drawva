"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ChevronDownIcon,
  CursorIcon,
  ColorsIcon,
  Delete02Icon,
  Download01Icon,
  EllipseIcon,
  EraserIcon,
  FunctionIcon,
  GitGraphIcon,
  HandIcon,
  HighlighterIcon,
  ImageAdd01Icon,
  Image01Icon,
  MathIcon,
  Maximize01Icon,
  Menu01Icon,
  MoreHorizontalIcon,
  PencilIcon,
  RedoIcon,
  Settings01Icon,
  SparklesIcon,
  SquareIcon,
  TextIcon,
  TerminalIcon,
  UndoIcon,
  Upload01Icon,
  PeerToPeer01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import type { CanvasMode } from "@/lib/canvas/types";

export interface AiRunState {
  phase: "idle" | "running" | "done" | "error";
  /** Label of the model currently generating. */
  activeProvider: string | null;
  /** Label of the model that produced the final result. */
  doneProvider: string | null;
}

const PALETTE = [
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
  {
    mode: "highlighter",
    label: "Highlighter",
    kbd: "⇧H",
    icon: HighlighterIcon,
  },
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
}: {
  mode: CanvasMode;
  tool: {
    mode: CanvasMode;
    label: string;
    kbd: string;
    icon: typeof CursorIcon;
  };
  onMode: (m: CanvasMode) => void;
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
            onClick={() => onMode(tool.mode)}
            data-icon="true"
          >
            <HugeiconsIcon icon={tool.icon} />
          </Button>
        }
      />
      <TooltipContent>
        {tool.label} <span className="kbd">{tool.kbd}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function CanvasHeader({
  mode,
  onMode,
  color,
  onColor,
  pen,
  onPen,
  onImportImage,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  onExportPng,
  onExportJson,
  onImportJson,
  onInsertWidget,
  onInsertDiagram,
  onInsertFormula,
  onInsertPlot,
  aiStatus,
  aiRun: _aiRun,
  autoOn,
  onAutoChange,
  onAskAi,
  models,
  activeModel,
  onModelChange,
  onOpenSettings,
  syncStatus,
  syncRoomCode,
  syncPeerCount,
  onOpenConnect,
  onOpenLogs,
  hasLogs,
}: {
  mode: CanvasMode;
  onMode: (m: CanvasMode) => void;
  color: string;
  onColor: (c: string) => void;
  pen: number;
  onPen: (p: number) => void;
  onImportImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportPng: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onInsertWidget: () => void;
  onInsertDiagram: () => void;
  onInsertFormula: () => void;
  onInsertPlot: () => void;
  aiStatus: "idle" | "thinking" | "done" | "error";
  aiRun: AiRunState;
  autoOn: boolean;
  onAutoChange: (v: boolean) => void;
  onAskAi: () => void;
  models: string[];
  activeModel: string | null;
  onModelChange: (model: string | null) => void;
  onOpenSettings: () => void;
  syncStatus: "idle" | "hosting" | "connecting" | "connected" | "error";
  syncRoomCode: string | null;
  syncPeerCount: number;
  onOpenConnect: () => void;
  onOpenLogs?: () => void;
  hasLogs?: boolean;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateFs = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", updateFs);
    return () => document.removeEventListener("fullscreenchange", updateFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const isShapeActive = ["rect", "ellipse", "arrow"].includes(mode);
  const activeShapeTool =
    SHAPE_TOOLS.find((s) => s.mode === mode) || SHAPE_TOOLS[0];

  const hasModels = models.length > 0;
  const settleValue =
    activeModel && hasModels && models.includes(activeModel)
      ? activeModel
      : (models[0] ?? "");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-2 sm:px-3">
      {/* ── Left: Brand & Combined Menu ─────────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="brand-wordmark pr-1 text-lg font-bold leading-none">
          Drawva
        </span>

        {/* Version Indicator Tag */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="cursor-pointer font-mono text-[10px] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-border/40 hover:bg-muted/40 select-none">
                v3.3
              </span>
            }
          />
          <TooltipContent
            side="bottom"
            align="start"
            className="w-56 p-2.5 flex flex-col gap-1.5 bg-popover text-popover-foreground border border-border shadow-xs rounded-md font-mono text-xs"
          >
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Drawva Engine</span>
              <span className="text-[10px] text-muted-foreground font-normal">v3.0.0</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Build:</span>
                <span className="text-foreground">v3.0.0</span>
              </div>
              <div className="flex justify-between">
                <span>Environment:</span>
                <span className="text-foreground">Production</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Compact Main Menu Bar */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1 text-xs px-2">
                <HugeiconsIcon icon={Menu01Icon} className="size-4" />
                <span className="hidden sm:inline">Menu</span>
                <HugeiconsIcon
                  icon={ChevronDownIcon}
                  className="size-3 text-muted-foreground"
                />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>File</DropdownMenuLabel>
              <DropdownMenuItem onClick={onExportPng}>
                <HugeiconsIcon icon={Image01Icon} />
                Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportJson}>
                <HugeiconsIcon icon={Download01Icon} />
                Save JSON Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportJson}>
                <HugeiconsIcon icon={Upload01Icon} />
                Open JSON Project…
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Insert</DropdownMenuLabel>
              <DropdownMenuItem onClick={onInsertWidget}>
                <HugeiconsIcon icon={Settings01Icon} />
                Interactive Applet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onInsertDiagram}>
                <HugeiconsIcon icon={GitGraphIcon} />
                Diagram
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onInsertFormula}>
                <HugeiconsIcon icon={MathIcon} />
                LaTeX Formula
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onInsertPlot}>
                <HugeiconsIcon icon={FunctionIcon} />
                Math Function Plot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportImage}>
                <HugeiconsIcon icon={ImageAdd01Icon} />
                Image File
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Canvas</DropdownMenuLabel>
              <DropdownMenuItem onClick={toggleFullscreen}>
                <HugeiconsIcon icon={Maximize01Icon} />
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenConnect}>
                <HugeiconsIcon icon={PeerToPeer01Icon} />
                Live P2P Sync
              </DropdownMenuItem>
              {onOpenLogs && (
                <DropdownMenuItem onClick={onOpenLogs}>
                  <HugeiconsIcon icon={TerminalIcon} />
                  AI Request Logs
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={onClear}
                className="text-destructive focus:text-destructive"
              >
                <HugeiconsIcon icon={Delete02Icon} />
                Clear Board
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Live P2P Badge */}
        {syncStatus === "connected" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={"ghost"}
                  size="sm"
                  onClick={onOpenConnect}
                  className="gap-1 px-2 text-xs"
                >
                  <HugeiconsIcon
                    icon={Wifi01Icon}
                    className={`size-3.5 ${syncStatus === "connected" ? "text-emerald-500" : ""}`}
                  />

                  <span className="font-mono font-bold text-xs">
                    {syncRoomCode}
                  </span>

                  {syncPeerCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="px-1 py-0 text-[10px]"
                    >
                      {syncPeerCount}
                    </Badge>
                  )}
                </Button>
              }
            />
            <TooltipContent>Live Device Connected (P2P)</TooltipContent>
          </Tooltip>
        ) : (
          ""
        )}
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 hidden sm:block" />

      {/* ── Center: Handy Drawing Tools ────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        {/* Handy Tools (Select, Hand, Pen, Highlighter, Eraser) */}
        {PRIMARY_TOOLS.slice(0, 5).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} />
        ))}

        {/* Compact Shapes Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant={isShapeActive ? "secondaryPrimary" : "ghost"}
                aria-label="Shapes"
                data-icon="true"
              >
                <HugeiconsIcon icon={activeShapeTool.icon} />
              </Button>
            }
          />
          <DropdownMenuContent align="center">
            {SHAPE_TOOLS.map((s) => (
              <DropdownMenuItem
                key={s.mode}
                onClick={() => onMode(s.mode)}
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
        <ToolButton mode={mode} tool={PRIMARY_TOOLS[5]} onMode={onMode} />

        {/* Style Popover: Color + Stroke Width */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                data-icon="true"
                aria-label="Colors & Stroke"
              >
                <HugeiconsIcon icon={ColorsIcon} />
              </Button>
            }
          />
          <PopoverContent
            align="center"
            sideOffset={6}
            className="w-56 items-start gap-3"
          >
            <PopoverHeader>
              <PopoverTitle>Style</PopoverTitle>
            </PopoverHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => onColor(c)}
                  title={c}
                  aria-label={`Color ${c}`}
                  className="size-5 rounded-full border transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor:
                      color === c ? "var(--foreground)" : "var(--border)",
                    outline: color === c ? "2px solid var(--ring)" : "none",
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Stroke width</span>
                <span>{pen}px</span>
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

        {/* Undo / Redo / Clear */}
        <div className="hidden md:flex items-center gap-0.5">
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={onUndo}
                  disabled={!canUndo}
                  data-icon="true"
                >
                  <HugeiconsIcon icon={UndoIcon} />
                </Button>
              }
            />
            <TooltipContent>
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
                >
                  <HugeiconsIcon icon={RedoIcon} />
                </Button>
              }
            />
            <TooltipContent>
              Redo <span className="kbd">⇧⌘Z</span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={onClear}
                  data-icon="true"
                  aria-label="Clear board"
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              }
            />
            <TooltipContent>Clear board</TooltipContent>
          </Tooltip>
        </div>

        {/* Mobile Extra Tools Dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  data-icon="true"
                  aria-label="More tools"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuItem onClick={onUndo} disabled={!canUndo}>
                <HugeiconsIcon icon={UndoIcon} />
                Undo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRedo} disabled={!canRedo}>
                <HugeiconsIcon icon={RedoIcon} />
                Redo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportImage}>
                <HugeiconsIcon icon={ImageAdd01Icon} />
                Insert Image
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClear} className="text-destructive">
                <HugeiconsIcon icon={Delete02Icon} />
                Clear Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 hidden lg:block" />

      {/* ── Right: AI Assistant & Settings ────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <AnimatePresence mode="wait">
          {aiStatus === "thinking" ? (
            <motion.div
              key="bars-loader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center"
            >
              <style>{`
                @keyframes bars-fill {
                  0% { opacity: 0.2; }
                  50% { opacity: 1; }
                  100% { opacity: 0.2; }
                }
              `}</style>
              <div className="flex gap-1 rounded-sm border border-primary/40 p-1 bg-background/90 shadow-xs">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-4 w-2 rounded-[1px] bg-primary"
                    style={{
                      animation: "bars-fill 1s ease-in-out infinite",
                      animationDelay: `${index * 0.08}s`,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="standard-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 sm:gap-1.5"
            >
              {aiStatus === "done" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] font-mono text-muted-foreground select-none"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Ready</span>
                </motion.div>
              )}

              {aiStatus === "error" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[11px] font-mono text-destructive select-none"
                >
                  <span className="size-1.5 rounded-full bg-destructive" />
                  <span>Failed</span>
                </motion.div>
              )}

              {hasModels && (
                <div className="hidden lg:block">
                  <Select
                    value={settleValue}
                    onValueChange={onModelChange}
                    items={models.map((m) => ({ label: m, value: m }))}
                  >
                    <SelectTrigger size="sm" className="w-auto min-w-36 max-w-64 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" alignItemWithTrigger={false} className="w-auto min-w-[280px] max-w-lg font-mono text-xs">
                      {models.map((m) => (
                        <SelectItem key={m} value={m} className="font-mono text-xs whitespace-nowrap">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="hidden sm:flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground select-none">
                <Switch
                  size="sm"
                  checked={autoOn}
                  onCheckedChange={onAutoChange}
                />
                Auto
              </label>

              {!autoOn && (
                <Button
                  size="sm"
                  onClick={onAskAi}
                  className="gap-1 px-2.5 text-xs"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
                  <span>Ask AI</span>
                </Button>
              )}

              {/* {onOpenLogs && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="sm"
                        variant={hasLogs ? "outline" : "ghost"}
                        onClick={onOpenLogs}
                        className="gap-1 px-2 text-xs h-8"
                        aria-label="AI generation logs"
                      >
                        <HugeiconsIcon
                          icon={TerminalIcon}
                          className="size-3.5 text-primary"
                        />
                        <span className="hidden sm:inline">Logs</span>
                        {hasLogs && (
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent>
                    AI Generation Logs & Prompt Inspector
                  </TooltipContent>
                </Tooltip>
              )} */}

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={onOpenSettings}
                      data-icon="true"
                      aria-label="AI settings"
                    >
                      <HugeiconsIcon icon={Settings01Icon} />
                    </Button>
                  }
                />
                <TooltipContent>AI settings</TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
