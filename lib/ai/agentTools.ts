import { tool } from "ai";
import { z } from "zod";

export const AGENT_MAX_STEPS_PER_TURN = 24;
export const AGENT_MAX_APPLIES_PER_TURN = 6;
export const AGENT_MAX_PATCHES_PER_TURN = 8;
export const AGENT_MAX_EDITS_PER_TURN = 12;
export const AGENT_MAX_TOOLS_PER_STEP = 1;
export const SNAPSHOT_BASIC_MAX_EDGE = 1024;
export const SNAPSHOT_DETAIL_MAX_EDGE = 2048;
export const READ_DEFAULT_LINES = 200;
export const READ_MAX_CHARS = 200_000;
export const MAX_PATCH_BYTES = 64 * 1024;
export const AGENT_HISTORY_TOKEN_TRIGGER = 24_000;
export const AGENT_MAX_TURN_IMAGES = 5;
export const AGENT_SCENE_JSON_MAX = 8_000;
export const AGENT_CONVERSATION_MAX_BYTES = 512 * 1024;
export const SCAN_MAX_ITEMS = 60;
/** Shared by conductor.ts and the compact route so the two never drift. */
export const COMPACT_KEEP = 12;

const regionSchema = z.object({
  x: z.coerce.number().describe("World X coordinate"),
  y: z.coerce.number().describe("World Y coordinate"),
  w: z.coerce.number().describe("Box width"),
  h: z.coerce.number().describe("Box height"),
});

const canvasScanSchema = z.object({
  scope: z.enum(["all", "viewport"]).optional().describe("Scan scope: 'viewport' for visible area or 'all' for entire canvas"),
});

const canvasSnapshotSchema = z.object({
  target: z.enum(["viewport", "canvas", "region", "object"]).describe("Capture target"),
  region: regionSchema.optional().describe("Region box when target='region'"),
  objectId: z.string().optional().describe("Object or widget ID when target='object'"),
  quality: z.enum(["basic", "detail"]).optional().describe("Snapshot resolution: 'basic' (≤1024px) or 'detail' (≤2048px)"),
  grid: z.boolean().optional().describe("Whether to overlay coordinate grid labels"),
});

const commandItemSchema = z.object({
  // Optional on purpose: models often omit it; validateCommands infers the tool
  // from payload keys (html→html_widget, latex→draw_formula, text→write_text).
  // An explicitly WRONG value still fails this enum and is rejected at admission.
  tool: z.enum([
    "write_text",
    "draw_formula",
    "plot_function",
    "animate_scene",
    "html_widget",
    "diagram_source",
    "draw",
    "erase",
  ]).optional().describe("Tool identifier (e.g. 'write_text', 'draw_formula', 'html_widget')"),
  x: z.coerce.number().optional().describe("World X coordinate on canvas (0..20000)"),
  y: z.coerce.number().optional().describe("World Y coordinate on canvas (0..20000)"),
  w: z.coerce.number().optional().describe("Box width in canvas units"),
  h: z.coerce.number().optional().describe("Box height in canvas units"),
  placement: z.enum([
    "below",
    "right",
    "left",
    "top",
    "in_place",
    "inside_target",
    "match_sketch",
    "overlay",
  ]).optional().describe("Relative placement hint relative to handwriting/anchor"),
  targetId: z.string().optional().describe("Target existing widget or object ID for refinement/replacement"),
  text: z.string().optional().describe("write_text: Text content to write on canvas"),
  latex: z.union([z.string(), z.number()]).optional().describe("draw_formula: LaTeX math expression (e.g. '5', 'x^2+y^2=r^2', '\\frac{a}{b}')"),
  expression: z.string().optional().describe("plot_function: Single-variable 2D math formula y=f(x)"),
  html: z.string().optional().describe("html_widget: Complete standalone HTML/SVG applet string"),
  source: z.string().optional().describe("diagram_source: Structured diagram source code"),
  sourceFormat: z.enum([
    "mermaid",
    "dot",
    "vega-lite",
    "smiles",
    "bpmn-xml",
    "cytoscape-json",
    "geojson",
  ]).optional().describe("diagram_source format"),
  title: z.string().optional().describe("Title for widget or diagram header"),
  fontSize: z.coerce.number().optional().describe("Font size in canvas units"),
  maxWidth: z.coerce.number().optional().describe("Maximum width for wrapped text column (default ~1200-2000)"),
  lineHeight: z.coerce.number().optional().describe("Line height multiplier (default ~1.35)"),
  pluginId: z.string().optional().describe("Plugin identifier"),
  points: z.array(z.tuple([z.coerce.number(), z.coerce.number()])).optional().describe("draw/erase: array of [x, y] coordinate pairs"),
  size: z.coerce.number().optional().describe("draw/erase: stroke width or eraser brush size"),
  mode: z.enum(["rect", "path"]).optional().describe("erase: 'rect' or 'path'"),
  durationMs: z.coerce.number().optional().describe("animate_scene: animation loop duration in ms"),
  loop: z.boolean().optional().describe("animate_scene: whether animation loops"),
  objects: z.array(z.any()).optional().describe("animate_scene: scene visual objects (circle/ellipse/rect/line/path/text/group)"),
  motions: z.array(z.any()).optional().describe("animate_scene: object motion tracks (orbit/spin/translate/pulse/fade/keyframes)"),
}).passthrough();

