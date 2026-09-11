// In-memory view deduplication using IP + DravId with TTL
const viewCache = new Map<string, number>();
const TTL_MS = 60 * 60 * 1000; // 1 hour per IP + DravId view window

// Clean up expired entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of viewCache.entries()) {
      if (now - timestamp > TTL_MS) {
        viewCache.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

/**
 * Checks if this IP has viewed this Drav recently.
 * If not, records the view and returns true.
 * If already recorded within TTL, returns false.
 */
export function recordDravView(ip: string, dravId: string): boolean {
  const key = `${ip}:${dravId}`;
  const now = Date.now();
  const lastViewed = viewCache.get(key);

  if (lastViewed && now - lastViewed < TTL_MS) {
    return false;
  }

  viewCache.set(key, now);
  return true;
}
