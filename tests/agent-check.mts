/**
 * Drawva Agent verification suite — run with `pnpm test:agent`.
 * No test framework: plain asserts, one process. Section A–E:
 *   A. widgetPatch pure unit cases
 *   B. agentTools schema/limit cases
 *   C. prompt/constant contracts
 *   D. repo hygiene (anti-clone greps, mutation-path audit)
 *   E. HTTP integration against a real `next start` + a fake OpenAI-compatible
 *      model server (exercises /api/canvas/agent/step and /compact end to end
 *      with no external network and no real API key).
 */
import assert from "node:assert";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyWidgetPatch } from "../lib/canvas/widgetPatch";
import { AGENT_TOOL_DEFS, MAX_PATCH_BYTES, AGENT_MAX_STEPS_PER_TURN, parseAgentToolCall } from "../lib/ai/agentTools";
import { AGENT_SYSTEM_PROMPT, COORDINATE_CONTRACT, SYSTEM_PROMPT } from "../lib/ai/prompts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}\n      ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// A. widgetPatch
// ---------------------------------------------------------------------------
console.log("\nA. widgetPatch");

const SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "<head><title>Widget</title></head>",
  "<body>",
  "  <h1>Hello</h1>",
  "  <p>World</p>",
  "</body>",
  "</html>",
].join("\n");

const GOOD = `--- a/widget.html
+++ b/widget.html
@@ -4,3 +4,3 @@
 <body>
-  <h1>Hello</h1>
+  <h1>Goodbye</h1>
   <p>World</p>`;

await test("A1 valid patch applies and returns counts", () => {
  const r = applyWidgetPatch(SRC, GOOD);
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) {
    assert.ok(r.content.includes("Goodbye") && !r.content.includes(">Hello<"));
    assert.equal(r.path, "widget.html");
    assert.equal(r.linesChanged, 2);
    assert.equal(r.newLineCount, 8);
  }
});

await test("A2 context mismatch reports first differing line", () => {
  const r = applyWidgetPatch(SRC, GOOD.replace("  <p>World</p>", "  <p>Earth</p>"));
  assert.ok(!r.ok && r.code === "PATCH_MISMATCH");
  if (!r.ok && "diagnostics" in r && r.diagnostics) {
    assert.equal(r.diagnostics.line, 6);
    assert.equal(r.diagnostics.expected, "  <p>Earth</p>");
    assert.equal(r.diagnostics.actual, "  <p>World</p>");
  }
});

await test("A3 bare @@ hunk header rejected", () => {
  const r = applyWidgetPatch(SRC, "@@\n-  <h1>Hello</h1>\n+  <h1>Bye</h1>");
  assert.ok(!r.ok && r.code === "INVALID_HUNK");
});

await test("A4 git metadata rejected", () => {
  const r = applyWidgetPatch(SRC, `diff --git a/widget.html b/widget.html\n${GOOD}`);
  assert.ok(!r.ok && r.code === "INVALID_HEADER");
  const r2 = applyWidgetPatch(SRC, `index 123..456 100644\n${GOOD}`);
  assert.ok(!r2.ok && r2.code === "INVALID_HEADER");
});

await test("A5 non-allowed path rejected", () => {
  const r = applyWidgetPatch(SRC, GOOD.replaceAll("widget.html", "widget.json"));
  assert.ok(!r.ok && r.code === "POLICY_DENIED");
});

await test("A6 path traversal rejected", () => {
  const r = applyWidgetPatch(SRC, GOOD.replaceAll("widget.html", "../secrets.txt"));
  assert.ok(!r.ok && r.code === "POLICY_DENIED");
});

await test("A7 absolute path rejected", () => {
  const r = applyWidgetPatch(SRC, GOOD.replaceAll("widget.html", "/etc/passwd"));
  assert.ok(!r.ok && r.code === "POLICY_DENIED");
});

await test("A8 old/new file headers must match", () => {
  const cross = GOOD.replace(/^(\+\+\+ b\/)widget\.html$/m, "$1widget.source");
  const r = applyWidgetPatch(SRC, cross);
  assert.ok(!r.ok && r.code === "INVALID_HEADER");
});

await test("A9 miscounted @@ counts still apply (recount repair)", () => {
  const r = applyWidgetPatch(SRC, GOOD.replace("@@ -4,3 +4,3 @@", "@@ -4,9 +4,9 @@"));
  assert.ok(r.ok && r.ok && r.content.includes("Goodbye"));
});

