import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PaintBrush01Icon,
  BrainIcon,
  SparklesIcon,
  FileDownloadIcon,
  LayerIcon,
  ArrowUpRight01Icon,
  GridIcon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Ambient Theme Background Glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl opacity-60"
        aria-hidden="true"
      />

      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-lg p-1"
          >
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 group-hover:scale-105 transition-transform duration-200">
              <HugeiconsIcon icon={PaintBrush01Icon} className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">
              Drawva
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Features
            </Link>
            <Button
              variant="default"
              size="sm"
              render={<Link href="/canvas" />}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-md shadow-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5"
            >
              <span>Open Canvas</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="w-4 h-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 flex flex-col items-center">
        {/* Hero Section */}
        <section className="text-center max-w-4xl flex flex-col items-center gap-6">
          <Badge
            variant="secondary"
            className="px-3.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border font-medium text-xs tracking-wide flex items-center gap-2 shadow-inner"
          >
            <HugeiconsIcon icon={SparklesIcon} className="w-3.5 h-3.5 text-primary animate-pulse" aria-hidden="true" />
            <span>AI-Powered Multimodal Whiteboard Engine</span>
          </Badge>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-balance text-foreground leading-tight">
            Infinite Whiteboard Built for <span className="text-primary">Visual AI</span> & Thinking
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl text-balance leading-relaxed">
            Drawva combines a high-performance vector canvas with multimodal AI reasoning. Sketch ideas, plot LaTeX math equations, generate Mermaid diagrams, and render live web widgets instantly.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              render={<Link href="/canvas" />}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base px-8 py-6 rounded-xl shadow-xl shadow-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <span>Start Drawing Now</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="w-5 h-5" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<Link href="#features" />}
              className="border-border bg-card/60 hover:bg-muted text-foreground font-medium text-base px-6 py-6 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-all"
            >
              Explore Features
            </Button>
          </div>

          {/* App Preview Mockup Container */}
          <div className="w-full mt-12 relative rounded-xl border border-border bg-card/50 backdrop-blur shadow-2xl p-2 sm:p-4 overflow-hidden group">
            <div className="h-9 bg-muted/80 rounded-t-lg flex items-center px-4 justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive/80" aria-hidden="true" />
                <div className="w-3 h-3 rounded-full bg-accent/80" aria-hidden="true" />
                <div className="w-3 h-3 rounded-full bg-primary/80" aria-hidden="true" />
              </div>
              <span className="text-xs font-mono text-muted-foreground">drawva.app/canvas</span>
              <div className="w-12" aria-hidden="true" />
            </div>

            <div className="relative aspect-video w-full rounded-b-lg bg-background flex flex-col items-center justify-center p-6 text-center border border-border/40 overflow-hidden">
              {/* Grid Background Pattern */}
              <div
                className="absolute inset-0 opacity-15 bg-[radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:16px_16px]"
                aria-hidden="true"
              />

              <div className="relative z-10 flex flex-col items-center gap-4 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                  <HugeiconsIcon icon={GridIcon} className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-foreground">
                  Interactive Canvas Workspace
                </h3>
                <p className="text-sm text-muted-foreground">
                  Tile-based vector rendering loop, real-time AI perception, multi-layered strokes, LaTeX formula recognition, and offline autosave.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  render={<Link href="/canvas" />}
                  className="mt-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                >
                  Launch Workspace
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section id="features" className="w-full mt-24 sm:mt-32 pt-8 border-t border-border flex flex-col items-center gap-12">
          <div className="text-center max-w-2xl">
            <h2 className="text-3xl font-bold text-foreground text-balance">
              Engineered for Speed, Precision & Creativity
            </h2>
            <p className="text-muted-foreground mt-3 text-balance">
              Everything you need to turn napkin sketches into structured visual artifacts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={LayerIcon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Multi-Layered Stacked Canvas
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Seamless performance with separated grid, object, stroke, and draft interaction layers. Ultra-smooth 60fps canvas engine.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={BrainIcon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Multimodal AI Perception
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Drawva AI inspects canvas snapshots, evaluates user intents, and generates valid structured vector elements on the fly.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={GridIcon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Mermaid Diagrams & LaTeX
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Automatic conversion of process flows and architecture sketches into responsive Mermaid diagrams and formatted math.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={SparklesIcon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Live Interactive Widgets
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Embed functional web components, calculators, interactive widgets, and HTML payloads directly into the 2D plane.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={FileDownloadIcon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Offline-First Autosave
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All whiteboard documents persist locally in browser IndexedDB. Export PNG images or full JSON document snapshots.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Accessibility & Clean UI
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fully keyboard accessible, screen reader ready, focus-visible states, dark mode themes, and shadcn component architecture.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border py-8 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Drawva</span>
            <span>— AI-Powered Infinite Whiteboard</span>
          </div>
          <p>© 2026 Drawva. Built with Next.js & shadcn UI theme.</p>
        </div>
      </footer>
    </div>
  );
}
