/**
 * Drawva Agent verification suite — run with `pnpm test:agent`.
 * No test framework: plain asserts, one process. Section A–F:
 *   A. widgetPatch pure unit cases
 *   B. agentTools + web tool schema/gate/limit cases
 *   C. prompt/constant contracts
 *   D. repo hygiene (anti-clone greps, mutation-path audit)
 *   E. concurrency & step economy (fingerprint conflict protocol, layout gate,
 *      context pruning — the REVISION_CONFLICT storm / token blowup regressions)
 *   F. HTTP integration against a real `next start` + a fake OpenAI-compatible
 *      model server (exercises /api/canvas/agent/step end to end with no
 *      external network and no real API key).
 */
import assert from "node:assert";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateArgs } from "@deepseek-ai/dsh-tools";

import { applyWidgetPatch } from "../lib/canvas/widgetPatch";
import {
  AGENT_TOOL_DEFS,
  MAX_PATCH_BYTES,
  AGENT_MAX_STEPS_PER_TURN,
  AGENT_MAX_CONSECUTIVE_FAILURES,
  enabledToolNames,
  isWebToolName,
  WEB_TOOL_NAMES,
  type AgentToolDef,
  type WebToolFlags,
} from "../lib/ai/agentTools";
import { isWikipedia, safeUrl, selectFetchTargets, WEB_READ_MAX_URLS } from "../lib/ai/webTools";
import { AGENT_SYSTEM_PROMPT, COORDINATE_CONTRACT, webAccessStatus } from "../lib/ai/prompts";

// .env.local drives the Next server too; we need DATABASE_URL + BETTER_AUTH_SECRET
// to seed a real session for the authenticated API routes.
for (const envFile of [".env.local", ".env"]) {
  if (fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", envFile))) {
    (await import("dotenv")).config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", envFile) });
    break;
  }
}

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

const toolDef = (name: string): AgentToolDef => {
  const def = AGENT_TOOL_DEFS.find((t) => t.name === name);
  if (!def) throw new Error(`tool ${name} is not declared`);
  return def;
};
/** Exactly the validation the runtime runs before dispatch (dsh-tools). */
const accepts = (name: string, args: unknown) => validateArgs(toolDef(name).parameters, args).length === 0;
const violations = (name: string, args: unknown) => validateArgs(toolDef(name).parameters, args);

