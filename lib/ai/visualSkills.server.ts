import fs from "node:fs";
import path from "node:path";
import { isVisualSkillId, VISUAL_SKILL_IDS, type VisualSkillId } from "./visualSkills";

const MAX_SKILL_BYTES = 16_000;

export function visualSkillsDirectory(): string {
  return path.join(process.cwd(), "lib", "ai", "visual-skills");
}

export function loadVisualSkillDocument(skill: string): string | null {
  if (!isVisualSkillId(skill)) return null;
  const file = path.join(visualSkillsDirectory(), `${skill}.md`);
  try {
    const document = fs.readFileSync(file, "utf8").trim();
    if (!document || Buffer.byteLength(document, "utf8") > MAX_SKILL_BYTES) return null;
    return document;
  } catch {
    return null;
  }
}

export function loadAllVisualSkillDocuments(): Record<VisualSkillId, string> {
  const out = {} as Record<VisualSkillId, string>;
  for (const id of VISUAL_SKILL_IDS) {
    const document = loadVisualSkillDocument(id);
    if (document) out[id] = document;
  }
  return out;
}
