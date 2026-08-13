"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilIcon, SparklesIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { CONTAINER } from "@/components/landing/container";

export function CtaSection() {
  return (
    <section className="relative w-full py-20 overflow-hidden border-t border-border/40 bg-gradient-to-b from-background via-primary/5 to-background">
      {/* Background glow circle */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className={CONTAINER}>
        <div className="mx-auto max-w-3xl rounded-3xl border border-primary/30 bg-card/80 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary">
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5 animate-pulse" />
            <span>Ready to Create?</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Turn your sketches into live code in seconds.
          </h2>

          <p className="mx-auto max-w-xl text-muted-foreground text-sm sm:text-base leading-relaxed">
            Experience the infinite whiteboard powered by a multimodal AI perception agent. No signup required, zero cloud database.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              render={<Link href="/canvas" />}
              className="gap-2 px-8 shadow-xl shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95 text-base font-semibold"
            >
              <HugeiconsIcon icon={PencilIcon} className="size-5" />
              <span>Launch Canvas Now</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
