
export async function attemptLandscapeLock(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const orientation = window.screen?.orientation as unknown as {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === "function") {
      await orientation.lock("landscape");
      return true;
    }
  } catch {
  }
  return false;
}

export async function requestFullscreenLandscape(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const docEl = document.documentElement;
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if ((docEl as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (docEl as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }
    }
    await attemptLandscapeLock();
    return true;
  } catch (err) {
    console.warn("[Orientation] Fullscreen landscape request failed:", err);
    return false;
  }
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches
  );
}

export function isPortraitMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.startsWith("portrait");
  }
  return window.innerHeight > window.innerWidth;
}