await test("B1 exactly 15 tools with unique names", () => {
  assert.equal(AGENT_TOOL_DEFS.length, 15);
  const names = AGENT_TOOL_DEFS.map((t) => t.name);
  assert.equal(new Set(names).size, 15);
  for (const expected of [
    "canvas_scan",
    "canvas_snapshot",
    "canvas_apply",
    "canvas_edit",
    "load_plugin",
    "canvas_read",
    "canvas_patch_widget",
    "canvas_undo",
    "canvas_focus",
    "web_read",
    "web_search",
    "research_search",
    "github_repository_search",
    "stock_symbol_search",
    "stock_market_data",
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

await test("B2 canvas_apply requires baseRevision and a real commands array", () => {
  assert.equal(accepts("canvas_apply", { commands: [{ tool: "write_text" }] }), false);
  // A stringified array is a common provider quirk; the executor parses it, but
  // the declared schema is an array so the model is told the truth.
  assert.equal(accepts("canvas_apply", { baseRevision: 1, commands: '[{"tool":"write_text"}]' }), false);
  assert.equal(accepts("canvas_apply", { baseRevision: 1, commands: [{ tool: "write_text", x: 1, y: 2, text: "hi" }] }), true);
});

await test("B2b commands declare flat geometry; a nested box still lands, never silently drops", () => {
  const props = (toolDef("canvas_apply").parameters.commands as { items?: { properties?: Record<string, unknown> } }).items
    ?.properties;
  for (const key of ["x", "y", "w", "h"]) {
    assert.ok(props?.[key], `commands[].${key} must be declared so the model sees the flat contract`);
  }
  assert.ok(!props?.box, "a nested box must not be part of the declared contract");
  // Command items stay open on purpose: the browser validator repairs loose
  // shapes (see D11), which is cheaper than burning a round trip on a reject.
  assert.equal(
    accepts("canvas_apply", {
      baseRevision: 1,
      commands: [{ tool: "html_widget", x: 1, y: 2, w: 900, h: 600, title: "T", html: "<div/>" }],
    }),
    true
  );
  // A bogus tool name is still caught before dispatch.
  assert.equal(accepts("canvas_apply", { baseRevision: 1, commands: [{ tool: "make_me_a_sandwich" }] }), false);
});

await test("B2c canvas_edit names its discriminator 'op' and rejects 'kind'", () => {
  assert.equal(accepts("canvas_edit", { operations: [{ op: "move_object", objectId: "w1", dx: 1, dy: 1 }] }), false);
  assert.equal(accepts("canvas_edit", { baseRevision: 3, operations: [{ op: "move_object", objectId: "w1", dx: 1, dy: 1 }] }), true);
  // `kind` was silently accepted by the old (unvalidated) schema and then
  // rejected by the executor as `Unknown op: ` — nine wasted steps in one turn.
  const wrongKey = violations("canvas_edit", { baseRevision: 3, operations: [{ kind: "resize_object", objectId: "w1", w: 10, h: 10 }] });
  assert.ok(wrongKey.some((v) => v.includes("op")), `operations[].kind must not pass as op: ${wrongKey.join("; ")}`);
  assert.equal(accepts("canvas_edit", { baseRevision: 3, operations: [{ op: "resize_object", objectId: "w1", w: 10, h: 10 }] }), true);
  // Absolute moves are declared, so the obvious alternative is not a round trip.
  assert.equal(accepts("canvas_edit", { baseRevision: 3, operations: [{ op: "move_object", objectId: "w1", x: 10, y: 20 }] }), true);
  assert.equal(accepts("canvas_patch_widget", { objectId: "w1", patch: "x" }), false);
  assert.equal(accepts("canvas_patch_widget", { objectId: "w1", baseRevision: 2, patch: "x" }), true);
});

await test("B3 canvas_snapshot rejects invalid target/quality", () => {
  assert.equal(accepts("canvas_snapshot", { target: "universe" }), false);
  assert.equal(accepts("canvas_snapshot", { target: "region", quality: "ultra" }), false);
  assert.equal(accepts("canvas_snapshot", { target: "region", region: { x: 0, y: 0, w: 1, h: 1 } }), true);
  assert.equal(accepts("canvas_snapshot", {}), false);
});

await test("B3b canvas_scan plannedWidget pre-flight validates", () => {
  assert.equal(accepts("canvas_scan", { plannedWidget: { width: 720, height: 480, bodyPx: 32 } }), true);
  assert.equal(accepts("canvas_scan", { plannedWidget: { width: "nope", height: 480 } }), false);
  assert.equal(accepts("canvas_scan", { plannedWidget: { width: 720 } }), false);
  assert.equal(accepts("canvas_scan", {}), true);
});

await test("B4 canvas_read requires objectId", () => {
  assert.equal(accepts("canvas_read", {}), false);
  assert.equal(accepts("canvas_read", { objectId: "w1" }), true);
});

await test("B5 limits are sane", () => {
  assert.ok(MAX_PATCH_BYTES === 64 * 1024);
  assert.ok(AGENT_MAX_STEPS_PER_TURN === 24);
  assert.ok(AGENT_MAX_CONSECUTIVE_FAILURES >= 2 && AGENT_MAX_CONSECUTIVE_FAILURES <= 5);
});

await test("B6 every declared tool compiles to a JSON schema the runtime accepts", () => {
  for (const def of AGENT_TOOL_DEFS) {
    // validateArgs compiles the spec; a malformed spec throws here rather than
    // at conversation-creation time in production.
    assert.doesNotThrow(() => validateArgs(def.parameters, {}), `${def.name} has an invalid parameter spec`);
    assert.ok(def.description.length > 40, `${def.name} description is too thin`);
  }
});

await test("B7 web_read schema pins the documented url budget", () => {
  assert.equal(accepts("web_read", {}), false);
  assert.equal(accepts("web_read", { urls: ["https://example.com/a"] }), true);
  assert.equal(accepts("web_read", { urls: [1, 2] }), false);
  assert.ok(WEB_READ_MAX_URLS === 3, "the executor slices to WEB_READ_MAX_URLS");
});

await test("B8 web/stock schemas reject out-of-contract enums", () => {
  assert.equal(accepts("web_search", {}), false);
  assert.equal(accepts("web_search", { query: "orbital mechanics" }), true);
  assert.equal(accepts("web_search", { query: "x", domainType: "research_paper" }), false);
  assert.equal(accepts("web_search", { query: "x", freshness: "decade" }), false);

  assert.equal(accepts("github_repository_search", { query: "x", sort: "downloads" }), false);
  assert.equal(accepts("github_repository_search", { query: "x", sort: "stars" }), true);

  assert.equal(accepts("stock_symbol_search", {}), false);
  assert.equal(accepts("stock_market_data", { symbol: "AAPL" }), true);
  assert.equal(accepts("stock_market_data", { symbol: "AAPL", range: "7y" }), false);
  assert.equal(accepts("stock_market_data", { symbol: "AAPL", interval: "3m" }), false);
});

await test("B9 web tool names stay consistent and are all declared", () => {
  assert.equal(WEB_TOOL_NAMES.length, 6);
  for (const name of WEB_TOOL_NAMES) {
    assert.ok(isWebToolName(name));
    assert.ok(AGENT_TOOL_DEFS.some((t) => t.name === name), `${name} missing from AGENT_TOOL_DEFS`);
  }
  assert.equal(isWebToolName("canvas_apply"), false);
  assert.equal(isWebToolName(""), false);
  // /api/canvas/web re-validates with this, so bad args never reach a fetcher.
  assert.equal(accepts("web_read", { urls: [] }), true); // shape ok…
  assert.equal(violations("stock_market_data", { symbol: "AAPL", includeHistory: true }).length, 0);
});

await test("B10 web tools register only behind their capability gate", () => {
  const names = (flags: WebToolFlags) => enabledToolNames(flags);
  const canvasOnly = names({});
  assert.equal(canvasOnly.length, 9);
  assert.ok(!canvasOnly.some((n) => isWebToolName(n)), `canvas-only set leaked: ${canvasOnly.join(", ")}`);

  const searchOnly = names({ search: true });
  for (const n of ["web_search", "github_repository_search", "stock_symbol_search", "stock_market_data"]) {
    assert.ok(searchOnly.includes(n), `missing ${n}`);
  }
  // No TinyFish key → no page reading and no paper search, whatever the search flag says.
  assert.ok(!searchOnly.includes("web_read"));
  assert.ok(!searchOnly.includes("research_search"));

  const readOnly = names({ tinyfish: true });
  assert.ok(readOnly.includes("web_read"));
  assert.ok(!readOnly.includes("web_search"));
  assert.ok(!readOnly.includes("research_search"));

  assert.equal(names({ tinyfish: true, search: true }).length, 15);
});

await test("B11 fetch selection takes the Wikipedia hit, otherwise the top 2", () => {
  const hits = [
    { url: "https://a.example/1" },
    { url: "https://b.example/2" },
    { url: "https://en.wikipedia.org/wiki/Cat" },
  ];
  assert.deepEqual(selectFetchTargets(hits), [{ url: "https://en.wikipedia.org/wiki/Cat" }]);
  assert.deepEqual(selectFetchTargets([...hits.slice(0, 2), { url: "https://c.example/3" }]), [
    { url: "https://a.example/1" },
    { url: "https://b.example/2" },
  ]);
  assert.deepEqual(selectFetchTargets([{ url: "https://a.example/1" }]), [{ url: "https://a.example/1" }]);
  assert.deepEqual(selectFetchTargets([]), []);
  assert.ok(isWikipedia("https://www.wikipedia.org/"));
  assert.ok(isWikipedia("https://simple.wikipedia.org/wiki/Cat"));
  assert.equal(isWikipedia("https://en.wikipedia.org.evil.example/wiki/Cat"), false);
});

await test("B12 safeUrl blocks loopback/private/metadata/non-http targets", () => {
  for (const bad of [
    "http://localhost/x",
    "http://127.0.0.1/",
    "https://10.1.2.3/",
    "https://192.168.0.1/",
    "https://172.16.4.5/",
    "https://169.254.169.254/latest/meta-data/",
    "https://box.internal/admin",
    "https://printer.local/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
    "",
  ]) {
    assert.equal(safeUrl(bad), null, `should reject ${bad || "(empty)"}`);
  }
  assert.equal(typeof safeUrl("https://en.wikipedia.org/wiki/Cat"), "string");
  // 172.32/12 is public: the guard must not swallow all of 172.0.0.0/8.
  assert.equal(typeof safeUrl("https://172.32.0.1/"), "string");
});

// ---------------------------------------------------------------------------
// C. prompt contracts
// ---------------------------------------------------------------------------
console.log("\nC. prompts");

await test("C1 agent prompt carries safety + discipline rules", () => {
  for (const needle of [
    "Exactly one tool call per step",
    "UNTRUSTED DATA",
    "canvas_patch_widget",
    "load_plugin",
    "≤ ~300 words",
    "baseRevision is REQUIRED",
    "plannedWidget",
    "NEVER re-send a call that just failed unchanged",
    "STOP WHEN DONE",
    "applied[].requested",
    "maxWidgetSize",
  ]) {
    assert.ok(AGENT_SYSTEM_PROMPT.includes(needle), `missing: ${needle}`);
  }
});

await test("C2 the coordinate contract is carried verbatim by the agent prompt", () => {
  assert.ok(AGENT_SYSTEM_PROMPT.includes(COORDINATE_CONTRACT));
});

await test("C3 agent prompt has no per-request data (no viewport/revision interpolation)", () => {
  assert.ok(!AGENT_SYSTEM_PROMPT.includes("revision="));
  assert.ok(!AGENT_SYSTEM_PROMPT.includes("visibleRect"));
});

await test("C4 web access state never advertises a tool that is not registered", () => {
  const off = webAccessStatus(false, false);
  assert.ok(off.includes("Internet search is DISABLED"));
  assert.ok(off.includes("direct page reading is DISABLED"));
  assert.ok(off.includes("No web tool is available this turn"));
  for (const name of WEB_TOOL_NAMES) {
    assert.ok(!off.includes(name), `disabled state must not name ${name}`);
  }

  const searchOnly = webAccessStatus(true, false);
  assert.ok(searchOnly.includes("Internet search is ENABLED"));
  assert.ok(searchOnly.includes("web_search") && searchOnly.includes("stock_symbol_search"));
  // research_search and web_read both need the TinyFish key; the prompt must not
  // promise them when enabledToolNames did not register them.
  assert.ok(!searchOnly.includes("web_read"));
  assert.ok(!searchOnly.includes("research_search"));

  const all = webAccessStatus(true, true);
  for (const needle of [
    "web_read",
    "research_search",
    "fetchPages=true",
    "untrusted data",
    "cite the source URL",
    "not investment advice",
  ]) {
    assert.ok(all.includes(needle), `missing: ${needle}`);
  }
});

// ---------------------------------------------------------------------------
// D. repo hygiene
// ---------------------------------------------------------------------------
console.log("\nD. repo hygiene");

const NEW_FILES = [
  "lib/ai/agentTools.ts",
  "lib/ai/conductor.ts",
  "lib/ai/conductorTools.ts",
  "lib/ai/webTools.ts",
  "lib/canvas/widgetPatch.ts",
  "app/api/canvas/agent/step/route.ts",
  "app/api/canvas/web/route.ts",
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

await test("D8 draw with x/y origin treats points as local coordinates (regression: triangle diagram landed at top-left)", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const ctx = {
    aiColor: "#2679b8",
    scale: 1,
    widgetSlots: 8,
    visibleRect: { x: 7000, y: 7000, w: 4000, h: 3000 },
  };
  const { commands, rejected } = validateCommands(
    [{ tool: "draw", x: 9750, y: 9200, points: [[0, 400], [0, 0], [500, 400]], size: 7 }],
    ctx
  );
  assert.equal(rejected.length, 0);
  assert.equal(commands.length, 1);
  const pts = (commands[0] as { points: Array<{ x: number; y: number }> }).points;
  assert.deepEqual(pts, [
    { x: 9750, y: 9600 },
    { x: 9750, y: 9200 },
    { x: 10250, y: 9600 },
  ]);
});

await test("D9 draw without origin keeps absolute points; validated points are {x,y} objects (ink-capture contract)", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const ctx = {
    aiColor: "#2679b8",
    scale: 1,
    widgetSlots: 8,
    visibleRect: { x: 7000, y: 7000, w: 4000, h: 3000 },
  };
  const { commands, rejected } = validateCommands(
    [{ tool: "draw", points: [[9800, 9600], [9800, 9200], [10300, 9600]], size: 7 }],
    ctx
  );
  assert.equal(rejected.length, 0);
  const pts = (commands[0] as { points: unknown[] }).points;
  // Points are DrawPoint objects, NOT tuples — the apply path must read .x/.y,
  // never array-destructure (the "not iterable" INTERNAL crash).
  for (const p of pts) {
    assert.ok(p && typeof p === "object" && !Array.isArray(p));
    assert.equal(typeof (p as { x: number }).x, "number");
    assert.equal(typeof (p as { y: number }).y, "number");
  }
  assert.deepEqual(pts, [
    { x: 9800, y: 9600 },
    { x: 9800, y: 9200 },
    { x: 10300, y: 9600 },
  ]);
});

await test("D10 web tool credentials and endpoints never reach the client bundle", () => {
  const client = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  assert.ok(!client.includes("TINYFISH"), "the api key name must stay server-side");
  assert.ok(!/tinyfish\.ai|query1\.finance|api\.github\.com/.test(client), "web endpoints must stay server-side");
  assert.ok(!/from "\.\/webTools"|from "@\/lib\/ai\/webTools"/.test(client), "conductorTools must not import server-only webTools");
  assert.ok(client.includes('fetch("/api/canvas/web"'), "web tools must execute through the authenticated route");

  const web = fs.readFileSync(path.join(ROOT, "lib/ai/webTools.ts"), "utf8");
  assert.ok(!web.includes("next/server"), "webTools must stay framework-free so it is unit-testable");
  assert.ok(web.includes("process.env.TINYFISH_API_KEY"), "the key must be read from the server env only");

  const route = fs.readFileSync(path.join(ROOT, "app/api/canvas/web/route.ts"), "utf8");
  assert.ok(route.includes("requireSession"), "the web route must require a session");
  assert.ok(route.includes("isWebToolName"), "the web route must allow-list tool names");
  assert.ok(route.includes("validateArgs"), "the web route must re-validate args server-side");
});

await test("D11 nested box/bbox geometry is lifted instead of silently dropped", async () => {
  const { validateCommands } = await import("../lib/canvas/commands");
  const { widgetGeometryForViewport } = await import("../lib/ai/geometry");
  const visibleRect = { x: 6538, y: 10756, w: 4884, h: 2237 };
  const ctx = {
    aiColor: "#2679b8",
    scale: 0.23,
    widgetSlots: 8,
    visibleRect,
    sceneItems: [],
    widgetGeometry: widgetGeometryForViewport(visibleRect),
  };
  // The reported turn's shape: `kind` + nested `box`, no flat x/y/w/h. Before
  // the fix all four numbers were lost and the engine invented a position.
  const { commands } = validateCommands(
    [{ kind: "html_widget", title: "Solar", box: { x: 6840, y: 11140, w: 3400, h: 1180 }, html: "<div>x</div>" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx as any
  );
  assert.equal(commands.length, 1);
  const cmd = commands[0] as { tool: string; x: number; y: number; w: number; h: number };
  assert.equal(cmd.tool, "html_widget");
  assert.equal(cmd.x, 6840, "nested box.x must survive");
  assert.equal(cmd.y, 11140, "nested box.y must survive");
  assert.ok(cmd.w > 1000, `width must come from box.w, got ${cmd.w}`);
});

await test("D12 canvas_edit accepts the op key under any common alias", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  const fn = src.slice(src.indexOf("function canonicalEditOp"), src.indexOf("async function execEdit"));
  for (const alias of ["rec.kind", "rec.type", "rec.operation"]) {
    assert.ok(fn.includes(alias), `canonicalEditOp must accept ${alias}`);
  }
  // And an unknown op must name the right key instead of echoing an empty string.
  const exec = src.slice(src.indexOf("async function execEdit"), src.indexOf("async function execLoadPlugin"));
  assert.ok(exec.includes('under the key "op"'), "the rejection must state the expected key");
  assert.ok(!exec.includes("Unknown op: ${op}"), "the old opaque rejection message must be gone");
});

await test("D13 apply echoes the engine's placement override so the model stops fighting it", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  assert.ok(src.includes("requestedWidgetBox"), "apply must capture the requested box");
  assert.ok(/requested: requestedBox/.test(src), "apply must report requested when it differs");
  assert.ok(
    AGENT_SYSTEM_PROMPT.includes("applied[].requested"),
    "the prompt must tell the model what applied[].requested means"
  );
});

await test("D14 a repeatedly failing tool ends tool use for the turn", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductor.ts"), "utf8");
  assert.ok(src.includes("AGENT_MAX_CONSECUTIVE_FAILURES"), "the fuse constant must be enforced");
  assert.ok(src.includes("policy.failStreak"), "consecutive failures must be tracked");
  assert.ok(/if \(policy\.stopped\)/.test(src), "the stop must be sticky for the rest of the turn");
  assert.ok(
    AGENT_SYSTEM_PROMPT.includes("NEVER re-send a call that just failed unchanged"),
    "the prompt must forbid re-sending an identical failing call"
  );
});

await test("D15 the final answer is the closing message, not every interim progress line", () => {
  const conductor = fs.readFileSync(path.join(ROOT, "lib/ai/conductor.ts"), "utf8");
  assert.ok(/sink\.text = "";/.test(conductor), "text before a tool call must be discarded");
  assert.ok(conductor.includes("message: finalText"), "the log must record the closing message only");
  assert.ok(
    !/stepsLog\.filter\(\(s\) => s\.text\)/.test(conductor),
    "the log must not concatenate every step's text into the response"
  );
  const sessions = fs.readFileSync(path.join(ROOT, "lib/ai/dsh/sessions.ts"), "utf8");
  const onToolCall = sessions.slice(sessions.indexOf('if (type === "tool/call")'), sessions.indexOf('if (type === "tool/result")'));
  assert.ok(
    onToolCall.includes('conversation.lastText = ""'),
    "the server projection must reset its text accumulator on a tool call"
  );
});

await test("D16 tool_request is emitted on dispatch, never from the raw tool/call event", () => {
  // tool/call is recorded before the tool validates its arguments, so
  // projecting it made the browser mutate the canvas for calls the runtime then
  // rejected — a mutation the model was told never happened.
  const bridge = fs.readFileSync(path.join(ROOT, "lib/ai/dsh/bridge.ts"), "utf8");
  assert.ok(bridge.includes("setBridgeDispatcher"), "the bridge must own the dispatch hook");
  assert.ok(/dispatchers\.get\(conversationId\)\?\.\(/.test(bridge), "dispatch must notify the open turn stream");
  const sessions = fs.readFileSync(path.join(ROOT, "lib/ai/dsh/sessions.ts"), "utf8");
  const projection = sessions.slice(sessions.indexOf("function projectSessionEvent"), sessions.indexOf("export async function disposeConversation"));
  assert.ok(!projection.includes('event: "tool_request"'), "the session projection must not emit tool_request");
  assert.ok(sessions.includes("setBridgeDispatcher(opts.conversationId"), "the turn must register a dispatcher");
});

await test("D17 a second create of the same widget title is refused, not cleaned up later", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductor.ts"), "utf8");
  assert.ok(src.includes("DUPLICATE_WIDGET"), "a repeat create must be refused with a dedicated code");
  assert.ok(src.includes("policy.createdWidgets"), "created widget titles must be tracked per turn");
  assert.ok(src.includes("function widgetTitleOf"), "the title must be read off the apply arguments");
  assert.ok(
    AGENT_SYSTEM_PROMPT.includes("DUPLICATE_WIDGET"),
    "the prompt must name the rejection so the model refines instead of retrying"
  );
});

// ---------------------------------------------------------------------------
// E. concurrency & step economy
// ---------------------------------------------------------------------------
console.log("\nE. concurrency & step economy");

type FakeItem = { id: string; kind: string; status: string; html?: string; copyText?: string; source?: string };

function fakeManagers(widgets: FakeItem[], objects: FakeItem[]) {
  return {
    widgets: {
      all: () => widgets,
      get: (id: string) => widgets.find((w) => w.id === id),
    },
    objects: {
      all: () => objects,
      get: (id: string) => objects.find((o) => o.id === id),
    },
  };
}

const FAKE_ENGINE = { tiles: { keys: () => [] as string[] } };

await test("E1 boardFingerprint ignores geometry, tracks identity/content/ink", async () => {
  const { boardFingerprint } = await import("../lib/canvas/fingerprint");
  const w = { id: "w1", kind: "diagram", status: "accepted", html: "<p>a</p>", copyText: "graph TD" };
  const o = { id: "o1", kind: "text", status: "accepted", source: "hello" };
  const m = fakeManagers([w], [o]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp = (ink: number) => boardFingerprint(FAKE_ENGINE as any, m.widgets as any, m.objects as any, ink);

  const base = fp(0);
  // A widget iframe self-fitting from 620x760 to 292x422 must NOT invalidate a
  // pending agent mutation — this is the REVISION_CONFLICT storm's root cause.
  Object.assign(w, { x: 10, y: 20, w: 292, h: 422 });
  assert.equal(fp(0), base, "geometry must not change the fingerprint");

  assert.notEqual(fp(1), base, "ink epoch must change the fingerprint");

  w.html = "<p>ab</p>";
  assert.notEqual(fp(0), base, "widget content must change the fingerprint");
  w.html = "<p>a</p>";
  assert.equal(fp(0), base);

  o.source = "hello there";
  assert.notEqual(fp(0), base, "object content must change the fingerprint");
});

await test("E2 trackedSceneSignature sees foreign deletes/edits, ignores untracked new items", async () => {
  const { trackedSceneSignature } = await import("../lib/canvas/fingerprint");
  const widgets: FakeItem[] = [{ id: "w1", kind: "diagram", status: "accepted", html: "12345" }];
  const objects: FakeItem[] = [{ id: "o1", kind: "text", status: "accepted", source: "abc" }];
  const m = fakeManagers(widgets, objects);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = () => trackedSceneSignature(m.widgets as any, m.objects as any, ["w1", "o1"]);

  const before = sig();
  // The apply's own new item is not on the watchlist, so it never registers.
  widgets.push({ id: "w2", kind: "html", status: "draft", html: "new" });
  assert.equal(sig(), before, "items created by the apply must not self-conflict");

  // A concurrent geometry shift on a watched item is still tolerated.
  Object.assign(widgets[0], { x: 99, y: 99 });
  assert.equal(sig(), before);

  // A foreign content edit and a foreign delete both must register.
  objects[0].source = "abcd";
  assert.notEqual(sig(), before);
  objects[0].source = "abc";
  assert.equal(sig(), before);
  objects.length = 0;
  assert.notEqual(sig(), before, "a concurrent delete must be detected");
});

await test("E3 conflict check is content-derived, never a bare revision comparison", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  const fn = src.slice(src.indexOf("function revisionConflict"), src.indexOf("async function execScan"));
  assert.ok(fn.includes("deps.fingerprintAt("), "revisionConflict must consult the observed fingerprint");
  assert.ok(fn.includes("deps.getFingerprint()"), "revisionConflict must compare against the live fingerprint");
  // The async-gap guards must not fall back to raw counter comparisons either.
  assert.ok(
    !/!==\s*currentRevision/.test(src),
    "no executor may reject a mutation on a bare revision inequality"
  );
});

await test("E4 layout-review gate arms only on unknown widget geometry, not on deletes", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  const apply = src.slice(src.indexOf("const widgetMutated ="), src.indexOf("async function execEdit"));
  assert.ok(!apply.includes("removed_widget"), "deleting a widget must not force a layout-review snapshot");
  const edit = src.slice(src.indexOf("async function execEdit"), src.indexOf("async function execRead"));
  assert.ok(edit.includes("widgetReflowed"), "canvas_edit must gate on reflow, not on any widget touch");
  const reflowIdx = edit.indexOf("widgetReflowed = true");
  const resizeIdx = edit.indexOf('op === "resize_object"');
  const deleteIdx = edit.indexOf('op === "delete_object"');
  assert.ok(reflowIdx > resizeIdx && reflowIdx < deleteIdx, "only resize_object may arm the gate");
});

await test("E5 canvas_snapshot returns the scene so no follow-up canvas_scan is needed", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  const snap = src.slice(src.indexOf("async function execSnapshot"), src.indexOf("function applyContext"));
  assert.ok(snap.includes("buildScene("), "snapshot must build the scene list");
  assert.ok(/items:\s*sceneItems/.test(snap), "snapshot must return items[]");
  assert.ok(snap.includes("counts:"), "snapshot must return counts");
  assert.ok(
    AGENT_SYSTEM_PROMPT.includes("Never follow a snapshot with canvas_scan"),
    "the prompt must tell the model the snapshot already carries the scene"
  );
});

