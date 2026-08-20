"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilIcon, StarIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ScatteredHeadline } from "@/components/landing/scattered-headline";

/* ── full-screen ink splash when navigating to the canvas ────────────── */

function InkSplashOnClick() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const btnRef = useRef<HTMLDivElement>(null);
  const [splash, setSplash] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [fired, setFired] = useState(false);

  const go = useCallback(() => {
    if (reduce) {
      router.push("/canvas");
      return;
    }
    if (fired) return;
    setFired(true);
    const rect = btnRef.current?.getBoundingClientRect();
    const cx = (rect?.left ?? innerWidth / 2) + (rect?.width ?? 0) / 2;
    const cy = (rect?.top ?? innerHeight / 2) + (rect?.height ?? 0) / 2;
    const r = Math.hypot(innerWidth, innerHeight) + 40;
    setSplash({ cx, cy, r });
  }, [fired, reduce, router]);

  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => router.push("/canvas"), 380);
    return () => clearTimeout(t);
  }, [splash, router]);

  return (
    <>
      <div ref={btnRef} className="inline-block">
        <Button
          size="lg"
          onClick={go}
          className="gap-2 px-6 shadow-lg shadow-primary/20 transition-transform hover:scale-[1.04] active:scale-95"
        >
          <HugeiconsIcon icon={PencilIcon} className="size-4.5" aria-hidden />
          <span>Start drawing</span>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 opacity-80" aria-hidden />
        </Button>
      </div>

      <AnimatePresence>
        {splash && (
          <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100] bg-background"
            initial={{ clipPath: `circle(0% at ${splash.cx}px ${splash.cy}px)`, opacity: 0 }}
            animate={{ clipPath: `circle(${splash.r}px at ${splash.cx}px ${splash.cy}px)`, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.7, 0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ── staggered entry helper ──────────────────────────────────────────── */

function Rise({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── editorial hero copy (left-aligned) ──────────────────────────────── */

const SPECS = [
  { k: "01", label: "BYO API key" },
  { k: "02", label: "Autosaves locally" },
  { k: "03", label: "P2P sync, zero cloud" },
];

export function HeroIntro() {
  return (
    <div className="flex flex-col items-start gap-4 lg:gap-5">
      <Rise delay={0.05}>
        <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          AI-powered infinite whiteboard
        </p>
      </Rise>

      <ScatteredHeadline />

      <Rise delay={0.22}>
        <p className="max-w-[46ch] text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
          Sketch, drop a formula, or draw a flowchart — Drawva&apos;s multimodal AI agent
          converts your handwritten ink into live diagrams, equations, and interactive
          applets right on your infinite board.
        </p>
      </Rise>

      <Rise delay={0.3} className="flex flex-wrap items-center gap-3 pt-1">
        <InkSplashOnClick />
        <Button
          size="lg"
          variant="outline"
          render={
            <a
              href="https://github.com/taqui-786/drawva"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          className="gap-2 px-5 hover:bg-muted/80"
        >
          <HugeiconsIcon icon={StarIcon} className="size-4.5" aria-hidden />
          <span>Star on GitHub</span>
        </Button>
      </Rise>

      <Rise delay={0.38} className="w-full pt-2 lg:pt-4">
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-border/60 pt-3.5">
          {SPECS.map((s) => (
            <li key={s.k} className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-[10px] font-semibold text-primary/80">{s.k}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </Rise>
    </div>
  );
}
