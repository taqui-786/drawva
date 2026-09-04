import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { AGENT_TOOL_DEFS, enabledToolNames, type AgentToolDef } from "../agentTools";
import { dispatchBridgeCall } from "./bridge";

export const TOOL_TIMEOUT_MS = 45_000;
const MAX_RESULT_CHARS = 100_000;

function boundedJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[truncated]` : text;
}

export interface ConversationToolHooks {
  conversationId: string;
  webEnabled: { tinyfish: boolean; search: boolean };
  loadPluginDocument: (pluginId: string) => string | null;
  registerPluginContract: (pluginId: string, document: string) => "registered" | "already" | "limit";
}

interface LooseToolDef {
  name: string;
  description: string;
  parameters: AgentToolDef["parameters"];
  output: { schema: { type: "json" }; render: (args: never, value: never) => ContentBlock[] };
  timeoutMs: number;
  isConcurrencySafe: (args: never) => boolean;
  execute: (args: never, exec: { callId: unknown; signal: AbortSignal }) => Promise<never>;
}

export function registerConversationTools(agentCtx: Context, hooks: ConversationToolHooks): string[] {
  const names = new Set(enabledToolNames(hooks.webEnabled));
  const output = {
    schema: { type: "json" } as const,
    render: (_args: never, value: never) => [{ type: "text" as const, text: boundedJson(value) }],
  };

  const execute = (name: string) =>
    name === "load_plugin"
      ? async (args: Record<string, unknown>) => {
          const pluginId = String(args.pluginId || "");
          const document = hooks.loadPluginDocument(pluginId);
          if (!document) throw new Error(`Unknown plugin: ${pluginId || "(empty)"}.`);
          return { pluginId, state: hooks.registerPluginContract(pluginId, document) } as never;
        }
      : async (args: Record<string, unknown>, exec: { callId: unknown; signal: AbortSignal }) => {
          const result = await dispatchBridgeCall(hooks.conversationId, String(exec.callId), {
            name,
            args,
            signal: exec.signal,
          });
          return (result ?? {}) as never;
        };

  for (const def of AGENT_TOOL_DEFS) {
    if (!names.has(def.name)) continue;
    const tool: LooseToolDef = {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      output,
      timeoutMs: TOOL_TIMEOUT_MS,
      isConcurrencySafe: () => false,
      execute: execute(def.name) as LooseToolDef["execute"],
    };
    agentCtx.tools.register(defineTool(tool as never));
  }

  return [...names];
}
