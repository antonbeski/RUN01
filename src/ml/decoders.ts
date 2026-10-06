// ─────────────────────────────────────────────────────────────────────────────
// Output decoders for different model architectures
// ─────────────────────────────────────────────────────────────────────────────

import type { Detection } from "../lib/cv/types";
import { COCO_CLASSES } from "../lib/cv/types";
import { undoLetterbox, type LetterboxResult } from "./preprocess";
import { multiClassNMS } from "./nms";

/**
 * Decode YOLOv8 / YOLOv9 / YOLOv10 output.
 * Output shape: [1, 4+numClasses, N] (anchor-free)
 * Box format: cx,cy,w,h in input pixels
 */
export function decodeYolov8(
  rawOutput: Float32Array,
  dims: number[],
  lb: LetterboxResult,
  origW: number,
  origH: number,
  confThreshold: number,
  iouThreshold: number,
  classFilter: number[],
): Detection[] {
  // dims = [1, 4+C, N]
  const numChannels = dims[1];
  const numPreds = dims[2];
  const numClasses = numChannels - 4;

  const boxes: number[] = [];
  const scores: number[] = [];
  const classIds: number[] = [];

  for (let i = 0; i < numPreds; i++) {
    const cx = rawOutput[0 * numPreds + i];
    const cy = rawOutput[1 * numPreds + i];
    const w  = rawOutput[2 * numPreds + i];
    const h  = rawOutput[3 * numPreds + i];

    let maxScore = 0;
    let maxClass = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = rawOutput[(4 + c) * numPreds + i];
      if (s > maxScore) { maxScore = s; maxClass = c; }
    }

    if (maxScore < confThreshold) continue;
    if (classFilter.length > 0 && !classFilter.includes(maxClass)) continue;

    const [bx, by, bw, bh] = undoLetterbox(cx, cy, w, h, lb, true, origW, origH);
    boxes.push(bx, by, bw, bh);
    scores.push(maxScore);
    classIds.push(maxClass);
  }

  const N = scores.length;
  const boxFlat = new Float32Array(boxes);
  const kept = multiClassNMS(boxFlat, scores, classIds, iouThreshold);

  return kept.map(idx => ({
    classId: classIds[idx],
    className: COCO_CLASSES[classIds[idx]] ?? `class_${classIds[idx]}`,
    confidence: scores[idx],
    bbox: [boxFlat[idx*4], boxFlat[idx*4+1], boxFlat[idx*4+2], boxFlat[idx*4+3]] as [number,number,number,number],
  }));
  void N;
}

/**
 * Decode DETR / RF-DETR / RT-DETR output.
 * logits: [1, Q, C]  boxes: [1, Q, 4] in normalized (cx,cy,w,h)
 * Uses sigmoid on logits (not softmax for RF-DETR).
 */
export function decodeDETR(
  logits: Float32Array,
  boxes: Float32Array,
  numQueries: number,
  numClasses: number,
  lb: LetterboxResult,
  origW: number,
  origH: number,
  confThreshold: number,
  iouThreshold: number,
  classFilter: number[],
  useBackground = false, // if true, class 0 is background (skip it)
): Detection[] {
  const outBoxes: number[] = [];
  const outScores: number[] = [];
  const outClassIds: number[] = [];

  const startClass = useBackground ? 1 : 0;

  for (let q = 0; q < numQueries; q++) {
    let maxScore = 0;
    let maxClass = startClass;
    for (let c = startClass; c < numClasses; c++) {
      const logit = logits[q * numClasses + c];
      const score = 1 / (1 + Math.exp(-logit)); // sigmoid
      if (score > maxScore) { maxScore = score; maxClass = c; }
    }
    if (maxScore < confThreshold) continue;
    const classIdx = useBackground ? maxClass - 1 : maxClass;
    if (classFilter.length > 0 && !classFilter.includes(classIdx)) continue;

    // Normalized cx,cy,w,h -> model input pixels
    const ncx = boxes[q * 4] * lb.inputW;
    const ncy = boxes[q * 4 + 1] * lb.inputH;
    const nw  = boxes[q * 4 + 2] * lb.inputW;
    const nh  = boxes[q * 4 + 3] * lb.inputH;

    const [bx, by, bw, bh] = undoLetterbox(ncx, ncy, nw, nh, lb, true, origW, origH);
    outBoxes.push(bx, by, bw, bh);
    outScores.push(maxScore);
    outClassIds.push(classIdx);
  }

  const boxFlat = new Float32Array(outBoxes);
  const kept = multiClassNMS(boxFlat, outScores, outClassIds, iouThreshold);

  return kept.map(idx => ({
    classId: outClassIds[idx],
    className: COCO_CLASSES[outClassIds[idx]] ?? `class_${outClassIds[idx]}`,
    confidence: outScores[idx],
    bbox: [boxFlat[idx*4], boxFlat[idx*4+1], boxFlat[idx*4+2], boxFlat[idx*4+3]] as [number,number,number,number],
  }));
}

/**
 * Decode YOLOX output.
 * Output: [1, N, 5+C] with objectness*class_score
 * Boxes are already decoded from grid (depends on ONNX export)
 */
export function decodeYOLOX(
  rawOutput: Float32Array,
  dims: number[],
  lb: LetterboxResult,
  origW: number,
  origH: number,
  confThreshold: number,
  iouThreshold: number,
  classFilter: number[],
): Detection[] {
  const N = dims[1] ?? dims[2];
  const stride = dims[2] ?? dims[1];
  const numClasses = stride - 5;

  const outBoxes: number[] = [];
  const outScores: number[] = [];
  const outClassIds: number[] = [];

  for (let i = 0; i < N; i++) {
    const base = i * stride;
    const cx  = rawOutput[base];
    const cy  = rawOutput[base + 1];
    const w   = rawOutput[base + 2];
    const h   = rawOutput[base + 3];
    const obj = rawOutput[base + 4];

    let maxCls = 0;
    let maxClsScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = rawOutput[base + 5 + c];
      if (s > maxClsScore) { maxClsScore = s; maxCls = c; }
    }
    const score = obj * maxClsScore;
    if (score < confThreshold) continue;
    if (classFilter.length > 0 && !classFilter.includes(maxCls)) continue;

    const [bx, by, bw, bh] = undoLetterbox(cx, cy, w, h, lb, true, origW, origH);
    outBoxes.push(bx, by, bw, bh);
    outScores.push(score);
    outClassIds.push(maxCls);
  }

  const boxFlat = new Float32Array(outBoxes);
  const kept = multiClassNMS(boxFlat, outScores, outClassIds, iouThreshold);

  return kept.map(idx => ({
    classId: outClassIds[idx],
    className: COCO_CLASSES[outClassIds[idx]] ?? `class_${outClassIds[idx]}`,
    confidence: outScores[idx],
    bbox: [boxFlat[idx*4], boxFlat[idx*4+1], boxFlat[idx*4+2], boxFlat[idx*4+3]] as [number,number,number,number],
  }));
}
