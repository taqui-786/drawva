"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PencilIcon,
  SparklesIcon,
  CheckmarkCircle01Icon,
  PaintBrush01Icon,
  ShapesIcon,
  TextFontIcon,
  EraserIcon,
  MoveIcon,
} from "@hugeicons/core-free-icons";
import { CONTAINER } from "@/components/landing/container";

const DEMO_MODES = [
  {
    id: "flowchart",
    label: "Flowchart Diagram",
    inkText: "Draw flowchart: User -> Auth -> Dashboard",
    outputType: "Mermaid Flowchart",
    preview: (
      <div className="flex flex-col items-center gap-3 py-4 w-full">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-xs font-mono font-medium text-primary shadow-xs">
            [User Input]
          </div>
          <span className="text-muted-foreground font-mono text-xs">➔</span>
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-xs font-mono font-medium text-primary shadow-xs">
            [Auth Engine]
          </div>
          <span className="text-muted-foreground font-mono text-xs">➔</span>
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-xs font-mono font-medium text-primary shadow-xs">
            [Dashboard]
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "latex",
    label: "LaTeX Equation",
    inkText: "Solve: E = mc^2 & Integral",
    outputType: "MathJax Rendering",
    preview: (
      <div className="flex flex-col items-center justify-center gap-2 py-4 w-full">
        <div className="font-serif text-lg text-foreground bg-muted/30 border border-border/60 px-6 py-3 rounded-lg shadow-xs">
          <span className="text-primary font-bold">∫</span>
          <sub>0</sub>
          <sup>∞</sup> e<sup>-x²</sup> dx = <span className="text-primary font-bold">√π / 2</span>
        </div>
      </div>
    ),
  },
  {
    id: "chart",
    label: "Statistical Chart",
    inkText: "Plot bar chart of monthly active users",
    outputType: "Vega-Lite Chart",
    preview: (
      <div className="flex items-end justify-center gap-3 h-28 py-2 w-full">
        {[40, 65, 30, 85, 55, 95].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="w-7 rounded-t-md bg-primary/80 hover:bg-primary shadow-xs"
            />
            <span className="font-mono text-[10px] text-muted-foreground">M{i + 1}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export function CanvasShowcase() {
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setActiveTab((i) => (i + 1) % DEMO_MODES.length), 4000);
    return () => clearInterval(t);
  }, [reduce]);

  const mode = DEMO_MODES[activeTab];

  return (
    <section id="demo" className="w-full py-16 md:py-24 border-t border-border/40">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
            <span>Interactive Perception Engine</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            See Drawva convert raw ink to code
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Draw anything on the infinite canvas. Drawva&apos;s 3-Stage AI agent perceives ink clusters and returns interactive widgets in place.
          </p>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {DEMO_MODES.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setActiveTab(i)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === i
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Frame Mockup */}
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md">
          {/* Top Canvas Toolbar */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-500/80" />
              <span className="size-3 rounded-full bg-yellow-500/80" />
              <span className="size-3 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-xs font-medium text-muted-foreground">
                drawva-infinite-board.canvas
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 p-1">
              <span className="p-1 text-muted-foreground hover:text-foreground">
                <HugeiconsIcon icon={MoveIcon} className="size-4" />
              </span>
              <span className="p-1 text-primary bg-primary/10 rounded">
                <HugeiconsIcon icon={PencilIcon} className="size-4" />
              </span>
              <span className="p-1 text-muted-foreground hover:text-foreground">
                <HugeiconsIcon icon={PaintBrush01Icon} className="size-4" />
              </span>
              <span className="p-1 text-muted-foreground hover:text-foreground">
                <HugeiconsIcon icon={EraserIcon} className="size-4" />
              </span>
              <span className="p-1 text-muted-foreground hover:text-foreground">
                <HugeiconsIcon icon={TextFontIcon} className="size-4" />
              </span>
              <span className="p-1 text-muted-foreground hover:text-foreground">
                <HugeiconsIcon icon={ShapesIcon} className="size-4" />
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>AI Ready • 60 FPS</span>
            </div>
          </div>

          {/* Canvas Working Area */}
          <div className="relative min-h-[320px] p-6 sm:p-10 bg-[radial-gradient(ellipse_at_center,var(--primary-10,transparent_70%))]">
            {/* Ambient canvas grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30 pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center justify-center space-y-6 text-center">
              {/* Simulated Ink Prompt Pill */}
              <motion.div
                key={`ink-${mode.id}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-background/80 px-4 py-2 text-xs font-mono shadow-md backdrop-blur-md"
              >
                <HugeiconsIcon icon={PencilIcon} className="size-4 text-primary" />
                <span className="text-foreground">{mode.inkText}</span>
              </motion.div>

              {/* AI Processing Arrow */}
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="h-4 w-px bg-border" />
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] text-primary font-medium">
                  <HugeiconsIcon icon={SparklesIcon} className="size-3" />
                  Stage 3: Generated {mode.outputType}
                </span>
                <span className="h-4 w-px bg-border" />
              </div>

              {/* Generated Widget Box */}
              <motion.div
                key={`widget-${mode.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-lg rounded-xl border border-primary/30 bg-card/95 p-5 shadow-xl backdrop-blur-md"
              >
                <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                  <div className="flex items-center gap-2 font-mono text-xs text-primary font-semibold">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />
                    <span>{mode.outputType} Widget</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">x: 420, y: 280</span>
                </div>

                {mode.preview}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
