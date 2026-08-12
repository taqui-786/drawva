// ============================================================
// Drawva AI System — Model Configuration
// Dedicated task routing for Vision, Prompt Eval, and Code models:
//   - NVIDIA Provider (Primary): nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
//   - OpenCode Provider (Secondary Vision): mimo-v2.5-free
//   - DeepInfra Provider (Secondary Code): deepseek-ai/DeepSeek-V4-flash
// ============================================================

import { ChatOpenAI } from "@langchain/openai";

export type ModelTask = "vision" | "code" | "eval";

export interface ModelOptions {
  task?: ModelTask;
  hasImage?: boolean;
}

export interface CodeProviderMeta {
  /** Stable id used to reference this provider across the UI + API. */
  id: string;
  /** Provider + model label shown to the user. */
  provider: string;
  /** Raw model id sent to the provider API. */
  modelName: string;
}

export interface CodeModelEntry extends Omit<CodeProviderMeta, "modelName"> {
  modelName: CodeProviderMeta["modelName"];
  model: ChatOpenAI;
}

interface CodeProviderDef extends CodeProviderMeta {
  enabled: () => boolean;
  create: () => ChatOpenAI;
}

/** Single source of truth for the code-generation fallback chain (order = priority). */
function codeProviderDefs(): CodeProviderDef[] {
  const defs: CodeProviderDef[] = [];
  const deepinfraKey = process.env.DEEPINFRA_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  const deepInfraModel =
    process.env.DEEPINFRA_CODE_MODEL ||
    process.env.DEEPINFRA_MODEL ||
    "deepseek-ai/DeepSeek-V4-flash";
  if (deepinfraKey) {
    defs.push({
      id: "deepinfra",
      provider: `DeepInfra/Baseten (${deepInfraModel})`,
      modelName: deepInfraModel,
      enabled: () => Boolean(process.env.DEEPINFRA_API_KEY),
      create: () =>
        new ChatOpenAI({
          model: deepInfraModel,
          apiKey: deepinfraKey,
          configuration: {
            baseURL:
              process.env.DEEPINFRA_BASE_URL ||
              "https://api.deepinfra.com/v1/openai",
          },
          temperature: 0.2,
          maxTokens: 8192,
          timeout: 60000,
          maxRetries: 1,
        }),
    });
  }

  const opencodeModel =
    process.env.OPENCODE_CODE_MODEL || "deepseek-v4-flash-free";
  if (opencodeKey) {
    defs.push({
      id: "opencode",
      provider: `OpenCode (${opencodeModel})`,
      modelName: opencodeModel,
      enabled: () => Boolean(process.env.OPENCODE_API_KEY),
      create: () =>
        new ChatOpenAI({
          model: opencodeModel,
          apiKey: opencodeKey,
          configuration: {
            baseURL: process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1",
          },
          temperature: 0.2,
          timeout: 60000,
          maxRetries: 1,
        }),
    });
  }

  const nvidiaModel =
    process.env.NVIDIA_CODE_MODEL ||
    process.env.NVIDIA_MODEL ||
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  if (nvidiaKey) {
    defs.push({
      id: "nvidia",
      provider: `NVIDIA (${nvidiaModel})`,
      modelName: nvidiaModel,
      enabled: () => Boolean(process.env.NVIDIA_API_KEY),
      create: () =>
        new ChatOpenAI({
          model: nvidiaModel,
          apiKey: nvidiaKey,
          configuration: {
            baseURL: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
          },
          temperature: 0.6,
          topP: 0.95,
          maxTokens: 65536,
          modelKwargs: {
            reasoning_budget: 16384,
          },
          timeout: 90000,
          maxRetries: 1,
        }),
    });
  }

  if (openrouterKey) {
    defs.push({
      id: "openrouter",
      provider: "OpenRouter (deepseek/deepseek-chat)",
      modelName: "deepseek/deepseek-chat",
      enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
      create: () =>
        new ChatOpenAI({
          model: "deepseek/deepseek-chat",
          apiKey: openrouterKey,
          configuration: { baseURL: "https://openrouter.ai/api/v1" },
          temperature: 0.2,
          timeout: 60000,
          maxRetries: 1,
        }),
    });
  }

  return defs;
}

/** Metadata for every *available* code provider (used by the model picker UI). */
export function listCodeModelProviders(): CodeProviderMeta[] {
  return codeProviderDefs()
    .filter((d) => d.enabled())
    .map(({ id, provider, modelName }) => ({ id, provider, modelName }));
}

/**
 * Instantiate every available code model in fallback priority order.
 * Used by the AI agent to try providers sequentially.
 */
export function getAllCodeModels(): CodeModelEntry[] {
  return codeProviderDefs()
    .filter((d) => d.enabled())
    .map((d) => ({ id: d.id, provider: d.provider, modelName: d.modelName, model: d.create() }));
}

export function getAiCodeModel(): ChatOpenAI | null {
  const all = getAllCodeModels();
  return all.length > 0 ? all[0].model : null;
}

export function getAiVisionModel(): ChatOpenAI | null {
  return getAiModel({ task: "vision" });
}

export function getAiEvalModel(): ChatOpenAI | null {
  return getAiModel({ task: "eval" });
}