await test("E6 a conflict tells the model to retry directly instead of re-scanning", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductorTools.ts"), "utf8");
  const fn = src.slice(src.indexOf("function revisionConflict"), src.indexOf("async function execScan"));
  assert.ok(/retry this same call with baseRevision/.test(fn), "the error must carry the retry instruction");
  assert.ok(fn.includes("{ currentRevision }"), "the error must carry currentRevision as data");
  assert.ok(
    AGENT_SYSTEM_PROMPT.includes("retry the SAME call immediately with baseRevision"),
    "the prompt must forbid a reflexive re-scan after a conflict"
  );
});

await test("E7 seed history caps what leaves the browser (server owns model history)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductor.ts"), "utf8");
  const seed = src.slice(src.indexOf("private seedHistory"));
  assert.ok(seed.includes("out.length < 60"), "seed must cap entry count");
  assert.ok(seed.includes("24_000"), "seed must cap characters");
  assert.ok(seed.includes("[called ${m.toolCall.name}]"), "seed must note prior tool calls");
});

await test("E8 turn logs report peak input and bump attribution, not only cumulative tokens", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/conductor.ts"), "utf8");
  assert.ok(src.includes("peakInputTokens: this.turnPeakInput"), "log must carry peak single-step input");
  assert.ok(src.includes("billedSteps: this.turnSteps"), "log must carry the billed step count");
  assert.ok(src.includes("revisionBumps: this.turnRevisionBumps()"), "log must carry bump attribution");
  const app = fs.readFileSync(path.join(ROOT, "components/canvas/CanvasApp.tsx"), "utf8");
  assert.ok(app.includes("revisionAuditRef"), "the revision counter must attribute its bumps");
});

