"use client";

import { useState } from "react";
import Link from "next/link";
import { useSnapshot } from "valtio";
import { motion, AnimatePresence } from "motion/react";
import { appState } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  AiBrain01Icon,
  CloudSyncIcon,
  CloudSavingDone01Icon,
  CloudAlertIcon,
  CloudOffIcon,
  CloudCheckIcon,
  SteeringIcon,
  Shield01Icon,
  PeerToPeer01Icon,
  LayoutRightIcon,
  Share07Icon,
  Compass01Icon,
  BookOpen01Icon,
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";
import type { CloudSyncStatus } from "@/lib/canvas/cloudSync";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/lib/canvas/types";
import {
  type ReasoningEffort,
  REASONING_EFFORT_OPTIONS,
} from "@/lib/ai/provider";

export interface AiRunState {
  phase: "idle" | "running" | "done" | "error";
  activeProvider: string | null;
  doneProvider: string | null;
  durationStage?: "normal" | "slow" | "critical";
}

export interface CanvasHeaderProps {
  canvasId?: string | null;
  onOpenSaveDialog?: () => void;
  onOpenPublishDialog?: () => void;
  onOpenSidebar?: () => void;
  onExportPng?: () => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
  onClear?: () => void;
  aiStatus: "idle" | "thinking" | "done" | "error";
  aiRun?: AiRunState;
  autoOn: boolean;
  onAutoChange: (auto: boolean) => void;
  onAskAi?: () => void;
  onCancelAi?: () => void;
  onSteerAi?: (guidance: string) => void;
  agentRunning?: boolean;
  models?: string[];
  activeModel?: string | null;
  onModelChange?: (model: string | null) => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  onOpenModelSelect?: () => void;
  onOpenSettings?: () => void;
  syncStatus: "idle" | "hosting" | "connecting" | "connected" | "error";
  syncRoomCode: string | null;
  syncPeerCount: number;
  onOpenConnect?: () => void;
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
  canvasId,
  onOpenSaveDialog,
  onOpenPublishDialog,
  onOpenSidebar,
  aiStatus,
  aiRun,
  autoOn,
  onAutoChange,
  onSteerAi,
  agentRunning = false,
  reasoningEffort = "medium",
  onReasoningEffortChange,
  syncStatus,
  syncPeerCount,
  onOpenConnect,
  cloudStatus = "idle",
  onTriggerCloudSync,
}: CanvasHeaderProps) {
  const { data: session } = useSession();
  const { center } = useSnapshot(appState);
  const isGenerating = agentRunning || aiStatus === "thinking";
  const [steerOpen, setSteerOpen] = useState(false);
  const [steerInput, setSteerInput] = useState("");
  const isSteerOpen = steerOpen && isGenerating;

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-40 flex items-center justify-between",
        "h-10 sm:h-11 px-2.5 sm:px-4",
        "border-b border-border/80 bg-background/95 backdrop-blur-md shadow-2xs select-none",
      )}
    >
      {/* Left side: Brand, Navlinks, P2P Sync */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <Link
          href="/canvas"
          className="brand-wordmark pr-1 text-base sm:text-lg font-bold leading-none select-none hover:opacity-85 transition-opacity"
        >
          Drawva
        </Link>

        {/* Navlinks */}
        <nav className="flex items-center gap-0.5 sm:gap-1 ml-1.5 sm:ml-3 pl-1.5 sm:pl-3 border-l border-border/60">
          <Link
            href="/community"
            title="Explore Community Dravs"
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <HugeiconsIcon icon={Compass01Icon} className="size-3.5" />
            <span className="hidden sm:inline">Community</span>
          </Link>
          <Link
            href="/manual"
            title="Drawva User Manual"
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <HugeiconsIcon icon={BookOpen01Icon} className="size-3.5" />
            <span className="hidden sm:inline">Manual</span>
          </Link>
        </nav>


        {/* P2P Sync Status */}
        {syncStatus === "connected" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenConnect}
                  className="gap-1 px-2 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <HugeiconsIcon icon={PeerToPeer01Icon} className="size-3.5" />
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-mono">{syncPeerCount}</span>
                </Button>
              }
            />
            <TooltipContent>
              P2P connected with {syncPeerCount} peer(s)
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Center: Canvas Coordinates (plain text, no interaction) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-1.5 pointer-events-none select-none font-mono text-[11px] tabular-nums text-muted-foreground/70">
        <span className="text-[10px] uppercase font-sans tracking-wider font-semibold text-muted-foreground/50">
          Center
        </span>
        <span className="font-medium text-foreground/65">
          {center.x}, {center.y}
        </span>
      </div>

      {/* Right side: Admin link, Save/Cloud Sync, AI Controls, Thinking depth, Auto switch, Sidebar trigger */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 ml-auto">
        {session?.user &&
          (session.user as { role?: string }).role === "admin" && (
            <Button
              variant="outline"
              size="xs"
              render={<Link href="/admin" />}
              className="h-6 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 font-sans mr-0.5"
            >
              <HugeiconsIcon icon={Shield01Icon} className="h-3 w-3" />
              <span>Admin</span>
            </Button>
          )}

        {/* Save button (when on blank / unsaved canvas) OR Cloud sync indicator (when on saved canvas) */}
        {session?.user && (
          <>
            {!canvasId ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      data-guide="save"
                      variant="outline"
                      size="xs"
                      onClick={onOpenSaveDialog}
                      className="gap-1.5 px-2.5 h-7 text-xs font-medium animate-pulse text-green-500 bg-green-500/10 hover:bg-green-500/20 cursor-pointer shrink-0"
                    >
                      <HugeiconsIcon
                        icon={CloudCheckIcon}
                        className="size-3.5"
                      />
                      <span>Save</span>
                    </Button>
                  }
                />
                <TooltipContent>
                  Save canvas to cloud & enable autosync
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      data-guide="save"
                      variant="ghost"
                      size="sm"
                      onClick={onTriggerCloudSync}
                      className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    >
                      {cloudStatus === "syncing" ? (
                        <>
                          <HugeiconsIcon
                            icon={CloudSyncIcon}
                            className="size-3.5 animate-spin text-primary"
                          />
                          <span className="hidden xl:inline text-[11px]">
                            Saving…
                          </span>
                        </>
                      ) : cloudStatus === "synced" ? (
                        <>
                          <HugeiconsIcon
                            icon={CloudSavingDone01Icon}
                            className="size-3.5 text-emerald-500"
                          />
                          <span className="hidden xl:inline text-[11px] text-emerald-600 dark:text-emerald-400">
                            Synced
                          </span>
                        </>
                      ) : cloudStatus === "error" ? (
                        <>
                          <HugeiconsIcon
                            icon={CloudAlertIcon}
                            className="size-3.5 text-destructive"
                          />
                          <span className="hidden xl:inline text-[11px] text-destructive">
                            Sync retry
                          </span>
                        </>
                      ) : cloudStatus === "offline" ? (
                        <>
                          <HugeiconsIcon
                            icon={CloudOffIcon}
                            className="size-3.5 text-muted-foreground"
                          />
                          <span className="hidden xl:inline text-[11px]">
                            Offline
                          </span>
                        </>
                      ) : (
                        <>
                          <HugeiconsIcon
                            icon={CloudSavingDone01Icon}
                            className="size-3.5 text-muted-foreground/70"
                          />
                          <span className="hidden xl:inline text-[11px]">
                            Cloud
                          </span>
                        </>
                      )}
                    </Button>
                  }
                />
                <TooltipContent>
                  {cloudStatus === "syncing"
                    ? "Syncing canvas to cloud…"
                    : cloudStatus === "synced"
                      ? "All changes saved to cloud"
                      : cloudStatus === "error"
                        ? "Cloud sync failed (Click to retry)"
                        : cloudStatus === "offline"
                          ? "Working offline — cached locally in IndexedDB"
                          : "Cloud Sync Active (Click to sync now)"}
                </TooltipContent>
              </Tooltip>
            )}
          </>
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
                        "flex gap-1 border py-0.5 px-1 rounded-sm bg-background/90 shadow-xs transition-colors duration-500 shrink-0",
                        containerBorderClass,
                      )}
                      title="Drawva AI is thinking and generating..."
                    >
                      {Array.from({ length: 12 }).map((_, index) => (
                        <div
                          key={index}
                          className={cn(
                            "h-5 w-2 sm:w-2.5 rounded-[1px] [animation:bars-fill_1s_ease-in-out_infinite]",
                            barColorClass,
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
                              size="icon-sm"
                              variant={isSteerOpen ? "secondary" : "ghost"}
                              data-icon="true"
                              aria-label="Steer agent"
                              className={cn(
                                "shrink-0 size-7 sm:size-7.5 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
                                isSteerOpen && "text-primary bg-primary/10",
                              )}
                            >
                              <HugeiconsIcon
                                icon={SteeringIcon}
                                className="size-4"
                              />
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
                          <HugeiconsIcon
                            icon={SteeringIcon}
                            className="size-4 text-primary"
                          />
                          <span>Steer Agent</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          mid-turn
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Give real-time instructions to steer the agent without
                        stopping or resetting its progress.
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
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            className="size-3.5"
                          />
                          <span>Steer</span>
                        </Button>
                      </form>
                    </div>
                  </PopoverContent>
                </Popover>
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

              {/* Publish Drav to Community Button */}
              {onOpenPublishDialog && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        data-guide="share"
                        variant="outline"
                        size="xs"
                        onClick={onOpenPublishDialog}
                        className="h-7 gap-1.5 px-2 text-xs font-medium shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary cursor-pointer"
                      >
                        <HugeiconsIcon icon={Share07Icon} className="size-3.5" />
                        <span className="hidden sm:inline">Share</span>
                      </Button>
                    }
                  />
                  <TooltipContent>Publish Drav to Community</TooltipContent>
                </Tooltip>
              )}

              {/* Thinking / Reasoning Effort Selector */}
              <div data-guide="reasoning" className="hidden sm:block shrink-0">
                <Select
                  value={reasoningEffort}
                  onValueChange={(val) =>
                    onReasoningEffortChange(
                      (val as ReasoningEffort) || "medium",
                    )
                  }
                  items={REASONING_EFFORT_OPTIONS.map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                  }))}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto gap-1 px-2 text-xs font-medium shrink-0"
                    title="Reasoning / Thinking Depth"
                  >
                    <HugeiconsIcon
                      icon={AiBrain01Icon}
                      className="size-3.5 shrink-0 text-primary"
                    />
                    <span className="hidden lg:inline text-muted-foreground mr-0.5">
                      Thinking:
                    </span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    alignItemWithTrigger={false}
                    className="w-56 text-xs"
                  >
                    {REASONING_EFFORT_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-xs cursor-pointer"
                      >
                        <div className="flex flex-col py-0.5">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {opt.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Auto AI Switch */}
              <label data-guide="auto-ai" className="hidden md:flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground select-none shrink-0">
                <Switch
                  size="sm"
                  checked={autoOn}
                  onCheckedChange={onAutoChange}
                />
                Auto
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar Trigger Button */}
        {onOpenSidebar && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-guide="sidebar"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onOpenSidebar}
                  data-icon="true"
                  aria-label="Open Canvases & Menu"
                  className="shrink-0 size-7 sm:size-7.5 p-0 text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
                >
                  <HugeiconsIcon icon={LayoutRightIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Canvases & Menu</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}

export default CanvasHeader;
