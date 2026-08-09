"use client";
// ============================================================
// Drawva — Canvas Shell (client component)
// Dynamic import of CanvasApp with ssr: false must live in a
// client component per Next.js 16 rules.
// ============================================================

import dynamic from "next/dynamic";

const CanvasApp = dynamic(
  () => import("./CanvasApp").then((m) => ({ default: m.CanvasApp })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 rounded-2xl bg-foreground flex items-center justify-center">
            <span className="text-background font-black text-xl">D</span>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading canvas…</p>
        </div>
      </div>
    ),
  }
);

export function CanvasShell() {
  return <CanvasApp />;
}