await test("E9 gesture-end handlers only bump the revision when a gesture happened", () => {
  const app = fs.readFileSync(path.join(ROOT, "components/canvas/CanvasApp.tsx"), "utf8");
  // pointerup/pointercancel fire on drag bars and resize handles even with no
  // drag in flight; an unconditional bump there rejects the agent's next call.
  const guardedDrag = app.match(/if \(wasDragging\) afterBoardChangeRef\.current\(\);/g) ?? [];
  const guardedResize = app.match(/if \(wasResizing\) afterBoardChangeRef\.current\(\);/g) ?? [];
  assert.equal(guardedDrag.length, 2, "both widget and object onDragEnd must be guarded");
  assert.equal(guardedResize.length, 2, "both widget and object onResizeEnd must be guarded");
});

// ---------------------------------------------------------------------------
// F. HTTP integration (real Next server + fake OpenAI-compatible model)
// ---------------------------------------------------------------------------
console.log("\nF. HTTP integration");

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
  mode: "text" | "tool" | "two-tools" | "bad-edit" | "summary";
  streamHits: number;
} = { lastBody: null, lastAuth: null, mode: "text", streamHits: 0 };

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
  if (mode === "bad-edit") {
    // operations[].kind instead of .op — the exact shape from the reported turn.
    return (
      frame({ role: "assistant", content: null }) +
      frame({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: {
              name: "canvas_edit",
              arguments: '{"baseRevision":7,"operations":[{"kind":"resize_object","objectId":"w1","w":10,"h":10}]}',
            },
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
        {
          index: 1,
          id: "call_2",
          type: "function",
          function: { name: "canvas_focus", arguments: '{"target":"canvas"}' },
        },
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
    // Stateful: after a tool batch is answered the loop calls again; answer
    // with final text so the turn terminates instead of ping-ponging.
    modelState.streamHits += 1;
    const followUp = modelState.streamHits % 2 === 0;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(followUp ? sseChunksFor("text") : sseChunksFor(modelState.mode));
  });
});

