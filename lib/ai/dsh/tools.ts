import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { AGENT_TOOL_DEFS, enabledToolNames, type AgentToolDef } from "../agentTools";
import { dispatchBridgeCall } from "./bridge";

/**
 * Canvas + web tools in the agent-tool DSL.
 *
 * Every tool is registered straight from `AGENT_TOOL_DEFS` — name, description
 * and parameter schema. A second hand-written copy of those schemas is exactly
 * how `canvas_edit` came to advertise `op` while validating nothing, so the
 * model spent a whole turn sending `kind` and reading `Unknown op: `.
 *
 * Execution bridges to the browser: canvas tools mutate live canvas state and
 * web tools proxy through the browser's `/api/canvas/web` call. `load_plugin`
 * is the one server-local tool (it edits this session's system prompt).
 *
 * Single-tool discipline: serial loop (`maxParallelToolCalls: 1`) + the persona
 * rule. A strict whole-step rejection (penecho admission) is not hooked: the
 * loop exposes no decision boundary, only per-call `tools/pre-execute`.
 */

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

/** Structural tool shape with inference-proof `never` callbacks (see below). */
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
    // `as never` skips defineTool's deep InferObject type walk, which recurses
    // on index-signature spec maps (TS2321). Runtime validation is unaffected:
    // the registry still enforces parameters/output schemas before dispatch.
    agentCtx.tools.register(defineTool(tool as never));
  }

  return [...names];
}
