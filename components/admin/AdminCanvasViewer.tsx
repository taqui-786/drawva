"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  RefreshIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { getAdminCanvasById } from "@/lib/actions/admin";
import { CanvasEngine } from "@/lib/canvas/engine";
import { WidgetManager } from "@/lib/canvas/widgets";
import { ObjectManager } from "@/lib/canvas/objects";
import { restoreSnapshot } from "@/lib/canvas/persistence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import type { Rect, Point } from "@/lib/canvas/types";

export function AdminCanvasViewer({ canvasId }: { canvasId: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const engineRef = React.useRef<CanvasEngine | null>(null);
  const wmRef = React.useRef<WidgetManager | null>(null);
  const omRef = React.useRef<ObjectManager | null>(null);

  const [zoomScale, setZoomScale] = React.useState<number>(1);
  const isDraggingRef = React.useRef(false);
  const lastPointRef = React.useRef<Point>({ x: 0, y: 0 });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "canvas", canvasId],
    queryFn: () => getAdminCanvasById(canvasId),
  });

  // Mount engine and restore snapshot
  React.useEffect(() => {
    if (!data?.snapshot || !containerRef.current) return;

    // Clean up previous instance if any
    engineRef.current?.destroy();
    wmRef.current?.clear();
    omRef.current?.clear();

    const container = containerRef.current;
    const engine = new CanvasEngine(container);
    engineRef.current = engine;

    const isDark = document.documentElement.classList.contains("dark");
    engine.syncTheme(isDark);

    const wm = new WidgetManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {},
    });
    wmRef.current = wm;

    const om = new ObjectManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {},
    });
    omRef.current = om;

    let canceled = false;

    async function loadData() {
      if (!data) return;
      await restoreSnapshot(engine, wm, om, data.snapshot);
      if (canceled) return;

      // Compute bounding box
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      const tileKeys = Object.keys(data.snapshot.tiles || {});
      for (const k of tileKeys) {
        const parts = k.split(",");
        const tx = Number(parts[0]);
        const ty = Number(parts[1]);
        if (!isNaN(tx) && !isNaN(ty)) {
          minX = Math.min(minX, tx * 512);
          minY = Math.min(minY, ty * 512);
          maxX = Math.max(maxX, (tx + 1) * 512);
          maxY = Math.max(maxY, (ty + 1) * 512);
        }
      }

      for (const w of data.snapshot.widgets || []) {
        minX = Math.min(minX, w.x);
        minY = Math.min(minY, w.y);
        maxX = Math.max(maxX, w.x + w.w);
        maxY = Math.max(maxY, w.y + w.h);
      }

      for (const o of data.snapshot.objects || []) {
        minX = Math.min(minX, o.x);
        minY = Math.min(minY, o.y);
        maxX = Math.max(maxX, o.x + o.w);
        maxY = Math.max(maxY, o.y + o.h);
      }

      if (
        isFinite(minX) &&
        isFinite(minY) &&
        isFinite(maxX) &&
        isFinite(maxY) &&
        maxX > minX &&
        maxY > minY
      ) {
        const box: Rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        engine.camera.centerOnBox(box, 100);
      } else {
        engine.camera.reset();
      }

      setZoomScale(engine.camera.scale);
      engine.requestRender();
      wm.sync();
      om.sync();
    }

    void loadData();

    return () => {
      canceled = true;
      engine.destroy();
      wm.clear();
      om.clear();
      engineRef.current = null;
      wmRef.current = null;
      omRef.current = null;
    };
  }, [data]);

  // Pointer & Wheel Handlers for pure viewing (Pan & Zoom only)
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !engineRef.current) return;
    const dx = e.clientX - lastPointRef.current.x;
    const dy = e.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: e.clientX, y: e.clientY };

    engineRef.current.camera.panBy(dx, dy);
    engineRef.current.requestRender();
    wmRef.current?.sync();
    omRef.current?.sync();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!engineRef.current) return;
    engineRef.current.camera.handleWheel(e.nativeEvent);
    setZoomScale(engineRef.current.camera.scale);
    engineRef.current.requestRender();
    wmRef.current?.sync();
    omRef.current?.sync();
  };

  const zoomBy = (deltaY: number) => {
    if (!engineRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    engineRef.current.camera.zoomAt(cx, cy, deltaY);
    setZoomScale(engineRef.current.camera.scale);
    engineRef.current.requestRender();
    wmRef.current?.sync();
    omRef.current?.sync();
  };

  const resetZoom = () => {
    if (!engineRef.current) return;
    engineRef.current.camera.reset();
    setZoomScale(engineRef.current.camera.scale);
    engineRef.current.requestRender();
    wmRef.current?.sync();
    omRef.current?.sync();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-6 w-48 rounded-md" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading canvas playground…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" render={<Link href="/admin/canva" />} className="gap-2">
          <HugeiconsIcon icon={ArrowLeft02Icon} className="h-4 w-4" />
          <span>Back to Canvases</span>
        </Button>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-destructive text-sm font-medium">
              {error instanceof Error ? error.message : "Canvas not found"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tilesCount = Object.keys(data.snapshot.tiles || {}).length;
  const widgetsCount = (data.snapshot.widgets || []).length;
  const objectsCount = (data.snapshot.objects || []).length;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background select-none">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/canva" />}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} className="h-4 w-4" />
            <span>Canvases</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <HugeiconsIcon icon={PaintBoardIcon} className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold text-foreground truncate max-w-[240px] md:max-w-md">
              {data.title}
            </h2>
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
              Read-Only
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Creator info */}
          <div className="hidden sm:flex items-center gap-2">
            {data.userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.userImage}
                alt={data.userName}
                className="h-6 w-6 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                {data.userName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-right">
              <span className="text-xs font-medium text-foreground block leading-tight">
                {data.userName}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono block leading-tight">
                {data.userEmail}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block shrink-0" />

          {/* Counts badge */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {tilesCount} tiles
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {widgetsCount} widgets
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {objectsCount} objects
            </Badge>
          </div>

          <Button
            variant="outline"
            size="icon-xs"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Reload canvas"
            className="cursor-pointer"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </header>

      {/* Canvas Viewport Container */}
      <div className="relative flex-1 w-full min-h-0 overflow-hidden bg-background">
        {/* The DOM element CanvasEngine mounts into */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Transparent interaction overlay for panning & zooming without drawing tools */}
        <div
          ref={overlayRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing touch-none"
          title="Drag to pan · Scroll to zoom"
        />

        {/* Floating Zoom & Controls Dock */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border/80 shadow-lg rounded-full px-2 py-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomBy(100)}
            className="rounded-full h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Zoom Out"
          >
            -
          </Button>

          <span className="text-[11px] font-mono text-muted-foreground px-2 min-w-[50px] text-center">
            {Math.round(zoomScale * 100)}%
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomBy(-100)}
            className="rounded-full h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Zoom In"
          >
            +
          </Button>

          <div className="h-3 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="xs"
            onClick={resetZoom}
            className="rounded-full h-7 text-[11px] text-muted-foreground hover:text-foreground px-2"
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
