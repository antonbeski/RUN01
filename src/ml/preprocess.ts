// ─────────────────────────────────────────────────────────────────────────────
// Pre-processing: letterbox resize + tensor creation
// ─────────────────────────────────────────────────────────────────────────────

export interface LetterboxResult {
  /** Scale factor applied to the original image */
  scale: number;
  /** Horizontal padding in pixels (added to each side) */
  padX: number;
  /** Vertical padding in pixels (added to each side) */
  padY: number;
  /** Model input width */
  inputW: number;
  /** Model input height */
  inputH: number;
}

/**
 * Compute letterbox parameters to fit (srcW x srcH) into (dstW x dstH)
 * while preserving aspect ratio.
 */
export function computeLetterbox(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): LetterboxResult {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((dstW - newW) / 2);
  const padY = Math.floor((dstH - newH) / 2);
  return { scale, padX, padY, inputW: dstW, inputH: dstH };
}

/**
 * Undo letterbox transform: convert a box in model-input space
 * to a box in original video space.
 * @param bx,by,bw,bh  Box in model input pixels (may be cx,cy,w,h or x,y,w,h)
 * @param lb  Letterbox result from computeLetterbox
 * @param isCxCy  true if input is center-format (cx,cy,w,h)
 * @returns [x,y,w,h] in original image pixels, clamped to [0,origW]x[0,origH]
 */
export function undoLetterbox(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  lb: LetterboxResult,
  isCxCy: boolean,
  origW: number,
  origH: number,
): [number, number, number, number] {
  let x: number, y: number;
  if (isCxCy) {
    x = bx - bw / 2;
    y = by - bh / 2;
  } else {
    x = bx;
    y = by;
  }
  // Remove padding
  x -= lb.padX;
  y -= lb.padY;
  // Undo scale
  x /= lb.scale;
  y /= lb.scale;
  bw /= lb.scale;
  bh /= lb.scale;
  // Clamp
  x = Math.max(0, Math.min(origW - 1, x));
  y = Math.max(0, Math.min(origH - 1, y));
  bw = Math.max(0, Math.min(origW - x, bw));
  bh = Math.max(0, Math.min(origH - y, bh));
  return [x, y, bw, bh];
}

/**
 * Draw an ImageBitmap into an OffscreenCanvas with letterboxing.
 * Returns the canvas ImageData for tensor creation.
 * @param bitmap The source frame (already full video size or resized)
 * @param inputW Model input width
 * @param inputH Model input height
 * @param padColor Padding color [R,G,B] (114,114,114 for YOLO-style)
 */
export function letterboxBitmapToImageData(
  bitmap: ImageBitmap,
  inputW: number,
  inputH: number,
  padColor: [number, number, number] = [114, 114, 114],
): { imageData: ImageData; lb: LetterboxResult } {
  const lb = computeLetterbox(bitmap.width, bitmap.height, inputW, inputH);
  const canvas = new OffscreenCanvas(inputW, inputH);
  const ctx = canvas.getContext("2d")!;
  // Fill background
  ctx.fillStyle = `rgb(${padColor[0]},${padColor[1]},${padColor[2]})`;
  ctx.fillRect(0, 0, inputW, inputH);
  // Draw image
  ctx.drawImage(
    bitmap,
    lb.padX,
    lb.padY,
    Math.round(bitmap.width * lb.scale),
    Math.round(bitmap.height * lb.scale),
  );
  return { imageData: ctx.getImageData(0, 0, inputW, inputH), lb };
}

/** Reusable Float32Array buffer pool to avoid per-frame allocation */
const _buffers: Float32Array[] = [];

/**
 * Convert an ImageData (RGBA) to a Float32 CHW tensor (1,3,H,W).
 * Normalizes: pixel = (px/255 - mean) / std
 * @param imageData RGBA image data
 * @param mean Per-channel mean [R,G,B]
 * @param std Per-channel std [R,G,B]
 * @param colorOrder "RGB" or "BGR"
 * @returns Reused or new Float32Array of length 3*H*W
 */
export function imageDataToTensor(
  imageData: ImageData,
  mean: [number, number, number] = [0, 0, 0],
  std: [number, number, number] = [1, 1, 1],
  colorOrder: "RGB" | "BGR" = "RGB",
): Float32Array {
  const { data, width, height } = imageData;
  const n = width * height;
  // Get or allocate buffer
  let buf = _buffers.pop();
  if (!buf || buf.length !== n * 3) {
    buf = new Float32Array(n * 3);
  }
  const [m0, m1, m2] = mean;
  const [s0, s1, s2] = std;

  if (colorOrder === "RGB") {
    for (let i = 0; i < n; i++) {
      buf[i]         = (data[i * 4]     / 255 - m0) / s0; // R
      buf[i + n]     = (data[i * 4 + 1] / 255 - m1) / s1; // G
      buf[i + 2 * n] = (data[i * 4 + 2] / 255 - m2) / s2; // B
    }
  } else {
    for (let i = 0; i < n; i++) {
      buf[i]         = (data[i * 4 + 2] / 255 - m0) / s0; // B
      buf[i + n]     = (data[i * 4 + 1] / 255 - m1) / s1; // G
      buf[i + 2 * n] = (data[i * 4]     / 255 - m2) / s2; // R
    }
  }
  return buf;
}

/** Return a tensor buffer to the pool for reuse */
export function returnTensorBuffer(buf: Float32Array): void {
  _buffers.push(buf);
}
