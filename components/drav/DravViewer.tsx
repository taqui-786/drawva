"use client";

import * as React from "react";
import { DravDetailData } from "@/lib/dravs/types";
import { CanvasEngine } from "@/lib/canvas/engine";
import { WidgetManager } from "@/lib/canvas/widgets";
import { ObjectManager } from "@/lib/canvas/objects";
import { restoreSnapshot } from "@/lib/canvas/persistence";
import { contentBounds } from "@/lib/canvas/atlas";
import { DravHeader } from "./DravHeader";
import { DravCommentsSheet } from "./DravCommentsSheet";
import { DravReportDialog } from "./DravReportDialog";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  RotateLeft01Icon,
  HandIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { dravQueryKeys } from "@/lib/dravs/useDravMutations";
import { cn } from "@/lib/utils";

interface DravViewerProps {
  drav: DravDetailData;
}

export function DravViewer({ drav }: DravViewerProps) {
  // Live reactive TanStack Query for real-time like/comment updates
  const { data: currentDrav = drav } = useQuery<DravDetailData>({
    queryKey: dravQueryKeys.detail(drav.id),
    queryFn: async () => {
      const res = await fetch(`/api/dravs/${drav.id}`);
      if (!res.ok) throw new Error("Failed to fetch Drav");
      return res.json();
    },
    initialData: drav,
    staleTime: 60 * 1000,
  });

  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const engineRef = React.useRef<CanvasEngine | null>(null);
  const widgetManagerRef = React.useRef<WidgetManager | null>(null);
  const objectManagerRef = React.useRef<ObjectManager | null>(null);

  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [zoomPercent, setZoomPercent] = React.useState(100);

  // Viewer modes: "drag" (canvas pan) vs "eye" (direct widget/canvas interaction)
  const [viewerMode, setViewerMode] = React.useState<"drag" | "eye">("drag");
  const [isDraggingState, setIsDraggingState] = React.useState(false);

  // Track dragging state for pan
  const isDragging = React.useRef(false);
  const lastPoint = React.useRef({ x: 0, y: 0 });

  // Record view on mount
  React.useEffect(() => {
    fetch(`/api/dravs/${drav.id}/views`, { method: "POST" }).catch((err) => {
      console.warn("Failed to record Drav view:", err);
    });
  }, [drav.id]);

  // Keyboard shortcut for switching tools: H (drag) and V (eye)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "h" || e.key === "H") {
        setViewerMode("drag");
      } else if (e.key === "v" || e.key === "V") {
        setViewerMode("eye");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Global window pointerup/cancel safety listener
  React.useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsDraggingState(false);
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, []);

  // Forward mouse wheel events from widget iframes to canvas camera
  React.useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "drawva-widget-wheel") return;
      const engine = engineRef.current;
      if (!engine) return;

      let screenX = window.innerWidth / 2;
      let screenY = window.innerHeight / 2;

      if (e.data.isScreenCoord) {
        screenX = typeof e.data.clientX === "number" ? e.data.clientX : screenX;
        screenY = typeof e.data.clientY === "number" ? e.data.clientY : screenY;
      } else {
        const pt = widgetManagerRef.current?.getIframeScreenPoint(
          e.source,
          typeof e.data.clientX === "number" ? e.data.clientX : 0,
          typeof e.data.clientY === "number" ? e.data.clientY : 0
        );
        if (pt) {
          screenX = pt.x;
          screenY = pt.y;
        } else if (
          typeof e.data.clientX === "number" &&
          typeof e.data.clientY === "number"
        ) {
          screenX = e.data.clientX;
          screenY = e.data.clientY;
        }
      }

      const deltaY = typeof e.data.deltaY === "number" ? e.data.deltaY : 0;
      if (deltaY === 0) return;

      if (e.data.ctrlKey || e.data.metaKey) {
        engine.camera.handleWheel({
          clientX: screenX,
          clientY: screenY,
          deltaX: 0,
          deltaY,
          ctrlKey: true,
          metaKey: false,
        });
      } else if (
        Math.abs(deltaY) < 60 &&
        (e.data.deltaMode === 0 || !e.data.deltaMode)
      ) {
        engine.camera.handleWheel({
          clientX: screenX,
          clientY: screenY,
          deltaX: 0,
          deltaY: deltaY * 2.5,
          ctrlKey: true,
          metaKey: false,
        });
      } else {
        engine.camera.zoomAt(screenX, screenY, deltaY);
      }
      engine.requestRender();
      setZoomPercent(Math.round(engine.camera.scale * 100));
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const gestureOverlayRef = React.useRef<HTMLDivElement | null>(null);

  // Non-passive wheel handler on overlay for smooth pinch-to-zoom and trackpad pan
  React.useEffect(() => {
    const el = gestureOverlayRef.current;
    if (!el) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;

      engine.camera.handleWheel({
        clientX: e.clientX,
        clientY: e.clientY,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        deltaMode: e.deltaMode,
      });
      engine.requestRender();
      setZoomPercent(Math.round(engine.camera.scale * 100));
    };

    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, []);

  // Initialize CanvasEngine and restore snapshot
  React.useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let cancelled = false;

    const engine = new CanvasEngine(el);
    const isDark = document.documentElement.classList.contains("dark");
    engine.syncTheme(isDark);
    engineRef.current = engine;

    const wm = new WidgetManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
    });
    wm.setMode("hand");
    widgetManagerRef.current = wm;

    const om = new ObjectManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
    });
    om.setMode("hand");
    objectManagerRef.current = om;

    // Lockstep rAF sync between canvas transforms and widgets/objects
    const unpost = engine.onPostFrame(() => {
      wm.sync();
      om.sync();
    });

    // Restore snapshot safely
    try {
      const raw =
        typeof drav.snapshot === "string" ? JSON.parse(drav.snapshot) : drav.snapshot;

      const parsedSnapshot = raw && typeof raw === "object"
        ? {
            ...raw,
            widgets: Array.isArray(raw.widgets)
              ? raw.widgets.map((w: Record<string, unknown>) => ({ ...w, status: "accepted" }))
              : raw.widgets,
            objects: Array.isArray(raw.objects)
              ? raw.objects.map((o: Record<string, unknown>) => ({ ...o, status: "accepted" }))
              : raw.objects,
          }
        : raw;

      restoreSnapshot(engine, wm, om, parsedSnapshot).then(() => {
        if (cancelled) return;
        wm.setMode("hand");
        om.setMode("hand");
        // Center camera on content
        const bounds = contentBounds(engine, wm, om);
        if (bounds && bounds.w > 0 && bounds.h > 0) {
          engine.camera.centerOnBox(bounds, 120);
          engine.requestRender();
          wm.sync();
          om.sync();
          setZoomPercent(Math.round(engine.camera.scale * 100));
        }
      });
    } catch (err) {
      console.error("Failed to restore Drav snapshot:", err);
    }

    // Theme observer
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      engine.syncTheme(dark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      unpost();
      wm.destroy();
      om.destroy();
      engine.destroy();
      engineRef.current = null;
      widgetManagerRef.current = null;
      objectManagerRef.current = null;
    };
  }, [drav.snapshot]);

  // Pointer interactions for panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    isDragging.current = true;
    setIsDraggingState(true);
    lastPoint.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !engineRef.current) return;
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;
    lastPoint.current = { x: e.clientX, y: e.clientY };

    const engine = engineRef.current;
    engine.camera.panBy(dx, dy);
    engine.requestRender();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false;
      setIsDraggingState(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Zoom controls
  const handleZoomBy = (deltaY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    engine.camera.zoomAt(cx, cy, deltaY);
    engine.requestRender();
    setZoomPercent(Math.round(engine.camera.scale * 100));
  };

  const handleResetView = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const bounds = contentBounds(
      engine,
      widgetManagerRef.current,
      objectManagerRef.current
    );
    if (bounds && bounds.w > 0 && bounds.h > 0) {
      engine.camera.centerOnBox(bounds, 120);
    } else {
      engine.camera.reset();
    }
    engine.requestRender();
    setZoomPercent(Math.round(engine.camera.scale * 100));
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background select-none">
      {/* Top Header */}
      <div className="shrink-0 h-13">
        <DravHeader
          drav={currentDrav}
          onOpenComments={() => setCommentsOpen(true)}
          onOpenReport={() => setReportOpen(true)}
        />
      </div>

      {/* Canvas Viewport (natural remaining flex height below header) */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />

        {/* Gesture Overlay: z-30 in drag mode to pan anywhere; z-10 in eye mode to allow widget clicks */}
        <div
          ref={gestureOverlayRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: viewerMode === "drag" ? 30 : 10,
            pointerEvents: "auto",
            touchAction: "none",
            userSelect: "none",
            cursor:
              viewerMode === "drag"
                ? isDraggingState
                  ? "grabbing"
                  : "grab"
                : isDraggingState
                  ? "grabbing"
                  : "default",
          }}
        />
      </div>

      {/* Floating Bottom Toolbar: Tool Modes & Zoom */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
        {/* Tool Mode: Drag (H) vs Eye (V) */}
        <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-full">
          <Button
            variant={viewerMode === "drag" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewerMode("drag")}
            className={cn(
              "size-7 rounded-full cursor-pointer transition-all",
              viewerMode === "drag" && "bg-background text-primary shadow-xs font-semibold"
            )}
            title="Drag Tool (Pan Canvas) [H]"
            aria-label="Drag Tool"
          >
            <HugeiconsIcon icon={HandIcon} className="size-3.5" />
          </Button>

          <Button
            variant={viewerMode === "eye" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewerMode("eye")}
            className={cn(
              "size-7 rounded-full cursor-pointer transition-all",
              viewerMode === "eye" && "bg-background text-primary shadow-xs font-semibold"
            )}
            title="Eye Tool (Interact with Canvas) [V]"
            aria-label="Eye Tool"
          >
            <HugeiconsIcon icon={ViewIcon} className="size-3.5" />
          </Button>
        </div>

        <div className="w-px h-4 bg-border/80 mx-0.5" />

        {/* Zoom Controls */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleZoomBy(100)}
          className="size-7 rounded-full cursor-pointer"
          title="Zoom out"
        >
          <HugeiconsIcon icon={ZoomOutAreaIcon} className="size-3.5" />
        </Button>

        <span className="w-12 text-center text-xs font-mono font-medium text-muted-foreground select-none">
          {zoomPercent}%
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleZoomBy(-100)}
          className="size-7 rounded-full cursor-pointer"
          title="Zoom in"
        >
          <HugeiconsIcon icon={ZoomInAreaIcon} className="size-3.5" />
        </Button>

        <div className="w-px h-4 bg-border/80 mx-0.5" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleResetView}
          className="size-7 rounded-full cursor-pointer text-muted-foreground hover:text-foreground"
          title="Reset View / Fit Content"
        >
          <HugeiconsIcon icon={RotateLeft01Icon} className="size-3.5" />
        </Button>
      </div>

      {/* Comments Sheet */}
      <DravCommentsSheet
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        dravId={drav.id}
      />

      {/* Report Dialog */}
      <DravReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        dravId={drav.id}
      />
    </div>
  );
}
