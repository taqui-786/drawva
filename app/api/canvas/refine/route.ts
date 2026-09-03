import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { createChatModel, isFatalAuthError, isRateLimitError } from "@/lib/ai/model";
import { MAX_BODY_BYTES, AI_TIMEOUT_MS } from "@/lib/ai/prompts";
import { extractJsonDecision } from "@/lib/ai/agentTools";
import { requireSession } from "@/lib/api-guard";
import { recordAiUsage } from "@/lib/actions/usage";
import { type ProviderType, PROVIDER_INFOS } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const REFINEMENT_SYSTEM_PROMPT = `You refine and beautify canvas content inside a marked selection rectangle.

== 1. SELECTION BOUNDARY & CONTEXT ISOLATION (CRITICAL) ==
- The red dashed outline marks the target selection bounding box.
- FOCUS EXCLUSIVELY on the main inner diagram, illustration, text, or widget fully inside the selection.
- IGNORE TOUCHING EXTERNAL STROKES & POINTERS: If an arrow, pointer, handwriting, or stroke originating outside the selection touches, enters, or crosses the selection border (such as an arrow pointing at the drawing asking "what is this?"), IGNORE IT COMPLETELY. Do not transcribe, redraw, or include touching external arrows or outside annotations.
- Handwritten notes or questions near/inside the selection (e.g. "what this called", "show measure", "refine", "beautify", "make straight") are instructions for you, not content to reproduce.

== 2. DECISION & OUTPUT POLICY ==
1. HANDWRITTEN TEXT, WORDS, NOTES, LABELS, NUMBERS, MATH FORMULAS:
   (e.g. "Hey", words, sentences, notes, headings, numbers, algebraic equations like "E=mc^2" or "y = ax^2 + bx + c")
   -> MUST RETURN native_canvas!
   -> DO NOT convert simple handwriting or text into an HTML widget iframe card.
   -> Return native_canvas with "texts": [{"text": "...", "normX": 0, "normY": 0, "fontSize": 48}] (or "formulas": [{"latex": "..."}] for math equations).
   -> Omit "color" to inherit the app's theme ink color, or set it to the dominant color from the provided ink palette when the user's handwriting is deliberately colored. Set fontSize proportional to selection rectangle height (e.g. fontSize = ~0.6 * selectionRect.h for single-line text, e.g. 40px - 140px depending on selection height).

2. ROUGH DIAGRAMS, PHYSICS / MATH SKETCHES, GEOMETRY, WIREFRAMES & SCHEMATICS:
   (e.g. projectile motion with coordinate axes and parabolic curve, velocity vectors, launch angles, geometric figures, triangles, circles, electrical circuits, free-body diagrams, annotated graphs, UI wireframes, flow concepts)
   -> RETURN html_widget with a standalone, publication-quality inline <svg> (or diagram_widget if standard format).
   -> NEVER return crude segmented polyline strokes. Transform rough hand drawings into crisp, professional, publication-grade vector graphics.

3. STRUCTURED STANDARD DIAGRAMS:
   (Mermaid flowcharts/sequences, Graphviz DOT networks/trees, Vega-Lite charts, SMILES molecules, BPMN workflows, Cytoscape graphs, GeoJSON maps)
   -> RETURN diagram_widget with clean source and matching sourceFormat.

4. EXISTING WIDGET EDITS (when target is provided):
   -> RETURN widget_patch with a valid unified diff against the exact target source (--- a/widget.html / +++ b/widget.html or widget.source).

5. SIMPLE SHAPES / STROKES:
   (e.g. single clean box, simple arrow, straight line)
   -> RETURN native_canvas with normalized strokes.

6. UNCLEAR INTENT OR BLANK SELECTION:
   -> RETURN reject with a clear reason.

== 3. INLINE SVG REQUIREMENTS FOR html_widget (DIAGRAMS ONLY) ==
- Structure:
  <div id="stage"><svg viewBox="0 0 W H" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" style="fill:var(--foreground)"/>
      </marker>
      <marker id="arrow-accent" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" style="fill:var(--chart-3)"/>
      </marker>
    </defs>
    <!-- Vector elements: axes, paths, curves, lines, arcs, markers, labels -->
  </svg></div>
- Aspect Ratio: Choose W and H for viewBox matching the aspect ratio of the selection rectangle (e.g. viewBox="0 0 600 400").
- Transparent Background: The container and stage must have background: transparent; with no outer card border or box-shadow, so the diagram integrates seamlessly into the whiteboard.
- Precision Geometry:
  * Straight axes with clean tick marks and arrow markers.
  * Smooth mathematical curves using quadratic/cubic Bézier paths: <path d="M ... Q ..." fill="none" style="stroke:var(--chart-3)" stroke-width="2.5" stroke-dasharray="6 4"/> for trajectory curves.
  * Angle arcs with angle labels (e.g. <path d="M ... A ..." fill="none" style="stroke:var(--chart-2)" stroke-width="2"/><text ...>θ = 30°</text>).
  * Velocity / vector arrows with arrowheads (e.g. marker-end="url(#arrow-accent)").
  * Typeset labels & formulas: <text style="font-family:var(--font-sans);fill:var(--foreground)" font-size="14" font-weight="600"> with accurate notation (v₀, v₀x, v₀y, y(x), x(t)).
  * Theme tokens only — the widget iframe receives the app theme on :root. Primary axes, outlines, and labels var(--foreground); secondary labels and ticks var(--muted-foreground); gridlines var(--border); vectors, curves, and data series var(--chart-1)..var(--chart-5); errors or negatives var(--destructive); an opaque backing (only when contrast demands it) var(--card) with var(--card-foreground). Never invent hex, rgb, or gradients. In SVG var() resolves in CSS only: style="fill:var(--chart-1)", never fill="var(--chart-1)".

== 4. RESPONSE FORMAT (MANDATORY) ==
Return ONLY a valid JSON object matching one of the schemas:
- For handwriting / text / formulas: {"kind": "native_canvas", "texts": [{"text": "Hey", "normX": 0, "normY": 0, "fontSize": 40}]} or {"kind": "native_canvas", "formulas": [{"latex": "..."}]}
- For html_widget (diagrams only): {"kind": "html_widget", "title": "...", "html": "<div id=\\"stage\\"><svg ...>...</svg></div>"}
- For diagram_widget: {"kind": "diagram_widget", "sourceFormat": "mermaid|dot|vega-lite|smiles|bpmn-xml|cytoscape-json|geojson", "title": "...", "source": "..."}
- For widget_patch: {"kind": "widget_patch", "targetId": "...", "expectedContentHash": "...", "patch": "..."}
- For reject: {"kind": "reject", "reason": "..."}`;

