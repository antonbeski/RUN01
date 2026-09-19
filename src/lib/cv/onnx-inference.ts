import type { Detection, ModelConfig, ModelSize, CVTask } from "./types";
import { COCO_CLASSES } from "./types";

// ONNX model CDN URLs (HuggingFace)
const MODEL_URLS: Record<CVTask, Record<ModelSize, string>> = {
  detect: {
    nano:   "https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx",
    small:  "https://huggingface.co/onnx-community/yolov8s/resolve/main/yolov8s.onnx",
    medium: "https://huggingface.co/onnx-community/yolov8m/resolve/main/yolov8m.onnx",
  },
  track: {
    nano:   "https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx",
    small:  "https://huggingface.co/onnx-community/yolov8s/resolve/main/yolov8s.onnx",
    medium: "https://huggingface.co/onnx-community/yolov8m/resolve/main/yolov8m.onnx",
  },
  segment: {
    nano:   "https://huggingface.co/onnx-community/yolov8n-seg/resolve/main/yolov8n-seg.onnx",
    small:  "https://huggingface.co/onnx-community/yolov8s-seg/resolve/main/yolov8s-seg.onnx",
    medium: "https://huggingface.co/onnx-community/yolov8m-seg/resolve/main/yolov8m-seg.onnx",
  },
  pose: {
    nano:   "https://huggingface.co/onnx-community/yolov8n-pose/resolve/main/yolov8n-pose.onnx",
    small:  "https://huggingface.co/onnx-community/yolov8s-pose/resolve/main/yolov8s-pose.onnx",
    medium: "https://huggingface.co/onnx-community/yolov8m-pose/resolve/main/yolov8m-pose.onnx",
  },
};

let sessionCache: Map<string, unknown> = new Map();

export async function loadModel(task: CVTask, size: ModelSize): Promise<unknown> {
  const key = `${task}-${size}`;
  if (sessionCache.has(key)) return sessionCache.get(key)!;

  const url = MODEL_URLS[task][size];
  // Dynamic import to avoid SSR issues
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/ort-wasm/";

  const session = await ort.InferenceSession.create(url, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  sessionCache.set(key, session);
  return session;
}

/** Non-maximum suppression */
function nms(boxes: number[][], scores: number[], iouThreshold: number): number[] {
  const indices = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);

  const kept: number[] = [];
  const suppressed = new Set<number>();

  for (const i of indices) {
    if (suppressed.has(i)) continue;
    kept.push(i);
    for (const j of indices) {
      if (i === j || suppressed.has(j)) continue;
      if (iou(boxes[i], boxes[j]) > iouThreshold) suppressed.add(j);
    }
  }
  return kept;
}

function iou(a: number[], b: number[]): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const inter = ix * iy;
  const union = aw * ah + bw * bh - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Run YOLOv8 inference on a 640x640 ImageData */
export async function runInference(
  session: unknown,
  imageData: ImageData,
  config: ModelConfig,
  originalW: number,
  originalH: number,
): Promise<Detection[]> {
  const ort = await import("onnxruntime-web");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = session as any;

  // Pre-process: RGBA ImageData -> CHW Float32 tensor [1, 3, 640, 640]
  const { data, width, height } = imageData;
  const tensor = new Float32Array(3 * width * height);
  for (let i = 0; i < width * height; i++) {
    tensor[i]                     = data[i * 4]     / 255; // R
    tensor[i + width * height]    = data[i * 4 + 1] / 255; // G
    tensor[i + 2 * width * height]= data[i * 4 + 2] / 255; // B
  }

  const inputTensor = new ort.Tensor("float32", tensor, [1, 3, height, width]);
  const results = await s.run({ images: inputTensor });

  // YOLOv8 output: [1, 84, 8400] (cx,cy,w,h, 80 class scores)
  const output = results.output0 ?? results[Object.keys(results)[0]];
  const raw = output.data as Float32Array;
  const numDetections = output.dims[2]; // 8400

  const detections: Detection[] = [];
  const scaleX = originalW / width;
  const scaleY = originalH / height;

  const boxes: number[][] = [];
  const scores: number[] = [];
  const classIds: number[] = [];

  for (let i = 0; i < numDetections; i++) {
    // Find best class
    let maxScore = 0;
    let maxClass = 0;
    for (let c = 0; c < 80; c++) {
      const score = raw[(4 + c) * numDetections + i];
      if (score > maxScore) { maxScore = score; maxClass = c; }
    }
    if (maxScore < config.confidenceThreshold) continue;
    if (config.classFilter.length > 0 && !config.classFilter.includes(maxClass)) continue;

    const cx = raw[0 * numDetections + i];
    const cy = raw[1 * numDetections + i];
    const w  = raw[2 * numDetections + i];
    const h  = raw[3 * numDetections + i];

    boxes.push([cx - w / 2, cy - h / 2, w, h]);
    scores.push(maxScore);
    classIds.push(maxClass);
  }

  const kept = nms(boxes, scores, config.iouThreshold);
  for (const idx of kept) {
    const [bx, by, bw, bh] = boxes[idx];
    detections.push({
      classId: classIds[idx],
      className: COCO_CLASSES[classIds[idx]] ?? `class_${classIds[idx]}`,
      confidence: scores[idx],
      bbox: [bx * scaleX, by * scaleY, bw * scaleX, bh * scaleY],
    });
  }
  return detections;
}

export function clearModelCache(): void {
  sessionCache = new Map();
}
