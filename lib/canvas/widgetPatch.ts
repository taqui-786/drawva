import { applyPatch, parsePatch, type StructuredPatch } from "diff";
import { MAX_PATCH_BYTES } from "@/lib/ai/agentTools";

const ALLOWED_PATHS = new Set(["widget.html", "widget.source"]);

export interface PatchOk {
  ok: true;
  content: string;
  path: "widget.html" | "widget.source";
  linesChanged: number;
  newLineCount: number;
}

export interface PatchErr {
  ok: false;
  code: string;
  message: string;
  diagnostics?: { line?: number; expected?: string; actual?: string; path?: string };
}

export type PatchResult = PatchOk | PatchErr;

function fail(code: string, message: string, diagnostics?: PatchErr["diagnostics"]): PatchErr {
  return { ok: false, code, message, diagnostics };
}

function fileName(raw: string | undefined): string {
  return String(raw || "")
    .replace(/^[ab]\//, "")
    .replace(/^\/+/, "")
    .trim();
}

function hunkChanged(lines: string[]): number {
  let changed = 0;
  for (const line of lines) {
    if (line.startsWith("-") || line.startsWith("+")) changed += 1;
  }
  return changed;
}

/**
 * jsdiff's parsePatch throws when hunk counts disagree with the body, and
 * models miscount `@@ -l,c +l,c @@` constantly — so recompute every hunk's
 * counts from its body lines BEFORE parsing. oldStart/newStart are kept as
 * authored; only the counts are normalized.
 */
function recountHunkHeaders(patch: string): string {
  const lines = patch.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = /^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/.exec(lines[i]);
    if (!header) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    let j = i + 1;
    let oldCount = 0;
    let newCount = 0;
    while (j < lines.length && !lines[j].startsWith("@@") && !/^(?:---|\+\+\+) /.test(lines[j])) {
      const body = lines[j];
      if (!body.startsWith("\\")) {
        if (body.startsWith("+")) newCount += 1;
        else if (body.startsWith("-")) oldCount += 1;
        else {
          oldCount += 1;
          newCount += 1;
        }
      }
      j += 1;
    }
    out.push(`@@ -${header[1]},${oldCount} +${header[3]},${newCount} @@`);
    for (let k = i + 1; k < j; k++) out.push(lines[k]);
    i = j;
  }
  return out.join("\n");
}

function firstMismatch(
  sourceLines: string[],
  hunk: StructuredPatch["hunks"][number]
): { line: number; expected: string; actual: string } | null {
  const start = Math.max(0, (hunk.oldStart || 1) - 1);
  let src = start;
  for (const line of hunk.lines) {
    if (line.startsWith("\\")) continue;
    const op = line[0];
    const body = line.slice(1);
    if (op === " " || op === "-") {
      const actual = sourceLines[src] ?? "";
      if (actual !== body) {
        return { line: src + 1, expected: body, actual };
      }
      src += 1;
    }
  }
  return null;
}

function applyExact(
  source: string,
  patch: StructuredPatch
): { content: string } | { mismatch: { line: number; expected: string; actual: string } } {
  const endedWithNl = source.endsWith("\n");
  const original = source.split("\n");
  if (endedWithNl && original.at(-1) === "") original.pop();
  for (const hunk of patch.hunks) {
    const mismatch = firstMismatch(original, hunk);
    if (mismatch) return { mismatch };
  }
  // Declared coordinates already match, so applyPatch will not relocate.
  const next = applyPatch(source, patch, { fuzzFactor: 0, autoConvertLineEndings: false });
  if (next === false) {
    return { mismatch: { line: 1, expected: "", actual: original[0] ?? "" } };
  }
  void endedWithNl;
  return { content: next };
}

export function applyWidgetPatch(currentContent: string, patch: string): PatchResult {
  if (typeof patch !== "string" || !patch.trim()) {
    return fail("EMPTY_PATCH", "Patch is empty. Include at least one hunk.");
  }
  if (new TextEncoder().encode(patch).byteLength > MAX_PATCH_BYTES) {
    return fail("LIMIT_EXCEEDED", `Patch exceeds ${MAX_PATCH_BYTES} bytes.`);
  }
  if (/^diff --git /m.test(patch) || /^index /m.test(patch) || /^new file mode /m.test(patch)) {
    return fail("INVALID_HEADER", "Git metadata lines (diff --git, index, new file mode) are not allowed.");
  }
  if (/^@@[ \t]*$/m.test(patch)) {
    // ponytail: no relocation inference for bare @@ headers; reject-with-diagnostic, add if models struggle
    return fail("INVALID_HUNK", "Bare @@ hunk headers are not allowed. Use @@ -oldStart,oldCount +newStart,newCount @@.");
  }

  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(recountHunkHeaders(patch));
  } catch {
    return fail("INVALID_HEADER", "Patch is not a valid unified diff.");
  }
  if (parsed.length !== 1) {
    return fail("POLICY_DENIED", "Patch must target exactly one file: widget.html or widget.source.", {
      path: parsed.map((p) => fileName(p.oldFileName || p.newFileName)).join(","),
    });
  }

  const file = parsed[0];
  const oldPath = fileName(file.oldFileName);
  const newPath = fileName(file.newFileName);
  if (oldPath !== newPath) {
    return fail("INVALID_HEADER", "Old and new file names must match.", { path: `${oldPath} -> ${newPath}` });
  }
  const path = newPath;
  if (!ALLOWED_PATHS.has(path) || path.includes("..") || path.startsWith("/")) {
    return fail("POLICY_DENIED", "Allowed paths: widget.html, widget.source.", { path });
  }
  if (!file.hunks?.length) return fail("EMPTY_PATCH", "Patch has no hunks.");

  let linesChanged = 0;
  for (const hunk of file.hunks) {
    linesChanged += hunkChanged(hunk.lines);
  }
  if (linesChanged === 0) return fail("EMPTY_PATCH", "Patch contains no changed lines.");

  const source = currentContent.replace(/\r\n/g, "\n");
  const applied = applyExact(source, file);
  if ("mismatch" in applied) {
    return fail("PATCH_MISMATCH", "Patch context does not match the current widget.", applied.mismatch);
  }
  const newLineCount = applied.content.split("\n").length;
  return {
    ok: true,
    content: applied.content,
    path: path as "widget.html" | "widget.source",
    linesChanged,
    newLineCount,
  };
}
