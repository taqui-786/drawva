import { SYSTEM_PROMPT, CODE_SYSTEM_PROMPT_EXTRA, PLUGIN_ROUTING_PROMPT } from "../lib/ai/prompts";
import { canonicalToolName } from "../lib/canvas/commands";

export function testPromptContract(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];

  const expectedTools = [
    "write_text",
    "draw_formula",
    "plot_function",
    "animate_scene",
    "html_widget",
    "diagram_source",
    "draw",
    "erase",
  ];

  const expectedIntents = [
    "none",
    "hint",
    "continue",
    "explain",
    "plot",
    "correct",
    "erase",
    "answer",
    "typeset",
  ];

  // 1. Verify all expected tools are handled in canonicalToolName
  for (const tool of expectedTools) {
    if (canonicalToolName(tool) !== tool) {
      errors.push(`canonicalToolName does not canonicalize tool "${tool}" to itself`);
    }
  }

  // 2. Verify all expected tools are listed in CODE_SYSTEM_PROMPT_EXTRA enum
  let schemaObj: { properties?: { intent?: { enum?: string[] }; commands?: { items?: { properties?: { tool?: { enum?: string[] } } } } } } = {};
  try {
    const jsonStr = CODE_SYSTEM_PROMPT_EXTRA.replace(/^[^{]*/, "");
    schemaObj = JSON.parse(jsonStr);
  } catch (err) {
    errors.push(`Failed to parse JSON Schema from CODE_SYSTEM_PROMPT_EXTRA: ${String(err)}`);
  }

  const schemaTools = schemaObj.properties?.commands?.items?.properties?.tool?.enum ?? [];
  for (const tool of expectedTools) {
    if (!schemaTools.includes(tool)) {
      errors.push(`Schema in CODE_SYSTEM_PROMPT_EXTRA missing tool "${tool}" in enum`);
    }
  }

  // 3. Verify all expected intents are in schema enum
  const schemaIntents = schemaObj.properties?.intent?.enum ?? [];
  for (const intent of expectedIntents) {
    if (!schemaIntents.includes(intent)) {
      errors.push(`Schema in CODE_SYSTEM_PROMPT_EXTRA missing intent "${intent}" in enum`);
    }
  }

  // 4. Verify all tools are documented in SYSTEM_PROMPT command contracts
  for (const tool of expectedTools) {
    if (!SYSTEM_PROMPT.includes(tool)) {
      errors.push(`SYSTEM_PROMPT missing command contract documentation for tool "${tool}"`);
    }
  }

  // 5. Verify routing prompt covers primary modalities
  if (!PLUGIN_ROUTING_PROMPT.includes("animate_scene") || !PLUGIN_ROUTING_PROMPT.includes("html_widget")) {
    errors.push(`PLUGIN_ROUTING_PROMPT missing references to core visual tools`);
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.endsWith("contract.test.ts"))) {
  const result = testPromptContract();
  if (result.pass) {
    console.log("✅ Prompt & Tool Schema Contract Test Passed.");
    process.exit(0);
  } else {
    console.error("❌ Prompt Contract Test Failed:\n" + result.errors.join("\n"));
    process.exit(1);
  }
}
