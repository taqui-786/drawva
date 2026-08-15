import { NextResponse } from "next/server";
import { PROVIDER_INFOS, type ProviderType, type CustomModel } from "@/lib/ai/provider";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

interface ProviderRequestBody {
  providerType?: ProviderType;
  baseUrl?: unknown;
  apiKey?: unknown;
  customModels?: CustomModel[];
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

  let body: ProviderRequestBody;
  try {
    body = JSON.parse(raw) as ProviderRequestBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const providerType: ProviderType = body.providerType || "custom";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const baseUrlInput = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const customModels = Array.isArray(body.customModels) ? body.customModels : [];

  if (!apiKey) {
    return json({ error: "Missing API key" }, 400);
  }

  if (providerType === "custom" && !baseUrlInput && customModels.length === 0) {
    return json({ error: "Custom provider requires a Base URL or custom models list." }, 400);
  }

  const info = PROVIDER_INFOS[providerType] || PROVIDER_INFOS.custom;
  const baseUrl = baseUrlInput || info.defaultBaseUrl || "";

  let fetchedModels: string[] = [];
  let fetchError: string | null = null;

  if (baseUrl) {
    const cleanUrl = baseUrl.replace(/\/+$/, "");
    const candidates = cleanUrl.endsWith("/v1")
      ? [`${cleanUrl}/models`, `${cleanUrl.slice(0, -3)}/models`]
      : [`${cleanUrl}/models`, `${cleanUrl}/v1/models`];

    for (const endpoint of candidates) {
      try {
        const headers: Record<string, string> = {
          accept: "application/json",
        };
        if (providerType === "anthropic") {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["authorization"] = `Bearer ${apiKey}`;
        }

        const res = await fetch(endpoint, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            data?: Array<Record<string, unknown>>;
            models?: Array<Record<string, unknown>>;
          };
          const rawRows = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
          const rows = rawRows.filter((m) => typeof m?.id === "string" || typeof m?.name === "string");
          if (rows.length > 0) {
            const compatible = rows.filter((m) => providerType === "custom" || isCompatibleModel(m));
            fetchedModels = compatible.map((m) => String(m.id || m.name));
            if (fetchedModels.length > 0) break;
          }
        } else {
          const text = (await res.text()).slice(0, 300);
          fetchError = `HTTP ${res.status}: ${text}`;
        }
      } catch (err) {
        fetchError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const combinedCandidates: string[] = [];

  if (customModels.length > 0) {
    for (const m of customModels) {
      if (m.id && (providerType === "custom" || isCompatibleModel(m.id))) {
        if (!combinedCandidates.includes(m.id)) {
          combinedCandidates.push(m.id);
        }
      }
    }
  }

  for (const m of fetchedModels) {
    if (!combinedCandidates.includes(m) && (providerType === "custom" || isCompatibleModel(m))) {
      combinedCandidates.push(m);
    }
  }

  if (combinedCandidates.length === 0 && info.defaultModels.length > 0) {
    for (const m of info.defaultModels) {
      if (providerType === "custom" || isCompatibleModel(m)) {
        if (!combinedCandidates.includes(m)) {
          combinedCandidates.push(m);
        }
      }
    }
  }

  if (combinedCandidates.length === 0) {
    return json(
      {
        error:
          fetchError ||
          "No vision-supported models found for this provider configuration.",
      },
      422
    );
  }

  return json({ models: combinedCandidates, filteredByVision: true, providerType });
}

function hasModality(list: string[], value: string): boolean {
  return list.some((s) => s.trim().toLowerCase() === value);
}

function isCompatibleModel(m: Record<string, unknown> | string): boolean {
  const modelObj = typeof m === "string" ? { id: m } : m;
  const cap = supportsCanvasChat(modelObj);
  if (cap !== null) {
    return cap;
  }
  const id = typeof modelObj.id === "string" ? modelObj.id.toLowerCase() : String(m).toLowerCase();
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
    id.includes("neva") ||
    id.includes("llama-3.2-11b-vision") ||
    id.includes("llama-3.2-90b-vision") ||
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

  if (Array.isArray(m.modalities)) {
    const mods = m.modalities.map((s) => String(s).toLowerCase());
    if (mods.includes("image") && mods.includes("text")) {
      return true;
    }
  }

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