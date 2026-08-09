"use client";
// ============================================================
// Drawva — Canvas App (client component)
// Composes CanvasProvider + CanvasToolbarLeft + CanvasViewport + CanvasToolbarRight
// Full-screen playground layout.
// ============================================================

import Link from "next/link";
import { CanvasProvider } from "@/components/canvas/CanvasProvider";
import { CanvasToolbarLeft } from "@/components/canvas/CanvasToolbarLeft";
import { CanvasToolbarRight } from "@/components/canvas/CanvasToolbarRight";
import { CanvasViewport } from "@/components/canvas/CanvasViewport";

export function CanvasApp() {
  return (
    <CanvasProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Primary tools on left sidebar */}
        <CanvasToolbarLeft />

        {/* Canvas workspace in middle */}
        <main className="flex flex-1 flex-col overflow-hidden relative">
          {/* Top header bar */}
          <header className="flex h-11 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm shrink-0 z-10">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6.5 items-center justify-center rounded-lg bg-foreground text-background text-xs font-black">
                D
              </span>
              <span className="font-heading font-black text-xs uppercase tracking-widest">
                Drawva
              </span>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block font-medium">
              Infinite Whiteboard Playground — Draw, Pan, Zoom, Erase, Undo & Export
            </span>
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              ← Home
            </Link>
          </header>

          {/* Canvas viewport */}
          <CanvasViewport />
        </main>

        {/* Playground controls & conditional options on right sidebar */}
        <CanvasToolbarRight />
      </div>
    </CanvasProvider>
  );
}
