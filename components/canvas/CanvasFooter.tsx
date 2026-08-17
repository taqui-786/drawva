"use client";

import { useState } from "react";
import { useSnapshot } from "valtio";
import { toast } from "sonner";
import { appState, type GeometryInfo } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Refresh01Icon,
  Copy01Icon,
  Tick01Icon,
  SquareIcon,
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
  const { zoom, center, cursor, geometry } = useSnapshot(appState);
  const [copied, setCopied] = useState(false);

  const copyGeometry = (geom: GeometryInfo) => {
    const data = {
      type: geom.type,
      label: geom.label,
      id: geom.id,
      title: geom.title,
      status: geom.status,
      x: geom.x,
      y: geom.y,
      w: geom.w,
      h: geom.h,
      x2: geom.x + geom.w,
      y2: geom.y + geom.h,
      cx: Math.round(geom.x + geom.w / 2),
      cy: Math.round(geom.y + geom.h / 2),
      contentW: geom.contentW,
      contentH: geom.contentH,
      aspect: geom.w > 0 && geom.h > 0 ? (geom.w / geom.h).toFixed(3) : undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success("Geometry copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

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

      {/* Center: Live Geometry Inspector */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {geometry ? (
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Type badge */}
            <Badge
              variant="outline"
              className="border-primary/40 bg-background font-medium text-primary text-[10px] tracking-tight shrink-0 px-1.5 py-0 h-4.5"
            >
              {geometry.label}
            </Badge>

            {/* Coordinates and Dimensions */}
            <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground font-sans font-medium text-[11px]">X</span>
                <span className="font-semibold text-foreground">{geometry.x}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground font-sans font-medium text-[11px]">Y</span>
                <span className="font-semibold text-foreground">{geometry.y}</span>
              </span>
              <Separator orientation="vertical" className="h-3.5 bg-primary/20" />
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground font-sans font-medium text-[11px]">W</span>
                <span className="font-semibold text-foreground">{geometry.w}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground font-sans font-medium text-[11px]">H</span>
                <span className="font-semibold text-foreground">{geometry.h}</span>
              </span>

              {/* Extra right/bottom bounds on medium/large screens */}
              <span className="hidden lg:inline-flex items-center gap-1 text-muted-foreground">
                <span className="font-sans text-[11px]">X2</span>
                <span className="font-medium text-foreground/80">{geometry.x + geometry.w}</span>
              </span>
              <span className="hidden lg:inline-flex items-center gap-1 text-muted-foreground">
                <span className="font-sans text-[11px]">Y2</span>
                <span className="font-medium text-foreground/80">{geometry.y + geometry.h}</span>
              </span>

              {/* Content dimensions if available */}
              {geometry.contentW && geometry.contentH && (
                <span className="hidden xl:inline-flex items-center gap-1 text-muted-foreground">
                  <span className="font-sans text-[11px]">Content</span>
                  <span className="font-medium text-foreground/80">{geometry.contentW}×{geometry.contentH}</span>
                </span>
              )}
            </div>

            {/* Quick Actions / Inspector Popover */}
            <div className="flex items-center gap-0.5 ml-1 border-l border-primary/20 pl-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-5 text-muted-foreground hover:text-foreground"
                      onClick={() => copyGeometry(geometry as GeometryInfo)}
                      aria-label="Copy geometry"
                      data-icon="true"
                    >
                      <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} className="size-3" />
                    </Button>
                  }
                />
                <TooltipContent>{copied ? "Copied!" : "Copy geometry JSON"}</TooltipContent>
              </Tooltip>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-5 text-muted-foreground hover:text-foreground"
                      aria-label="Geometry details"
                      data-icon="true"
                    >
                      <HugeiconsIcon icon={SquareIcon} className="size-3" />
                    </Button>
                  }
                />
                <PopoverContent align="center" side="top" className="w-64 p-3 text-xs">
                  <PopoverHeader className="pb-1 mb-1 border-b">
                    <PopoverTitle className="font-medium text-xs flex items-center justify-between">
                      <span>Geometry Inspector</span>
                      <Badge variant="secondary" className="text-[10px] py-0 h-4">
                        {geometry.type}
                      </Badge>
                    </PopoverTitle>
                  </PopoverHeader>
                  <div className="space-y-1.5 font-mono text-[11px] tabular-nums">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Target:</span>
                      <span className="text-foreground font-sans font-medium">{geometry.label}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Top-Left (X, Y):</span>
                      <span className="text-foreground font-semibold">
                        {geometry.x}, {geometry.y}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Bottom-Right (X2, Y2):</span>
                      <span className="text-foreground">
                        {geometry.x + geometry.w}, {geometry.y + geometry.h}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Center (CX, CY):</span>
                      <span className="text-foreground">
                        {Math.round(geometry.x + geometry.w / 2)}, {Math.round(geometry.y + geometry.h / 2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Size (W × H):</span>
                      <span className="text-foreground font-semibold">
                        {geometry.w} × {geometry.h} px
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Area:</span>
                      <span className="text-foreground">{geometry.w * geometry.h} px²</span>
                    </div>
                    {geometry.w > 0 && geometry.h > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Aspect Ratio:</span>
                        <span className="text-foreground">{(geometry.w / geometry.h).toFixed(3)}:1</span>
                      </div>
                    )}
                    {geometry.contentW && geometry.contentH && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Content Size:</span>
                        <span className="text-foreground">
                          {geometry.contentW} × {geometry.contentH}
                        </span>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground/60 font-mono">
            <span className="size-1.5 rounded-full bg-muted-foreground/30" />
            <span className="text-[11px]">No selection</span>
          </div>
        )}
      </div>

      {/* Right: Coordinates (Cursor & Viewport Center) */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono tabular-nums shrink-0">
        {cursor && (
          <span className="hidden sm:inline-flex items-center gap-1">
            <span className="text-muted-foreground/60 text-[11px] font-sans">cursor</span>
            <span className="text-foreground/90">
              {cursor.x}, {cursor.y}
            </span>
          </span>
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