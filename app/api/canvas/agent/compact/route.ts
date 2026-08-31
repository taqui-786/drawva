import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createChatModel } from "@/lib/ai/model";
import { AI_TIMEOUT_MS, MAX_BODY_BYTES } from "@/lib/ai/prompts";
import type { ProviderType } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 400 });

  let body: {
    providerType?: ProviderType;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    messages?: unknown;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerType: ProviderType = body.providerType || "custom";
  if (providerType === "codex" || providerType === "antigravity") {
    return NextResponse.json({ error: "Compact requires an API provider." }, { status: 400 });
  }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  if (!apiKey || !modelId) return NextResponse.json({ error: "Missing API key or model." }, { status: 400 });
  if (!Array.isArray(body.messages)) return NextResponse.json({ error: "messages is required." }, { status: 400 });

  const keep = 12;
  const old = body.messages.length > keep ? body.messages.slice(0, -keep) : [];
  const digest = old
    .map((m) => {
      if (!m || typeof m !== "object") return "";
      const rec = m as Record<string, unknown>;
      const role = String(rec.role || "");
      const text =
        typeof rec.text === "string"
          ? rec.text
          : rec.result !== undefined
            ? JSON.stringify(rec.result)
            : "";
      const name = typeof rec.name === "string" ? rec.name : "";
      return `${role}${name ? `(${name})` : ""}: ${text}`.slice(0, 800);
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 24_000);

  const model = createChatModel({
    providerType,
    baseUrl,
    apiKey,
    model: modelId,
    timeoutMs: AI_TIMEOUT_MS,
  });

  const { text } = await generateText({
    model,
    instructions:
      "Summarize this Drawva Agent conversation for a later step. Keep object ids, coordinates, plugin ids, and the unfinished task. Plain text, ≤ 1500 characters. No JSON.",
    prompt: digest || "(empty)",
  });

  const summary = text.trim().slice(0, 1500);
  return NextResponse.json({ summary });
}
