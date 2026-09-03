import { NextResponse } from "next/server";
import { inspectModelCapabilities, type ModelCapabilityResult } from "@/lib/ai/modelRegistry";
import { requireSession } from "@/lib/api-guard";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

interface ValidateRequestBody {
  modelId?: string;
  modelIds?: string[];
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Failed to read body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 400);
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  let body: ValidateRequestBody;
  try {
    body = JSON.parse(raw) as ValidateRequestBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const modelIdsToInspect: string[] = [];
  if (typeof body.modelId === "string" && body.modelId.trim()) {
    modelIdsToInspect.push(body.modelId.trim());
  }
  if (Array.isArray(body.modelIds)) {
    for (const m of body.modelIds) {
      if (typeof m === "string" && m.trim() && !modelIdsToInspect.includes(m.trim())) {
        modelIdsToInspect.push(m.trim());
      }
    }
  }

  if (modelIdsToInspect.length === 0) {
    return json({ error: "No modelId or modelIds provided." }, 400);
  }

  const capabilities: Record<string, ModelCapabilityResult> = {};

  await Promise.all(
    modelIdsToInspect.map(async (id) => {
      capabilities[id] = await inspectModelCapabilities(id);
    })
  );

  return json({
    capabilities,
  });
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
