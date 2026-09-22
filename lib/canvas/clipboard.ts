import { detectDiagramFormat, type DiagramFormat } from "./diagram";
import type { ObjectItem } from "./objects";
import type { WidgetItem } from "./widgets";

export type ClipboardPayload =
  | { kind: "image"; blob: Blob }
  | { kind: "internal"; data: InternalClipboardData }
  | { kind: "diagram"; format: DiagramFormat; source: string; title?: string }
  | { kind: "formula"; latex: string }
  | { kind: "text"; text: string };

export type InternalClipboardData =
  | { type: "drawva_object"; item: ObjectItem }
  | { type: "drawva_widget"; item: WidgetItem }
  | { type: "drawva_ink"; snapshot: HTMLCanvasElement; w: number; h: number };

// In-memory clipboard fallback for internal rich items
let internalClipboard: InternalClipboardData | null = null;

export function setInternalClipboard(data: InternalClipboardData | null): void {
  internalClipboard = data;
}

export function getInternalClipboard(): InternalClipboardData | null {
  return internalClipboard;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

export function isSvgString(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<svg") &&
    trimmed.endsWith("</svg>") &&
    trimmed.includes("xmlns")
  );
}

export function isDataUrlImage(text: string): boolean {
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(text.trim());
}

export function isImageUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(trimmed);
}

export function isLatexFormula(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) return false;

  // Block or inline delimiters: $$...$$, $...$, \[...\], \(...\)
  if (
    (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) ||
    (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4) ||
    (trimmed.startsWith("$") && trimmed.endsWith("$") && trimmed.length > 2 && !trimmed.slice(1, -1).includes("\n"))
  ) {
    return true;
  }

  // Strong LaTeX commands indicators
  const latexPatterns = [
    /\\(frac|sqrt|sum|int|prod|lim|alpha|beta|gamma|theta|lambda|pi|sigma|omega|Delta|nabla)\b/,
    /\\(begin|end)\{(matrix|pmatrix|bmatrix|vmatrix|align|aligned|equation|cases)\}/,
    /\\(cdot|times|leq|geq|neq|approx|infty|partial|mathbf|mathcal|text)\b/,
    /\\[a-zA-Z]+(\{[^}]*\})+/,
  ];

  return latexPatterns.some((pattern) => pattern.test(trimmed));
}

export function cleanLatex(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("$$") && cleaned.endsWith("$$")) {
    cleaned = cleaned.slice(2, -2).trim();
  } else if (cleaned.startsWith("\\[") && cleaned.endsWith("\\]")) {
    cleaned = cleaned.slice(2, -2).trim();
  } else if (cleaned.startsWith("$") && cleaned.endsWith("$")) {
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith("\\(") && cleaned.endsWith("\\)")) {
    cleaned = cleaned.slice(2, -2).trim();
  }
  return cleaned;
}

export async function parseClipboardEvent(
  e: ClipboardEvent
): Promise<ClipboardPayload | null> {
  const data = e.clipboardData;
  if (!data) return null;

  // 1. Check for files / images directly in clipboardData
  if (data.files && data.files.length > 0) {
    const file = data.files[0];
    if (file.type.startsWith("image/")) {
      return { kind: "image", blob: file };
    }
  }

  // 2. Check clipboardData.items for image items
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return { kind: "image", blob: file };
      }
    }
  }

  // 3. Check plain text
  const text = data.getData("text/plain") || "";
  if (!text.trim()) return null;

  return parseTextPayload(text);
}

export async function parseTextPayload(text: string): Promise<ClipboardPayload | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // A. Check for internal drawva serialized JSON
  if (trimmed.startsWith("{") && trimmed.includes('"drawva_')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && (parsed.type === "drawva_object" || parsed.type === "drawva_widget")) {
        return { kind: "internal", data: parsed };
      }
    } catch {
      // Ignore JSON parse error, fall through
    }
  }

  // B. Base64 Data URL Image
  if (isDataUrlImage(trimmed)) {
    const blob = await dataUrlToBlob(trimmed);
    if (blob) return { kind: "image", blob };
  }

  // C. Direct SVG source markup
  if (isSvgString(trimmed)) {
    const blob = new Blob([trimmed], { type: "image/svg+xml" });
    return { kind: "image", blob };
  }

  // D. Diagram formats (Mermaid, DOT, Vega-Lite, GeoJSON, Cytoscape, BPMN, SMILES)
  const diagramFmt = detectDiagramFormat(undefined, trimmed);
  if (diagramFmt) {
    return { kind: "diagram", format: diagramFmt, source: trimmed };
  }

  // E. LaTeX Formula
  if (isLatexFormula(trimmed)) {
    return { kind: "formula", latex: cleanLatex(trimmed) };
  }

  // F. Public Image URL (fetch if possible)
  if (isImageUrl(trimmed)) {
    try {
      const res = await fetch(trimmed, { mode: "cors" });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith("image/")) {
          return { kind: "image", blob };
        }
      }
    } catch {
      // If CORS blocks or fetch fails, fall through to text
    }
  }

  // G. Default: Plain text
  return { kind: "text", text: trimmed };
}