await test("A10 two-file patch rejected", () => {
  const two = `${GOOD}\n${GOOD.replace(/widget\.html/g, "widget.source").replace("Hello", "X")}`;
  const r = applyWidgetPatch(SRC, two);
  assert.ok(!r.ok && r.code === "POLICY_DENIED");
});

await test("A11 empty / no-hunk patch rejected", () => {
  const empty = applyWidgetPatch(SRC, "");
  assert.ok(!empty.ok && empty.code === "EMPTY_PATCH");
  const headersOnly = applyWidgetPatch(SRC, "--- a/widget.html\n+++ b/widget.html\n");
  assert.ok(!headersOnly.ok && headersOnly.code === "EMPTY_PATCH");
});

await test("A12 insertion-only hunk applies", () => {
  const insert = `--- a/widget.html
+++ b/widget.html
@@ -1,0 +2 @@
+<!-- note -->`;
  const r = applyWidgetPatch(SRC, insert);
  assert.ok(r.ok && r.content.includes("<!-- note -->"));
});

await test("A13 oversized patch rejected", () => {
  const pad = "-x\n+y\n".repeat(Math.ceil(MAX_PATCH_BYTES / 4) + 100);
  const big = `--- a/widget.html\n+++ b/widget.html\n@@ -1,2 +1,2 @@\n${pad}`;
  const r = applyWidgetPatch(SRC, big);
  assert.ok(!r.ok && r.code === "LIMIT_EXCEEDED");
});

await test("A14 CRLF source normalizes before matching", () => {
  const crlf = SRC.replace(/\n/g, "\r\n");
  const r = applyWidgetPatch(crlf, GOOD);
  assert.ok(r.ok && r.content.includes("Goodbye"));
  if (r.ok) assert.ok(!r.content.includes("\r"));
});

await test("A15 trailing newline state survives", () => {
  const src = `${SRC}\n`;
  const r = applyWidgetPatch(src, GOOD);
  assert.ok(r.ok && r.ok && r.content.endsWith("\n"));
});

await test("A16 multibyte UTF-8 patch byte length enforcement", () => {
  // 4-byte emoji: 17,000 emojis = 68,000 bytes > 65,536 bytes limit, but character count is 17,000
  const padEmoji = "-🚀\n+✨\n".repeat(8500);
  const bigEmoji = `--- a/widget.html\n+++ b/widget.html\n@@ -1,2 +1,2 @@\n${padEmoji}`;
  const r = applyWidgetPatch(SRC, bigEmoji);
  assert.ok(!r.ok && r.code === "LIMIT_EXCEEDED");
});

// ---------------------------------------------------------------------------
// B. agentTools
// ---------------------------------------------------------------------------
console.log("\nB. agentTools");

