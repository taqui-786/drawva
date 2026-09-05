export const VISUAL_SKILL_IDS = ["math-2d", "physics-2d", "math-3d"] as const;
export type VisualSkillId = (typeof VISUAL_SKILL_IDS)[number];
export const VISUAL_SKILL_ID_SET = new Set<string>(VISUAL_SKILL_IDS);

export const VISUAL_SKILL_META = "drawva-visual-skill";
export const MANIM_WEB_BROWSER_URL = "https://cdn.jsdelivr.net/npm/manim-web@0.3.24/dist/manim-web.browser.js";
export const MANIM_WEB_LOCAL_PATH = "/vendor/manim-web-0.3.24/manim-web.browser.js";
export const MANIM_MATHJAX_LOCAL_PATH = "/vendor/manim-web-0.3.24/MathJaxBundle-xSidSV0E.js";

export function isVisualSkillId(value: string): value is VisualSkillId {
  return VISUAL_SKILL_ID_SET.has(value);
}

export interface VisualSkillMarkup {
  markers: string[];
  skill: string | null;
  manimImports: string[];
  forbiddenManim: string[];
}

function htmlAttribute(tag: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  if (quoted) return quoted[2];
  const unquoted = new RegExp(`\\b${name}\\s*=\\s*([^\\s"'=<>\`]+)`, "i").exec(tag);
  return unquoted ? unquoted[1] : null;
}

function javascriptImportUrls(source: string): string[] {
  const text = String(source || "");
  const imports: string[] = [];
  const tokens: { kind: string; text: string }[] = [];
  const identifierStart = /[A-Za-z_$]/;
  const identifierPart = /[A-Za-z0-9_$]/;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 2;
      while (index < text.length && !/[\r\n]/.test(text[index])) index++;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index++;
      index = Math.min(text.length, index + 2);
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      const valueStart = ++index;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index++] === quote) break;
      }
      const value = text.slice(valueStart, Math.max(valueStart, index - 1));
      const previous = tokens[tokens.length - 1];
      const beforePrevious = tokens[tokens.length - 2];
      let importSpecifier = previous?.kind === "identifier" && previous.text === "import";
      if (previous?.kind === "punctuation" && previous.text === "(" && beforePrevious?.kind === "identifier" && beforePrevious.text === "import") {
        importSpecifier = true;
      }
      if (previous?.kind === "identifier" && previous.text === "from") {
        let cursor = tokens.length - 2;
        let foundImport = false;
        while (cursor >= 0) {
          const token = tokens[cursor--];
          if (token.kind === "identifier" && token.text === "import") {
            foundImport = true;
            break;
          }
          if (!(token.kind === "identifier" || ["{", "}", "*", ","].includes(token.text))) break;
        }
        importSpecifier = importSpecifier || foundImport;
      }
      if (importSpecifier) imports.push(value);
      tokens.push({ kind: "string", text: value });
      continue;
    }
    if (identifierStart.test(char)) {
      const start = index++;
      while (index < text.length && identifierPart.test(text[index])) index++;
      tokens.push({ kind: "identifier", text: text.slice(start, index) });
      continue;
    }
    tokens.push({ kind: "punctuation", text: char });
    index++;
  }
  return imports;
}

export function parseVisualSkillMarkup(html: string): VisualSkillMarkup {
  const stripped = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi, "");
  const markers = [...stripped.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => htmlAttribute(tag, "name") === VISUAL_SKILL_META)
    .map((tag) => String(htmlAttribute(tag, "content") || "").trim())
    .filter(Boolean);

  const manimImports: string[] = [];
  const forbiddenManim: string[] = [];
  const sourceHtml = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  for (const match of sourceHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const tag = match[0].slice(0, match[0].indexOf(">") + 1);
    const source = String(match[1] || "");
    const src = String(htmlAttribute(tag, "src") || "");
    if (src) {
      if (/manim-web/i.test(src)) forbiddenManim.push(src);
      continue;
    }
    const type = String(htmlAttribute(tag, "type") || "")
      .trim()
      .toLowerCase()
      .split(";", 1)[0];
    const importUrls = javascriptImportUrls(source).filter((url) => /manim-web/i.test(url));
    const rawUrls = [...source.matchAll(/https?:\/\/[^\s"'`<>]+/g)].map((raw) => raw[0]).filter((url) => /manim-web/i.test(url));
    const unmatched = [...rawUrls];
    for (const url of importUrls) {
      const index = unmatched.indexOf(url);
      if (index >= 0) unmatched.splice(index, 1);
    }
    if (type !== "module") {
      forbiddenManim.push(...rawUrls);
      continue;
    }
    manimImports.push(...importUrls);
    forbiddenManim.push(...unmatched);
  }

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
      message: 'Import manim-web as one exact literal specifier inside an inline script[type="module"]; external, classic, computed, and non-import URL uses cannot use the local mirror.',
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
