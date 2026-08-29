"use client";

import { useSnapshot } from "valtio";
import { appState } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Refresh01Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { motion, AnimatePresence } from "motion/react";
import { useSession } from "@/lib/auth-client";
import { RoseTwoLoader } from "./RoseTwoLoader";

export interface GenerationTickerState {
  status: "idle" | "running" | "done" | "error";
  currentMessage: string;
  messageId: number;
}

export function CanvasFooter({
  onZoomIn,
  onZoomOut,
  onReset,
  tickerState,
  onOpenLogs,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  tickerState?: GenerationTickerState;
  onOpenLogs?: () => void;
}) {
  const { zoom, center } = useSnapshot(appState);
  const { data: session } = useSession();

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between gap-2 border-t bg-background/95 backdrop-blur-xs px-3 overflow-hidden select-none">
      {/* Left: Viewport Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onZoomOut} aria-label="Zoom out" data-icon="true">
                <HugeiconsIcon icon={ZoomOutAreaIcon} />
              </Button>
            }
          />
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Badge variant="secondary" className="w-14 justify-center font-mono tabular-nums text-xs">
          {zoom}%
        </Badge>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onZoomIn} aria-label="Zoom in" data-icon="true">
                <HugeiconsIcon icon={ZoomInAreaIcon} />
              </Button>
            }
          />
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="sm" variant="ghost" onClick={onReset}>
                <HugeiconsIcon icon={Refresh01Icon} />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            }
          />
          <TooltipContent>Re-center board</TooltipContent>
        </Tooltip>
      </div>

      {/* Center: Generation Status Ticker (Vertical Stack / Reel Animation with Rose Two Loader) */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-2 overflow-hidden">
        <AnimatePresence mode="wait">
          {tickerState && tickerState.status !== "idle" && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.18 }}
              onClick={onOpenLogs}
              className="group inline-flex items-center gap-2 px-1.5 py-0.5 text-xs cursor-pointer select-none max-w-full bg-transparent border-none shadow-none hover:bg-transparent outline-none focus:outline-none"
              title="Click to inspect full AI Request Logs"
            >
              {tickerState.status === "running" ? (
                <RoseTwoLoader size={20} className="shrink-0" />
              ) : tickerState.status === "done" ? (
                <span className="size-2 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50" />
              ) : (
                <span className="size-2 rounded-full bg-destructive shrink-0 shadow-xs shadow-destructive/50" />
              )}

              {/* Fixed-width ticker container with vertical conveyor/stack animation */}
              <div className="w-48 sm:w-64 md:w-80 h-4 overflow-hidden relative flex items-center text-left">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={tickerState.messageId}
                    initial={{ y: -16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 16, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[11px] font-mono truncate text-foreground/90 leading-none absolute inset-x-0"
                  >
                    {tickerState.currentMessage}
                  </motion.div>
                </AnimatePresence>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity shrink-0 font-mono">
                <HugeiconsIcon icon={TerminalIcon} className="size-3" />
                <span>Logs</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Right: User status & Coordinates (Viewport Center) */}
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-mono tabular-nums shrink-0">
        {session?.user && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 py-0.5"
                  >
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-medium truncate max-w-[100px] sm:max-w-[160px]">
                      {session.user.name || "User"}
                    </span>
                  </button>
                }
              />
              <TooltipContent side="top" align="end" className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Signed in as {session.user.name}</span>
                  <span className="text-[11px] opacity-80 font-mono">{session.user.email}</span>
                </div>
              </TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
          </>
        )}

        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground/60 text-[11px] font-sans">center</span>
          <span className="text-foreground/90">
            {center.x}, {center.y}
          </span>
        </span>
      </div>
    </footer>
  );
}