"use client";

import { useSnapshot } from "valtio";
import { appState } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { ZoomInAreaIcon, ZoomOutAreaIcon, Refresh01Icon } from "@hugeicons/core-free-icons";

export function CanvasFooter({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  // Subscribes ONLY to zoom/center, so pan/zoom frames never re-render
  // CanvasApp or the header.
  const { zoom, center } = useSnapshot(appState);

  return (
    <footer className="flex h-10 shrink-0 items-center gap-2 border-t bg-background px-3">
      <div className="flex items-center gap-1">
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
        <Badge variant="secondary" className="w-14 justify-center font-mono tabular-nums">
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
                Reset
              </Button>
            }
          />
          <TooltipContent>Re-center board</TooltipContent>
        </Tooltip>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground font-mono tabular-nums">
        <span>x {center.x}</span>
        <span>y {center.y}</span>
      </div>
    </footer>
  );
}