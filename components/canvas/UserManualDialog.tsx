"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  SparklesIcon,
  Settings01Icon,
  GithubIcon,
  Link01Icon,
  BookOpen01Icon,
  CheckmarkBadge01Icon,
  EyeIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";

interface UserManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManualDialog({ open, onOpenChange }: UserManualDialogProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 4;

  const markManualAsCompleted = () => {
    try {
      localStorage.setItem("theDrawvaManual", "true");
    } catch {}
  };

  const handleClose = () => {
    markManualAsCompleted();
    onOpenChange(false);
  };

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) handleClose();
        else onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-2xl overflow-hidden p-0 gap-0 border border-border/80 bg-background shadow-2xl rounded-2xl sm:max-w-2xl">
        {/* Header bar with progress dots */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 bg-muted/30 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <HugeiconsIcon icon={BookOpen01Icon} className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-none flex items-center gap-2">
                Drawva User Manual
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                  Slide {currentSlide + 1} of {totalSlides}
                </Badge>
              </DialogTitle>
            </div>
          </div>

          {/* Slide Indicator Dots */}
          <div className="flex items-center gap-1.5 pr-6">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentSlide
                    ? "w-6 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Slide Content Area */}
        <div className="p-6 min-h-[380px] flex flex-col justify-center">
          {/* ── Slide 1: Welcome & App Intro ───────────────────────────── */}
          {currentSlide === 0 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative group p-4 rounded-2xl bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/20 shadow-inner">
                  <Image
                    src="/favicon.svg"
                    alt="Drawva Logo"
                    width={96}
                    height={96}
                    className="size-24 drop-shadow-md transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                <div className="space-y-1 max-w-lg">
                  <h3 className="text-2xl font-bold tracking-tight">
                    Welcome to <span className="brand-wordmark">Drawva</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Drawva is an <strong>infinite canvas whiteboard engine</strong> powered by a multimodal AI perception agent.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                <Card className="border-border/60 bg-card/60 shadow-xs">
                  <CardContent className="p-3 text-center space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center justify-center gap-1">
                      🎨 Infinite Canvas
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Draw vector ink, text, shapes, and formulas freely on a 2D space.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/60 shadow-xs">
                  <CardContent className="p-3 text-center space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center justify-center gap-1">
                      🧠 AI Perception
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Multimodal agent perceives your drawings and spatial layout in real-time.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/60 shadow-xs">
                  <CardContent className="p-3 text-center space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center justify-center gap-1">
                      📊 7+ Diagram Formats
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Generates Mermaid, Graphviz, Vega-Lite, GeoJSON, LaTeX, & applets.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Slide 2: AI Generation Modes ───────────────────────────── */}
          {currentSlide === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
                  AI Generation & Perception Modes
                </h3>
                <p className="text-xs text-muted-foreground">
                  Drawva supports two seamless ways to invoke AI perception on your canvas drawings:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Auto Generation Card */}
                <Card className="border-primary/30 bg-primary/5 shadow-xs overflow-hidden">
                  <CardContent className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">1. Auto-Delay Generation</span>
                      <Badge variant="default" className="text-[10px] bg-primary text-primary-foreground font-mono">
                        Auto ON
                      </Badge>
                    </div>

                    <div className="flex items-center justify-center py-1 bg-background/80 rounded-lg border border-border/60">
                      <Image
                        src="/manual/auto-toggle.png"
                        alt="Auto Toggle Screenshot"
                        width={142}
                        height={61}
                        className="h-9 object-contain rounded"
                      />
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      When <strong>Auto</strong> is toggled ON, Drawva automatically perceives your canvas 1.5s after you finish drawing. Ideal for continuous live sketching!
                    </p>
                  </CardContent>
                </Card>

                {/* Manual Generation Card */}
                <Card className="border-border/80 bg-card/60 shadow-xs overflow-hidden">
                  <CardContent className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">2. Manual On-Demand</span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        Ask AI Button
                      </Badge>
                    </div>

                    <div className="flex items-center justify-center py-1 bg-background/80 rounded-lg border border-border/60">
                      <Image
                        src="/manual/ask-ai-button.png"
                        alt="Ask AI Button Screenshot"
                        width={225}
                        height={92}
                        className="h-9 object-contain rounded"
                      />
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      When <strong>Auto</strong> is OFF, you can sketch freely without interruptions. Whenever you want AI analysis, simply click the <strong>Ask AI</strong> button!
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Slide 3: AI Model & Provider Setup ─────────────────────── */}
          {currentSlide === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <HugeiconsIcon icon={Settings01Icon} className="size-5 text-primary" />
                  AI Provider & Vision Model Setup
                </h3>
                <p className="text-xs text-muted-foreground">
                  Configure your custom OpenAI-compatible API Provider to start generating diagrams.
                </p>
              </div>

              {/* Crucial Vision Notice */}
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <HugeiconsIcon icon={EyeIcon} className="size-4 shrink-0 text-amber-500" />
                  <span>Important: Vision / Multimodal Model Required!</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-95">
                  Drawva passes a visual snapshot of your canvas to the AI. You <strong>MUST select a model that supports Image + Text inputs</strong> (e.g. <code>gpt-4o</code>, <code>gpt-4o-mini</code>, <code>claude-3-5-sonnet</code>, <code>gemini-1.5-pro</code>, <code>qwen2.5-vl</code>).
                </p>
              </div>

              {/* Instructions & Gear Icon screenshot */}
              <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-xl border border-border/70 bg-card/60">
                <div className="flex items-center justify-center p-2 bg-background rounded-lg border border-border shrink-0">
                  <Image
                    src="/manual/ai-settings.png"
                    alt="AI Settings Gear Button"
                    width={158}
                    height={162}
                    className="size-16 object-contain rounded"
                  />
                </div>

                <div className="space-y-1.5 text-xs">
                  <p className="font-semibold text-foreground">How to configure your API Key:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px]">
                    <li>Click the <strong>AI Settings (⚙️)</strong> gear icon in the top header bar.</li>
                    <li>Enter your OpenAI-compatible Provider <strong>Base URL</strong> and <strong>API Key</strong>.</li>
                    <li>Click <strong>Verify & Save</strong> to automatically list and select your vision model.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* ── Slide 4: About Creator & Credits ───────────────────────── */}
          {currentSlide === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <HugeiconsIcon icon={UserIcon} className="size-5 text-primary" />
                  About the Project & Creator
                </h3>
                <p className="text-xs text-muted-foreground">
                  Thank you for trying out Drawva! Here is a little context about how it was built:
                </p>
              </div>

              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Md Taqui Imam</h4>
                      <p className="text-xs text-primary font-medium">Fullstack GenAI Developer</p>
                    </div>
                    <Badge variant="outline" className="border-primary/30 text-primary font-mono text-[10px]">
                      Open Source Side Project
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    &quot;I built Drawva as a fun side project to create a seamless infinite canvas powered by multimodal AI. It is completely open-source for the developer community!&quot;
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs h-8 border-border/80"
                      render={
                        <a
                          href="https://github.com/taqui-786/drawva"
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
                      <span>GitHub Repo</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs h-8 border-border/80"
                      render={
                        <a
                          href="https://taqui.in"
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
                      <span>Portfolio (taqui.in)</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs h-8 border-border/80 text-muted-foreground"
                      render={
                        <a
                          href="https://github.com/Penecho/penecho"
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <HugeiconsIcon icon={SparklesIcon} className="size-3.5 text-amber-500" />
                      <span>Inspired by Penecho</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer controls: Skip / Prev / Next */}
        <div className="px-6 py-3.5 border-t border-border/60 bg-muted/30 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip Manual
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentSlide === 0}
              className="gap-1 text-xs h-8"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
              <span>Previous</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleNext}
              className="gap-1.5 text-xs h-8 font-medium shadow-sm"
            >
              <span>{currentSlide === totalSlides - 1 ? "Get Started!" : "Next"}</span>
              {currentSlide === totalSlides - 1 ? (
                <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
