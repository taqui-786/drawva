/**
 * Widget theme bridge.
 *
 * Widget HTML runs inside a sandboxed, opaque-origin iframe that never loads
 * `app/globals.css`, so the app's design tokens have to be forwarded explicitly.
 * `app/globals.css` stays the single source of truth: values are read back off
 * the live document, which means the `.dark` class variant is picked up for free.
 *
 * Only raw tokens are forwarded. The Tailwind `@theme inline` radius scale is
 * NOT readable from the DOM (unused entries such as `--radius-2xl` are tree
 * shaken out of the compiled stylesheet), so it is re-derived here to mirror the
 * `@theme inline` block in `app/globals.css`.
 */

/** Tokens forwarded into widget iframes. Keep in sync with `app/globals.css`. */
export const WIDGET_THEME_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "radius",
  "font-sans",
] as const;

export type WidgetTheme = Record<string, string>;

const MAX_TOKEN_VALUE_LENGTH = 120;

/**
 * Defense in depth: values originate from our own stylesheet, but they are
 * interpolated into a stylesheet inside another document, so anything that
 * could terminate a declaration or open a new rule / at-rule is rejected.
 */
function safeTokenValue(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > MAX_TOKEN_VALUE_LENGTH) return null;
  if (/[;{}<>\\]|\/\*|@|url\s*\(/i.test(text)) return null;
  return text;
}

/** Read the app's current theme tokens off the live document. */
export function readWidgetTheme(): WidgetTheme {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return {};
  const computed = getComputedStyle(document.documentElement);
  const theme: WidgetTheme = {};
  for (const token of WIDGET_THEME_TOKENS) {
    const safe = safeTokenValue(computed.getPropertyValue(`--${token}`) || "");
    if (safe) theme[token] = safe;
  }
  return theme;
}

/** Mirrors the `@theme inline` radius scale in `app/globals.css`. */
const THEME_DERIVED =
  `--radius-sm:calc(var(--radius) * 0.6);` +
  `--radius-md:calc(var(--radius) * 0.8);` +
  `--radius-lg:var(--radius);` +
  `--radius-xl:calc(var(--radius) * 1.4);` +
  `--radius-2xl:calc(var(--radius) * 1.8);` +
  `--radius-3xl:calc(var(--radius) * 2.2);` +
  `--radius-4xl:calc(var(--radius) * 2.6);`;

/**
 * Token declarations only.
 *
 * No default `font-family` is set on `body` on purpose: changing the inherited
 * font would shift measured content size for every already-persisted widget and
 * feed different numbers into the auto-fit geometry. Widgets opt in with
 * `font-family: var(--font-sans)`. `color` carries no metrics, so it is safe to
 * default at zero specificity, and it keeps dark mode legible.
 */
export function widgetThemeVarsCss(theme: WidgetTheme): string {
  const declarations = WIDGET_THEME_TOKENS.filter((token) => theme[token])
    .map((token) => `--${token}:${theme[token]}`)
    .join(";");
  if (!declarations) return "";
  const inheritedColor = theme.foreground ? `:where(body){color:var(--foreground)}` : "";
  return `:root{${declarations};${THEME_DERIVED}}${inheritedColor}`;
}

/**
 * `<style>` tag for documents assembled in one pass (the offscreen rasterizer).
 * The app webfont is deliberately not imported here: the rasterizer only waits
 * ~80ms before measuring, so a pending webfont stylesheet would risk measuring
 * a half-styled document.
 */
export function widgetThemeStyleTag(theme: WidgetTheme = readWidgetTheme()): string {
  const css = widgetThemeVarsCss(theme);
  return css ? `<style>${css}</style>` : "";
}

/**
 * Resolve a theme token to a concrete color string for the raster paths
 * (canvas 2D `fillStyle` / `strokeStyle`, MathJax SVG fills), which cannot
 * resolve `var()`.
 *
 * The value is normalised through a canvas context so whatever color syntax
 * `app/globals.css` compiles to — `oklch()`, `lab()`, or hex — comes back as
 * something every raster consumer understands. Returns `fallback` when the
 * token is missing or the browser rejects its syntax.
 */
export function resolveThemeColor(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = readWidgetTheme()[token];
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
