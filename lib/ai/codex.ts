import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentReply } from "./agent";
import type { ReasoningEffort } from "./provider";

export interface CodexRunOptions {
  systemPrompt: string;
  userJson: string;
  imageBase64?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
}

export function findCodexPath(): string | null {
  const envPath = process.env.CODEX_CLI_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    path.join(home, ".local", "bin", "codex"),
    "/usr/local/bin/codex",
    "/usr/bin/codex",
    "codex",
  ];

  for (const candidate of candidates) {
    if (candidate === "codex") {
      try {
        const isWin = process.platform === "win32";
        const checkCmd = isWin ? "where.exe" : "which";
        const res = spawnSync(checkCmd, ["codex"], { encoding: "utf8" });
        if (res.status === 0 && res.stdout.trim()) {
          return res.stdout.trim().split("\n")[0].trim();
        }
      } catch {}
    } else if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getCodexAuthPath(): string | null {
  const home = process.env.CODEX_HOME || process.env.USERPROFILE || process.env.HOME || "";
  if (!home) return null;
  const authPath = process.env.CODEX_HOME ? path.join(home, "auth.json") : path.join(home, ".codex", "auth.json");
  return fs.existsSync(/*turbopackIgnore: true*/ authPath) ? authPath : null;
}

export function isCodexAvailable(): { available: boolean; reason?: string; path?: string } {
  const exePath = findCodexPath();
  if (!exePath) {
    return { available: false, reason: "Codex CLI executable not found on PATH or ~/.local/bin/codex." };
  }
  const authPath = getCodexAuthPath();
  if (!authPath) {
    return { available: false, reason: "Codex auth not found. Run `codex login` in your terminal first." };
  }
  return { available: true, path: exePath };
}

export function getCodexModels(): string[] {
  const home = process.env.CODEX_HOME || process.env.USERPROFILE || process.env.HOME || "";
  if (!home) return ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"];
  const cachePath = process.env.CODEX_HOME
    ? path.join(home, "models_cache.json")
    : path.join(home, ".codex", "models_cache.json");

  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ cachePath)) {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ cachePath, "utf8");
      const data = JSON.parse(raw);
      const rows = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
      const modelIds = rows
        .map((m: Record<string, unknown>) => String(m.id || m.name || m.slug || "").trim())
        .filter(Boolean);
      if (modelIds.length > 0) {
        return modelIds;
      }
    }
  } catch {}

  return ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"];
}

export async function runCodexCli(opts: CodexRunOptions): Promise<AgentReply> {
  const check = isCodexAvailable();
  if (!check.available || !check.path) {
    throw new Error(check.reason || "Codex CLI is not available");
  }

  let tempImagePath: string | null = null;
  if (opts.imageBase64) {
    const rawBase64 = opts.imageBase64.includes(",") ? opts.imageBase64.split(",")[1] : opts.imageBase64;
    const buf = Buffer.from(rawBase64, "base64");
    tempImagePath = path.join(os.tmpdir(), `drawva-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`);
    await fs.promises.writeFile(tempImagePath, buf);
  }

  const args = [
    "exec",
    "--ephemeral",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--json",
    "-c", 'approval_policy="never"',
    "-c", 'web_search="disabled"',
    "-c", "mcp_servers={}",
    "-C", os.tmpdir(),
  ];

  if (tempImagePath) {
    args.push("-i", tempImagePath);
  }
  if (opts.model && opts.model !== "default") {
    args.push("--model", opts.model);
  }
  if (opts.reasoningEffort && opts.reasoningEffort !== "default") {
    args.push("-c", `model_reasoning_effort="${opts.reasoningEffort}"`);
  }
  args.push("-");

  const timeoutMs = opts.timeoutMs ?? 120_000;

  try {
    const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        const child = spawn(/*turbopackIgnore: true*/ check.path!, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            NO_COLOR: "1",
          },
        });

        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
          reject(new Error(`Codex CLI timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);

        child.stdout.on("data", (d) => (out += d.toString()));
        child.stderr.on("data", (d) => (err += d.toString()));

        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });

        child.on("close", (c) => {
          clearTimeout(timer);
          resolve({ stdout: out, stderr: err, code: c });
        });

        const promptInput = `${opts.systemPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the required schema.\n\nInput Context:\n${opts.userJson}`;
        child.stdin.write(promptInput);
        child.stdin.end();
      }
    );

    if (code !== 0 && !stdout) {
      throw new Error(`Codex CLI exited with code ${code}: ${stderr}`);
    }

    // Parse JSON-RPC line stream from stdout
    const lines = stdout.trim().split("\n");
    let fullAgentText = "";
    let tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "item.completed" && msg.item?.type === "agent_message" && msg.item?.text) {
          fullAgentText += msg.item.text;
        } else if (msg.type === "turn.completed" && msg.usage) {
          const inTok = Number(msg.usage.input_tokens || 0);
          const outTok = Number(msg.usage.output_tokens || 0);
          tokenUsage = {
            inputTokens: inTok,
            outputTokens: outTok,
            totalTokens: inTok + outTok,
          };
        }
      } catch {}
    }

    if (!fullAgentText) {
      fullAgentText = stdout;
    }

    // Extract JSON object from agent output
    const jsonMatch = fullAgentText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Codex CLI did not return a valid JSON object. Raw response: ${fullAgentText.slice(0, 300)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const rawCommands = Array.isArray(parsed.commands) ? parsed.commands : [];

    return {
      intent: (parsed.intent as AgentReply["intent"]) || "answer",
      observedText: typeof parsed.observedText === "string" ? parsed.observedText : undefined,
      spatialPlan: typeof parsed.spatialPlan === "string" ? parsed.spatialPlan : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      commands: rawCommands as Array<Record<string, unknown>>,
      tokenUsage,
    };
  } finally {
    if (tempImagePath) {
      await fs.promises.unlink(tempImagePath).catch(() => {});
    }
  }
}
