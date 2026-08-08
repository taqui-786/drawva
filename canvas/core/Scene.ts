import type { CanvasElement, ElementId } from "@/canvas/model/types";
import { bumpVersion } from "@canvas/model/elementFactory";

/**
 * Scene owns the document elements. It is the ONLY place elements are mutated.
 * Selection, camera, drag state etc. never live here (§25, §56).
 */
export class Scene {
  private elements = new Map<ElementId, CanvasElement>();

  getElements(): CanvasElement[] {
    return [...this.elements.values()];
  }

  getNonDeletedElements(): CanvasElement[] {
    return this.getElements().filter((el) => !el.isDeleted);
  }

  getElement(id: ElementId): CanvasElement | undefined {
    return this.elements.get(id);
  }

  getElementsByIds(ids: Iterable<ElementId>): CanvasElement[] {
    const out: CanvasElement[] = [];
    for (const id of ids) {
      const el = this.elements.get(id);
      if (el && !el.isDeleted) out.push(el);
    }
    return out;
  }

  addElement(el: CanvasElement): void {
    this.elements.set(el.id, el);
  }

  removeElement(id: ElementId): void {
    this.elements.delete(id);
  }

  /** Replace an element wholesale (used by history rollback). */
  replaceElement(el: CanvasElement): void {
    this.elements.set(el.id, el);
  }

  /** Common update path: marks the element as changed (versions matter for history/collab). */
  updateElement(id: ElementId, mutator: (el: CanvasElement) => void): void {
    const el = this.elements.get(id);
    if (!el) return;
    mutator(el);
    bumpVersion(el);
  }

  replaceAll(elements: CanvasElement[]): void {
    this.elements = new Map(elements.map((el) => [el.id, el]));
  }

  /** Duplication/paste helper: structural deep-clone; caller assigns new ids and repairs bindings. */
  cloneElement(el: CanvasElement): CanvasElement {
    return structuredClone(el);
  }
}