export function getAiModel(
  options?: ModelOptions | ModelTask
): ChatOpenAI | null {
  const task: ModelTask =
    typeof options === "string"
      ? options
      : options?.task || (options?.hasImage ? "vision" : "code");

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const deepinfraKey = process.env.DEEPINFRA_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const mimoKey = process.env.MIMO_API_KEY;

  if (task === "vision") {
    // 1. NVIDIA AI Endpoints (Primary Vision Provider)
    if (nvidiaKey) {
      const baseURL =
        process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
      const modelName =
        process.env.NVIDIA_VISION_MODEL ||
        process.env.NVIDIA_MODEL ||
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

      console.log(
        `[AI Model] 🤖 NVIDIA Provider | Task: "vision" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: nvidiaKey,
        configuration: { baseURL },
        temperature: 0.6,
        topP: 0.95,
        maxTokens: 65536,
        modelKwargs: {
          reasoning_budget: 16384,
        },
        timeout: 90000,
        maxRetries: 1,
      });
    }

    // 2. OpenCode Snapshot Vision Recognition (Secondary Vision Provider)
    if (opencodeKey) {
      const baseURL =
        process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";
      const modelName = process.env.OPENCODE_VISION_MODEL || "mimo-v2.5-free";

      console.log(
        `[AI Model] 🤖 OpenCode Provider | Task: "vision" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: opencodeKey,
        configuration: { baseURL },
        temperature: 0.2,
        timeout: 60000,
        maxRetries: 1,
      });
    }

    // 3. DeepInfra Vision Recognition (Tertiary)
    if (deepinfraKey) {
      const baseURL =
        process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai";
      const modelName =
        process.env.DEEPINFRA_VISION_MODEL || "Qwen/Qwen2-VL-72B-Instruct";

      console.log(
        `[AI Model] 🤖 DeepInfra Provider | Task: "vision" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: deepinfraKey,
        configuration: { baseURL },
        temperature: 0.2,
        timeout: 60000,
        maxRetries: 1,
      });
    }
  }

  if (task === "eval") {
    // 1. NVIDIA AI Provider (Primary Prompt Evaluator)
    if (nvidiaKey) {
      const baseURL =
        process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
      const modelName =
        process.env.NVIDIA_EVAL_MODEL ||
        process.env.NVIDIA_MODEL ||
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

      console.log(
        `[AI Model] 🤖 NVIDIA Provider | Task: "eval" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: nvidiaKey,
        configuration: { baseURL },
        temperature: 0.6,
        topP: 0.95,
        maxTokens: 65536,
        modelKwargs: {
          reasoning_budget: 16384,
        },
        timeout: 90000,
        maxRetries: 1,
      });
    }

    // 2. DeepInfra Provider for Eval (Secondary)
    if (deepinfraKey) {
      const baseURL =
        process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai";
      const modelName =
        process.env.DEEPINFRA_CODE_MODEL || "deepseek-ai/DeepSeek-V4-flash";

      console.log(
        `[AI Model] 🤖 DeepInfra Provider | Task: "eval" | Model: "${modelName}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: deepinfraKey,
        configuration: { baseURL },
        temperature: 0.2,
        timeout: 60000,
        maxRetries: 1,
      });
    }

    // 3. OpenCode Provider for Eval (Tertiary)
    if (opencodeKey) {
      const baseURL =
        process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";
      const modelName = process.env.OPENCODE_CODE_MODEL || "deepseek-v4-flash-free";

      console.log(
        `[AI Model] 🤖 OpenCode Provider | Task: "eval" | Model: "${modelName}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: opencodeKey,
        configuration: { baseURL },
        temperature: 0.2,
        timeout: 60000,
        maxRetries: 1,
      });
    }
  }

  if (task === "code") {
    // 1. DeepInfra DeepSeek Code Generation (Primary)
    if (deepinfraKey) {
      const baseURL =
        process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai";
      const modelName =
        process.env.DEEPINFRA_CODE_MODEL || process.env.DEEPINFRA_MODEL || "deepseek-ai/DeepSeek-V4-flash";

      console.log(
        `[AI Model] 🤖 DeepInfra Provider | Task: "code" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: deepinfraKey,
        configuration: { baseURL },
        temperature: 0.2,
        maxTokens: 8192,
        timeout: 60000,
        maxRetries: 1,
      });
    }

    // 2. OpenCode DeepSeek Code Generation (Secondary)
    if (opencodeKey) {
      const baseURL =
        process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";
      const modelName = process.env.OPENCODE_CODE_MODEL || "deepseek-v4-flash-free";

      console.log(
        `[AI Model] 🤖 OpenCode Provider | Task: "code" | Model: "${modelName}" | BaseURL: "${baseURL}"`
      );

      return new ChatOpenAI({
        model: modelName,
        apiKey: opencodeKey,
        configuration: { baseURL },
        temperature: 0.2,
        timeout: 60000,
        maxRetries: 1,
      });
    }
  }

  // Fallback providers (OpenRouter / MiMo API)
  if (openrouterKey) {
    const defaultModel =
      task === "vision" ? "xiaomi/mimo-v2.5" : "deepseek/deepseek-chat";
    console.log(
      `[AI Model] 🤖 OpenRouter Provider | Task: "${task}" | Model: "${defaultModel}"`
    );
    return new ChatOpenAI({
      model: defaultModel,
      apiKey: openrouterKey,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      temperature: 0.2,
      timeout: 60000,
      maxRetries: 1,
    });
  }

  if (mimoKey) {
    const baseURL = process.env.MIMO_BASE_URL || "https://api.mimo.mi.com/v1";
    console.log(
      `[AI Model] 🤖 MiMo Provider | Task: "${task}" | Model: "mimo-v2.5"`
    );
    return new ChatOpenAI({
      model: "mimo-v2.5",
      apiKey: mimoKey,
      configuration: { baseURL },
      temperature: 0.2,
      timeout: 60000,
      maxRetries: 1,
    });
  }

  console.log(`[AI Model] ⚠️ No API key set. Falling back to dry-run mode.`);
  return null;
}