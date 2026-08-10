import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Github01Icon,
  Layers01Icon,
  Database01Icon,
  TouchInteraction01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";

import { Reveal } from "@/components/Reveal";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

function Icon({ icon, size = 18, className }: { icon: HugeIcon; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} className={className} />;
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-chart-1/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-emerald-700 dark:text-emerald-300">
      {label}
    </span>
  );
}

const FEATURES: { icon: HugeIcon; title: string; desc: string }[] = [
  {
    icon: Layers01Icon,
    title: "Tile-based engine",
    desc: "Repaints only what a stroke touches.",
  },
  {
    icon: Database01Icon,
    title: "Saves as you draw",
    desc: "Local autosave, no account needed.",
  },
  {
    icon: TouchInteraction01Icon,
    title: "Infinite canvas",
    desc: "Pan and zoom with no page edges.",
  },
  {
    icon: Download01Icon,
    title: "Take it with you",
    desc: "Export any region as a crisp PNG.",
  },
];

export default function Home() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground selection:bg-foreground selection:text-background">
      {/* Keyboard users hop straight to content */}
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Soft ambient light drifting behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-64 left-1/2 -z-10 size-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground">
              D
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Drawva</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="https://github.com/taqui-786/drawva"
              target="_blank"
              rel="noreferrer"
              className="hidden h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              <Icon icon={Github01Icon} size={16} />
              <span>Source</span>
            </Link>
            <Link
              href="/canvas"
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/85 active:scale-[0.98]"
            >
              Open canvas
              <Icon icon={ArrowRight01Icon} size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-y-auto px-6"
      >
        <section className="flex flex-1 flex-col justify-center gap-8 py-8 lg:flex-row lg:items-center lg:gap-14">
          {/* Copy */}
          <div className="max-w-xl">
            <Reveal>
              <div className="flex flex-wrap items-center gap-2">
                <Tag label="Offline-first" />
                <Tag label="Local autosave" />
                <Tag label="No account" />
              </div>
            </Reveal>

            <Reveal index={1}>
              <h1 className="mt-4 font-serif text-4xl leading-[1.05] font-medium tracking-[-0.03em] sm:text-5xl lg:text-[56px]">
                A canvas for ideas that are still taking shape.
              </h1>
            </Reveal>

            <Reveal index={2}>
              <p className="mt-4 max-w-md text-base leading-[1.55] text-muted-foreground sm:text-lg">
                A freeform whiteboard that lives in your browser. Sketch, type, and arrange on an
                infinite canvas that saves itself.
              </p>
            </Reveal>

            <Reveal index={3}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/canvas"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/85 active:scale-[0.98]"
                >
                  Open canvas
                  <Icon icon={ArrowRight01Icon} size={16} />
                </Link>
                <Link
                  href="https://github.com/taqui-786/drawva"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-6 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted active:scale-[0.98]"
                >
                  <Icon icon={Github01Icon} size={16} />
                  View on GitHub
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Drawing surface - the actual canvas medium, not a fake screenshot */}
          <Reveal index={4} className="hidden flex-1 lg:block">
            <div className="card-lift overflow-hidden rounded-xl border border-border bg-card">
              <div className="relative h-[320px] xl:h-[380px]">
                {/* faint dot grid to evoke the canvas */}
                <svg aria-hidden="true" className="absolute inset-0 h-full w-full text-muted-foreground/25">
                  <defs>
                    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
                      <circle cx="1" cy="1" r="1" fill="currentColor" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#dots)" />
                </svg>

                {/* ink strokes */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 640 360"
                  className="absolute inset-0 h-full w-full text-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path
                    d="M96 248c38-64 84-96 132-92s62 44 46 78c-13 27-56 30-88 10"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M340 120c40 8 84 8 124-6m-24-26 26 24-24 22"
                    strokeWidth="2.5"
                    opacity="0.8"
                  />
                  <ellipse cx="480" cy="252" rx="84" ry="54" strokeWidth="2.5" />
                  <path d="M432 236h96M432 256h64" strokeWidth="2" opacity="0.5" />
                </svg>

                {/* highlighter sweep in the page accent */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 640 360"
                  className="absolute inset-0 h-full w-full text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M118 168c72-26 148-26 218-6" strokeWidth="18" opacity="0.16" />
                </svg>

                {/* offset drawn shape in the page accent */}
                <div
                  aria-hidden="true"
                  className="absolute right-[14%] top-[22%] size-16 rounded-lg bg-primary/10"
                />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Feature strip ────────────────────────────────── */}
        <section className="shrink-0 border-t border-border/70 py-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} index={i}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon icon={f.icon} size={16} />
                  </span>
                  <div>
                    <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                      {f.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-[1.45] text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-border py-3.5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-xs text-muted-foreground">
          <span>Drawva, an offline-first infinite whiteboard.</span>
          <p>MIT License · © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}