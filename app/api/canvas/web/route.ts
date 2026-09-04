import { NextResponse } from "next/server";
import { validateArgs } from "@deepseek-ai/dsh-tools";
import { AGENT_TOOL_DEFS, isWebToolName } from "@/lib/ai/agentTools";
import { runWebTool, tinyfishKey } from "@/lib/ai/webTools";
import { requireSession } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BODY_BYTES = 32 * 1024;

interface WebToolRequest {
  name?: string;
  args?: unknown;
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ code: "INVALID_ARGUMENT", message: "Failed to read body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ code: "INVALID_ARGUMENT", message: "Request too large" }, 400);
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  let body: WebToolRequest;
  try {
    body = JSON.parse(raw) as WebToolRequest;
  } catch {
    return json({ code: "INVALID_ARGUMENT", message: "Invalid JSON" }, 400);
  }

  const name = typeof body.name === "string" ? body.name : "";
  const def = isWebToolName(name) ? AGENT_TOOL_DEFS.find((d) => d.name === name) : undefined;
  if (!def) {
    return json({ code: "INVALID_ARGUMENT", message: `Unknown web tool: ${name || "(missing)"}.` }, 400);
  }

  const args = (body.args ?? {}) as Record<string, unknown>;
  const violations = validateArgs(def.parameters, args);
  if (violations.length > 0) {
    return json({ code: "INVALID_ARGUMENT", message: `Invalid arguments for ${name}: ${violations.join("; ")}` }, 400);
  }

  const result = await runWebTool(name, args, {
    tinyfishKey: tinyfishKey(),
    signal: req.signal,
  });
  // Argument problems the schema cannot express (an empty urls[], an unusable
  // URL) come back from the tool as INVALID_ARGUMENT; keep them 4xx so a bad
  // call is a bad request rather than a successful empty answer.
  const code = (result as { code?: unknown }).code;
  return json(result, code === "INVALID_ARGUMENT" ? 400 : 200);
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
