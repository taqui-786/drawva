import { z } from "zod";

export const AGENT_MAX_STEPS_PER_TURN = 24;
export const AGENT_MAX_APPLIES_PER_TURN = 6;
export const AGENT_MAX_PATCHES_PER_TURN = 8;
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

const regionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const canvasScanSchema = z.object({
  scope: z.enum(["all", "viewport"]).optional(),
});

const canvasSnapshotSchema = z.object({
  target: z.enum(["viewport", "canvas", "region", "object"]),
  region: regionSchema.optional(),
  objectId: z.string().optional(),
  quality: z.enum(["basic", "detail"]).optional(),
  grid: z.boolean().optional(),
});

const canvasApplySchema = z.object({
  baseRevision: z.number().optional(),
  commands: z.array(z.record(z.string(), z.unknown())).min(1).max(16),
  note: z.string().optional(),
});

const loadPluginSchema = z.object({
  pluginId: z.string(),
});

const canvasReadSchema = z.object({
  objectId: z.string(),
  resource: z.enum(["text", "html", "source"]).optional(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
});

const canvasPatchWidgetSchema = z.object({
  objectId: z.string(),
  baseRevision: z.number().optional(),
  patch: z.string(),
});

const canvasUndoSchema = z.object({});

const canvasFocusSchema = z.object({
  target: z.enum(["canvas", "object", "region"]),
  objectId: z.string().optional(),
  region: regionSchema.optional(),
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
    name: "load_plugin",
    description:
      "Load the full capability card for one enabled plugin id from the catalog. Call before using a plugin's APIs or HTML contract.",
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

