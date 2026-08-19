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

      {/* Right: Coordinates (Viewport Center) */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono tabular-nums shrink-0">
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