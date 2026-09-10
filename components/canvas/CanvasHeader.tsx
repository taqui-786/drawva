"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSnapshot } from "valtio";
import { motion, AnimatePresence } from "motion/react";
import { appState } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Delete02Icon,
  Download01Icon,
  GridTableIcon,
  Image01Icon,
  Maximize01Icon,
  Menu01Icon,
  Settings01Icon,
  AiBrain01Icon,
  AiChipIcon,
  SparklesIcon,
  TerminalIcon,
  Upload01Icon,
  PeerToPeer01Icon,
  Wifi01Icon,
  ScreenRotationIcon,
  Logout01Icon,
  CloudSyncIcon,
  CloudSavingDone01Icon,
  CloudAlertIcon,
  CloudOffIcon,
  SquareStopIcon,
  SteeringIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Refresh01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { useSession, signOut } from "@/lib/auth-client";
import type { CloudSyncStatus } from "@/lib/canvas/cloudSync";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/lib/canvas/types";
import {
  type ReasoningEffort,
  REASONING_EFFORT_OPTIONS,
} from "@/lib/ai/provider";
import { requestFullscreenLandscape } from "@/lib/canvas/orientation";

export interface AiRunState {
  phase: "idle" | "running" | "done" | "error";
  activeProvider: string | null;
  doneProvider: string | null;
  durationStage?: "normal" | "slow" | "critical";
}

export interface CanvasHeaderProps {
  onExportPng: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onClear?: () => void;
  aiStatus: "idle" | "thinking" | "done" | "error";
  aiRun: AiRunState;
  autoOn: boolean;
  onAutoChange: (v: boolean) => void;
  onAskAi?: () => void;
  onCancelAi?: () => void;
  onSteerAi?: (guidance: string) => void;
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
  cloudStatus?: CloudSyncStatus;
  onTriggerCloudSync?: () => void;
  viewMode?: boolean;
  onToggleViewMode?: () => void;
  gridVisible?: boolean;
  onToggleGrid?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  // Legacy optional props to prevent regressions
  mode?: CanvasMode;
  onMode?: (m: CanvasMode) => void;
  toolsLocked?: boolean;
  color?: string;
  onColor?: (c: string) => void;
  pen?: number;
  onPen?: (p: number) => void;
  onImportImage?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onTidy?: () => void;
}

