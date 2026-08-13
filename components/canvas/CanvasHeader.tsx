"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
  UndoIcon,
  Upload01Icon,
  Share01Icon,
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

const PALETTE = ["#111111", "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#9333ea", "#fbbf24"];

const PRIMARY_TOOLS: { mode: CanvasMode; label: string; kbd: string; icon: typeof CursorIcon }[] = [
  { mode: "select", label: "Select", kbd: "V", icon: CursorIcon },
  { mode: "hand", label: "Hand", kbd: "H", icon: HandIcon },
  { mode: "pen", label: "Pen", kbd: "P", icon: PencilIcon },
  { mode: "highlighter", label: "Highlighter", kbd: "⇧H", icon: HighlighterIcon },
  { mode: "eraser", label: "Eraser", kbd: "E", icon: EraserIcon },
  { mode: "text", label: "Text", kbd: "T", icon: TextIcon },
];

const SHAPE_TOOLS: { mode: CanvasMode; label: string; kbd: string; icon: typeof SquareIcon }[] = [
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
  tool: { mode: CanvasMode; label: string; kbd: string; icon: typeof CursorIcon };
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
  aiRun,
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
  const activeShapeTool = SHAPE_TOOLS.find((s) => s.mode === mode) || SHAPE_TOOLS[0];

  const hasModels = models.length > 0;
  const settleValue = activeModel && hasModels && models.includes(activeModel) ? activeModel : (models[0] ?? "");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-2 sm:px-3">
      {/* ── Left: Brand & Combined Menu ─────────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="brand-wordmark pr-1 text-lg font-bold leading-none">Drawva</span>

        {/* Compact Main Menu Bar */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1 text-xs px-2">
                <HugeiconsIcon icon={Menu01Icon} className="size-4" />
                <span className="hidden sm:inline">Menu</span>
                <HugeiconsIcon icon={ChevronDownIcon} className="size-3 text-muted-foreground" />
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
                <HugeiconsIcon icon={Share01Icon} />
                Live P2P Sync
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClear} className="text-destructive focus:text-destructive">
                <HugeiconsIcon icon={Delete02Icon} />
                Clear Board
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Live P2P Badge */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={syncStatus === "connected" ? "secondary" : "ghost"}
                size="sm"
                onClick={onOpenConnect}
                className="gap-1 px-2 text-xs"
              >
                <HugeiconsIcon
                  icon={syncStatus === "connected" ? Wifi01Icon : Share01Icon}
                  className={`size-3.5 ${syncStatus === "connected" ? "text-emerald-500" : ""}`}
                />
                {syncStatus === "connected" && syncRoomCode ? (
                  <span className="font-mono font-bold text-xs">{syncRoomCode}</span>
                ) : (
                  <span className="hidden md:inline">Connect</span>
                )}
                {syncPeerCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {syncPeerCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <TooltipContent>Live Device Connection (P2P)</TooltipContent>
        </Tooltip>
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
              <DropdownMenuItem key={s.mode} onClick={() => onMode(s.mode)} className="gap-2">
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
              <Button size="icon-sm" variant="ghost" data-icon="true" aria-label="Colors & Stroke">
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
                    borderColor: color === c ? "var(--foreground)" : "var(--border)",
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
                onValueChange={(v) => onPen(Number(Array.isArray(v) ? v[0] : v))}
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
                <Button size="icon-sm" variant="ghost" onClick={onUndo} disabled={!canUndo} data-icon="true">
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
                <Button size="icon-sm" variant="ghost" onClick={onRedo} disabled={!canRedo} data-icon="true">
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
                <Button size="icon-sm" variant="ghost" onClick={onClear} data-icon="true" aria-label="Clear board">
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
                <Button size="icon-sm" variant="ghost" data-icon="true" aria-label="More tools">
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
              key="sci-fi-loader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative flex h-8 min-w-[200px] sm:min-w-[280px] max-w-xs items-center justify-between overflow-hidden rounded-full border border-primary/30 bg-muted/80 px-3.5 shadow-sm backdrop-blur-sm"
            >
              {/* System primary shimmering sweep beam */}
              <motion.div
                className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-primary/30 to-transparent"
                animate={{ x: ["-100%", "260%"] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut", repeatType: "mirror" }}
              />

              {/* Left pulsing system primary status dot */}
              <div className="relative z-10 flex items-center gap-1.5">
                <motion.span
                  className="size-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                />
                <motion.span
                  className="size-1.5 rounded-full bg-primary/60"
                  animate={{ scale: [1.3, 1, 1.3], opacity: [0.8, 0.4, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut", delay: 0.2 }}
                />
              </div>

              {/* Center system equalizer bars */}
              <div className="relative z-10 flex items-center gap-1 px-2">
                {[0.4, 0.85, 0.35, 1, 0.5, 0.75, 0.4].map((hRatio, i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-primary"
                    animate={{ scaleY: [0.3, 1, 0.3], opacity: [0.5, 1, 0.5] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.9,
                      ease: "easeInOut",
                      delay: i * 0.1,
                    }}
                    style={{ height: `${14 * hRatio}px` }}
                  />
                ))}
              </div>

              {/* Right rotating sparkles icon in primary brand color */}
              <div className="relative z-10 flex items-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
                  className="text-primary drop-shadow-[0_0_6px_var(--primary)]"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="size-4" />
                </motion.div>
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
                <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {aiRun.doneProvider ? `Done · ${aiRun.doneProvider}` : "Done"}
                </Badge>
              )}

              {aiStatus === "error" && (
                <Badge variant="destructive">Failed</Badge>
              )}

              {hasModels && (
                <div className="hidden lg:block">
                  <Select
                    value={settleValue}
                    onValueChange={onModelChange}
                    items={models.map((m) => ({ label: m, value: m }))}
                  >
                    <SelectTrigger size="sm" className="max-w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="hidden sm:flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground select-none">
                <Switch size="sm" checked={autoOn} onCheckedChange={onAutoChange} />
                Auto
              </label>

              {!autoOn && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onAskAi}
                  className="gap-1 px-2.5 text-xs"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
                  <span>Ask AI</span>
                </Button>
              )}

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