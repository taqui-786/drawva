// ============================================================
// Drawva Canvas Engine — Image Import
// file input → downscale → place as ImageItem
// drag/resize handles; "merge into ink" option
// ============================================================

import type { Camera } from "./camera";
import type { ImageItem } from "./types";

let _nextId = 1;
function newId(): string {
  return `img_${Date.now()}_${_nextId++}`;
}

const MAX_SIDE = 2000; // pixels

/** Downscale an image to max MAX_SIDE on longest side */
async function downscaleImage(img: HTMLImageElement): Promise<string> {
  const { naturalWidth: nw, naturalHeight: nh } = img;
  const scale = nw > nh
    ? Math.min(1, MAX_SIDE / nw)
    : Math.min(1, MAX_SIDE / nh);

  const w = Math.round(nw * scale);
  const h = Math.round(nh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Load a File into an HTMLImageElement */
function loadFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Not an image file"));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export class ImageImporter {
  private camera: Camera;
  private onPlace: (item: ImageItem) => void;
  private onError: (err: Error) => void;

  constructor(
    camera: Camera,
    onPlace: (item: ImageItem) => void,
    onError: (err: Error) => void
  ) {
    this.camera = camera;
    this.onPlace = onPlace;
    this.onError = onError;
  }

  /** Open file picker and place image at world center */
  openFilePicker(viewportW: number, viewportH: number): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return;
      await this.placeFile(file, viewportW / 2, viewportH / 2);
    };

    input.click();
  }

  /** Place a dropped / pasted file at screen coordinates */
  async placeFile(file: File, screenX: number, screenY: number): Promise<void> {
    try {
      const img = await loadFile(file);
      const src = await downscaleImage(img);

      // Place at viewport center in world coords, max 600px wide
      const world = this.camera.screenToWorld({ x: screenX, y: screenY });
      const worldW = Math.min(600 / this.camera.scale, img.naturalWidth);
      const worldH = (worldW / img.naturalWidth) * img.naturalHeight;

      const item: ImageItem = {
        id: newId(),
        kind: "image",
        x: world.x - worldW / 2,
        y: world.y - worldH / 2,
        w: worldW,
        h: worldH,
        src,
      };

      this.onPlace(item);
    } catch (err) {
      this.onError(err as Error);
    }
  }

  /** Handle drag-and-drop DataTransfer */
  async handleDrop(e: DragEvent): Promise<void> {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    await this.placeFile(files[0], e.offsetX, e.offsetY);
  }

  /** Handle paste event (paste image from clipboard) */
  async handlePaste(e: ClipboardEvent, viewportW: number, viewportH: number): Promise<void> {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) await this.placeFile(file, viewportW / 2, viewportH / 2);
        break;
      }
    }
  }
}