// `color` is intentionally default-free: when the model omits it the client
// falls back to the app's theme ink color instead of a hardcoded slate.
const refinedStrokeSchema = z.object({
  points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(2).max(200),
  color: z.string().min(1).max(30).optional(),
  width: z.number().min(0.5).max(20).optional().default(2),
});

const refinedTextSchema = z.object({
  text: z.string().min(1).max(500),
  normX: z.number().min(0).max(1).optional().default(0),
  normY: z.number().min(0).max(1).optional().default(0),
  fontSize: z.number().min(8).max(200).optional().default(32),
  color: z.string().min(1).max(30).optional(),
});

const refinedFormulaSchema = z.object({
  latex: z.string().min(1).max(2000),
  normX: z.number().min(0).max(1).optional().default(0),
  normY: z.number().min(0).max(1).optional().default(0),
  fontSize: z.number().min(8).max(200).optional().default(32),
  color: z.string().min(1).max(30).optional(),
});

const refinementResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("widget_patch"),
    targetId: z.string(),
    expectedContentHash: z.string(),
    patch: z.string().min(1),
  }),
  z.object({
    kind: z.literal("native_canvas"),
    strokes: z.array(refinedStrokeSchema).max(100).optional().default([]),
    texts: z.array(refinedTextSchema).max(50).optional().default([]),
    formulas: z.array(refinedFormulaSchema).max(20).optional().default([]),
  }),
  z.object({
    kind: z.literal("diagram_widget"),
    sourceFormat: z.enum(["mermaid", "dot", "bpmn-xml", "vega-lite", "geojson", "smiles", "cytoscape-json"]),
    source: z.string().min(1).max(102400),
    title: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("html_widget"),
    html: z.string().min(1).max(200000),
    title: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("reject"),
    reason: z.string().min(1).max(500),
  }),
]);

export type RefineResult = z.infer<typeof refinementResultSchema>;