await test("B1 exactly 8 tools with unique names", () => {
  assert.equal(AGENT_TOOL_DEFS.length, 8);
  const names = AGENT_TOOL_DEFS.map((t) => t.name);
  assert.equal(new Set(names).size, 8);
  for (const expected of [
    "canvas_scan",
    "canvas_snapshot",
    "canvas_apply",
    "load_plugin",
    "canvas_read",
    "canvas_patch_widget",
    "canvas_undo",
    "canvas_focus",
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

await test("B2 canvas_apply schema enforces 1..16 commands", () => {
  const def = AGENT_TOOL_DEFS.find((t) => t.name === "canvas_apply")!;
  assert.equal(def.schema.safeParse({ baseRevision: 1, commands: [] }).success, false);
  assert.equal(
    def.schema.safeParse({
      baseRevision: 1,
      commands: Array.from({ length: 17 }, () => ({ tool: "write_text" })),
    }).success,
    false
  );
  assert.equal(
    def.schema.safeParse({ baseRevision: 1, commands: [{ tool: "write_text" }] }).success,
    true
  );
});

await test("B3 canvas_snapshot schema rejects invalid target/quality", () => {
  const def = AGENT_TOOL_DEFS.find((t) => t.name === "canvas_snapshot")!;
  assert.equal(def.schema.safeParse({ target: "universe" }).success, false);
  assert.equal(def.schema.safeParse({ target: "region", quality: "ultra" }).success, false);
  assert.equal(def.schema.safeParse({ target: "region", region: { x: 0, y: 0, w: 1, h: 1 } }).success, true);
});

await test("B4 canvas_read requires objectId", () => {
  const def = AGENT_TOOL_DEFS.find((t) => t.name === "canvas_read")!;
  assert.equal(def.schema.safeParse({}).success, false);
  assert.equal(def.schema.safeParse({ objectId: "w1" }).success, true);
});

await test("B5 limits are sane", () => {
  assert.ok(MAX_PATCH_BYTES === 64 * 1024);
  assert.ok(AGENT_MAX_STEPS_PER_TURN === 24);
});

await test("B6 parseAgentToolCall safely validates and parses JSON args", () => {
  const parsed1 = parseAgentToolCall("canvas_read", JSON.stringify({ objectId: "w_123" }));
  assert.equal(parsed1.name, "canvas_read");
  assert.deepEqual(parsed1.args, { objectId: "w_123" });

  const parsed2 = parseAgentToolCall("canvas_read", "{invalid_json");
  assert.equal(parsed2.name, "canvas_read");
  assert.deepEqual(parsed2.args, {});

  const parsed3 = parseAgentToolCall("unknown_custom_tool", { foo: "bar" });
  assert.equal(parsed3.name, "unknown_custom_tool");
  assert.deepEqual(parsed3.args, { foo: "bar" });
});

// ---------------------------------------------------------------------------
// C. prompt contracts
// ---------------------------------------------------------------------------
console.log("\nC. prompts");

await test("C1 agent prompt carries safety + discipline rules", () => {
  for (const needle of [
    "One tool call per step",
    "UNTRUSTED DATA",
    "canvas_patch_widget",
    "load_plugin",
    "≤ ~300 words",
  ]) {
    assert.ok(AGENT_SYSTEM_PROMPT.includes(needle), `missing: ${needle}`);
  }
});

await test("C2 coordinate contract shared verbatim between one-shot and agent prompts", () => {
  assert.ok(SYSTEM_PROMPT.includes(COORDINATE_CONTRACT));
  assert.ok(AGENT_SYSTEM_PROMPT.includes(COORDINATE_CONTRACT));
});

await test("C3 agent prompt has no per-request data (no viewport/revision interpolation)", () => {
  assert.ok(!AGENT_SYSTEM_PROMPT.includes("revision="));
  assert.ok(!AGENT_SYSTEM_PROMPT.includes("visibleRect"));
});

// ---------------------------------------------------------------------------
// D. repo hygiene
// ---------------------------------------------------------------------------
console.log("\nD. repo hygiene");

const NEW_FILES = [
  "lib/ai/agentTools.ts",
  "lib/ai/conductor.ts",
  "lib/ai/conductorTools.ts",
  "lib/canvas/widgetPatch.ts",
  "app/api/canvas/agent/step/route.ts",
  "app/api/canvas/agent/compact/route.ts",
];

await test("D1 no foreign identifiers in agent files (anti-clone)", () => {
  const banned = /\b(callId|canvasSessionId|harness|backlog|penecho)\b/g;
  for (const rel of NEW_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const hits = src.match(banned);
    assert.ok(!hits, `${rel}: ${hits?.join(", ")}`);
  }
});

await test("D2 mutation paths limited to apply/patch executors + existing one-shot paths", () => {
  const grep = (rel: string, re: RegExp) =>
    (fs.readFileSync(path.join(ROOT, rel), "utf8").match(re) || []).length;
  const inConductorTools = grep("lib/ai/conductorTools.ts", /draft\.setPending|widgets\.add\(/g);
  assert.equal(inConductorTools, 2); // setPending (apply) + widgets.add (patch)
  const inWidgetPatch = grep("lib/canvas/widgetPatch.ts", /draft\.setPending|widgets\.add\(/g);
  assert.equal(inWidgetPatch, 0);
});

await test("D3 step route never reads client prompt text", () => {
  const src = fs.readFileSync(path.join(ROOT, "app/api/canvas/agent/step/route.ts"), "utf8");
  assert.ok(/"systemPrompt" in body/.test(src)); // rejected explicitly
  assert.ok(!/body\.systemPrompt/.test(src)); // never used as prompt input
});

await test("D4 new widget creation without targetId never overwrites or adopts existing scene widgets", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const sceneItems = [
    { id: "widget-1788027425209", kind: "html", x: 8093, y: 8900, w: 1052, h: 1115, title: "Visual Widget" },
  ];
  const validationCtx = {
    aiColor: "#2679b8",
    scale: 1,
    widgetSlots: 8,
    plugins: new Set(["general"]),
    visibleRect: { x: 5704, y: 6232, w: 4868, h: 2230 },
    changedBox: { x: 6983, y: 6835, w: 645, h: 643 },
    sceneItems,
  };
  const rawCommand = {
    tool: "html_widget",
    html: "<div class=\"cb\"><h3>Cube</h3><canvas id=\"cv\"></canvas></div>",
    placement: "in_place",
    x: 6983,
    y: 6835,
    w: 645,
    h: 643,
  };
  const { commands, rejected } = validateCommands([rawCommand], validationCtx);
  assert.equal(rejected.length, 0);
  assert.equal(commands.length, 1);
  const validated = commands[0] as { targetId?: string; x: number; y: number };
  assert.equal(validated.targetId, undefined, "New widget command must NOT adopt existing widget targetId");
  assert.equal(validated.x, 6983);
  assert.equal(validated.y, 6835);
});

await test("D5 arithmetic completion with command: 'draw_formula' and latex: '5' resolves correctly without becoming 'draw_formula' text", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const validationCtx = {
    aiColor: "#2679b8",
    scale: 1,
    widgetSlots: 8,
    plugins: new Set(["general"]),
    visibleRect: { x: 7800, y: 6600, w: 2500, h: 1500 },
    changedBox: { x: 7801, y: 6616, w: 1800, h: 200 },
  };
  const rawCommand = {
    command: "draw_formula",
    latex: "5",
    x: 9700,
    y: 6960,
    w: 250,
    h: 150,
  };
  const { commands, rejected } = validateCommands([rawCommand], validationCtx);
  assert.equal(rejected.length, 0);
  assert.equal(commands.length, 1);
  const validated = commands[0] as { tool: string; latex: string; x: number; y: number };
  assert.equal(validated.tool, "draw_formula");
  assert.equal(validated.latex, "5");
  assert.notEqual(validated.tool, "write_text");
});

await test("D6 extractText never extracts metadata keys like command or tool name", async () => {
  const { extractText } = await import("../lib/canvas/commands");
  const result = extractText({
    command: "draw_formula",
    tool: "draw_formula",
    action: "mutate",
    type: "math",
    latex: "5",
  });
  assert.equal(result, "");
});

await test("D7 numeric latex values and formula synonyms validate as draw_formula", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const validationCtx = {
    aiColor: "#2679b8",
    scale: 1,
    widgetSlots: 8,
    plugins: new Set(["general"]),
    visibleRect: { x: 1000, y: 1000, w: 2000, h: 1200 },
  };
  const rawCommand = {
    tool: "formula",
    latex: 42,
    x: 1200,
    y: 1200,
  };
  const { commands, rejected } = validateCommands([rawCommand], validationCtx);
  assert.equal(rejected.length, 0);
  assert.equal(commands.length, 1);
  const validated = commands[0] as { tool: string; latex: string };
  assert.equal(validated.tool, "draw_formula");
  assert.equal(validated.latex, "42");
});

// ---------------------------------------------------------------------------
// E. HTTP integration (real Next server + fake OpenAI-compatible model)
// ---------------------------------------------------------------------------
console.log("\nE. HTTP integration");

const APP_PORT = 4123;
const MODEL_PORT = 4124;
const APP = `http://127.0.0.1:${APP_PORT}`;
const MODEL_URL = `http://127.0.0.1:${MODEL_PORT}/v1`;
const API_KEY = "test-key-123";

interface WireMsg {
  role: string;
  content?: unknown;
  tool_call_id?: string;
}
interface ModelBody {
  stream?: boolean;
  messages?: WireMsg[];
  tools?: unknown[];
  parallel_tool_calls?: boolean;
}

/** Captured last model request + scripted reply mode. */
const modelState: {
  lastBody: ModelBody | null;
  lastAuth: string | null;
  mode: "text" | "tool" | "two-tools" | "summary";
} = { lastBody: null, lastAuth: null, mode: "text" };

function sseChunksFor(mode: typeof modelState.mode): string {
  const enc = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
    enc({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] });
  if (mode === "text") {
    return (
      frame({ role: "assistant", content: "Hello " }) +
      frame({ content: "world." }) +
      frame({}, "stop") +
      enc({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 11, completion_tokens: 4 } }) +
      "data: [DONE]\n\n"
    );
  }
  if (mode === "tool") {
    return (
      frame({ role: "assistant", content: null }) +
      frame({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "canvas_scan", arguments: '{"scope":"all"}' },
          },
        ],
      }) +
      frame({}, "tool_calls") +
      "data: [DONE]\n\n"
    );
  }
  return (
    frame({ role: "assistant", content: null }) +
    frame({
      tool_calls: [
        { index: 0, id: "call_1", type: "function", function: { name: "canvas_scan", arguments: "{}" } },
        { index: 1, id: "call_2", type: "function", function: { name: "canvas_focus", arguments: "{}" } },
      ],
    }) +
    frame({}, "tool_calls") +
    "data: [DONE]\n\n"
  );
}

