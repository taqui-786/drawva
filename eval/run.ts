import fs from "node:fs";
import path from "node:path";
import { validateCommands, type CommandValidationContext } from "../lib/canvas/commands";
import { widgetGeometryForViewport } from "../lib/ai/geometry";
import { buildSystemPromptText } from "../lib/ai/agent";

export interface EvalCase {
  id: string;
  description: string;
  mock: {
    userPromptText: {
      requestId: string;
      trigger: string;
      visibleRect: { x: number; y: number; w: number; h: number };
      changedBox: { x: number; y: number; w: number; h: number };
      sourceRect: { x: number; y: number; w: number; h: number };
      latestInput?: { globalRect: { x: number; y: number; w: number; h: number }; imageRect: { x: number; y: number; w: number; h: number } };
      scene?: string;
      enabledPlugins?: Array<{ id: string; name: string; version: string; connect: string[]; recommendedRefreshSeconds: number; document: string }>;
      widgetGeometry?: { max?: { w?: number; h?: number } };
    };
    rawModelResponse: {
      intent?: string;
      observedText?: string;
      spatialPlan?: string;
      message?: string;
      commands?: Array<Record<string, unknown>>;
    };
    imageRef?: string;
  };
  expect: {
    toolAny?: string[];
    geometry?: {
      insideBox?: [number, number, number, number];
      tolerance?: number;
    };
    mustNotOverlapSceneItems?: boolean;
    minCommands?: number;
  };
}

export interface EvalResult {
  id: string;
  description: string;
  json_valid: boolean;
  raw_command_count: number;
  validator_pass_count: number;
  rejected: string[];
  geometry_ok: boolean;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  pass: boolean;
  error?: string;
}

function parseSceneItems(scene?: string) {
  if (!scene) return [];
  try {
    const parsed = JSON.parse(scene);
    if (Array.isArray(parsed?.items)) {
      return parsed.items.map((i: Record<string, unknown>) => ({
        id: typeof i.id === "string" ? i.id : undefined,
        kind: String(i.kind || "object"),
        x: Number(i.x) || 0,
        y: Number(i.y) || 0,
        w: Number(i.w) || 0,
        h: Number(i.h) || 0,
        title: typeof i.title === "string" ? i.title : undefined,
      }));
    }
  } catch {}
  return [];
}

import { testPromptContract } from "./contract.test";

export function runEvalCase(c: EvalCase, rawReply?: unknown, latencyMs = 0): EvalResult {
  const startTime = Date.now();
  const reply = (rawReply || c.mock.rawModelResponse) as Record<string, unknown>;
  const rawCommands = Array.isArray(reply?.commands) ? reply.commands : [];
  
  const mockInput = c.mock.userPromptText;
  const visibleRect = mockInput.visibleRect;
  const changedBox = mockInput.changedBox;
  const plugins = new Set((mockInput.enabledPlugins || []).map((p) => p.id));
  plugins.add("general");
  plugins.add("flowchart");

  const ctx: CommandValidationContext = {
    aiColor: "#2679b8",
    scale: 0.25,
    widgetSlots: 8,
    plugins,
    visibleRect,
    changedBox,
    keepPosition: false,
    sceneItems: parseSceneItems(mockInput.scene),
    widgetGeometry: widgetGeometryForViewport(visibleRect),
    spatialPlan: typeof reply?.spatialPlan === "string" ? reply.spatialPlan : undefined,
  };

  const { commands, rejected } = validateCommands(rawCommands, ctx);

  let geometryOk = true;
  if (c.expect.geometry?.insideBox && commands.length > 0) {
    const [bx, by, bw, bh] = c.expect.geometry.insideBox;
    const tol = c.expect.geometry.tolerance ?? 100;
    for (const cmd of commands) {
      if ("x" in cmd && "y" in cmd && "w" in cmd && "h" in cmd) {
        const cx = cmd.x as number;
        const cy = cmd.y as number;
        const cw = cmd.w as number;
        const ch = cmd.h as number;
        if (cx < bx - tol || cy < by - tol || cx + cw > bx + bw + tol || cy + ch > by + bh + tol) {
          geometryOk = false;
        }
      }
    }
  }

  let toolMatch = true;
  if (c.expect.toolAny && c.expect.toolAny.length > 0) {
    toolMatch = commands.some((cmd) => c.expect.toolAny!.includes(cmd.tool));
  }

  const minCommandsMet = commands.length >= (c.expect.minCommands ?? 1);
  const pass = Boolean(reply && typeof reply === "object") && minCommandsMet && toolMatch && geometryOk;

  const systemText = buildSystemPromptText("studio", true);
  const userText = JSON.stringify(mockInput);
  const outText = JSON.stringify(reply);

  const tokensIn = Math.ceil((systemText.length + userText.length) / 4);
  const tokensOut = Math.ceil(outText.length / 4);

  return {
    id: c.id,
    description: c.description,
    json_valid: Boolean(reply && typeof reply === "object" && Array.isArray(reply.commands)),
    raw_command_count: rawCommands.length,
    validator_pass_count: commands.length,
    rejected,
    geometry_ok: geometryOk,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: latencyMs || (Date.now() - startTime),
    pass,
  };
}

export async function runAll() {
  const casesDir = path.join(process.cwd(), "eval", "cases");
  const resultsDir = path.join(process.cwd(), "eval", "results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const files = fs.readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort();
  const results: EvalResult[] = [];

  console.log(`\n=== Drawva Prompt & Generation Evaluation ===`);
  const contractRes = testPromptContract();
  if (!contractRes.pass) {
    console.error("❌ Contract Drift Test Failed:\n" + contractRes.errors.join("\n"));
    process.exit(1);
  }
  console.log("✅ Prompt & Tool Schema Contract Verified.");
  console.log(`Running ${files.length} golden test cases...\n`);

  for (const file of files) {
    const raw = fs.readFileSync(path.join(casesDir, file), "utf8");
    const testCase: EvalCase = JSON.parse(raw);
    const result = runEvalCase(testCase);
    results.push(result);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultPath = path.join(resultsDir, `${timestamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2), "utf8");

  // Summary Table
  console.table(
    results.map((r) => ({
      Case: r.id,
      ValidJSON: r.json_valid ? "YES" : "NO",
      RawCmds: r.raw_command_count,
      Passed: r.validator_pass_count,
      Rejected: r.rejected.length > 0 ? r.rejected.join(",") : "none",
      GeomOK: r.geometry_ok ? "YES" : "NO",
      TokIn: r.tokens_in,
      TokOut: r.tokens_out,
      Status: r.pass ? "PASS" : "FAIL",
    }))
  );

  const totalPassed = results.filter((r) => r.pass).length;
  console.log(`\nSummary: ${totalPassed}/${results.length} cases passed (${Math.round((totalPassed / results.length) * 100)}%)`);
  console.log(`Results saved to ${resultPath}\n`);
}

if (require.main === module || process.argv[1]?.includes("eval/run")) {
  void runAll();
}