export function CanvasHeader({
  onExportPng,
  onExportJson,
  onImportJson,
  onClear,
  aiStatus,
  aiRun,
  autoOn,
  onAutoChange,
  onAskAi,
  onCancelAi,
  onSteerAi,
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
  cloudStatus = "idle",
  onTriggerCloudSync,
  gridVisible = true,
  onToggleGrid,
  onZoomIn,
  onZoomOut,
  onReset,
}: CanvasHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { zoom, center } = useSnapshot(appState);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isGenerating = agentRunning || aiStatus === "thinking";
  const [steerOpen, setSteerOpen] = useState(false);
  const [steerInput, setSteerInput] = useState("");
  const isSteerOpen = steerOpen && isGenerating;

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

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur-xs px-2 sm:px-3 w-full max-w-full overflow-hidden select-none">
      {/* Left side: Brand, Menu, Sync, and Zoom controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className="brand-wordmark pr-1 text-base sm:text-lg font-bold leading-none select-none">
          Drawva
        </span>

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
              {onToggleGrid && (
                <DropdownMenuItem onClick={onToggleGrid}>
                  <HugeiconsIcon icon={GridTableIcon} />
                  {gridVisible ? "Hide canvas grid" : "Show canvas grid"}
                </DropdownMenuItem>
              )}
              {onClear && (
                <DropdownMenuItem
                  onClick={onClear}
                  className="text-destructive focus:text-destructive"
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                  Clear Board
                </DropdownMenuItem>
              )}
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

        {/* P2P Sync Status */}
        {syncStatus === "connected" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenConnect}
                  className="gap-1 px-2 text-xs"
                >
                  <HugeiconsIcon
                    icon={Wifi01Icon}
                    className="size-3.5 text-emerald-500"
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
        )}

        {/* Cloud Sync Status */}
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

        {/* Integrated Zoom Controls (relocated from bottom footer) */}
        {onZoomIn && onZoomOut && (
          <>
            <Separator orientation="vertical" className="mx-0.5 sm:mx-1 h-4 sm:h-5 self-center" />
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={onZoomOut}
                      aria-label="Zoom out"
                      data-icon="true"
                      className="size-7 sm:size-8 p-0"
                    >
                      <HugeiconsIcon icon={ZoomOutAreaIcon} className="size-3.5 sm:size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>

              <Badge
                variant="secondary"
                className="w-12 sm:w-13 justify-center font-mono tabular-nums text-[11px] px-1"
              >
                {zoom}%
              </Badge>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={onZoomIn}
                      aria-label="Zoom in"
                      data-icon="true"
                      className="size-7 sm:size-8 p-0"
                    >
                      <HugeiconsIcon icon={ZoomInAreaIcon} className="size-3.5 sm:size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>

              {onReset && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={onReset}
                        aria-label="Re-center board"
                        data-icon="true"
                        className="size-7 sm:size-8 p-0"
                      >
                        <HugeiconsIcon icon={Refresh01Icon} className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>Re-center board</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* Center: Canvas Coordinates (clean & minimalist) */}
      <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums select-none">
        <span className="text-muted-foreground/50 text-[10px] uppercase tracking-wider font-sans">center</span>
        <span className="text-foreground/75 text-[11px]">
          {center.x}, {center.y}
        </span>
      </div>

      {/* Right side: User Profile, Admin link, and AI Controls */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 ml-auto">
        {session?.user && (
          <div className="hidden xl:flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground px-1 py-0.5">
              <span className="size-1.5 rounded-full bg-primary shrink-0" />
              <span className="font-medium truncate max-w-[110px]">
                {session.user.name || "User"}
              </span>
            </span>
            {(session.user as { role?: string }).role === "admin" && (
              <Button
                variant="outline"
                size="xs"
                render={<Link href="/admin" />}
                className="h-6 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 font-sans"
              >
                <HugeiconsIcon icon={Shield01Icon} className="h-3 w-3" />
                <span>Admin</span>
              </Button>
            )}
            <Separator orientation="vertical" className="mx-0.5 h-4" />
          </div>
        )}

        <AnimatePresence mode="wait">
          {agentRunning || aiStatus === "thinking" ? (
            <motion.div
              key="ai-generating-loader"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1 sm:gap-1.5 shrink-0"
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

              {onSteerAi && (
                <Popover
                  open={isSteerOpen}
                  onOpenChange={(open) => {
                    setSteerOpen(open);
                    if (!open) setSteerInput("");
                  }}
                >
                  <Tooltip open={isSteerOpen ? false : undefined}>
                    <TooltipTrigger
                      render={
                        <PopoverTrigger
                          render={
                            <Button
                              size="icon-lg"
                              variant={isSteerOpen ? "secondary" : "ghost"}
                              data-icon="true"
                              aria-label="Steer agent"
                              className={cn(
                                "shrink-0 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
                                isSteerOpen && "text-primary bg-primary/10"
                              )}
                            >
                              <HugeiconsIcon icon={SteeringIcon} className="size-4" />
                            </Button>
                          }
                        />
                      }
                    />
                    <TooltipContent>Steer agent</TooltipContent>
                  </Tooltip>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    sideOffset={6}
                    className="w-80 p-3 shadow-lg border bg-popover text-popover-foreground"
                  >
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <HugeiconsIcon icon={SteeringIcon} className="size-4 text-primary" />
                          <span>Steer Agent</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          mid-turn
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Give real-time instructions to steer the agent without stopping or resetting its progress.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = steerInput.trim();
                          if (!val) return;
                          onSteerAi(val);
                          setSteerInput("");
                          setSteerOpen(false);
                        }}
                        className="flex items-center gap-1.5 mt-0.5"
                      >
                        <input
                          type="text"
                          value={steerInput}
                          onChange={(e) => setSteerInput(e.target.value)}
                          placeholder="e.g. 'Use blue color', 'Make it a flowchart'..."
                          className="flex-1 h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!steerInput.trim()}
                          className="h-8 px-2.5 text-xs gap-1 shrink-0"
                        >
                          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
                          <span>Steer</span>
                        </Button>
                      </form>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {onCancelAi && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-lg"
                        variant="outline"
                        data-icon="true"
                        onClick={onCancelAi}
                        aria-label="Cancel generation"
                        className="shrink-0 p-0 text-destructive"
                      >
                        <HugeiconsIcon icon={SquareStopIcon} className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>Cancel generation</TooltipContent>
                </Tooltip>
              )}
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

export default CanvasHeader;
