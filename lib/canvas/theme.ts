export function resolveThemeColor(token: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  if (!raw) return fallback;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("color", raw)) {
    return fallback;
  }
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return raw;
    ctx.fillStyle = raw;
    const resolved = ctx.fillStyle;
    return typeof resolved === "string" && resolved ? resolved : fallback;
  } catch {
    return fallback;
  }
}
