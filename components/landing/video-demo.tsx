"use client";

import { CONTAINER } from "@/components/landing/container";

export function VideoDemo() {
  return (
    <section id="demo" className="w-full py-16 md:py-24 border-t border-border/40">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto mb-12">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Product Demo
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            See Drawva in action
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Watch how handwritten canvas ink transforms into interactive diagrams and executable code.
          </p>
        </div>

        {/* Demo Video Container Mock */}
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md">
          {/* Top Browser Bar */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-500/80" />
              <span className="size-3 rounded-full bg-yellow-500/80" />
              <span className="size-3 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                drawva-demo-walkthrough.mp4
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span>HD 1080p</span>
            </div>
          </div>

          {/* Video Player Box / Placeholder Area */}
          <div className="relative aspect-video w-full bg-black/90 flex flex-col items-center justify-center p-6 text-center group cursor-pointer">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--primary-20,rgba(16,185,129,0.2)),transparent_70%)] pointer-events-none" />

            {/* Play Button Mock Icon */}
            <div className="relative z-10 flex size-20 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/40 transition-transform group-hover:scale-110">
              <svg
                viewBox="0 0 24 24"
                className="size-8 translate-x-0.5"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            <div className="relative z-10 space-y-2 mt-6">
              <h3 className="text-xl font-bold text-white">
                Drawva Product Showcase Video
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                [ Demo Video Placeholder — Replace with your &lt;video&gt; or iframe src ]
              </p>
            </div>

            {/* Video Controls Bar Mock */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-white/10 bg-black/60 px-6 py-3 text-white text-xs font-mono backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="text-primary">▶ 00:00 / 01:30</span>
              </div>
              <div className="flex-1 mx-6 h-1 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full w-1/3 bg-primary" />
              </div>
              <div className="flex items-center gap-3">
                <span>1080p</span>
                <span>🔊</span>
                <span>⛶</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
