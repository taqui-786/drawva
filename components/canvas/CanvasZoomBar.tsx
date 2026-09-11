"use client";

import React from "react";
import { useSnapshot } from "valtio";
import { appState } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MinusSignIcon,
  Add01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export interface CanvasZoomBarProps {
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  viewMode?: boolean;
  className?: string;
}

export const CanvasZoomBar: React.FC<CanvasZoomBarProps> = ({
  zoom: zoomProp,
  onZoomIn,
  onZoomOut,
  onReset,
  viewMode = false,
  className,
}) => {
  const { zoom: stateZoom } = useSnapshot(appState);
  const zoom = zoomProp ?? stateZoom;

  if (!onZoomIn && !onZoomOut && !onReset) return null;

  return (
    <div
      role="toolbar"
      aria-label="Canvas Zoom and Navigation Controls"
      className={cn(
        "fixed z-40 select-none transition-all duration-300",
        viewMode ? "bottom-3 left-3" : "bottom-4 left-3 sm:left-5",
        className
      )}
    >
      <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-background/90 dark:bg-zinc-950/85 backdrop-blur-md p-1 shadow-sm">
        {/* Zoom Out Button */}
        {onZoomOut && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={onZoomOut}
                  aria-label="Zoom out"
                  data-icon="true"
                  className="size-6 sm:size-6.5 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                >
                  <HugeiconsIcon icon={MinusSignIcon} className="size-3 sm:size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Zoom out <span className="kbd">Ctrl -</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Zoom Percentage / Quick Reset to 100% */}
        {onReset ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onReset}
                  aria-label="Reset zoom to 100%"
                  className="h-6 sm:h-6.5 px-1 min-w-9 sm:min-w-10 justify-center font-mono tabular-nums text-[11px] font-medium text-foreground/85 hover:text-foreground hover:bg-muted rounded-lg cursor-pointer transition-colors"
                >
                  {zoom}%
                </Button>
              }
            />
            <TooltipContent side="top">
              Reset zoom <span className="kbd">Shift 0</span>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex items-center justify-center h-6 sm:h-6.5 px-1 min-w-9 sm:min-w-10 font-mono tabular-nums text-[11px] font-medium text-foreground/80">
            {zoom}%
          </span>
        )}

        {/* Zoom In Button */}
        {onZoomIn && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={onZoomIn}
                  aria-label="Zoom in"
                  data-icon="true"
                  className="size-6 sm:size-6.5 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3 sm:size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Zoom in <span className="kbd">Ctrl +</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Re-center Viewport Action */}
        {onReset && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-3.5 self-center opacity-40" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={onReset}
                    aria-label="Re-center canvas"
                    data-icon="true"
                    className="size-6 sm:size-6.5 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  >
                    <HugeiconsIcon icon={Target02Icon} className="size-3 sm:size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top">
                Re-center canvas <span className="kbd">Shift 1</span>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
};

export default CanvasZoomBar;