// --- Session seeding: the agent routes require a real better-auth session. ---
const TEST_USER_EMAIL = "drawva-agent-check@localhost";
const SESSION_TOKEN = `test-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let sessionCookie = "";

async function seedSession(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET || "";
  if (!databaseUrl) throw new Error("DATABASE_URL missing for session seeding");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${`test-user-${SESSION_TOKEN}`}, 'Agent Check', ${TEST_USER_EMAIL}, true, now(), now())
    ON CONFLICT (email) DO NOTHING`;
  const userId = (await sql`SELECT id FROM "user" WHERE email = ${TEST_USER_EMAIL}`)[0]?.id as string;
  await sql`INSERT INTO "session" (id, expires_at, token, created_at, updated_at, user_id)
    VALUES (${`test-session-row-${SESSION_TOKEN}`}, now() + interval '1 hour', ${SESSION_TOKEN}, now(), now(), ${userId})`;
  const signature = createHmac("sha256", secret).update(SESSION_TOKEN).digest("base64");
  const value = encodeURIComponent(`${SESSION_TOKEN}.${signature}`);
  // Send both plain and __Secure- prefixed names; the server matches whichever it uses.
  sessionCookie = `better-auth.session_token=${value}; __Secure-better-auth.session_token=${value}`;
}

