import { ImageItem, CANVAS_SIZE } from "./types";

export async function prepareImportedImage(file: File | Blob): Promise<{
  blob: Blob;
  image: HTMLImageElement;
  naturalW: number;
  naturalH: number;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        blob: file,
        image: img,
        naturalW: img.naturalWidth || img.width,
        naturalH: img.naturalHeight || img.height,
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export function createImageItem(
  id: string,
  x: number,
  y: number,
  prepared: {
    blob: Blob;
    image: HTMLImageElement;
    naturalW: number;
    naturalH: number;
  },
  maxWidth: number = 600
): ImageItem {
  let w = prepared.naturalW;
  let h = prepared.naturalH;

  if (w > maxWidth) {
    const scale = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * scale);
  }

  const fittedX = Math.max(0, Math.min(CANVAS_SIZE - w, x));
  const fittedY = Math.max(0, Math.min(CANVAS_SIZE - h, y));

  return {
    id,
    kind: "image",
    x: fittedX,
    y: fittedY,
    w,
    h,
    naturalW: prepared.naturalW,
    naturalH: prepared.naturalH,
    blob: prepared.blob,
    image: prepared.image,
  };
}
