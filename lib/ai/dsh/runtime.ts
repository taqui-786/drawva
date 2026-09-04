import { Context, type Plugin } from "@deepseek-ai/cordis";
import Timer from "@deepseek-ai/cordis-plugin-timer";
import LlmRuntime from "@deepseek-ai/dsh-llm";
import * as LlmRetry from "@deepseek-ai/dsh-llm-retry";
import * as PiAi from "@deepseek-ai/dsh-llm-pi-ai";
import SessionStore from "@deepseek-ai/dsh-session";
import SessionProjection from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import AgentRegistry from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import TokenMeter from "@deepseek-ai/dsh-token-meter";
import ToolResultPruner from "@deepseek-ai/dsh-compaction-tool-result-pruner";
import BasicCompaction from "@deepseek-ai/dsh-compaction-basic";
import SettingsFile from "@deepseek-ai/dsh-settings-file";
import AttachmentLocal from "@deepseek-ai/dsh-attachment-local";
import * as ToolCallTimeoutPolicy from "@deepseek-ai/dsh-tool-call-timeout-policy";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as DrawvaCredentials from "./credentials";

const PLUGIN_ALLOWLIST = new Set([
  "timer",
  "drawva-settings",
  "drawva-credentials",
  "attachment-local",
  "llm",
  "llm-retry",
  "llm-pi-ai",
  "session",
  "session-projection",
  "system-prompt",
  "tools",
  "agent",
  "agent-loop",
  "token-meter",
  "tool-result-pruner",
  "compaction-basic",
  "tool-call-timeout-policy",
]);

let ctx: Context | null = null;
let ready: Promise<Context> | null = null;

async function boot(): Promise<Context> {
  const context = new Context();
  const mount = (key: string, plugin: Plugin, config?: Record<string, unknown>) => {
    if (!PLUGIN_ALLOWLIST.has(key)) {
      throw new Error(`Agent runtime refused non-allowlisted plugin: ${key}`);
    }
    return config === undefined ? context.plugin(plugin) : context.plugin(plugin, config);
  };

  await mount("timer", Timer);
  await mount("drawva-settings", SettingsFile, {
    path: join(tmpdir(), "drawva-dsh", "settings.json"),
    watch: false,
  });
  await mount("drawva-credentials", DrawvaCredentials);
  await mount("attachment-local", AttachmentLocal, {
    dshHome: join(tmpdir(), "drawva-dsh"),
    maxImagesPerMessage: 5,
    maxMessageImageBytes: 8 * 1024 * 1024,
  });
  await mount("llm", LlmRuntime);
  await mount("llm-retry", LlmRetry, { mode: "normal", maxRetries: 2 });
  await mount("llm-pi-ai", PiAi);
  await mount("session", SessionStore);
  await mount("session-projection", SessionProjection);
  await mount("system-prompt", SystemPrompt);
  await mount("tools", ToolRuntime, { mode: "native" });
  await mount("agent", AgentRegistry);
  await mount("agent-loop", AgentLoop, { agents: [], maxParallelToolCalls: 1 });
  await mount("token-meter", TokenMeter);
  await mount("tool-result-pruner", ToolResultPruner, { thresholdChars: 8192, headChars: 4096, tailChars: 1024 });
  await mount("compaction-basic", BasicCompaction, { thresholdRatio: 0.625, retainRatio: 0.16, maxTokens: 4096 });
  await mount("tool-call-timeout-policy", ToolCallTimeoutPolicy, { timeoutMs: 45_000 });
  return context;
}

export function agentRuntime(): Promise<Context> {
  if (ctx) return Promise.resolve(ctx);
  if (!ready) {
    ready = boot().then(
      (context) => {
        ctx = context;
        return context;
      },
      (err) => {
        ready = null;
        throw err;
      }
    );
  }
  return ready;
}
