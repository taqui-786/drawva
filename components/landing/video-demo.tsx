"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilIcon, SparklesIcon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";

/**
 * Demo reel shown inside a "browser/video" frame. Cycles through a few
 * canvas scenarios so the hero block feels alive.
 *
 * To use a real recording: drop the file at `public/demo.mp4` and replace
 * the <DemoStage /> below with:
 *
 *   <video src="/demo.mp4" autoPlay muted loop playsInline controls className="h-full w-full object-cover" />
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
            {i > 0 && <span className="font-mono text-sm text-muted-foreground/70">→</span>}
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
        <span className="text-primary text-2xl font-bold">∑</span>
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
      <div className="flex h-20 items-end justify-center gap-2.5">
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

/* ── animated demo stage (placeholder for the real video) ────────────── */

function DemoStage({ reduce }: { reduce: boolean }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SCENES.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);

  const scene = SCENES[idx];

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 py-5 text-center">
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
  );
}

/* ── frame with spotlight border + gentle 3D tilt ────────────────────── */

export function VideoDemo() {
  const reduce = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 120, damping: 20 });
  const sy = useSpring(my, { stiffness: 120, damping: 20 });
  const rotateX = useTransform(sy, [0, 1], [3.2, -3.2]);
  const rotateY = useTransform(sx, [0, 1], [-3.6, 3.6]);
  const spotlight = useTransform(
    sx,
    (v) => `radial-gradient(420px circle at ${v * 100}% ${sy.get() * 100}%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 72%)`
  );

  const onMove = (e: React.MouseEvent) => {
    if (reduce) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="relative h-full min-h-0 w-full [perspective:1400px]"
    >
      {/* soft glow behind the frame */}
      <div
        aria-hidden
        className="absolute inset-x-8 bottom-2 top-10 -z-10 rounded-[2rem] bg-primary/12 blur-3xl"
      />

      <motion.div
        ref={frameRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-[0_24px_60px_-24px_color-mix(in_oklch,var(--primary)_30%,transparent),0_2px_8px_color-mix(in_oklch,var(--foreground)_6%,transparent)] backdrop-blur-md"
      >
        {/* cursor-following spotlight border */}
        <motion.div
          aria-hidden
          style={reduce ? undefined : { background: spotlight }}
          className="pointer-events-none absolute inset-0 z-20 opacity-70"
        />

        {/* Top browser bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/40 px-4 py-2">
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
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              AI Live
            </span>
            <span className="hidden sm:inline">HD 1080p</span>
          </div>
        </div>

        {/* Demo stage — swap for a real <video> later */}
        <div className="min-h-0 flex-1">
          <DemoStage reduce={!!reduce} />
        </div>

        {/* bottom mock bar — hint that a real video goes here */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/50 bg-muted/40 px-4 py-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={SparklesIcon} className="size-3" />
            Auto demo — replace with real &lt;video&gt; / iframe src
          </span>
          <span>▶ 00:00 / 00:30</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
