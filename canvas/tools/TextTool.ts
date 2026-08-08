import { createElement } from "@canvas/model/elementFactory";
import type { Editor } from "@/canvas/core/Editor";
import type { TextElement } from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/**
 * TextTool:
 * Click on canvas to create or edit text elements.
 * Uses a prompt dialog or inline editing session for text input.
 */
export class TextTool implements ToolHandler {
  readonly name = "text";
  cursor = "text";

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0) return;

    // Prompt for text input (fallback before full DOM overlay inline editor)
    const text = window.prompt("Enter text:", "Text");
    if (!text || text.trim().length === 0) {
      if (!editor.isToolLocked()) {
        editor.setActiveTool("select");
      }
      return;
    }

    editor.beginTransaction();
    const fontSize = 20;
    const lines = text.split("\n");
    const approxWidth = Math.max(...lines.map((l) => l.length)) * (fontSize * 0.6);
    const approxHeight = lines.length * (fontSize * 1.2);

    const el = createElement("text", {
      id: createId("text"),
      x: e.scene[0],
      y: e.scene[1],
      width: Math.max(40, approxWidth),
      height: Math.max(24, approxHeight),
    }) as TextElement;

    el.text = text;
    editor.history.noteCreated(el.id);
    editor.scene.addElement(el);
    editor.commitHistory();

    editor.selectOnly(el.id);
    if (!editor.isToolLocked()) {
      editor.setActiveTool("select");
    }
  }
}
