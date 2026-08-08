import type { ToolType } from "@/canvas/model/types";

/**
 * Centralized shortcut registry (§62). Tools listed here; all UI must display
 * shortcuts from this registry, never hard-code them.
 */
export const TOOL_SHORTCUTS: { tool: ToolType; keys: string[] }[] = [
  { tool: "select", keys: ["v", "1"] },
  { tool: "hand", keys: ["h"] },
  { tool: "rectangle", keys: ["r", "2"] },
  { tool: "diamond", keys: ["d", "3"] },
  { tool: "ellipse", keys: ["o", "4"] },
  { tool: "arrow", keys: ["a", "5"] },
  { tool: "line", keys: ["l", "6"] },
  { tool: "freedraw", keys: ["p", "7"] },
  { tool: "text", keys: ["t", "8"] },
  { tool: "image", keys: ["9"] },
  { tool: "eraser", keys: ["e", "0"] },
  { tool: "frame", keys: ["f"] },
  { tool: "laser", keys: ["k"] },
];

export function toolForKey(key: string): ToolType | null {
  const lower = key.toLowerCase();
  for (const entry of TOOL_SHORTCUTS) {
    if (entry.keys.includes(lower)) return entry.tool;
  }
  return null;
}