async function cleanupSession(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM "session" WHERE token = ${SESSION_TOKEN}`;
    await sql`DELETE FROM "user" WHERE email = ${TEST_USER_EMAIL}`;
  } catch (err) {
    console.warn("session cleanup failed:", err instanceof Error ? err.message : err);
  }
}

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
      // 401 is fine: the route is up, it just demands a session.
      if (res.ok || res.status === 404 || res.status === 401) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server not ready at ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${APP}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
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

function wireToolNames(body: ModelBody): string[] {
  return (body.tools ?? []).map((entry) => {
    const rec = entry as { name?: string; function?: { name?: string } };
    return rec.function?.name ?? rec.name ?? "";
  });
}

const CANVAS_TOOL_NAMES = [
  "canvas_scan",
  "canvas_snapshot",
  "canvas_apply",
  "canvas_edit",
  "load_plugin",
  "canvas_read",
  "canvas_patch_widget",
  "canvas_undo",
  "canvas_focus",
];

const SEARCH_TOOL_NAMES = [
  "web_search",
  "github_repository_search",
  "stock_symbol_search",
  "stock_market_data",
];

let conversationSeq = 0;
const freshConversation = () => `t${Date.now().toString(36)}${(conversationSeq += 1)}`;

const validStepBase = {
  conversation: freshConversation(),
  providerType: "custom",
  baseUrl: MODEL_URL,
  apiKey: API_KEY,
  model: "fake-model",
  loadedPluginIds: ["weather"],
  webSearch: false,
  text: "hi, draw a cat",
};

let nextProc: ReturnType<typeof spawn> | null = null;

try {
  await startServer(fakeModel, MODEL_PORT);
  await seedSession();
  nextProc = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitFor(`${APP}/api/plugins`, 60_000);

  await test("E0 unauthenticated requests are rejected", async () => {
    const res = await post_unauthed("/api/canvas/agent/step", validStepBase);
    assert.equal(res.status, 401);
    const res2 = await fetch(`${APP}/api/plugins`);
    assert.equal(res2.status, 401);
  });

  await test("E1 step rejects client-sent prompt text", async () => {
    const res = await post("/api/canvas/agent/step", { ...validStepBase, systemPrompt: "hi" });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes("prompt text"));
  });

  await test("E2 step validates required apiKey and modelId", async () => {
    const res = await post("/api/canvas/agent/step", { ...validStepBase, model: "" });
    assert.equal(res.status, 400);
    const res2 = await post("/api/canvas/agent/step", { ...validStepBase, apiKey: "" });
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

  await test("E4 step rejects unknown plugin ids in loadedPluginIds", async () => {
    const res = await post("/api/canvas/agent/step", {
      ...validStepBase,
      loadedPluginIds: ["weather", "not-a-plugin"],
    });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes("not-a-plugin"));
  });

  await test("E5 step rejects missing text; conversation suffix is optional (session-owned)", async () => {
    assert.equal((await post("/api/canvas/agent/step", { ...validStepBase, text: undefined })).status, 400);
    assert.equal((await post("/api/canvas/agent/step", { ...validStepBase, text: "  " })).status, 400);
    // No conversation suffix → the user session owns a default conversation.
    const noConversation = { ...validStepBase, conversation: undefined };
    const res = await post("/api/canvas/agent/step", noConversation);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") || "").includes("text/event-stream"));
    await readSseText(res);
  });

  await test("E6 plugins ?doc= returns full card; unknown 404s", async () => {
    const res = await fetch(`${APP}/api/plugins?doc=weather`, { headers: { cookie: sessionCookie } });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { plugin?: { id: string; document: string } };
    assert.equal(data.plugin?.id, "weather");
    assert.ok(data.plugin!.document.includes("drawva-plugin"));
    const res2 = await fetch(`${APP}/api/plugins?doc=not-a-plugin`, { headers: { cookie: sessionCookie } });
    assert.equal(res2.status, 404);
  });

  await test("E7 step E2E: streams text, server-composed prompt, tools bound, key forwarded, plugin contract injected", async () => {
    modelState.mode = "text";
    modelState.streamHits = 0;
    const res = await post("/api/canvas/agent/step", { ...validStepBase, conversation: freshConversation() });
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") || "").includes("text/event-stream"));
    const rawText = await readSseText(res);
    const events = sseEvents(rawText);
    const joined = events
      .filter((e) => e.event === "text_delta")
      .map((e) => String(e.data.text || ""))
      .join("");
    assert.equal(joined, "Hello world.");
    const final = events.filter((e) => e.event === "final");
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
    // loadedPluginIds → durable contract section in the system prompt
    assert.ok(String(msgs[0].content).includes("PLUGIN CONTRACT (durable)"));
    const toolNames = wireToolNames(body);
    for (const name of CANVAS_TOOL_NAMES) {
      assert.ok(toolNames.includes(name), `missing ${name}`);
    }
    // webSearch:false in the request → the whole search family stays unbound.
    for (const name of SEARCH_TOOL_NAMES) {
      assert.ok(!toolNames.includes(name), `${name} bound despite webSearch:false`);
    }
  });

  // Opens a turn stream and answers every tool_request via /tool-result,
  // like the browser conductor does. Resolves with all streamed events.
  async function runTurnAnsweringTools(
    body: Record<string, unknown>,
    answer: (name: string, args: unknown) => unknown
  ): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
    const conversation = String(body.conversation);
    const res = await post("/api/canvas/agent/step", body);
    assert.equal(res.status, 200);
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const answered = new Set<string>();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 90_000;
    let sawFinal = false;
    const pump = async (): Promise<void> => {
      for (;;) {
        if (Date.now() > deadline) throw new Error("turn stream timed out");
        const { done, value } = await reader.read();
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const dataLine = /^data: (.+)$/m.exec(block)?.[1];
          if (!event || !dataLine) continue;
          let data: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(dataLine) as unknown;
            if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
          } catch {}
          events.push({ event, data });
          if (event === "tool_request") {
            const toolCallId = String(data.toolCallId || "");
            if (toolCallId && !answered.has(toolCallId)) {
              answered.add(toolCallId);
              const result = answer(String(data.name || ""), data.args);
              const answerRes = await post("/api/canvas/agent/tool-result", {
                conversation,
                toolCallId,
                result,
              });
              assert.equal(answerRes.status, 200);
            }
          }
          if (event === "final" || event === "error") sawFinal = true;
        }
        if (sawFinal) {
          // Drain remaining frames, then stop reading.
          await reader.cancel().catch(() => {});
          return;
        }
      }
    };
    await pump();
    return events;
  }

  await test("E8 step E2E: tool_request bridges to tool-result and the turn finishes", async () => {
    modelState.mode = "tool";
    modelState.streamHits = 0;
    const seen: string[] = [];
    const events = await runTurnAnsweringTools(
      { ...validStepBase, conversation: freshConversation() },
      (name, args) => {
        seen.push(name);
        assert.equal(name, "canvas_scan");
        assert.deepEqual(args, { scope: "all" });
        return { revision: 7, objects: [] };
      }
    );
    assert.deepEqual(seen, ["canvas_scan"]);
    const ends = events.filter((e) => e.event === "tool_end");
    assert.equal(ends.length, 1);
    assert.equal(ends[0].data.ok, true);
    assert.ok(events.some((e) => e.event === "final"));
    assert.equal(events.filter((e) => e.event === "error").length, 0);
  });

  await test("E9 step E2E: serial tool loop answers every request in order", async () => {
    modelState.mode = "two-tools";
    modelState.streamHits = 0;
    const seen: string[] = [];
    const events = await runTurnAnsweringTools(
      { ...validStepBase, conversation: freshConversation() },
      (name) => {
        seen.push(name);
        return { ok: true };
      }
    );
    assert.deepEqual(seen, ["canvas_scan", "canvas_focus"]);
    assert.ok(events.some((e) => e.event === "final"));
    assert.equal(events.filter((e) => e.event === "error").length, 0);
  });

  await test("E10 step E2E: prior turns seed the conversation as provider-visible context", async () => {
    modelState.mode = "text";
    modelState.streamHits = 0;
    const res = await post("/api/canvas/agent/step", {
      ...validStepBase,
      conversation: freshConversation(),
      text: "continue the task",
      history: [
        { role: "user", text: "first question about widgets" },
        { role: "assistant", text: "created widget-1" },
      ],
    });
    assert.equal(res.status, 200);
    await readSseText(res);
    const wireText = JSON.stringify(modelState.lastBody!.messages!);
    assert.ok(wireText.includes("first question about widgets"), "prior user turn missing from wire messages");
    assert.ok(wireText.includes("created widget-1"), "prior assistant turn missing from wire messages");
  });

  await test("E11 step E2E: a mis-keyed canvas_edit is rejected before it reaches the browser", async () => {
    // The reported turn sent operations[].kind nine times and got
    // `Unknown op: ` back from the executor. With the schema declared, the
    // runtime rejects the call pre-dispatch and the browser never sees it.
    modelState.mode = "bad-edit";
    modelState.streamHits = 0;
    const seen: string[] = [];
    const events = await runTurnAnsweringTools(
      { ...validStepBase, conversation: freshConversation() },
      (name) => {
        seen.push(name);
        return { ok: true };
      }
    );
    assert.deepEqual(seen, [], "an invalid tool call must never bridge to the canvas");
    const ends = events.filter((e) => e.event === "tool_end");
    assert.equal(ends.length, 1);
    assert.equal(ends[0].data.ok, false, "the invalid call must be reported as a failed tool");
    assert.ok(events.some((e) => e.event === "final"), "the turn must still finish with an answer");
  });

  await test("E13 step E2E: the search flag gates both the tool list and the prompt state line", async () => {
    modelState.mode = "text";
    modelState.streamHits = 0;
    await readSseText(
      await post("/api/canvas/agent/step", { ...validStepBase, conversation: freshConversation(), webSearch: true })
    );
    const onNames = wireToolNames(modelState.lastBody!);
    for (const name of SEARCH_TOOL_NAMES) {
      assert.ok(onNames.includes(name), `missing ${name}`);
    }
    assert.ok(String(modelState.lastBody!.messages![0].content).includes("Internet search is ENABLED"));

    await readSseText(
      await post("/api/canvas/agent/step", { ...validStepBase, conversation: freshConversation(), webSearch: false })
    );
    const offNames = wireToolNames(modelState.lastBody!);
    for (const name of SEARCH_TOOL_NAMES) {
      assert.ok(!offNames.includes(name), `${name} bound despite webSearch:false`);
    }
    assert.ok(String(modelState.lastBody!.messages![0].content).includes("Internet search is DISABLED"));
  });

  await test("E14 web route rejects unknown names, bad args, and unauthenticated callers", async () => {
    assert.equal((await post_unauthed("/api/canvas/web", { name: "web_search", args: { query: "x" } })).status, 401);
    const unknown = await post("/api/canvas/web", { name: "definitely_not_a_tool", args: {} });
    assert.equal(unknown.status, 400);
    assert.equal(((await unknown.json()) as { code?: string }).code, "INVALID_ARGUMENT");
    const badArgs = await post("/api/canvas/web", { name: "web_read", args: { urls: [] } });
    assert.equal(badArgs.status, 400);
    assert.equal(((await badArgs.json()) as { code?: string }).code, "INVALID_ARGUMENT");
  });

  await test("E15 step E2E: image turn admits the snapshot and streams text", async () => {
    modelState.mode = "text";
    modelState.streamHits = 0;
    // 1x1 PNG, like the conductor's canvas atlas snapshots.
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const res = await post("/api/canvas/agent/step", {
      ...validStepBase,
      conversation: freshConversation(),
      text: "what is in this image",
      images: [{ id: "img-atlas-test", dataUrl: tinyPng }],
    });
    assert.equal(res.status, 200);
    const events = sseEvents(await readSseText(res));
    assert.equal(events.filter((e) => e.event === "error").length, 0);
    const joined = events
      .filter((e) => e.event === "text_delta")
      .map((e) => String(e.data.text || ""))
      .join("");
    assert.equal(joined, "Hello world.");
    // The image must reach the model as vision content.
    const wireImages = JSON.stringify(modelState.lastBody!.messages!).includes("image");
    assert.ok(wireImages, "no image content reached the model wire request");
  });
} finally {
  if (nextProc && !nextProc.killed) {
    nextProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    nextProc.kill("SIGKILL");
  }
  await stopServer(fakeModel);
  await cleanupSession();
}

async function post_unauthed(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${APP}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
