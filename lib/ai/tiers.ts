export type ModelTier = "frontier" | "mid" | "small";

export function getModelTier(modelId?: string): ModelTier {
  if (!modelId || typeof modelId !== "string") return "mid";
  const name = modelId.toLowerCase().trim();

  // Frontier tier
  if (
    /opus|gpt-5|gpt-4\.5|gpt-4o$|claude-3-7|claude-3-5-sonnet|gemini-2(\.0)?-pro|gemini-1\.5-pro|\bo[13](-(mini|preview))?\b/i.test(
      name
    )
  ) {
    return "frontier";
  }

  // Small tier
  if (
    /flash|mini|8b|7b|small|lite|turbo|haiku|qwen.*(flash|7b|8b|14b)|minimax|kimi/i.test(
      name
    )
  ) {
    return "small";
  }

  // Default to mid
  return "mid";
}
