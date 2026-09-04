import { NextResponse } from "next/server";
import { completeLlmText, resolveLlmConfig } from "@/lib/ai/llm";
import { PLUGIN_AUTHORING_PROMPT } from "@/lib/ai/prompts";
import { parsePluginMarkdown } from "@/lib/plugins/registry";
import { requireSession } from "@/lib/api-guard";
import type { ProviderType } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AuthorRequestBody {
  prompt: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  providerType?: ProviderType;
}

export async function POST(req: Request) {
  try {
    const guard = await requireSession(req);
    if (guard instanceof NextResponse) return guard;

    const body = (await req.json()) as AuthorRequestBody;
    const { prompt, baseUrl, apiKey, model: modelId, providerType } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Missing or invalid prompt." }, { status: 400 });
    }

    if (!apiKey || !modelId) {
      return NextResponse.json(
        { error: "Missing apiKey or model for plugin generation." },
        { status: 400 }
      );
    }

    const llm = resolveLlmConfig({
      providerType: providerType || "custom",
      baseUrl,
      apiKey,
      model: modelId,
      timeoutMs: 45_000,
    });

    const { text: rawContent } = await completeLlmText(llm, {
      system: PLUGIN_AUTHORING_PROMPT,
      prompt: `Generate a plugin document for: ${prompt.trim()}`,
      signal: req.signal,
    });

    let text = rawContent.trim();

    // Strip wrapping markdown fences if model wrapped entire document in ```markdown
    if (text.startsWith("```markdown") && text.endsWith("```")) {
      text = text.replace(/^```markdown\s*\n?/, "").replace(/\n?```$/, "").trim();
    } else if (text.startsWith("```") && text.endsWith("```")) {
      text = text.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = parsePluginMarkdown(text);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Generated plugin markdown failed schema or size validation (must be < 2.5KB with valid YAML frontmatter).",
          rawText: text,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      markdown: text,
      plugin: parsed,
    });
  } catch (err) {
    console.error("[POST /api/plugins/author] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plugin authoring failed." },
      { status: 500 }
    );
  }
}
