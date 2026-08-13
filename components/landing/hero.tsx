import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilIcon, StarIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";

export function Hero() {
  return (
    <section className="flex min-h-0 flex-1 flex-col justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex max-w-3xl flex-col items-start gap-5 text-left sm:gap-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative grid size-2 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
                <span className="relative size-1.5 rounded-full bg-primary" />
              </span>
              Offline-first AI whiteboard
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="font-heading text-3xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              A canvas that <span className="text-primary">thinks with you</span>.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="max-w-[54ch] text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sketch, jot math, drop a plot. The AI reads your ink and replies right on the board.
              Free, open source, and MIT licensed.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                size="lg"
                render={
                  <a
                    href="https://github.com/taqui-786/drawva"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                className="gap-2 px-7 transition-transform hover:scale-[1.02] active:scale-95"
              >
                <HugeiconsIcon icon={StarIcon} className="size-5" aria-hidden />
                Leave a star
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/canvas" />}
                className="gap-2 px-6"
              >
                <HugeiconsIcon icon={PencilIcon} className="size-5" aria-hidden />
                Start drawing
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.22} className="w-full">
          {/* App mockup slot. Replace this frame with a real screenshot of the
              canvas (with its navbar header) when ready. Keep the same aspect. */}
          <div className="mx-auto w-full max-w-[calc(58vh*1.78)] overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-28px] shadow-foreground/10">
            <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/40 px-3">
              <span className="grid size-4 place-items-center rounded-[4px] bg-primary/15 text-primary">
                <HugeiconsIcon icon={StarIcon} className="size-2.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-center font-mono text-[11px] text-muted-foreground">
                drawva.app
              </span>
              <span className="w-4" />
            </div>
            <div className="grid aspect-[16/9] w-full place-items-center bg-muted/10">
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <span className="grid size-10 place-items-center rounded-md border border-dashed border-border text-muted-foreground/60">
                  <HugeiconsIcon icon={StarIcon} className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-foreground">Canvas mockup goes here</p>
                <p className="text-xs text-muted-foreground">
                  Add a screenshot of the board with its navbar header.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}