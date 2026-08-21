"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { NexoraDashboard } from "@/components/landing/NexoraDashboard";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function NexoraHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative flex-1 flex flex-col items-center justify-start overflow-hidden px-4 pt-2 md:pt-4">
      {/* Background Video */}
      <video
        src={VIDEO_URL}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover z-0 pointer-events-none select-none"
      />

      {/* Main Foreground Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-7xl mx-auto">
        {/* 1. Badge (top) */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground font-body shadow-xs">
            <span>Now with GPT-5 support ✨</span>
          </div>
        </motion.div>

        {/* 2. Headline */}
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center font-display text-5xl md:text-6xl lg:text-[5rem] leading-[0.95] tracking-tight text-foreground max-w-xl"
        >
          The Future of <span className="italic font-normal">Smarter</span> Automation
        </motion.h1>

        {/* 3. Subheadline */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-center text-base md:text-lg text-muted-foreground max-w-[650px] leading-relaxed font-body"
        >
          Automate your busywork with intelligent agents that learn, adapt, and execute—so your team can focus on what matters most.
        </motion.p>

        {/* 4. CTA Buttons */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 flex items-center gap-3"
        >
          {/* Primary Button */}
          <Button
            render={<Link href="/canvas" />}
            className="rounded-full px-6 py-5 text-sm font-medium font-body bg-foreground text-background hover:bg-foreground/90 transition-all shadow-md hover:scale-[1.02] active:scale-95"
          >
            Book a demo
          </Button>

          {/* Play Button */}
          <button
            type="button"
            aria-label="Play product video preview"
            className="h-11 w-11 rounded-full border-0 bg-background shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-background/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-foreground text-foreground ml-0.5"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        </motion.div>

        {/* 5. Dashboard Preview (custom coded, NOT an image) */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 w-full max-w-5xl shrink-0"
        >
          <NexoraDashboard />
        </motion.div>
      </div>
    </section>
  );
}
