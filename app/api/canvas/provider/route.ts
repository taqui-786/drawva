import { NextResponse } from "next/server";
import {
  PROVIDER_INFOS,
  type ProviderType,
  type CustomModel,
} from "@/lib/ai/provider";
import type { ModelCapabilities } from "@/lib/ai/capabilities";
import { inspectModelCapabilities } from "@/lib/ai/modelRegistry";
import { isCodexAvailable, getCodexModels } from "@/lib/ai/codex";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

interface ProviderRequestBody {
  providerType?: ProviderType;
  baseUrl?: unknown;
  apiKey?: unknown;
  customModels?: unknown;
}

export async function GET() {
  const codexStatus = isCodexAvailable();
  const models = codexStatus.available ? getCodexModels() : [];
  return json({
    codex: {
      ...codexStatus,
      models,
    },
  });
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

  const providerType = body.providerType;
  if (!providerType || !(providerType in PROVIDER_INFOS)) {
    return json({ error: "Invalid or missing providerType." }, 400);
  }

  const info = PROVIDER_INFOS[providerType];

  if (providerType === "codex") {
    const status = isCodexAvailable();
    if (!status.available) {
      return json(
        { error: status.reason || "Codex CLI not available. Run `codex login` in terminal." },
        422,
      );
    }
    const codexModels = getCodexModels();
    const capabilities: Record<string, ModelCapabilities> = {};
    for (const m of codexModels) {
      capabilities[m] = await inspectModelCapabilities(m);
    }
    return json({
      models: codexModels,
      capabilities,
      filteredByVision: true,
      providerType: "codex",
    });
  }
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim().replace(/\/+$/, "")
      : info.defaultBaseUrl;

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  const customModels: CustomModel[] = Array.isArray(body.customModels)
    ? (body.customModels as unknown[])
        .filter(
          (m): m is CustomModel =>
            typeof m === "object" &&
            m !== null &&
            typeof (m as CustomModel).id === "string" &&
            Boolean((m as CustomModel).id.trim()),
        )
        .map((m) => ({
          id: m.id.trim(),
          name: typeof m.name === "string" ? m.name.trim() : m.id.trim(),
        }))
    : [];

  let fetchedModels: string[] = [];
  let fetchError: string | null = null;
  const rawModelMap: Record<string, Record<string, unknown>> = {};

  if (baseUrl) {
    const candidates = baseUrl.endsWith("/v1")
      ? [`${baseUrl}/models`]
      : [`${baseUrl}/v1/models`, `${baseUrl}/models`];
    const seen = new Set<string>();

    for (const url of candidates) {
      if (seen.has(url)) continue;
      seen.add(url);

      try {
        const headers: Record<string, string> = {
          accept: "application/json",
          "User-Agent": "claude-cli/0.2.29 (external, cli)",
          "X-Stainless-Lang": "js",
          "X-Stainless-Package-Version": "0.2.29",
          "X-Stainless-OS": "MacOS",
          "X-Stainless-Arch": "arm64",
          "X-Stainless-Runtime": "node",
          "X-Stainless-Runtime-Version": "v20.10.0",
        };
        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }
        if (baseUrl.includes("openrouter.ai")) {
          headers["HTTP-Referer"] = "https://drawva.app";
          headers["X-Title"] = "Drawva";
        }

        const res = await fetch(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          const data = (await res.json()) as {
            data?: Array<Record<string, unknown>>;
            models?: Array<Record<string, unknown>>;
          };
          const rawRows = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.models)
              ? data.models
              : [];
          const rows = rawRows.filter(
            (m) => typeof m?.id === "string" || typeof m?.name === "string",
          );
          if (rows.length > 0) {
            for (const r of rows) {
              const rowId = String(r.id || r.name);
              rawModelMap[rowId] = r;
            }
            const compatibleFlags = await Promise.all(
              rows.map((m) => providerType === "custom" || isCompatibleModel(m)),
            );
            const compatible = rows.filter((_, i) => compatibleFlags[i]);
            fetchedModels = compatible.map((m) => String(m.id || m.name));
            if (fetchedModels.length > 0) break;
          }
        } else if (res.ok) {
          fetchError = `Endpoint returned non-JSON response (${contentType || "text/html"}). Check Base URL path (e.g. add /v1).`;
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
      if (m.id) {
        const ok = providerType === "custom" || (await isCompatibleModel(m.id));
        if (ok && !combinedCandidates.includes(m.id)) {
          combinedCandidates.push(m.id);
        }
      }
    }
  }

  for (const m of fetchedModels) {
    if (!combinedCandidates.includes(m)) {
      combinedCandidates.push(m);
    }
  }

  if (combinedCandidates.length === 0 && info.defaultModels.length > 0) {
    for (const m of info.defaultModels) {
      const ok = providerType === "custom" || (await isCompatibleModel(m));
      if (ok && !combinedCandidates.includes(m)) {
        combinedCandidates.push(m);
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
      422,
    );
  }

  const capabilities: Record<string, ModelCapabilities> = {};
  await Promise.all(
    combinedCandidates.map(async (m) => {
      const rawMeta = rawModelMap[m];
      capabilities[m] = await inspectModelCapabilities(m, rawMeta);
    }),
  );

  return json({
    models: combinedCandidates,
    capabilities,
    filteredByVision: true,
    providerType,
  });
}

async function isCompatibleModel(m: Record<string, unknown> | string): Promise<boolean> {
  const modelObj = typeof m === "string" ? { id: m } : m;
  const id = typeof modelObj.id === "string" ? modelObj.id : String(m);
  const caps = await inspectModelCapabilities(id, modelObj);
  // Compatible if verified vision or unknown (never prematurely drop unverified custom models)
  return caps.vision || caps.status !== "verified_no_vision";
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
