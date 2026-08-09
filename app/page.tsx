import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  ArrowRight01Icon,
  Layers01Icon,
  FlashIcon,
  CodeCircleIcon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

function Icon({ icon, size = 18 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary selection:text-primary-foreground">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground font-black text-sm text-background shadow-md">
              D
            </span>
            <span className="font-heading font-black text-base uppercase tracking-wider text-foreground">
              Drawva
            </span>
          </div>

          <nav className="hidden items-center gap-8 md:flex text-sm font-medium text-muted-foreground">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#stack" className="transition-colors hover:text-foreground">
              Tech Stack
            </a>
            <a href="#docs" className="transition-colors hover:text-foreground">
              Documentation
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
            <Button variant="default" size="sm" className="gap-2">
              Get Started
              <Icon icon={ArrowRight01Icon} size={14} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-24 md:py-32">
          {/* Subtle Background Glow */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

          <div className="container mx-auto max-w-5xl px-6 text-center">
            {/* Pill Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
              <Icon icon={SparklesIcon} size={14} />
              <span>Next.js App Router + Tailwind v4 + shadcn/ui</span>
            </div>

            {/* Headline */}
            <h1 className="font-heading text-4xl font-black tracking-tight sm:text-6xl md:text-7xl text-foreground">
              A Fresh Next.js Stack Built for Speed & Precision
            </h1>

            {/* Subheading */}
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground">
              Cleanly initialized repository with Tailwind CSS v4, Base UI primitives, HugeIcons, and modern App Router defaults ready for your next application build.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a href="/canvas">
                <Button size="lg" className="gap-2">
                  Launch Canvas
                  <Icon icon={ArrowRight01Icon} size={16} />
                </Button>
              </a>
              <Button variant="outline" size="lg">
                View GitHub Repo
              </Button>
            </div>

            {/* Feature Grid */}
            <div id="features" className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 text-left">
              <div className="group rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-lg">
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Icon icon={FlashIcon} size={20} />
                </div>
                <h3 className="font-heading text-lg font-bold text-foreground">Fast App Router</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Next.js 16 with React 19 Server Components, optimized routing, and instant layout hydration.
                </p>
              </div>

              <div className="group rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-lg">
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Icon icon={Layers01Icon} size={20} />
                </div>
                <h3 className="font-heading text-lg font-bold text-foreground">Tailwind CSS v4</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  CSS-first configuration using <code>@theme inline</code> tokens, <code>@import &quot;shadcn/tailwind.css&quot;</code>, and smooth OKLCH colors.
                </p>
              </div>

              <div className="group rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-lg">
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Icon icon={CodeCircleIcon} size={20} />
                </div>
                <h3 className="font-heading text-lg font-bold text-foreground">Base UI Primitives</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  shadcn setup powered by `@base-ui/react` primitives and `@hugeicons/react` icons for accessible UI.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 bg-muted/30">
        <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Icon icon={SecurityCheckIcon} size={16} />
            <span>Drawva Clean Setup · Ready for development</span>
          </div>
          <p>© {new Date().getFullYear()} Drawva. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
