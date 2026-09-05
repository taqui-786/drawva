export const VISUAL_SKILL_IDS = ["math-2d", "physics-2d", "math-3d"] as const;
export type VisualSkillId = (typeof VISUAL_SKILL_IDS)[number];
export const VISUAL_SKILL_ID_SET = new Set<string>(VISUAL_SKILL_IDS);

export const VISUAL_SKILL_META = "drawva-visual-skill";
export const MANIM_WEB_BROWSER_URL = "https://cdn.jsdelivr.net/npm/manim-web@0.3.24/dist/manim-web.browser.js";
export const MANIM_WEB_LOCAL_PATH = "/vendor/manim-web-0.3.24/manim-web.browser.js";

export function isVisualSkillId(value: string): value is VisualSkillId {
  return VISUAL_SKILL_ID_SET.has(value);
}

export interface VisualSkillMarkup {
  markers: string[];
  skill: string | null;
  manimImports: string[];
  forbiddenManim: string[];
}

const META_RE = /<meta\b[^>]*\bname\s*=\s*["']drawva-visual-skill["'][^>]*>/gi;
const CONTENT_RE = /\bcontent\s*=\s*["']([^"']+)["']/i;
const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']*manim-web[^"']*)["'][^>]*>/gi;
const IMPORT_RE = /(?:import\s*\(\s*|from\s+)["']([^"']*manim-web[^"']*)["']/g;

export function parseVisualSkillMarkup(html: string): VisualSkillMarkup {
  const source = String(html || "");
  const markers: string[] = [];
  for (const tag of source.match(META_RE) || []) {
    const content = CONTENT_RE.exec(tag)?.[1]?.trim();
    if (content) markers.push(content);
  }
  const manimImports = [...source.matchAll(IMPORT_RE)].map((m) => m[1]);
  const forbiddenManim = [...source.matchAll(SCRIPT_SRC_RE)].map((m) => m[1]);
  return {
    markers,
    skill: markers.length === 1 ? markers[0] : null,
    manimImports: [...new Set(manimImports)],
    forbiddenManim: [...new Set(forbiddenManim)],
  };
}

export function validateVisualSkillMarkup(
  html: string,
  loadedSkills: Iterable<string>
): { ok: true; skill: string | null } | { ok: false; code: string; message: string } {
  const loaded = new Set(loadedSkills);
  const markup = parseVisualSkillMarkup(html);
  let skill: string | null = null;
  if (markup.markers.length) {
    if (markup.markers.length !== 1) {
      return {
        ok: false,
        code: "VISUAL_SKILL_MARKER_REQUIRED",
        message: "A scientific Visual Explainer must contain exactly one drawva-visual-skill meta marker.",
      };
    }
    skill = markup.skill;
    if (!skill || !isVisualSkillId(skill)) {
      return {
        ok: false,
        code: "VISUAL_SKILL_MARKER_REQUIRED",
        message: "A scientific Visual Explainer must declare exactly one supported skill: math-2d, physics-2d, or math-3d.",
      };
    }
    if (!loaded.has(skill)) {
      return {
        ok: false,
        code: "VISUAL_SKILL_NOT_LOADED",
        message: `Load the ${skill} visual skill with load_visual_skill before creating this Visual Explainer.`,
      };
    }
  }
  if (markup.manimImports.length && !skill) {
    return {
      ok: false,
      code: "VISUAL_SKILL_MANIM_MARKER_REQUIRED",
      message: "A manim-web import requires the matching drawva-visual-skill marker and a loaded visual skill.",
    };
  }
  if (markup.forbiddenManim.length) {
    return {
      ok: false,
      code: "VISUAL_SKILL_MANIM_IMPORT_FORBIDDEN",
      message: "Import manim-web as a literal specifier inside an inline script[type=\"module\"]; do not use <script src>.",
    };
  }
  if (markup.manimImports.some((url) => url !== MANIM_WEB_BROWSER_URL)) {
    return {
      ok: false,
      code: "VISUAL_SKILL_MANIM_IMPORT_FORBIDDEN",
      message: `manim-web may be imported only from ${MANIM_WEB_BROWSER_URL}.`,
    };
  }
  return { ok: true, skill };
}