const canvasApplySchema = z.object({
  baseRevision: z.coerce.number().optional().describe("Base board revision for conflict safety — pass the revision from your latest canvas_scan/canvas_snapshot. Stale revisions are rejected."),
  commands: z.array(commandItemSchema).min(1).max(16).describe("Array of 1..16 canvas commands (write_text, draw_formula, diagram_source, html_widget, plot_function, animate_scene, draw, erase)"),
  note: z.string().optional().describe("Brief note explaining what this mutation achieves"),
});

const editOpSchema = z.object({
  op: z.enum(["move_object", "resize_object", "delete_object"]).describe("Edit operation"),
  objectId: z.string().describe("ID of the widget or object to edit"),
  dx: z.coerce.number().optional().describe("move_object: X offset in canvas units"),
  dy: z.coerce.number().optional().describe("move_object: Y offset in canvas units"),
  w: z.coerce.number().optional().describe("resize_object: new width in canvas units"),
  h: z.coerce.number().optional().describe("resize_object: new height in canvas units"),
});

const canvasEditSchema = z.object({
  baseRevision: z.coerce.number().optional().describe("Base board revision for conflict safety — pass the revision from your latest canvas_scan/canvas_snapshot"),
  operations: z.array(editOpSchema).min(1).max(16).describe("Array of 1..16 typed edit operations"),
  note: z.string().optional().describe("Brief note explaining what this edit achieves"),
});

const loadPluginSchema = z.object({
  pluginId: z.string().describe("ID of the enabled plugin to load full documentation for"),
});

const canvasReadSchema = z.object({
  objectId: z.string().describe("ID of the widget or canvas object to inspect"),
  resource: z.enum(["text", "html", "source"]).optional().describe("Resource format to read: 'text' (default), 'html', or 'source'"),
  startLine: z.coerce.number().optional().describe("1-indexed start line number"),
  endLine: z.coerce.number().optional().describe("1-indexed end line number"),
});

const canvasPatchWidgetSchema = z.object({
  objectId: z.string().describe("ID of the widget to patch"),
  baseRevision: z.coerce.number().optional().describe("Base board revision"),
  expectedContentHash: z.string().optional().describe("contentHash returned by the canvas_read this patch is based on — stale hashes are rejected"),
  patch: z.string().describe("Unified diff patch string with --- a/widget.html / +++ b/widget.html headers"),
});

const canvasUndoSchema = z.object({});

const canvasFocusSchema = z.object({
  target: z.enum(["canvas", "object", "region"]).describe("Camera focus target"),
  objectId: z.string().optional().describe("Object ID to focus on"),
  region: regionSchema.optional().describe("Region box to focus camera on"),
});

export interface AgentToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
}

export const AGENT_TOOL_DEFS: AgentToolDef[] = [
  {
    name: "canvas_scan",
    description:
      "List canvas items (id, kind, box, title). Cheap, no image. Use before mutating. scope=viewport limits to the visible rect.",
    schema: canvasScanSchema,
  },
  {
    name: "canvas_snapshot",
    description:
      "Capture a picture of the canvas. target=viewport|canvas|region|object. quality=basic (default, max edge 1024) or detail (max edge 2048, region/object only). grid=true (default) overlays global coordinate labels. Returns sourceRect + imageScale for the coordinate contract.",
    schema: canvasSnapshotSchema,
  },
  {
    name: "canvas_apply",
    description: `Apply 1..16 validated canvas commands in one undo step. commands use the same tools as one-shot AI: write_text, draw_formula, plot_function, animate_scene, html_widget, diagram_source, draw, erase. Pass baseRevision from the latest scan/snapshot. Partial rejects are returned as rejected[] — treat them as feedback.`,
    schema: canvasApplySchema,
  },
  {
    name: "canvas_edit",
    description:
      "Lightweight typed edits on existing items: move_object (dx,dy), resize_object (w,h), delete_object. Cheaper and safer than canvas_apply or canvas_patch_widget for simple changes — never re-create or replace an item just to move/resize/delete it.",
    schema: canvasEditSchema,
  },
  {
    name: "load_plugin",
    description:
      "Load the full capability card for one plugin id from the catalog. Call before using a plugin's APIs or HTML contract.",
    schema: loadPluginSchema,
  },
  {
    name: "canvas_read",
    description:
      'Read one object or widget as line-numbered text. Format is "NNN| " + line; the number and "| " are metadata, never part of patch/edit content. Default window is 200 lines; pass endLine for more. resource=text|html|source.',
    schema: canvasReadSchema,
  },
  {
    name: "canvas_patch_widget",
    description:
      "Surgical unified-diff edit of one widget. Headers must be exactly --- a/widget.html / +++ b/widget.html (HTML widgets) or widget.source (diagrams). Strip NNN| prefixes from canvas_read before writing the diff. Re-read the exact range before retrying a rejected patch. Never abbreviate long lines with ...",
    schema: canvasPatchWidgetSchema,
  },
  {
    name: "canvas_undo",
    description: "Undo the last canvas mutation (one history step). Does not take a changeId.",
    schema: canvasUndoSchema,
  },
  {
    name: "canvas_focus",
    description: "Move the user's camera to the whole canvas, an object, or a region. Does not change revision.",
    schema: canvasFocusSchema,
  },
];

