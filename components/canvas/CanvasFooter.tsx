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
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";

export interface GenerationTickerState {
  status: "idle" | "running" | "done" | "error";
  currentMessage: string;
  messageId: number;
  detail?: string;
}

export function CanvasFooter({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const { zoom, center } = useSnapshot(appState);
  const { data: session } = useSession();

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between gap-2 border-t bg-background/95 backdrop-blur-xs px-3 overflow-hidden select-none">
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

      <div className="flex-1 min-w-0 px-2" />

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
