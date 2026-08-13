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
          className="gap-2 px-7 shadow-lg shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95"
        >
          <HugeiconsIcon icon={PencilIcon} className="size-5" aria-hidden />
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

/* ── left column copy ────────────────────────────────────────────────── */

export function HeroIntro() {
  return (
    <div className="flex flex-col justify-center gap-6 py-6 md:py-10">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
        AI-Powered Infinite Whiteboard
      </p>

      <ScatteredHeadline />

      <p className="max-w-[54ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        Sketch, drop a formula, or draw a flowchart — Drawva&apos;s multimodal AI agent converts your handwritten ink into live diagrams, equations, and interactive applets right on your infinite board.
      </p>

      <div className="flex flex-wrap items-center gap-3.5 pt-2">
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
          className="gap-2 px-6 hover:bg-muted/80"
        >
          <HugeiconsIcon icon={StarIcon} className="size-5" aria-hidden />
          <span>Star on GitHub</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-4 text-xs text-muted-foreground border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>BYO OpenAI API Key</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>IndexedDB Auto-Save</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>Zero-Cloud P2P Sync</span>
        </div>
      </div>
    </div>
  );
}