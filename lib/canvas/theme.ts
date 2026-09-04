
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

function safeTokenValue(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > MAX_TOKEN_VALUE_LENGTH) return null;
  if (/[;{}<>\\]|\/\*|@|url\s*\(/i.test(text)) return null;
  return text;
}

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

const THEME_DERIVED =
  `--radius-sm:calc(var(--radius) * 0.6);` +
  `--radius-md:calc(var(--radius) * 0.8);` +
  `--radius-lg:var(--radius);` +
  `--radius-xl:calc(var(--radius) * 1.4);` +
  `--radius-2xl:calc(var(--radius) * 1.8);` +
  `--radius-3xl:calc(var(--radius) * 2.2);` +
  `--radius-4xl:calc(var(--radius) * 2.6);`;

export function widgetThemeVarsCss(theme: WidgetTheme): string {
  const declarations = WIDGET_THEME_TOKENS.filter((token) => theme[token])
    .map((token) => `--${token}:${theme[token]}`)
    .join(";");
  if (!declarations) return "";
  const inheritedColor = theme.foreground ? `:where(body){color:var(--foreground)}` : "";
  return `:root{${declarations};${THEME_DERIVED}}${inheritedColor}`;
}

export function widgetThemeStyleTag(theme: WidgetTheme = readWidgetTheme()): string {
  const css = widgetThemeVarsCss(theme);
  return css ? `<style>${css}</style>` : "";
}

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