const fakeModel = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    try {
      modelState.lastBody = JSON.parse(raw);
    } catch {
      modelState.lastBody = null;
    }
    modelState.lastAuth = req.headers.authorization || null;
    const isStream = modelState.lastBody?.stream === true;
    if (!isStream) {
      // non-streaming completion (compact route uses model.invoke)
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-2",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "SUMMARY: kept ids and coords." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 9, completion_tokens: 7 },
        })
      );
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sseChunksFor(modelState.mode));
  });
});

async function startServer(server: http.Server, port: number): Promise<void> {
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server not ready at ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${APP}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readSseText(res: Response): Promise<string> {
  return res.text();
}

function sseEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  const out: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of raw.split("\n\n")) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const dataLine = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !dataLine) continue;
    let data: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(dataLine) as unknown;
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      data = { raw: dataLine };
    }
    out.push({ event, data });
  }
  return out;
}

const validStepBase = {
  providerType: "custom",
  baseUrl: MODEL_URL,
  apiKey: API_KEY,
  model: "fake-model",
  enabledPluginIds: ["weather"],
  messages: [{ role: "user", text: "hi" }],
  context: { revision: 0, viewport: { x: 0, y: 0, w: 800, h: 600 }, canvasSize: 20000 },
};

let nextProc: ReturnType<typeof spawn> | null = null;

