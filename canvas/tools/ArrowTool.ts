import { LineTool } from "./LineTool";

/**
 * ArrowTool (§8):
 * Extends LineTool behavior, creating ArrowElement objects with arrowheads.
 */
export class ArrowTool extends LineTool {
  constructor() {
    super("arrow", "arrow");
  }
}
