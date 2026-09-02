"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  BookOpen01Icon,
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
  MagicWand01Icon,
  Menu01Icon,
  MoreHorizontalIcon,
  MoreIcon,
  PencilIcon,
  RedoIcon,
  Settings01Icon,
  AiBrain01Icon,
  AiChipIcon,
  SparklesIcon,
  SquareIcon,
  TextIcon,
  TerminalIcon,
  UndoIcon,
  Upload01Icon,
  PeerToPeer01Icon,
  Wifi01Icon,
  ScreenRotationIcon,
  Logout01Icon,
  Analytics01Icon,
  CloudSyncIcon,
  CloudSavingDone01Icon,
  CloudAlertIcon,
  CloudOffIcon,
} from "@hugeicons/core-free-icons";
import type { ElementGeometryData } from "./GeometryInspectorDialog";
import { useSession, signOut } from "@/lib/auth-client";
import type { CloudSyncStatus } from "@/lib/canvas/cloudSync";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/lib/canvas/types";
import {
  type ReasoningEffort,
  REASONING_EFFORT_OPTIONS,
  getModelCapabilitiesCached,
} from "@/lib/ai/provider";
import { requestFullscreenLandscape } from "@/lib/canvas/orientation";

export interface AiRunState {
  phase: "idle" | "running" | "done" | "error";
  /** Label of the model currently generating. */
  activeProvider: string | null;
  /** Label of the model that produced the final result. */
  doneProvider: string | null;
  /** Latency warning level: "normal" | "slow" | "critical" */
  durationStage?: "normal" | "slow" | "critical";
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
            className={cn("shrink-0 size-7 sm:size-8 p-0", disabled && "opacity-50 pointer-events-none")}
          >
            <HugeiconsIcon icon={tool.icon} className="size-4" />
          </Button>
        }
      />
      <TooltipContent>
        {disabled ? "Tools locked during refinement" : (
          <>
            {tool.label} <span className="kbd">{tool.kbd}</span>
          </>
        )}
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
  agentRunning = false,
  models,
  activeModel,
  reasoningEffort = "default",
  onReasoningEffortChange,
  onOpenModelSelect,
  onOpenSettings,
  syncStatus,
  syncRoomCode,
  syncPeerCount,
  onOpenConnect,
  onOpenLogs,
  onOpenManual,
  onOpenInspector,
  selectedElement,
  onTidy,
  cloudStatus = "idle",
  onTriggerCloudSync,
  toolsLocked = false,
}: {
  mode: CanvasMode;
  onMode: (m: CanvasMode) => void;
  toolsLocked?: boolean;
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
  onAskAi?: () => void;
  agentRunning?: boolean;
  models: string[];
  activeModel: string | null;
  onModelChange?: (model: string | null) => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  onOpenModelSelect: () => void;
  onOpenSettings: () => void;
  syncStatus: "idle" | "hosting" | "connecting" | "connected" | "error";
  syncRoomCode: string | null;
  syncPeerCount: number;
  onOpenConnect: () => void;
  onOpenLogs?: () => void;
  onOpenManual?: () => void;
  onOpenInspector?: () => void;
  selectedElement?: ElementGeometryData | null;
  onTidy?: () => void;
  cloudStatus?: CloudSyncStatus;
  onTriggerCloudSync?: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
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

  const [capabilitiesVersion, setCapabilitiesVersion] = useState(0);
  useEffect(() => {
    const onStorage = () => setCapabilitiesVersion((v) => v + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const supportsReasoning = useMemo(() => {
    void capabilitiesVersion;
    if (!activeModel) return false;
    return getModelCapabilitiesCached(activeModel).reasoning;
  }, [activeModel, capabilitiesVersion]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-1.5 sm:px-3 w-full max-w-full overflow-hidden">
      {/* ── Left: Brand & Combined Menu ─────────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className="brand-wordmark pr-1 text-base sm:text-lg font-bold leading-none select-none">
          Drawva
        </span>

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
              <DropdownMenuItem onClick={() => void requestFullscreenLandscape()}>
                <HugeiconsIcon icon={ScreenRotationIcon} />
                Landscape Mode (Rotate)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenConnect}>
                <HugeiconsIcon icon={PeerToPeer01Icon} />
                Live P2P Sync
              </DropdownMenuItem>
              {onOpenInspector && (
                <DropdownMenuItem onClick={onOpenInspector}>
                  <HugeiconsIcon icon={Analytics01Icon} />
                  <span>Geometry Inspector</span>
                </DropdownMenuItem>
              )}
              {onOpenLogs && (
                <DropdownMenuItem onClick={onOpenLogs}>
                  <HugeiconsIcon icon={TerminalIcon} />
                  AI Request Logs
                </DropdownMenuItem>
              )}
              {onOpenManual && (
                <DropdownMenuItem onClick={onOpenManual}>
                  <HugeiconsIcon icon={BookOpen01Icon} />
                  User Manual & Guide
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
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>AI Intelligence</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenModelSelect} disabled={agentRunning}>
                <HugeiconsIcon icon={AiChipIcon} />
                <div className="flex flex-col text-left">
                  <span>Select AI Model</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">
                    {activeModel || "No model"}
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings}>
                <HugeiconsIcon icon={Settings01Icon} />
                AI Settings & Keys
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {session?.user && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <div className="px-2 py-1 text-xs text-muted-foreground truncate max-w-[190px]">
                    {session.user.email}
                  </div>
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      router.push("/signin");
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <HugeiconsIcon icon={Logout01Icon} />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
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

        {/* Cloud Sync Status Indicator */}
        {session?.user && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onTriggerCloudSync}
                  className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {cloudStatus === "syncing" ? (
                    <>
                      <HugeiconsIcon icon={CloudSyncIcon} className="size-3.5 animate-spin text-primary" />
                      <span className="hidden xl:inline text-[11px]">Saving…</span>
                    </>
                  ) : cloudStatus === "synced" ? (
                    <>
                      <HugeiconsIcon icon={CloudSavingDone01Icon} className="size-3.5 text-emerald-500" />
                      <span className="hidden xl:inline text-[11px] text-emerald-600 dark:text-emerald-400">Synced</span>
                    </>
                  ) : cloudStatus === "error" ? (
                    <>
                      <HugeiconsIcon icon={CloudAlertIcon} className="size-3.5 text-destructive" />
                      <span className="hidden xl:inline text-[11px] text-destructive">Sync retry</span>
                    </>
                  ) : cloudStatus === "offline" ? (
                    <>
                      <HugeiconsIcon icon={CloudOffIcon} className="size-3.5 text-muted-foreground" />
                      <span className="hidden xl:inline text-[11px]">Offline</span>
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={CloudSavingDone01Icon} className="size-3.5 text-muted-foreground/70" />
                      <span className="hidden xl:inline text-[11px]">Cloud</span>
                    </>
                  )}
                </Button>
              }
            />
            <TooltipContent>
              {cloudStatus === "syncing"
                ? "Syncing canvas to Neon Cloud DB…"
                : cloudStatus === "synced"
                ? "All changes saved to Neon Cloud DB"
                : cloudStatus === "error"
                ? "Cloud sync failed (Click to retry)"
                : cloudStatus === "offline"
                ? "Working offline — cached locally in IndexedDB"
                : "Cloud Sync Active (Click to sync now)"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Separator orientation="vertical" className="mx-1 h-5 hidden sm:block self-center" />

      {/* ── Center: Handy Drawing Tools ────────────────────────────── */}
      <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto no-scrollbar py-0.5 px-0.5">
        {/* Handy Tools (Select, Hand, Pen, Highlighter, Eraser) */}
        {PRIMARY_TOOLS.slice(0, 5).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} disabled={toolsLocked} />
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
                disabled={toolsLocked}
                className={cn("shrink-0 size-7 sm:size-8 p-0", toolsLocked && "opacity-50 pointer-events-none")}
              >
                <HugeiconsIcon icon={activeShapeTool.icon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="center">
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
        <ToolButton mode={mode} tool={PRIMARY_TOOLS[5]} onMode={onMode} disabled={toolsLocked} />

        {/* Style Popover: Color + Stroke Width */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                data-icon="true"
                aria-label="Colors & Stroke"
                className="shrink-0 size-7 sm:size-8 p-0"
              >
                <HugeiconsIcon icon={ColorsIcon} className="size-4" />
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
          <Separator orientation="vertical" className="mx-1 h-5 self-center" />
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  data-icon="true"
                  aria-label="More"
                >
                  <HugeiconsIcon icon={MoreIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                disabled={aiStatus === "thinking"}
                onClick={onTidy}
              >
                <HugeiconsIcon icon={MagicWand01Icon} />
                Tidy layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <DropdownMenuItem
                disabled={aiStatus === "thinking"}
                onClick={onTidy}
              >
                <HugeiconsIcon icon={MagicWand01Icon} />
                Tidy layout
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

      <Separator orientation="vertical" className="mx-1 h-5 hidden lg:block self-center" />

      {/* ── Right: AI Assistant & Settings ────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 ml-auto">
        <AnimatePresence mode="wait">
          {agentRunning || aiStatus === "thinking" ? (
            <motion.div
              key="ai-generating-loader"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="flex items-center"
            >
              {(() => {
                const stage = aiRun?.durationStage || "normal";
                const barColorClass =
                  stage === "critical"
                    ? "bg-rose-500 transition-colors duration-500"
                    : stage === "slow"
                    ? "bg-amber-500 transition-colors duration-500"
                    : "bg-primary transition-colors duration-500";
                const containerBorderClass =
                  stage === "critical"
                    ? "border-rose-500/50 shadow-rose-500/10"
                    : stage === "slow"
                    ? "border-amber-500/50 shadow-amber-500/10"
                    : "border-primary/40";

                return (
                  <>
                    <style>{`
                      @keyframes bars-fill {
                        0% { opacity: 0.2; }
                        50% { opacity: 1; }
                        100% { opacity: 0.2; }
                      }
                    `}</style>
                    <div
                      className={cn(
                        "flex gap-1 border p-1 rounded-sm bg-background/90 shadow-xs transition-colors duration-500 shrink-0",
                        containerBorderClass
                      )}
                      title="Drawva AI is thinking and generating..."
                    >
                      {Array.from({ length: 12 }).map((_, index) => (
                        <div
                          key={index}
                          className={cn(
                            "h-5 w-2 sm:w-2.5 rounded-[1px] [animation:bars-fill_1s_ease-in-out_infinite]",
                            barColorClass
                          )}
                          style={{ animationDelay: `${index * 0.08}s` }}
                        />
                      ))}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          ) : (
            <motion.div
              key="ai-standard-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1 sm:gap-1.5"
            >
              {aiStatus === "done" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="hidden sm:inline-flex items-center gap-1 sm:gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-300 select-none shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                  <span>Ready</span>
                </motion.div>
              )}

              {aiStatus === "error" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="hidden sm:inline-flex items-center gap-1 sm:gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 sm:px-2 py-0.5 text-[11px] font-mono text-destructive select-none shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Failed</span>
                </motion.div>
              )}

              {/* Model Select Trigger Pill */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onOpenModelSelect}
                      disabled={agentRunning}
                      className="hidden md:inline-flex h-7 gap-1.5 px-2 font-mono text-xs max-w-[130px] lg:max-w-[180px] truncate shadow-2xs hover:border-primary/40 shrink-0"
                      aria-label="Select AI Model"
                    >
                      <HugeiconsIcon icon={AiChipIcon} className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{activeModel || (models.length > 0 ? "Choose Model" : "No Model")}</span>
                    </Button>
                  }
                />
                <TooltipContent>AI Model: {activeModel || "None selected"} (Click to browse & change)</TooltipContent>
              </Tooltip>

              {/* Reasoning / Thinking Effort Controller - Only visible for reasoning models */}
              {supportsReasoning && (
                <div className="hidden sm:block shrink-0">
                  <Select
                    value={reasoningEffort}
                    onValueChange={(val) => onReasoningEffortChange((val as ReasoningEffort) || "default")}
                    items={REASONING_EFFORT_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 w-auto gap-1 px-2 text-xs font-medium shrink-0"
                      title="Reasoning / Thinking Depth"
                    >
                      <HugeiconsIcon icon={AiBrain01Icon} className="size-3.5 shrink-0 text-primary" />
                      <span className="hidden lg:inline text-muted-foreground mr-0.5">Thinking:</span>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" alignItemWithTrigger={false} className="w-56 text-xs">
                      {REASONING_EFFORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs cursor-pointer">
                          <div className="flex flex-col py-0.5">
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="hidden md:flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground select-none shrink-0">
                <Switch
                  size="sm"
                  checked={autoOn}
                  onCheckedChange={onAutoChange}
                />
                Auto
              </label>

              {onAskAi && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="sm"
                        variant="default"
                        onClick={onAskAi}
                        disabled={agentRunning}
                        aria-label="Ask AI"
                        className="gap-1.5 px-2.5 sm:px-3.5 h-8 text-xs shrink-0 font-medium shadow-2xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
                      >
                        <HugeiconsIcon icon={SparklesIcon} className="size-3.5 shrink-0" />
                        <span>Ask AI</span>
                      </Button>
                    }
                  />
                  <TooltipContent>
                    Ask AI to observe the canvas and generate answers or widgets
                  </TooltipContent>
                </Tooltip>
              )}

              {onOpenInspector && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size={selectedElement ? "sm" : "icon-sm"}
                        variant={selectedElement ? "secondary" : "ghost"}
                        onClick={onOpenInspector}
                        data-icon={!selectedElement ? "true" : undefined}
                        aria-label="Geometry & AI Inspector"
                        className={cn(
                          "shrink-0 h-8 gap-1.5 px-2 text-xs transition-all cursor-pointer",
                          selectedElement
                            ? "border border-primary/40 bg-primary/10 text-primary font-medium shadow-2xs hover:bg-primary/20"
                            : "size-8 p-0 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <HugeiconsIcon icon={Analytics01Icon} className="size-4 text-foreground shrink-0" />
                        {selectedElement && (
                          <span className="hidden text-foreground  sm:inline font-mono text-[11px] truncate max-w-[110px]">
                            {Math.round(selectedElement.x)},{Math.round(selectedElement.y)}
                          </span>
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {selectedElement
                      ? `Geometry Inspector (${selectedElement.tool}: x=${Math.round(selectedElement.x)}, y=${Math.round(selectedElement.y)}, ${Math.round(selectedElement.w)}×${Math.round(selectedElement.h)})`
                      : "Element Geometry & AI Output Inspector (Logger)"}
                  </TooltipContent>
                </Tooltip>
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
                      className="shrink-0 size-8 p-0"
                    >
                      <HugeiconsIcon icon={Settings01Icon} className="size-4" />
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