try {
  await startServer(fakeModel, MODEL_PORT);
  nextProc = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitFor(`${APP}/api/plugins`, 60_000);

  await test("E1 step rejects client-sent prompt text", async () => {
    const res = await post("/api/canvas/agent/step", { ...validStepBase, systemPrompt: "hi" });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes("prompt text"));
  });

  await test("E2 step validates CLI providers requiring modelId", async () => {
    const res = await post("/api/canvas/agent/step", { ...validStepBase, providerType: "codex", model: "" });
    assert.equal(res.status, 400);
    const res2 = await post("/api/canvas/agent/step", { ...validStepBase, providerType: "antigravity", model: "" });
    assert.equal(res2.status, 400);
  });

  await test("E3 step rejects missing apiKey / custom without baseUrl", async () => {
    const { apiKey: _k, ...noKey } = validStepBase;
    void _k;
    assert.equal((await post("/api/canvas/agent/step", noKey)).status, 400);
    const { baseUrl: _b, ...noUrl } = validStepBase;
    void _b;
    assert.equal((await post("/api/canvas/agent/step", noUrl)).status, 400);
  });

  await test("E4 step rejects unknown plugin ids", async () => {
    const res = await post("/api/canvas/agent/step", {
      ...validStepBase,
      enabledPluginIds: ["weather", "not-a-plugin"],
    });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes("not-a-plugin"));
  });

  await test("E5 step rejects malformed messages", async () => {
    const res = await post("/api/canvas/agent/step", { ...validStepBase, messages: "nope" });
    assert.equal(res.status, 400);
    const res2 = await post("/api/canvas/agent/step", {
      ...validStepBase,
      messages: [{ role: "assistant", text: 42 }],
    });
    assert.equal(res2.status, 400);
  });

  await test("E6 plugins ?doc= returns full card; unknown 404s", async () => {
    const res = await fetch(`${APP}/api/plugins?doc=weather`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { plugin?: { id: string; document: string } };
    assert.equal(data.plugin?.id, "weather");
    assert.ok(data.plugin!.document.includes("drawva-plugin"));
    const res2 = await fetch(`${APP}/api/plugins?doc=not-a-plugin`);
    assert.equal(res2.status, 404);
  });

  await test("E7 step E2E: streams text, server-composed prompt, tools bound, key forwarded", async () => {
    modelState.mode = "text";
    const res = await post("/api/canvas/agent/step", validStepBase);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") || "").includes("text/event-stream"));
    const rawText = await readSseText(res);
    const events = sseEvents(rawText);
    const deltas = events.filter((e) => e.event === "text_delta");
    const final = events.filter((e) => e.event === "final");
    assert.equal(deltas.length, 2);
    assert.equal(final.length, 1);
    assert.equal(final[0].data.text, "Hello world.");
    assert.equal(events.filter((e) => e.event === "error").length, 0);
    // model-side assertions
    assert.equal(modelState.lastAuth, `Bearer ${API_KEY}`);
    const body = modelState.lastBody!;
    const msgs = body.messages!;
    assert.equal(msgs[0].role, "system");
    assert.ok(String(msgs[0].content).includes("Drawva Agent"));
    assert.ok(String(msgs[0].content).includes("PLUGIN CATALOG"));
    assert.ok(String(msgs[0].content).includes("weather"));
    assert.ok(Array.isArray(body.tools) && body.tools.length === 8);
  });

  await test("E8 step E2E: tool_call round-trips with parsed args", async () => {
    modelState.mode = "tool";
    const res = await post("/api/canvas/agent/step", validStepBase);
    assert.equal(res.status, 200);
    const events = sseEvents(await readSseText(res));
    const tc = events.filter((e) => e.event === "tool_call");
    assert.equal(tc.length, 1);
    assert.equal(tc[0].data.name, "canvas_scan");
    assert.deepEqual(tc[0].data.args, { scope: "all" });
    assert.equal(tc[0].data.extraToolCalls, 0);
    assert.ok(events.some((e) => e.event === "final"));
  });

  await test("E9 step E2E: multiple tool_calls suppressed to first + extraToolCalls", async () => {
    modelState.mode = "two-tools";
    const res = await post("/api/canvas/agent/step", validStepBase);
    assert.equal(res.status, 200);
    const events = sseEvents(await readSseText(res));
    const tc = events.filter((e) => e.event === "tool_call");
    assert.equal(tc.length, 1);
    assert.equal(tc[0].data.name, "canvas_scan");
    assert.equal(tc[0].data.extraToolCalls, 1);
    assert.ok(!events.some((e) => e.event === "tool_call" && e.data.name === "canvas_focus"));
  });

  await test("E10 step E2E: system notes render as user turns, tool results as tool role", async () => {
    modelState.mode = "text";
    const res = await post("/api/canvas/agent/step", {
      ...validStepBase,
      messages: [
        { role: "user", text: "first question" },
        { role: "system", text: "older summary", tag: "compact" },
        {
          role: "assistant",
          text: "",
          toolCall: { id: "call_9", name: "canvas_scan", args: { scope: "all" } },
        },
        { role: "tool", toolCallId: "call_9", name: "canvas_scan", result: { items: [] }, isError: false },
      ],
    });
    assert.equal(res.status, 200);
    const msgs = modelState.lastBody!.messages!;
    assert.equal(msgs.filter((m) => m.role === "system").length, 1); // only the composed prompt
    const note = msgs.find((m) => typeof m.content === "string" && m.content.includes("[system note] older summary"));
    assert.ok(note, "system note missing");
    assert.equal(note.role, "user");
    const toolMsg = msgs.find((m) => m.role === "tool");
    assert.ok(toolMsg, "tool message missing");
    assert.equal(toolMsg.tool_call_id, "call_9");
    assert.ok(String(toolMsg.content).includes("items"));
  });

  await test("E11 compact E2E: returns model summary", async () => {
    const res = await post("/api/canvas/agent/compact", {
      providerType: "custom",
      baseUrl: MODEL_URL,
      apiKey: API_KEY,
      model: "fake-model",
      messages: [
        { role: "user", text: "q1" },
        { role: "assistant", text: "a1" },
      ],
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { summary?: string };
    assert.equal(data.summary, "SUMMARY: kept ids and coords.");
  });

  await test("E12 compact rejects CLI providers and missing fields", async () => {
    assert.equal(
      (await post("/api/canvas/agent/compact", { providerType: "antigravity", apiKey: "k", model: "m", messages: [] })).status,
      400
    );
    assert.equal((await post("/api/canvas/agent/compact", { providerType: "custom", apiKey: "k", model: "m" })).status, 400);
  });
} finally {
  if (nextProc && !nextProc.killed) {
    nextProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    nextProc.kill("SIGKILL");
  }
  await stopServer(fakeModel);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
