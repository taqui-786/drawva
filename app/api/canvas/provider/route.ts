import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

/**
 * Verify a user-supplied OpenAI-compatible provider and list its models.
 * The API key is used only for the outgoing models request and is never
 * logged or persisted server-side.
 *
 * When the provider exposes per-model input/output capabilities (e.g.
 * OpenRouter's `architecture.input_modalities` / `output_modalities`), only
 * models accepting image + text input and emitting text output are returned
 * (Drawva's pipeline sends the canvas as an image and reads commands back as
 * text). Providers whose /models response does not declare capabilities (most
 * OpenAI-compatible hosts) fall back to returning every model.
 */
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

  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = JSON.parse(raw) as { baseUrl?: unknown; apiKey?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!baseUrl || !apiKey) {
    return json({ error: "Missing baseUrl or apiKey" }, 400);
  }

  const candidates = [baseUrl.replace(/\/+$/, ""), `${baseUrl.replace(/\/+$/, "")}/v1`];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    const endpoint = `${candidate}/models`;
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        lastError = new Error(`HTTP ${res.status} from ${candidate}: ${text}`);
        continue;
      }
      const data = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
      };
      const rows = Array.isArray(data.data)
        ? data.data.filter((m) => typeof m?.id === "string")
        : [];
      if (rows.length === 0) {
        return json({ error: `No models returned by ${candidate}` }, 422);
      }

      const compatibleRows = rows.filter(isCompatibleModel);
      const models = compatibleRows.map((m) => String(m.id));

      if (models.length === 0) {
        return json(
          { error: "Img + text supported input models required to run the AI generation here." },
          422
        );
      }

      return json({ models, filteredByVision: true });
    } catch (err) {
      lastError = err;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  console.error("[API /api/canvas/provider Error]: 🛑 Verification failed:", detail);
  return json({ error: `Could not reach provider: ${detail}` }, 400);
}

function hasModality(list: string[], value: string): boolean {
  return list.some((s) => s.trim().toLowerCase() === value);
}

/**
 * Drawva's pipeline sends a canvas image snapshot plus text, and needs text
 * back, so a model is usable only when it accepts image + text input AND
 * emits text output. Returns true/false when the row declares its full
 * capabilities, or null when it exposes none (i.e. plain /v1/models hosts).
 */
function isCompatibleModel(m: Record<string, unknown>): boolean {
  const cap = supportsCanvasChat(m);
  if (cap !== null) {
    return cap;
  }
  const id = typeof m.id === "string" ? m.id.toLowerCase() : "";
  return (
    id.includes("vision") ||
    id.includes("-vl") ||
    id.includes("vl-") ||
    id.includes("gpt-4o") ||
    id.includes("gpt-4-turbo") ||
    id.includes("claude-3") ||
    id.includes("gemini") ||
    id.includes("pixtral") ||
    id.includes("llava") ||
    id.includes("molmo") ||
    id.includes("paligemma") ||
    id.includes("fuyu") ||
    id.includes("cogvlm") ||
    id.includes("internvl") ||
    id.includes("deepseek-vl") ||
    id.includes("phi-3-vision") ||
    id.includes("phi-3.5-vision") ||
    id.includes("qwen-vl") ||
    id.includes("minicpm") ||
    id.includes("idefics") ||
    id.includes("reka")
  );
}

function supportsCanvasChat(m: Record<string, unknown>): boolean | null {
  // OpenRouter / gateway schema:
  //   architecture.input_modalities  = ["file","image","text"]
  //   architecture.output_modalities = ["text"]
  const arch =
    m.architecture && typeof m.architecture === "object"
      ? (m.architecture as Record<string, unknown>)
      : undefined;
  let inputs = Array.isArray(arch?.input_modalities)
    ? arch.input_modalities.map(String)
    : null;
  let outputs = Array.isArray(arch?.output_modalities)
    ? arch.output_modalities.map(String)
    : null;

  if (!inputs && Array.isArray(m.input_modalities)) {
    inputs = m.input_modalities.map(String);
  }
  if (!outputs && Array.isArray(m.output_modalities)) {
    outputs = m.output_modalities.map(String);
  }

  // Fallback: "image->text" style modality strings.
  if (typeof m.modality === "string") {
    const sides = m.modality.split("->");
    if (!inputs && sides[0]) {
      inputs = sides[0].split(",").map((s) => s.trim());
    }
    if (!outputs && sides[1]) {
      outputs = sides[1].split(",").map((s) => s.trim());
    }
  }

  if (inputs && outputs) {
    return (
      hasModality(inputs, "image") &&
      hasModality(inputs, "text") &&
      hasModality(outputs, "text")
    );
  }

  // Check if root-level modalities array contains both image and text
  if (Array.isArray(m.modalities)) {
    const mods = m.modalities.map((s) => String(s).toLowerCase());
    if (mods.includes("image") && mods.includes("text")) {
      return true;
    }
  }

  // Explicit boolean flags some gateways expose (image-input only).
  const flag = m.supports_image ?? m.supportsImage ?? m.vision;
  if (typeof flag === "boolean") return flag;
  return null;
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}