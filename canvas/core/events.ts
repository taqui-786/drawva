export type EditorEvent =
  | "change"          // document elements changed (scene mutations)
  | "selectionChange"
  | "cameraChange"
  | "toolChange"
  | "historyChange"
  | "persist"         // request a debounced persistence write
  | "editingChange";  // e.g. text editing entered/exited

export type EditorEventType = EditorEvent;

export type EditorEventHandler = () => void;

type Handler = () => void;

export class EventEmitter {
  private handlers = new Map<string, Set<Handler>>();

  on(type: EditorEventType, handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  off(type: EditorEventType, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(type: EditorEventType): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) handler();
  }

  clear(): void {
    this.handlers.clear();
  }
}
