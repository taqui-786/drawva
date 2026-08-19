"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilIcon, SparklesIcon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { CONTAINER } from "@/components/landing/container";

/**
 * Auto-playing animated micro-demo shown inside a "browser/video" frame.
 * Cycles through a few canvas scenarios so the hero block feels alive.
 * Swap the inner content for a real <video> / iframe src later.
 */
const SCENES = [
  {
    id: "flowchart",
    ink: "Draw flowchart: User → Auth → Dashboard",
    label: "Mermaid Flowchart",
    body: (
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {["User Input", "Auth Engine", "Dashboard"].map((n, i) => (
          <div key={n} className="flex items-center gap-2.5">
            {i > 0 && <span className="text-muted-foreground/70 font-mono text-sm">→</span>}
            <div className="rounded-lg border border-primary/50 bg-primary/10 px-3.5 py-1.5 font-mono text-xs font-medium text-primary shadow-xs">
              {n}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "math",
    ink: "Solve: sum of squares & plot",
    label: "MathJax LaTeX",
    body: (
      <div className="font-serif text-base text-foreground sm:text-lg">
        <span className="text-primary font-bold text-2xl">∑</span>
        <sub className="text-[10px]">n</sub>
        <sup className="text-[10px]">i=1</sup> i² =&nbsp;
        <span className="text-primary font-bold">n(n+1)(2n+1)/6</span>
      </div>
    ),
  },
  {
    id: "chart",
    ink: "Plot bar chart of monthly users",
    label: "Vega-Lite Chart",
    body: (
      <div className="flex items-end justify-center gap-2.5 h-20">
        {[40, 65, 30, 85, 55, 95].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
            className="w-6 rounded-t-md bg-primary/80"
          />
        ))}
      </div>
    ),
  },
];

export function VideoDemo() {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SCENES.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);

  const scene = SCENES[idx];

  return (
    <section className="w-full">
      <div className={CONTAINER}>
        {/* Browser / video frame */}
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur-md">
          {/* Top browser bar */}
          <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-500/80" />
              <span className="size-2.5 rounded-full bg-yellow-500/80" />
              <span className="size-2.5 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                drawva-demo.mp4
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AI Live
              </span>
              <span>HD 1080p</span>
            </div>
          </div>

          {/* Animated demo stage */}
          <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-5 px-6 py-8 text-center sm:min-h-[260px]">
            {/* ambient glow + grid */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--primary-20,rgba(16,185,129,0.15)),transparent_70%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:28px_28px] opacity-25" />

            {/* ink prompt */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`ink-${scene.id}`}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
                className="relative z-10 inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-background/80 px-3.5 py-1.5 font-mono text-xs shadow-md backdrop-blur-md"
              >
                <HugeiconsIcon icon={PencilIcon} className="size-3.5 text-primary" />
                <span className="text-foreground">{scene.ink}</span>
              </motion.div>
            </AnimatePresence>

            {/* generated widget */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`widget-${scene.id}`}
                initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35 }}
                className="relative z-10 w-full max-w-md rounded-xl border border-primary/30 bg-background/90 p-4 shadow-xl backdrop-blur-md"
              >
                <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3.5" />
                    {scene.label}
                  </span>
                </div>
                {scene.body}
              </motion.div>
            </AnimatePresence>

            {/* scene dots */}
            <div className="relative z-10 flex items-center gap-1.5">
              {SCENES.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx ? "w-5 bg-primary" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* fake video controls */}

          {/* bottom mock bar - hint that a real video goes here */}
          <div className="flex items-center justify-between border-t border-border/50 bg-muted/40 px-4 py-2 font-mono text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon icon={SparklesIcon} className="size-3" />
              Auto demo — replace with real &lt;video&gt; / iframe src
            </span>
            <span>▶ 00:00 / 00:30</span>
          </div>
        </div>
      </div>
    </section>
  );
}
