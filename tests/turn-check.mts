/**
 * turn-check.mts — turn-completion regression suite.
 *
 * Boots the REAL Next server and the REAL DSH agent runtime, then drives them
 * with a scripted OpenAI-compatible provider so the model's behaviour is fully
 * controlled. No AI provider is involved, so nothing observed here can be
 * explained away as a provider fault.
 *
 * Guards the failure family behind "The AI model returned an empty response":
 *   A  tool call -> text                    happy path
 *   B  tool call with NO id                 proxies that omit tool_calls[].id
 *   C  text emitted alongside the tool call preamble must not become the answer
 *   D  stream cut after the tool result     serverless timeout / dropped connection
 *   E  reasoning-only reply                 R1-style models that think then stop
 *   F  whitespace-only reply
 *   G  finish_reason=length mid tool call   output cap drops the call entirely
 *   H  finish_reason=length on text         partial answer must still land
 *
 * Requires DATABASE_URL and BETTER_AUTH_SECRET; run via `pnpm test:turn`.
 */

import assert from "node:assert";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = 4223;
const MODEL_PORT = 4224;
const APP = `http://127.0.0.1:${APP_PORT}`;
const MODEL_URL = `http://127.0.0.1:${MODEL_PORT}/v1`;
const API_KEY = "repro-key";

type Script =
  | "toolThenText"
  | "toolNoIdThenText"
  | "textWithToolThenText"
  | "toolThenReasoningOnly"
  | "toolThenEmptyText"
  | "toolThenTruncatedToolCall"
  | "toolThenTruncatedText";

const state: {
  script: Script;
  hits: number;
  requests: Array<{ n: number; roles: string[]; toolResults: number }>;
} = { script: "toolThenText", hits: 0, requests: [] };

const enc = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
  enc({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] });
const usage = () =>
  enc({ id: "c1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } });

function toolFrame(id: string | undefined, name: string, args: string): string {
  const call: Record<string, unknown> = { index: 0, type: "function", function: { name, arguments: args } };
  if (id !== undefined) call.id = id;
  return frame({ tool_calls: [call] });
}

const fakeModel = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body: { stream?: boolean; messages?: Array<{ role: string }> } = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    if (body.stream !== true) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "c2", choices: [{ index: 0, message: { role: "assistant", content: "SUMMARY" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 3 } }));
      return;
    }
    state.hits += 1;
    const roles = (body.messages ?? []).map((m) => m.role);
    state.requests.push({ n: state.hits, roles, toolResults: roles.filter((r) => r === "tool").length });
    const first = state.hits === 1;
    res.writeHead(200, { "content-type": "text/event-stream" });

    if (first && state.script === "toolThenText") {
      res.end(frame({ role: "assistant", content: null }) + toolFrame("call_1", "canvas_scan", '{"scope":"all"}') + frame({}, "tool_calls") + usage() + "data: [DONE]\n\n");
      return;
    }
    if (first && state.script === "toolNoIdThenText") {
      // A proxy that omits tool_calls[].id entirely.
      res.end(frame({ role: "assistant", content: null }) + toolFrame(undefined, "canvas_scan", '{"scope":"all"}') + frame({}, "tool_calls") + usage() + "data: [DONE]\n\n");
      return;
    }
    if (first && state.script === "textWithToolThenText") {
      res.end(
        frame({ role: "assistant", content: "Let me check the board first. " }) +
          toolFrame("call_1", "canvas_scan", '{"scope":"all"}') +
          frame({}, "tool_calls") + usage() + "data: [DONE]\n\n"
      );
      return;
    }
    // Every later request: a plain-text final answer, no tool call.
    if (state.script === "toolThenReasoningOnly") {
      // Reasoning-only reply: the model "thinks" but emits no text block.
      res.end(
        frame({ role: "assistant", content: null }) +
          frame({ reasoning_content: "The user wants tech news. I already searched. " }) +
          frame({ reasoning_content: "I should now write it to the canvas." }) +
          frame({}, "stop") + usage() + "data: [DONE]\n\n"
      );
      return;
    }
    if (state.script === "toolThenEmptyText") {
      // Whitespace-only text: assembler keeps a block, but it trims to nothing.
      res.end(frame({ role: "assistant", content: "  " }) + frame({ content: "\n" }) + frame({}, "stop") + usage() + "data: [DONE]\n\n");
      return;
    }
    if (state.script === "toolThenTruncatedToolCall") {
      // finish_reason=length while a tool call was mid-stream. The assembler DROPS
      // truncated tool calls (they cannot be dispatched safely), leaving a message
      // with no text and no tool call, and the loop reports max-tokens.
      res.end(
        frame({ role: "assistant", content: null }) +
          toolFrame("call_2", "canvas_apply", '{"baseRevision":7,"commands":[{"tool":"html_widget","html":"<div>partial') +
          frame({}, "length") + usage() + "data: [DONE]\n\n"
      );
      return;
    }
    if (state.script === "toolThenTruncatedText") {
      // finish_reason=length on a text answer: the text IS kept by the assembler.
      res.end(frame({ role: "assistant", content: "Here are the head" }) + frame({}, "length") + usage() + "data: [DONE]\n\n");
      return;
    }
    res.end(frame({ role: "assistant", content: "Here are the headlines " }) + frame({ content: "for this week." }) + frame({}, "stop") + usage() + "data: [DONE]\n\n");
  });
});