interface RefineRequest {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  cropDataUrl?: string;
  selectionRect?: { x: number; y: number; w: number; h: number };
  imageScale?: number;
  baseRevision?: number;
  fingerprint?: string;
  target?: {
    id?: string;
    kind?: string;
    source?: string;
    html?: string;
    contentHash?: string;
    sourceFormat?: string;
    box?: { x: number; y: number; w: number; h: number };
  };
  containedItems?: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number }>;
  nearbyItems?: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>;
  palette?: string[];
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function publicError(err: unknown): string {
  if (isFatalAuthError(err)) return "API key rejected by provider.";
  if (isRateLimitError(err)) return "Provider rate limited the request. Try again.";
  return err instanceof Error ? err.message : "Refinement failed.";
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Failed to read body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 400);

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  let body: RefineRequest;
  try {
    body = JSON.parse(raw) as RefineRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const providerType: ProviderType = body.providerType || "custom";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  const info = PROVIDER_INFOS[providerType];
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : info?.defaultBaseUrl || "";
  if (!apiKey || !modelId) return json({ error: "Missing API key or model." }, 400);
  if (providerType === "custom" && !baseUrl) return json({ error: "Custom provider requires a Base URL." }, 400);
  if (!body.cropDataUrl) return json({ error: "Missing crop image." }, 400);
  if (!body.selectionRect) return json({ error: "Missing selection rectangle." }, 400);

  let model;
  try {
    model = createChatModel({
      providerType,
      baseUrl,
      apiKey,
      model: modelId,
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to create model." }, 400);
  }

  const contextParts: string[] = [];
  contextParts.push(`Selection rectangle: x=${body.selectionRect.x}, y=${body.selectionRect.y}, w=${body.selectionRect.w}, h=${body.selectionRect.h}`);
  if (body.imageScale) contextParts.push(`Image scale: ${body.imageScale}`);
  if (body.baseRevision !== undefined) contextParts.push(`Base revision: ${body.baseRevision}`);
  if (body.palette && body.palette.length > 0) contextParts.push(`Dominant ink palette: ${body.palette.join(", ")}`);

  if (body.target) {
    contextParts.push(`Target: id=${body.target.id || "none"}, kind=${body.target.kind || "unknown"}`);
    if (body.target.sourceFormat) contextParts.push(`Source format: ${body.target.sourceFormat}`);
    if (body.target.contentHash) contextParts.push(`Content hash: ${body.target.contentHash}`);
    if (body.target.source) contextParts.push(`Current source:\n${body.target.source.slice(0, 8000)}`);
    else if (body.target.html) contextParts.push(`Current HTML:\n${body.target.html.slice(0, 8000)}`);
  }

  if (body.containedItems && body.containedItems.length > 0) {
    contextParts.push(`Contained items: ${JSON.stringify(body.containedItems)}`);
  }
  if (body.nearbyItems && body.nearbyItems.length > 0) {
    contextParts.push(`Nearby context items: ${JSON.stringify(body.nearbyItems.slice(0, 10))}`);
  }

  const userPrompt = `Refine the content inside the marked selection rectangle. Return ONLY the final JSON object.\n\n${contextParts.join("\n")}`;

  try {
    const result = await generateText({
      model,
      system: REFINEMENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image", image: body.cropDataUrl },
          ],
        },
      ],
      abortSignal: req.signal,
    });

    try {
      const usage = await result.usage;
      if (usage) {
        await recordAiUsage({
          providerType,
          modelId,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
        });
      }
    } catch {}

    const rawText = result.text.trim();
    let parsedResult: RefineResult | null = null;

    // 1. Try direct JSON.parse
    try {
      const direct = JSON.parse(rawText);
      const validated = refinementResultSchema.safeParse(direct);
      if (validated.success) parsedResult = validated.data;
    } catch {}

    // 2. Try extractJsonDecision from markdown code fences or text
    if (!parsedResult) {
      const extracted = extractJsonDecision(rawText);
      if (extracted) {
        const validated = refinementResultSchema.safeParse(extracted);
        if (validated.success) parsedResult = validated.data;
      }
    }

    // 3. Fallback: if the model returned raw HTML/SVG
    if (!parsedResult && (rawText.includes("<svg") || rawText.includes("<div"))) {
      const cleanHtml = rawText.replace(/^```html?/i, "").replace(/```$/i, "").trim();
      parsedResult = {
        kind: "html_widget",
        title: "Refined Diagram",
        html: cleanHtml,
      };
    }

    if (!parsedResult) {
      return json({ error: "Model returned invalid refinement output." }, 500);
    }

    return json({ ok: true, result: parsedResult });
  } catch (err) {
    if (req.signal.aborted) return json({ error: "Cancelled" }, 499);
    return json({ error: publicError(err) }, 500);
  }
}
