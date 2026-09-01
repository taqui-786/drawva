import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractJsonDecision } from "./agentTools";
import type { AgentReply } from "./types";
import type { ReasoningEffort } from "./provider";

export interface AntigravityRunOptions {
  systemPrompt: string;
  userJson: string;
  imageBase64?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
}

export function findAntigravityPath(): string | null {
  const envPath = process.env.ANTIGRAVITY_CLI_PATH?.trim() || process.env.AGY_CLI_PATH?.trim();
  if (envPath && fs.existsSync(/*turbopackIgnore: true*/ envPath)) return envPath;

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    path.join(home, ".local", "bin", "agy"),
    path.join(home, ".local", "bin", "antigravity"),
    "/usr/local/bin/agy",
    "/usr/local/bin/antigravity",
    "agy",
    "antigravity",
  ];

  for (const candidate of candidates) {
    if (candidate === "agy" || candidate === "antigravity") {
      try {
        const isWin = process.platform === "win32";
        const checkCmd = isWin ? "where.exe" : "which";
        const res = spawnSync(checkCmd, [candidate], { encoding: "utf8" });
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

export function isAntigravityAvailable(): { available: boolean; reason?: string; path?: string } {
  const exePath = findAntigravityPath();
  if (!exePath) {
    return { available: false, reason: "Antigravity CLI binary (agy) not found on PATH or ~/.local/bin/agy." };
  }
  return { available: true, path: exePath };
}

export function getAntigravityModels(): string[] {
  const exePath = findAntigravityPath();
  if (!exePath) {
    return [
      "gemini-3.7-flash-high",
      "gemini-3.7-flash-medium",
      "gemini-3.6-flash-high",
      "claude-sonnet-4-6",
      "claude-opus-4-6-thinking",
    ];
  }

  try {
    const res = spawnSync(/*turbopackIgnore: true*/ exePath, ["models"], { encoding: "utf8", timeout: 10000 });
    if (res.status === 0 && res.stdout) {
      const lines = res.stdout.split("\n");
      const models: string[] = [];
      for (const line of lines) {
        const clean = line.replace(/[^\x20-\x7E]/g, "").trim();
        const match = clean.match(/^([a-z0-9\-_.]+)\s{2,}/i);
        if (match && match[1] && !match[1].startsWith("Fetching") && !match[1].startsWith("Usage")) {
          models.push(match[1]);
        }
      }
      if (models.length > 0) {
        return models;
      }
    }
  } catch {}

  return [
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.6-flash-high",
    "claude-sonnet-4-6",
    "claude-opus-4-6-thinking",
  ];
}

export async function runAntigravityCli(opts: AntigravityRunOptions): Promise<AgentReply> {
  const check = isAntigravityAvailable();
  if (!check.available || !check.path) {
    throw new Error(check.reason || "Antigravity CLI is not available");
  }

  let tempImagePath: string | null = null;
  if (opts.imageBase64) {
    const rawBase64 = opts.imageBase64.includes(",") ? opts.imageBase64.split(",")[1] : opts.imageBase64;
    const buf = Buffer.from(rawBase64, "base64");
    tempImagePath = path.join(os.tmpdir(), `drawva-agy-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`);
    await fs.promises.writeFile(tempImagePath, buf);
  }

  const prompt = tempImagePath
    ? `${opts.systemPrompt}\n\nCanvas Image: See attached file at ${tempImagePath}\n\nIMPORTANT: Return ONLY a valid JSON object matching the required schema.\n\nInput Context:\n${opts.userJson}`
    : `${opts.systemPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the required schema.\n\nInput Context:\n${opts.userJson}`;

  const args = [
    "--input-format", "text",
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--disable-slash-commands",
  ];

  const hasEffortSuffix = opts.model && /-(high|medium|low|none|minimal|thinking)$/i.test(opts.model);

  if (opts.model && opts.model !== "default") {
    let selectedModel = opts.model;
    if (hasEffortSuffix && opts.reasoningEffort && opts.reasoningEffort !== "default") {
      selectedModel = selectedModel.replace(/-(high|medium|low)$/i, `-${opts.reasoningEffort}`);
    }
    args.push("--model", selectedModel);
  }
  if (opts.reasoningEffort && opts.reasoningEffort !== "default" && !hasEffortSuffix) {
    args.push("--effort", opts.reasoningEffort);
  }

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
          reject(new Error(`Antigravity CLI timed out after ${timeoutMs / 1000}s`));
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

        child.stdin.write(prompt);
        child.stdin.end();
      }
    );

    if (code !== 0 && !stdout) {
      throw new Error(`Antigravity CLI exited with code ${code}: ${stderr}`);
    }

    let rawResponse = "";
    let tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

    try {
      const topJson = JSON.parse(stdout.trim()) as {
        response?: string;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      rawResponse = topJson.response || stdout;
      if (topJson.usage) {
        const inTok = Number(topJson.usage.input_tokens || 0);
        const outTok = Number(topJson.usage.output_tokens || 0);
        tokenUsage = {
          inputTokens: inTok,
          outputTokens: outTok,
          totalTokens: inTok + outTok,
        };
      }
    } catch {
      rawResponse = stdout;
    }

    // Extract the first balanced JSON object from the response; plain text becomes an answer.
    const parsed = extractJsonDecision(rawResponse) ?? { message: rawResponse.trim(), commands: [] };

    let toolCall: AgentReply["toolCall"] | undefined;
    if (parsed.type === "tool_call" || (typeof parsed.name === "string" && parsed.name)) {
      const name = String(parsed.name || "");
      let args: Record<string, unknown> = {};
      if (parsed.arguments && typeof parsed.arguments === "object") {
        args = parsed.arguments as Record<string, unknown>;
      } else if (typeof parsed.arguments === "string") {
        try {
          args = JSON.parse(parsed.arguments);
        } catch {}
      } else if (parsed.args && typeof parsed.args === "object") {
        args = parsed.args as Record<string, unknown>;
      }
      toolCall = { name, args };
    }

    const rawCommands = Array.isArray(parsed.commands) ? parsed.commands : [];
    const message =
      typeof parsed.text === "string"
        ? parsed.text
        : typeof parsed.message === "string"
        ? parsed.message
        : toolCall
        ? undefined
        : rawResponse.trim();

    return {
      intent: (parsed.intent as AgentReply["intent"]) || "answer",
      observedText: typeof parsed.observedText === "string" ? parsed.observedText : undefined,
      spatialPlan: typeof parsed.spatialPlan === "string" ? parsed.spatialPlan : undefined,
      message,
      commands: rawCommands as Array<Record<string, unknown>>,
      toolCall,
      attempts: 1,
      requestId: `antigravity-${Date.now()}`,
      tokenUsage,
    };
  } finally {
    if (tempImagePath) {
      await fs.promises.unlink(tempImagePath).catch(() => {});
    }
  }
}