const TEST_EMAIL = "drawva-repro@localhost";
const TOKEN = `repro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let cookie = "";

async function seedSession(): Promise<void> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${`u-${TOKEN}`}, 'Repro', ${TEST_EMAIL}, true, now(), now()) ON CONFLICT (email) DO NOTHING`;
  const userId = (await sql`SELECT id FROM "user" WHERE email = ${TEST_EMAIL}`)[0]?.id as string;
  await sql`INSERT INTO "session" (id, expires_at, token, created_at, updated_at, user_id)
    VALUES (${`s-${TOKEN}`}, now() + interval '1 hour', ${TOKEN}, now(), now(), ${userId})`;
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET || "").update(TOKEN).digest("base64");
  const v = encodeURIComponent(`${TOKEN}.${sig}`);
  cookie = `better-auth.session_token=${v}; __Secure-better-auth.session_token=${v}`;
}

async function cleanup(): Promise<void> {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "session" WHERE token = ${TOKEN}`;
    await sql`DELETE FROM "user" WHERE email = ${TEST_EMAIL}`;
  } catch {}
}

const post = (p: string, body: unknown) =>
  fetch(`${APP}${p}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

async function waitFor(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404 || r.status === 401) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`not ready: ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

interface Ev { event: string; data: Record<string, unknown> }

/**
 * Drive one turn exactly the way lib/ai/conductor.ts does, and report the
 * decision the conductor would reach. Mirrors pumpTurnStream (sink handling, the
 * sawFinal guard, the stream-end fallthrough) and runTurn's error naming, so an
 * assertion here is an assertion about shipped client behaviour.
 */
async function driveTurn(opts: {
  conversation: string;
  answerWith?: (name: string, id: string) => unknown;
  cutAfterToolResult?: boolean;
}): Promise<{
  events: Ev[];
  sinkText: string;
  outcome: string;
  sawFinal: boolean;
  /** What the conductor concludes: a usable answer, or a named error. */
  verdict: "answer" | "error";
  answer: string;
  errorMessage: string;
  elapsedMs: number;
}> {
  const started = Date.now();
  const res = await post("/api/canvas/agent/step", {
    conversation: opts.conversation,
    providerType: "custom",
    baseUrl: MODEL_URL,
    apiKey: API_KEY,
    model: "fake-model",
    loadedPluginIds: [],
    webSearch: false,
    text: "Observe the canvas and answer.",
  });
  assert.equal(res.status, 200);

  const events: Ev[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let sink = "";
  let sawFinal = false;
  let reasoningOnly = false;
  let toolSteps = 0;
  let serverError = "";
  let outcome = "stream_end_no_final";
  const deadline = Date.now() + 100_000;

  outer: for (;;) {
    if (Date.now() > deadline) { outcome = "harness_timeout"; break; }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep = buf.indexOf("\n\n");
    while (sep >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const dataLine = /^data: (.+)$/m.exec(block)?.[1];
      sep = buf.indexOf("\n\n");
      if (!event || !dataLine) continue;
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(dataLine) as Record<string, unknown>; } catch { continue; }
      events.push({ event, data });

      if (event === "text_delta" && typeof data.text === "string") sink += data.text;
      else if (event === "tool_request" && typeof data.name === "string") {
        sink = "";                                        // conductor: preamble is not the answer
        toolSteps += 1;
        const id = String(data.toolCallId || `call-${Date.now()}`);
        const result = opts.answerWith ? opts.answerWith(String(data.name), id) : { ok: true, revision: 7, items: [] };
        const ans = await post("/api/canvas/agent/tool-result", { conversation: opts.conversation, toolCallId: id, result });
        events.push({ event: "__tool_result_http", data: { status: ans.status, sentId: id, serverId: String(data.toolCallId ?? "") } });
        if (opts.cutAfterToolResult) { outcome = "client_cut_stream"; await reader.cancel().catch(() => {}); break outer; }
      } else if (event === "final") {
        sawFinal = true;
        if (typeof data.text === "string" && data.text) sink = data.text;
        if (data.reasoningOnly === true) reasoningOnly = true;
        outcome = "final"; break outer;
      } else if (event === "error") {
        serverError = String(data.message || "Agent turn failed.");
        outcome = "error"; break outer;
      }
    }
  }

  // ---- conductor.pumpTurnStream: the stream-end fallthrough ----
  let verdict: "answer" | "error";
  let errorMessage = "";
  if (outcome === "error") {
    verdict = "error";
    errorMessage = serverError;
  } else if (!sawFinal) {
    if (sink.trim()) { verdict = "answer"; }
    else {
      verdict = "error";
      errorMessage = "The connection to the agent closed before it finished. Nothing was lost on the canvas — ask again to continue.";
    }
  } else if (sink.trim()) {
    verdict = "answer";
  } else {
    // ---- conductor.runTurn: name the actual cause ----
    verdict = "error";
    errorMessage = reasoningOnly
      ? "The model finished thinking but never wrote an answer or called a tool. Retry, or pick a model with stronger tool-calling support in Settings."
      : toolSteps > 0
        ? "The model ran tools but never produced a final answer. Retry — the canvas is unchanged."
        : "The AI model returned an empty response with no output. Please try again or switch model in Settings.";
  }

  return { events, sinkText: sink, outcome, sawFinal, verdict, answer: sink.trim(), errorMessage, elapsedMs: Date.now() - started };
}

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? `  :: ${d}` : ""}`); }
};

