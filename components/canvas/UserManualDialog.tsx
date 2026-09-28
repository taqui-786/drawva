"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Video01Icon,
  BookOpen01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";

interface UserManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManualDialog({ open, onOpenChange }: UserManualDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const markManualAsCompleted = () => {
    try {
      localStorage.setItem("theDrawvaManual", "true");
    } catch {}
  };

  const handleClose = () => {
    markManualAsCompleted();
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onOpenChange(false);
  };

  // Pause video if dialog is closed
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) handleClose();
        else onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0 border border-border/80 bg-background shadow-2xl rounded-2xl">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/60 bg-muted/20 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <HugeiconsIcon icon={Video01Icon} className="size-4" />
              </div>
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Take a Short Rough Usecase Demo
              </DialogTitle>
            </div>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex text-[11px] font-mono px-2 py-0.5 border-primary/30 text-primary bg-primary/5"
            >
              Demo Walkthrough
            </Badge>
          </div>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-0 sm:pl-10.5">
            Watch Drawva&apos;s multimodal AI perceive strokes on the infinite canvas in real-time, transform sketches into live diagrams and formulas, and execute agent tools.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-6 flex flex-col items-center gap-4 bg-muted/5">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/95 border border-border/80 shadow-md">
            <video
              ref={videoRef}
              src="/demo/drawva-demo-two-vid.mp4"
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-card/60 text-xs">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold text-[11px]">
                1
              </span>
              <span className="text-muted-foreground leading-snug">
                Draw vectors, ink &amp; text on the infinite 2D canvas
              </span>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-card/60 text-xs">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold text-[11px]">
                2
              </span>
              <span className="text-muted-foreground leading-snug">
                Multimodal AI inspects ink &amp; spatial layout in real-time
              </span>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-card/60 text-xs">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold text-[11px]">
                3
              </span>
              <span className="text-muted-foreground leading-snug">
                Renders diagrams, MathJax formulas &amp; sandboxed widgets
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3.5 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            render={
              <a
                href="/manual"
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <HugeiconsIcon icon={BookOpen01Icon} className="size-3.5" />
            <span>Full User Manual</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleClose}
            className="gap-1.5 text-xs h-8 font-medium shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span>Start Drawing</span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
