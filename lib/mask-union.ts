export interface DecodedMask {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

export interface UnionMaskResult {
  blob: Blob;
  width: number;
  height: number;
}

const EDIT_ALPHA = 0;
const PRESERVE_ALPHA = 255;

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export async function decodeMaskPng(blob: Blob): Promise<DecodedMask | null> {
  if (typeof document === "undefined") return null;
  const image = await loadImageFromBlob(blob);
  if (!image || image.width <= 0 || image.height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = imageData.data[index * 4 + 3];
  }
  return { width: canvas.width, height: canvas.height, alpha };
}

export function unionMaskAlpha(masks: readonly DecodedMask[]): DecodedMask | null {
  if (masks.length === 0) return null;
  const first = masks[0];
  const { width, height } = first;
  for (const mask of masks) {
    if (mask.width !== width || mask.height !== height) return null;
  }
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    let editable = false;
    for (const mask of masks) {
      if (mask.alpha[index] === EDIT_ALPHA) {
        editable = true;
        break;
      }
    }
    alpha[index] = editable ? EDIT_ALPHA : PRESERVE_ALPHA;
  }
  return { width, height, alpha };
}

export async function unionMaskPngBlob(
  masks: readonly DecodedMask[],
): Promise<UnionMaskResult | null> {
  const union = unionMaskAlpha(masks);
  if (!union) return null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = union.width;
  canvas.height = union.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.createImageData(union.width, union.height);
  const data = imageData.data;
  for (let index = 0; index < union.alpha.length; index += 1) {
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = union.alpha[index];
  }
  context.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;
  return { blob, width: union.width, height: union.height };
}
