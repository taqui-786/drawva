"use client";

import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ScreenRotationIcon, Cancel01Icon, FullScreenIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { isMobileDevice, isPortraitMode, requestFullscreenLandscape, attemptLandscapeLock } from "@/lib/canvas/orientation";

export function MobileOrientationPrompt() {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = isMobileDevice();
      const portrait = isPortraitMode();
      setIsMobilePortrait(mobile && portrait);
    };

    check();

    attemptLandscapeLock().catch(() => {});

    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    const screenOrientation = window.screen?.orientation;
    if (screenOrientation) {
      screenOrientation.addEventListener("change", check);
    }

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      if (screenOrientation) {
        screenOrientation.removeEventListener("change", check);
      }
    };
  }, []);

  if (!isMobilePortrait || dismissed) {
    return null;
  }

  const handleRotate = async () => {
    await requestFullscreenLandscape();
  };

  return (
    <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs transition-all max-w-[90vw]">
      <HugeiconsIcon icon={ScreenRotationIcon} className="size-4 text-primary shrink-0 animate-bounce" />
      <span className="text-muted-foreground whitespace-nowrap text-[11px] font-medium">
        Rotate for landscape canvas
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleRotate}
        className="h-6 gap-1 px-2 text-[11px] font-medium rounded-full shrink-0"
      >
        <HugeiconsIcon icon={FullScreenIcon} className="size-3" />
        Landscape
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="size-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
        aria-label="Dismiss rotation prompt"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
      </button>
    </div>
  );
}
