"use client";

import Image from "next/image";
import Link from "next/link";

export function DrawvaCanvasPreview() {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.2)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        boxShadow:
          "var(--shadow-dashboard, 0 25px 80px -12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04))",
      }}
      className="w-full rounded-2xl overflow-hidden p-2 sm:p-3 md:p-3.5 backdrop-blur-xl transition-all select-none"
    >
      <Link
        href="/canvas"
        className="group block relative w-full overflow-hidden rounded-xl border border-black/[0.06] bg-background shadow-xs transition-transform duration-300 hover:scale-[1.005] focus:outline-none"
      >
        <Image
          src="/demo/drawva-demo-two-webpformat.webp"
          alt="Drawva AI Infinite Canvas Demo"
          width={1920}
          height={1080}
          unoptimized
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="w-full h-auto block object-cover rounded-xl"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 backdrop-blur-md border border-border/60 text-[11px] font-mono font-medium text-foreground/90 shadow-sm opacity-90 group-hover:opacity-100 transition-opacity">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          <span>Live Demo</span>
        </div>
      </Link>
    </div>
  );
}