export function getAiSdkTools() {
  return {
    canvas_scan: tool({
      description: "List canvas items (id, kind, box, title). Cheap, no image. Use before mutating. scope=viewport limits to the visible rect.",
      inputSchema: canvasScanSchema,
    }),
    canvas_snapshot: tool({
      description: "Capture a picture of the canvas. target=viewport|canvas|region|object. quality=basic (default, max edge 1024) or detail (max edge 2048, region/object only). grid=true (default) overlays global coordinate labels. Returns sourceRect + imageScale for the coordinate contract.",
      inputSchema: canvasSnapshotSchema,
    }),
    canvas_apply: tool({
      description: "Apply 1..16 validated canvas commands in one undo step. commands use write_text, draw_formula, plot_function, html_widget, diagram_source, draw, erase. Pass baseRevision from the latest scan/snapshot.",
      inputSchema: canvasApplySchema,
    }),
    canvas_edit: tool({
      description:
        "Lightweight typed edits on existing items: move_object (dx,dy), resize_object (w,h), delete_object. Cheaper and safer than canvas_apply or canvas_patch_widget for simple changes.",
      inputSchema: canvasEditSchema,
    }),
    load_plugin: tool({
      description: "Load the full capability card for one plugin id from the catalog. Call before using a plugin's APIs or HTML contract.",
      inputSchema: loadPluginSchema,
    }),
    canvas_read: tool({
      description: 'Read one object or widget as line-numbered text. Format is "NNN| " + line; default window is 200 lines.',
      inputSchema: canvasReadSchema,
    }),
    canvas_patch_widget: tool({
      description: "Surgical unified-diff edit of one widget. Headers must be exactly --- a/widget.html / +++ b/widget.html or widget.source.",
      inputSchema: canvasPatchWidgetSchema,
    }),
    canvas_undo: tool({
      description: "Undo the last canvas mutation (one history step).",
      inputSchema: canvasUndoSchema,
    }),
    canvas_focus: tool({
      description: "Move the user's camera to the whole canvas, an object, or a region.",
      inputSchema: canvasFocusSchema,
    }),
  };
}

export interface ParsedAgentToolCall {
  name: string;
  args: unknown;
  valid: boolean;
  error?: string;
}

export function parseAgentToolCall(name: string, rawArgs: unknown): ParsedAgentToolCall {
  const def = AGENT_TOOL_DEFS.find((d) => d.name === name);
  if (!def) {
    return { name, args: rawArgs, valid: false, error: `Unknown tool: ${name}` };
  }
  let args = rawArgs;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { name, args: {}, valid: false, error: "Tool arguments are not valid JSON." };
    }
  }
  const result = def.schema.safeParse(args ?? {});
  if (!result.success) {
    return { name, args: typeof args === "object" && args !== null ? args : {}, valid: false, error: result.error.message };
  }
  return { name, args: result.data, valid: true };
}

/**
 * Extract the first balanced JSON object/array from text that may be wrapped in
 * prose or fences. A greedy first-{-to-last-} regex mis-slices multiple objects;
 * this scans bracket pairs and returns the first candidate that parses.
 */
export function extractJsonDecision(text: string): Record<string, unknown> | null {
  if (!text || !/[{\[]/.test(text)) return null;
  const starts = ["{", "["];
  let attempts = 0;
  for (let i = 0; i < text.length && attempts < 256; i++) {
    const ch = text[i];
    if (!starts.includes(ch)) continue;
    attempts++;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(i, j + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
          } catch {}
          break;
        }
      }
    }
  }
  return null;
}
