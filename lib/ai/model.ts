// ============================================================
// Drawva AI System — Model Configuration
// Dedicated task routing for Code vs Vision models:
//   - Code model: DeepInfra (deepseek-ai/DeepSeek-V4-Flash-0731)
//   - Vision model: OpenCode (mimo-v2.5-free) / DeepInfra (Qwen/Qwen2-VL-72B-Instruct)
// ============================================================

import { ChatOpenAI } from "@langchain/openai";

export type ModelTask = "vision" | "code";

export interface ModelOptions {
  task?: ModelTask;
  hasImage?: boolean;
}

export function getAiModel(
  options?: ModelOptions | ModelTask
): ChatOpenAI | null {
  const task: ModelTask =
    typeof options === "string"
      ? options
      : options?.task || (options?.hasImage ? "vision" : "code");

  const deepinfraKey = process.env.DEEPINFRA_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const mimoKey = process.env.MIMO_API_KEY;

  if (task === "code") {
    // 1. DeepInfra Code Generation (Primary)
    if (deepinfraKey) {
      const baseURL =
        process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai";
      const modelName =
        process.env.DEEPINFRA_CODE_MODEL || process.env.DEEPINFRA_MODEL || "deepseek-ai/DeepSeek-V4-Flash-0731";

      console.log(
        `[AI Model] 🤖 DeepInfra Provider | Task: "code" | Model: "${modelName}" | BaseURL: "${baseURL}"`
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

    // 2. OpenCode Code Generation (Secondary)
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

  if (task === "vision") {
    // 1. OpenCode Snapshot Vision Recognition (Primary)
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

    // 2. DeepInfra Vision Recognition (Secondary)
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

export function getAiVisionModel(): ChatOpenAI | null {
  return getAiModel({ task: "vision" });
}

export function getAiCodeModel(): ChatOpenAI | null {
  return getAiModel({ task: "code" });
}
