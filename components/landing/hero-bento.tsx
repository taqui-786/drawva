"use client";

import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ── shared tile shell ────────────────────────────────────────────────── */

function Tile({
  title,
  caption,
  className,
  children,
}: {
  title: string;
  caption?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl bg-card/70 p-4 border border-border/60 shadow-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        <span className="size-1.5 rounded-full bg-primary/40 group-hover:bg-primary group-hover:animate-ping" />
      </div>
      <div className="my-auto flex min-h-[70px] items-center justify-center py-2">{children}</div>
      {caption && (
        <p className="pt-2 text-[11px] leading-tight text-muted-foreground/80 border-t border-border/40">
          {caption}
        </p>
      )}
    </Card>
  );
}

/* ── Tile 1 · Multimodal AI Agent ─────────────────────────────────────── */

const STAGES = [
  { name: "Visual Canvas Perception", desc: "Ink & atlas image analysis" },
  { name: "Multimodal Reasoning", desc: "Spatial intent & gesture eval" },
  { name: "Structured Command Output", desc: "7 formats, MathJax & applets" },
];

function PipelineTile({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % STAGES.length), 1600);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <Tile
      className={className}
      title="Multimodal AI Agent"
      caption="Supports OpenAI, DeepSeek, Qwen2-VL, Ollama, and any OpenAI-compatible provider."
    >
      <div className="flex w-full flex-col justify-center gap-1.5 py-1">
        {STAGES.map((s, i) => (
          <Fragment key={s.name}>
            {i > 0 && (
              <div className="relative mx-4 h-2 w-px bg-border/80">
                {!reduce && (
                  <motion.span
                    className="absolute -left-[2.5px] top-0 size-1.5 rounded-full bg-primary"
                    animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.5,
                    }}
                  />
                )}
              </div>
            )}
            <motion.div
              animate={{
                opacity: idx === i ? 1 : 0.5,
                scale: idx === i ? 1.02 : 1,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 transition-all",
                idx === i
                  ? "border-primary/60 bg-primary/10 shadow-sm"
                  : "border-border/60 bg-muted/30"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    idx === i ? "bg-primary shadow-sm shadow-primary" : "bg-muted-foreground/40"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-xs font-medium",
                    idx === i ? "text-primary font-semibold" : "text-muted-foreground"
                  )}
                >
                  {s.name}
                </span>
              </div>
              <span className="hidden sm:inline-block font-mono text-[9px] text-muted-foreground/70">
                {s.desc}
              </span>
            </motion.div>
          </Fragment>
        ))}
      </div>
    </Tile>
  );
}

/* ── Tile 2 · Zero-Cloud P2P Sync ─────────────────────────────────────── */

function AvatarDot() {
  return (
    <span className="relative grid size-7 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 shadow-xs">
      <span className="size-2 rounded-full bg-primary" />
    </span>
  );
}