let next: ReturnType<typeof spawn> | null = null;
let seq = 0;
const fresh = () => `r${Date.now().toString(36)}${(seq += 1)}`;

try {
  await new Promise<void>((r) => fakeModel.listen(MODEL_PORT, "127.0.0.1", r));
  await seedSession();
  next = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog: string[] = [];
  const capture = (d: unknown) => {
    const s = String(d);
    serverLog.push(s);
    for (const line of s.split("\n")) if (line.includes("[PROBE]")) console.log("   " + line.trim());
  };
  next.stdout?.on("data", capture);
  next.stderr?.on("data", capture);
  await waitFor(`${APP}/api/plugins`, 90_000);

  // ---------------------------------------------------------------- A
  console.log("\nA  tool call -> text  (baseline: does the answer survive at all?)");
  state.script = "toolThenText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}`);
    console.log(`   events: ${r.events.map((e) => e.event).join(" -> ")}`);
    console.log(`   final payload = ${JSON.stringify(final?.data ?? null)}\n   clientSink=${JSON.stringify(r.sinkText)}`);
    console.log(`   2nd request saw tool results: ${state.requests[1]?.toolResults ?? 0}`);
    check("A1 the tool result reached the model", (state.requests[1]?.toolResults ?? 0) > 0, JSON.stringify(state.requests));
    check("A2 final carries the model's text", (final?.data.text as string) === "Here are the headlines for this week.", JSON.stringify(final?.data.text));
    check("A3 the client's own sink is non-empty", r.sinkText.length > 0, JSON.stringify(r.sinkText));
    check("A4 the conductor's verdict is a usable answer", r.verdict === "answer", `verdict=${r.verdict} msg=${r.errorMessage}`);
  }

  // ---------------------------------------------------------------- B
  console.log("\nB  tool call with NO id  (proxy omits tool_calls[].id)");
  state.script = "toolNoIdThenText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const httpRow = r.events.find((e) => e.event === "__tool_result_http");
    const final = r.events.find((e) => e.event === "final");
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}`);
    console.log(`   server toolCallId=${JSON.stringify(httpRow?.data.serverId)}  client posted=${JSON.stringify(httpRow?.data.sentId)}  http=${httpRow?.data.status}`);
    console.log(`   turn wall time = ${(r.elapsedMs / 1000).toFixed(1)}s   (a 45s stall means the bridge never matched the id)`);
    console.log(`   final payload = ${JSON.stringify(final?.data ?? null)}`);
    check("B1 client posts back the SAME id the server sent", httpRow?.data.sentId === httpRow?.data.serverId,
      `server=${JSON.stringify(httpRow?.data.serverId)} client=${JSON.stringify(httpRow?.data.sentId)}`);
    check("B2 the turn still produces a final answer", (final?.data.text as string || "").length > 0, JSON.stringify(final?.data.text));
    check("B3 the tool round-trip does not stall on the bridge timeout", r.elapsedMs < 20_000, `${(r.elapsedMs / 1000).toFixed(1)}s`);
  }

  // ---------------------------------------------------------------- C
  console.log("\nC  text emitted in the SAME message as the tool call");
  state.script = "textWithToolThenText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}`);
    console.log(`   final payload = ${JSON.stringify(final?.data ?? null)}`);
    check("C1 the preamble is discarded and the real answer survives",
      (final?.data.text as string) === "Here are the headlines for this week.", JSON.stringify(final?.data.text));
  }

  // ---------------------------------------------------------------- D
  console.log("\nD  stream cut right after the tool result (serverless timeout / dropped connection)");
  state.script = "toolThenText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh(), cutAfterToolResult: true });
    console.log(`   outcome=${r.outcome}  sawFinal=${r.sawFinal}  verdict=${r.verdict}`);
    console.log(`   conductor says: ${JSON.stringify(r.errorMessage || r.answer)}`);
    check("D1 a truncated stream is reported as a connection failure, not an empty model response",
      r.verdict === "error" && /connection to the agent closed/i.test(r.errorMessage),
      `verdict=${r.verdict} msg=${JSON.stringify(r.errorMessage)}`);
    check("D2 the message does not blame the model", !/empty response/i.test(r.errorMessage), JSON.stringify(r.errorMessage));
  }

  // ---------------------------------------------------------------- E
  console.log("\nE  model replies with REASONING ONLY, no text block (very common on R1-style models)");
  state.script = "toolThenReasoningOnly"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    const reasoning = r.events.filter((e) => e.event === "reasoning").length;
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}  reasoning frames=${reasoning}`);
    console.log(`   final payload = ${JSON.stringify(final?.data ?? null)}`);
    console.log(`   verdict=${r.verdict}  conductor says: ${JSON.stringify(r.errorMessage || r.answer)}`);
    check("E1 the server flags the reply as reasoning-only", final?.data.reasoningOnly === true, JSON.stringify(final?.data));
    check("E2 the conductor names the real cause instead of 'empty response'",
      r.verdict === "error" && /finished thinking/i.test(r.errorMessage) && !/empty response/i.test(r.errorMessage),
      JSON.stringify(r.errorMessage));
  }

  // ---------------------------------------------------------------- F
  console.log("\nF  model replies with WHITESPACE-ONLY text");
  state.script = "toolThenEmptyText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    console.log(`   llm requests=${state.hits}  final payload = ${JSON.stringify(final?.data ?? null)}`);
    console.log(`   verdict=${r.verdict}  conductor says: ${JSON.stringify(r.errorMessage || r.answer)}`);
    check("F1 a whitespace-only reply is treated as no answer", r.verdict === "error", `verdict=${r.verdict}`);
    check("F2 with no tools called and no reasoning, the generic message is correct",
      /empty response/i.test(r.errorMessage), JSON.stringify(r.errorMessage));
  }

  // ---------------------------------------------------------------- G
  console.log("\nG  finish_reason=length while a TOOL CALL was mid-stream (output cap hit)");
  state.script = "toolThenTruncatedToolCall"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    const err = r.events.find((e) => e.event === "error");
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}`);
    console.log(`   events: ${r.events.map((e) => e.event).join(" -> ")}`);
    console.log(`   final payload = ${JSON.stringify(final?.data ?? null)}\n   error payload = ${JSON.stringify(err?.data.message ?? null)}`);
    console.log(`   -> the assembler DROPS a truncated tool call, so the message has no text AND no call.`);
    check("G1 an output-cap truncation is reported as an error, not an empty success",
      r.verdict === "error" && /output token limit/i.test(r.errorMessage),
      `verdict=${r.verdict} msg=${JSON.stringify(r.errorMessage)}`);
  }

  // ---------------------------------------------------------------- H
  console.log("\nH  finish_reason=length on a TEXT answer");
  state.script = "toolThenTruncatedText"; state.hits = 0; state.requests = [];
  {
    const r = await driveTurn({ conversation: fresh() });
    const final = r.events.find((e) => e.event === "final");
    console.log(`   llm requests=${state.hits}  outcome=${r.outcome}  final payload = ${JSON.stringify(final?.data ?? null)}`);
    check("H1 truncated text still reaches the user", r.verdict === "answer" && r.answer.length > 0, `verdict=${r.verdict} answer=${JSON.stringify(r.answer)}`);
  }

  console.log(`\n${"=".repeat(70)}\nRESULT: ${pass} passed, ${fail} failed\n${"=".repeat(70)}`);} finally {
  await cleanup();
  next?.kill("SIGTERM");
  await new Promise<void>((r) => fakeModel.close(() => r()));
  setTimeout(() => process.exit(fail ? 1 : 0), 300);
}
