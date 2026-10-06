// ─────────────────────────────────────────────────────────────────────────────
// Non-Maximum Suppression — typed array, no object allocation in hot path
// ─────────────────────────────────────────────────────────────────────────────

/** IoU between two [x,y,w,h] boxes */
export function iou(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const inter = ix * iy;
  const union = aw * ah + bw * bh - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Multi-class NMS. Returns indices of kept detections.
 * @param boxes   [N x 4] flat array: x,y,w,h per detection (stride 4)
 * @param scores  [N] scores
 * @param classIds [N] class ids
 * @param iouThreshold IoU threshold for suppression
 * @param topK    Max detections to keep before NMS (per class)
 * @returns Kept indices
 */
export function multiClassNMS(
  boxes: Float32Array | number[],
  scores: Float32Array | number[],
  classIds: Int32Array | number[],
  iouThreshold: number,
  topK = 300,
): number[] {
  const N = scores.length;
  if (N === 0) return [];

  // Group by class
  const byClass = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const c = classIds[i];
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c)!.push(i);
  }

  const kept: number[] = [];
  for (const indices of byClass.values()) {
    // Sort by score descending
    indices.sort((a, b) => scores[b] - scores[a]);
    // Top-K per class
    const candidates = indices.slice(0, topK);
    const suppressed = new Uint8Array(candidates.length);

    for (let i = 0; i < candidates.length; i++) {
      if (suppressed[i]) continue;
      kept.push(candidates[i]);
      const ai = candidates[i];
      const ax = boxes[ai * 4];
      const ay = boxes[ai * 4 + 1];
      const aw = boxes[ai * 4 + 2];
      const ah = boxes[ai * 4 + 3];
      for (let j = i + 1; j < candidates.length; j++) {
        if (suppressed[j]) continue;
        const bi = candidates[j];
        if (iou(ax, ay, aw, ah, boxes[bi*4], boxes[bi*4+1], boxes[bi*4+2], boxes[bi*4+3]) > iouThreshold) {
          suppressed[j] = 1;
        }
      }
    }
  }
  return kept;
}