function SyncTile({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [code, setCode] = useState("4640");

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(
      () => setCode(String(1000 + Math.floor(Math.random() * 9000))),
      2000
    );
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <Tile
      className={className}
      title="Zero-Cloud P2P Sync"
      caption="Sub-30ms direct WebRTC DataChannels. No database needed."
    >
      <div className="flex w-full flex-col items-center gap-3 py-1">
        <div className="flex w-full items-center gap-2 px-1">
          <AvatarDot />
          <div className="relative h-px flex-1 bg-border/80">
            {!reduce && (
              <>
                <motion.span
                  className="absolute -top-[2.5px] size-[6px] rounded-full bg-primary shadow-xs shadow-primary"
                  animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.span
                  className="absolute -top-[2.5px] size-[6px] rounded-full bg-primary/60"
                  animate={{ left: ["100%", "0%"], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                />
              </>
            )}
          </div>
          <AvatarDot />
        </div>
        <div className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums tracking-wider rounded-md bg-muted/50 border border-border/50 px-3 py-1">
          <span className="text-muted-foreground">DRAW-</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={code}
              initial={reduce ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="text-primary"
            >
              {code}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </Tile>
  );
}

/* ── Tile 3 · 7 Diagram Formats ───────────────────────────────────────── */

const FORMATS: { name: string; icon: React.ReactNode }[] = [
  {
    name: "Mermaid",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <rect x="1" y="4" width="5" height="3.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="10" y="4" width="5" height="3.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6.2 5.7h3.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7.5 8.4v3" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7.5 11.4l1.3-1.2M7.5 11.4l-1.3-1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    name: "Graphviz DOT",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <circle cx="3" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="13" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="3.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 7L6.5 5M11 7L9.5 5M5 9l1.6 2M11 9l-1.6 2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    name: "Vega-Lite",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <path d="M2 13h12M3.5 11V6M6 11V4M8.5 11V7M11 11V5M13.5 11V8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "SMILES",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <path d="M8 2.5l5 2.9v5.8L8 14.2l-5-2.9V5.4z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M13 5.4L8 8.3 3 5.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "BPMN XML",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <rect x="3" y="5.6" width="10" height="4.8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    name: "Cytoscape",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="2.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="13.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="13.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 4.6l3.2 2M12 4.6l-2.4 2M12 12l-3-1.6M3 5l0.2 4M8 10.4v1.6" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    name: "GeoJSON Maps",
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <path d="M8 2.5c-2.2 0-4 1.7-4 3.9 0 2.9 4 7.1 4 7.1s4-4.2 4-7.1c0-2.2-1.8-3.9-4-3.9z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="6.3" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
];

function FormatTile({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % FORMATS.length), 1500);
    return () => clearInterval(t);
  }, [reduce]);

  const active = FORMATS[idx];

  return (
    <Tile
      className={className}
      title="7 Diagram Formats"
      caption="Mermaid · Graphviz · Vega-Lite · SMILES · BPMN · Cytoscape · GeoJSON"
    >
      <div className="flex w-full flex-col items-center gap-2.5">
        <div className="flex w-full gap-1">
          {FORMATS.map((f, i) => (
            <span
              key={f.name}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                i === idx ? "bg-primary shadow-xs shadow-primary" : "bg-border/60"
              )}
            />
          ))}
        </div>
        <div className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.name}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 text-primary"
            >
              {active.icon}
              <span className="font-mono text-xs font-semibold text-foreground">
                {active.name}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Tile>
  );
}

/* ── Tile 4 · Live Math & LaTeX ───────────────────────────────────────── */

const MATH_STEPS = ["scribble", "latex", "plot"] as const;

function MathTile({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % MATH_STEPS.length), 2000);
    return () => clearInterval(t);
  }, [reduce]);

  const current = MATH_STEPS[step];

  return (
    <Tile
      className={className}
      title="Live Math & LaTeX"
      caption="Handwritten ∑ renders to MathJax equations & function plots."
    >
      <div className="grid h-full w-full place-items-center py-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current}
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35 }}
          >
            {current === "scribble" && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <svg viewBox="0 0 40 40" className="size-8 text-primary" aria-hidden>
                  <motion.path
                    d="M8 30c3-8 8-14 10-20M10 24c6 1 10-4 12-8M10 30c6-2 12-1 16-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </svg>
                <span>Handwritten Ink</span>
              </div>
            )}
            {current === "latex" && (
              <span className="font-serif text-sm italic text-foreground bg-muted/40 border border-border/50 px-3 py-1.5 rounded-md">
                <span className="text-primary font-semibold">∑</span>
                <sub className="text-[10px]">i=1</sub>
                <sup className="text-[10px]">n</sup> i² = n(n+1)(2n+1)/6
              </span>
            )}
            {current === "plot" && (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 48 28" className="h-7 w-12 text-primary" aria-hidden>
                  <motion.path
                    d="M0 20c4-14 8-14 12 0s8 14 12 0 8-14 12 0 8-14 12-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </svg>
                <span className="font-mono text-xs font-medium text-foreground">f(x) = sin(x)</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Tile>
  );
}

/* ── Tile 5 · stat strip ──────────────────────────────────────────────── */

function StatTile({ className }: { className?: string }) {
  return (
    <Tile className={className} title="Canvas Engine">
      <div className="flex flex-col items-center gap-1 text-center w-full">
        <span className="font-mono text-xs font-semibold text-primary">60 FPS Tile Cache</span>
        <p className="text-[11px] text-muted-foreground">
          512px offscreen tile layers • IndexedDB autosave • Infinite undo/redo
        </p>
      </div>
    </Tile>
  );
}

/* ── bento grid ───────────────────────────────────────────────────────── */

export function HeroBento() {
  return (
    <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2">
      <PipelineTile className="sm:col-span-2 lg:col-span-1 lg:row-span-2" />
      <SyncTile className="col-span-1" />
      <FormatTile className="col-span-1" />
      <MathTile className="col-span-1" />
      <StatTile className="col-span-1" />
    </div>
  );
}