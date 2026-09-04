"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PencilIcon,
  ArrowRight01Icon,
  GithubIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { DrawvaCanvasPreview } from "@/components/landing/DrawvaCanvasPreview";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function DrawvaHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative flex-1 flex flex-col items-center justify-start overflow-hidden px-4 pt-2 md:pt-4">
      <video
        src={VIDEO_URL}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover z-0 pointer-events-none select-none"
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-7xl mx-auto">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/90 backdrop-blur-md px-3.5 py-1 text-xs font-medium text-muted-foreground font-body shadow-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span>Drawva 4.0 · Multimodal AI Whiteboard</span>
          </div>
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center font-display text-5xl md:text-6xl lg:text-[5rem] leading-[0.95] tracking-tight text-foreground max-w-2xl"
        >
          The Infinite Canvas for{" "}
          <span className="italic font-normal text-primary">Smarter</span>{" "}
          Thinking
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3.5 text-center text-sm md:text-base text-muted-foreground max-w-[560px] leading-relaxed font-body"
        >
          Sketch, drop formulas, or draw diagrams — Drawva&apos;s multimodal AI converts
          your handwritten ink into live visuals and equations.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 sm:mt-5 flex items-center gap-3 font-body"
        >
          <Button
            size="lg"
            render={<Link href="/canvas" />}
            className="rounded-full px-6 py-5 text-sm font-medium gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95"
          >
            <HugeiconsIcon icon={PencilIcon} className="h-4 w-4" />
            <span>Start drawing free</span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4 opacity-80" />
          </Button>

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
            className="rounded-full px-5 py-5 text-sm font-medium gap-2 border-border/80 bg-background/80 backdrop-blur-sm hover:bg-muted/80 text-foreground transition-all hover:scale-[1.02] active:scale-95"
          >
            <HugeiconsIcon icon={GithubIcon} className="h-4 w-4" />
            <span>Star on GitHub</span>
            <HugeiconsIcon icon={StarIcon} className="h-3.5 w-3.5 text-primary opacity-90" />
          </Button>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 sm:mt-8 w-full max-w-5xl shrink-0"
        >
          <DrawvaCanvasPreview />
        </motion.div>
      </div>
    </section>
  );
}
