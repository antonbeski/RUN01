// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision — Inference Worker
// All model loading, preprocessing, inference, decoding and tracking runs here.
// The main thread only draws and plays video.
// ─────────────────────────────────────────────────────────────────────────────

/// <reference lib="webworker" />

import type {
  WorkerInMessage,
  WorkerOutMessage,
  ModelConfig,
  BackendType,
  Detection,
} from "../lib/cv/types";
import { letterboxBitmapToImageData, imageDataToTensor, returnTensorBuffer } from "../ml/preprocess";
import { decodeYolov8, decodeDETR, decodeYOLOX } from "../ml/decoders";
import { MODEL_CDN_URLS, getModelManifest } from "../ml/manifest";
import { ByteTracker } from "../tracking/byteTrack";

// ─── Runtime state ─────────────────────────────────────────────────────────
let session: import("onnxruntime-web").InferenceSession | null = null;
let tracker: ByteTracker | null = null;
let currentConfig: ModelConfig | null = null;
let activeBackend: BackendType = "unknown";
let modelId = "";

// ─── ORT import ────────────────────────────────────────────────────────────
// Dynamic import so the worker can be used with or without WebGPU support
let ort: typeof import("onnxruntime-web") | null = null;

async function getOrt() {
  if (ort) return ort;
  try {
    // Try WebGPU variant first
    ort = await import("onnxruntime-web/webgpu") as typeof import("onnxruntime-web");
  } catch {
    ort = await import("onnxruntime-web");
  }
  return ort;
}

// ─── Post typed messages ────────────────────────────────────────────────────
function post(msg: WorkerOutMessage, transfer?: Transferable[]) {
  if (transfer) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

// ─── Load model ────────────────────────────────────────────────────────────
async function initModel(mid: string, config: ModelConfig, wasmPaths: string): Promise<void> {
  const rtOrt = await getOrt();
  
  // Configure WASM paths
  rtOrt.env.wasm.wasmPaths = wasmPaths;
  rtOrt.env.wasm.simd = true;
  rtOrt.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 2)
    : 1;

  post({ type: "loading", progress: 5, message: "Fetching model…" });

  // Fetch model bytes
  const manifest = getModelManifest(mid);
  let modelBytes: ArrayBuffer;

  // Check Cache Storage first
  const cacheKey = `model-${mid}`;
  let cachedResponse: Response | null = null;
  try {
    const cache = await caches.open("run01-models-v1");
    cachedResponse = await cache.match(cacheKey);
  } catch {
    // Cache Storage may be unavailable in some contexts
  }

  if (cachedResponse) {
    post({ type: "loading", progress: 60, message: "Loading from cache…" });
    modelBytes = await cachedResponse.arrayBuffer();
  } else {
    // Fetch from CDN
    const url = MODEL_CDN_URLS[mid];
    if (!url) throw new Error(`No URL for model: ${mid}`);

    post({ type: "loading", progress: 10, message: `Downloading ${manifest?.name ?? mid}…` });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);

    // Stream with progress
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        const progress = 10 + Math.round((received / contentLength) * 50);
        post({ type: "loading", progress, message: `Downloading… ${Math.round(received / 1024 / 1024)}MB` });
      }
    }

    // Concatenate
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    modelBytes = combined.buffer;

    // Cache for next time
    try {
      const cache = await caches.open("run01-models-v1");
      await cache.put(cacheKey, new Response(modelBytes.slice(0)));
    } catch {
      // ignore cache write failures
    }
  }

  post({ type: "loading", progress: 65, message: "Creating inference session…" });

  // Try WebGPU, fallback to WASM
  let ep: BackendType = "unknown";
  try {
    session = await rtOrt.InferenceSession.create(modelBytes, {
      executionProviders: ["webgpu"],
      graphOptimizationLevel: "all",
    });
    ep = "webgpu";
  } catch (e1) {
    console.warn("[InferenceWorker] WebGPU failed, falling back to WASM:", e1);
    try {
      session = await rtOrt.InferenceSession.create(modelBytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      ep = "wasm";
    } catch (e2) {
      throw new Error(`Model load failed on both WebGPU and WASM: ${e2}`);
    }
  }

  activeBackend = ep;
  modelId = mid;
  currentConfig = config;

  post({ type: "loading", progress: 80, message: "Warming up…" });

  // Warm up with 2 dummy inference passes
  const manifest2 = getModelManifest(mid);
  const w = manifest2?.inputWidth ?? 640;
  const h = manifest2?.inputHeight ?? 640;
  const dummyTensor = new rtOrt.Tensor("float32", new Float32Array(3 * w * h), [1, 3, h, w]);
  const inputName = session!.inputNames[0];
  for (let i = 0; i < 2; i++) {
    await session!.run({ [inputName]: dummyTensor });
  }
  dummyTensor.dispose?.();

  // Init tracker
  tracker = new ByteTracker(config);

  post({ type: "loading", progress: 100, message: "Ready" });
  post({ type: "ready", backend: ep, warmupMs: 0 });
}

// ─── Run inference ──────────────────────────────────────────────────────────
async function runFrame(
  id: number,
  mediaTime: number,
  bitmap: ImageBitmap,
  videoWidth: number,
  videoHeight: number,
): Promise<void> {
  if (!session || !currentConfig || !tracker) {
    bitmap.close();
    return;
  }

  const rtOrt = await getOrt();
  const manifest = getModelManifest(modelId);
  const inputW = manifest?.inputWidth ?? 640;
  const inputH = manifest?.inputHeight ?? 640;

  const t0 = performance.now();

  // Preprocess
  const { imageData, lb } = letterboxBitmapToImageData(bitmap, inputW, inputH);
  bitmap.close(); // release as soon as possible

  const mean = manifest?.inputMean ?? [0, 0, 0];
  const std = manifest?.inputStd ?? [1, 1, 1];
  const colorOrder = manifest?.inputColorOrder ?? "RGB";
  const tensorData = imageDataToTensor(imageData, mean as [number,number,number], std as [number,number,number], colorOrder);

  const t1 = performance.now();

  // Inference
  const inputName = session.inputNames[0];
  const inputTensor = new rtOrt.Tensor("float32", tensorData, [1, 3, inputH, inputW]);
  let results: Awaited<ReturnType<typeof session.run>>;
  try {
    results = await session.run({ [inputName]: inputTensor });
  } finally {
    inputTensor.dispose?.();
    returnTensorBuffer(tensorData);
  }

  const t2 = performance.now();

  // Decode
  const outputType = manifest?.outputType ?? "yolov8";
  const confThresh = currentConfig.confidenceThreshold;
  const iouThresh = currentConfig.iouThreshold;
  const classFilter = currentConfig.classFilter;
  let allDetections: Detection[] = [];

  try {
    if (outputType === "yolov8" || outputType === "rtdetr") {
      const outputKey = results.output0 ? "output0" : Object.keys(results)[0];
      const output = results[outputKey];
      const raw = output.data as Float32Array;
      allDetections = decodeYolov8(raw, output.dims as number[], lb, videoWidth, videoHeight, confThresh, iouThresh, classFilter);
    } else if (outputType === "detr") {
      const logitsKey = results.logits ? "logits" : Object.keys(results)[0];
      const boxesKey = results.pred_boxes ? "pred_boxes" : Object.keys(results)[1];
      const logitsT = results[logitsKey];
      const boxesT = results[boxesKey];
      const numQ = logitsT.dims[1] as number;
      const numC = logitsT.dims[2] as number;
      allDetections = decodeDETR(
        logitsT.data as Float32Array,
        boxesT.data as Float32Array,
        numQ, numC, lb, videoWidth, videoHeight,
        confThresh, iouThresh, classFilter, true,
      );
    } else if (outputType === "yolox") {
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      allDetections = decodeYOLOX(
        output.data as Float32Array,
        output.dims as number[],
        lb, videoWidth, videoHeight, confThresh, iouThresh, classFilter,
      );
    }
  } finally {
    // Dispose output tensors
    for (const t of Object.values(results)) {
      (t as { dispose?: () => void }).dispose?.();
    }
  }

  const t3 = performance.now();

  // Track
  const tracks = tracker.update(allDetections, mediaTime);

  const t4 = performance.now();

  post({
    type: "result",
    id,
    mediaTime,
    detections: allDetections,
    tracks,
    timings: {
      pre: t1 - t0,
      infer: t2 - t1,
      post: t3 - t2,
      track: t4 - t3,
      total: t4 - t0,
    },
  });
}

// ─── Message handler ────────────────────────────────────────────────────────
self.addEventListener("message", async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "init":
        await initModel(msg.modelId, msg.config, msg.wasmPaths);
        break;

      case "frame":
        await runFrame(msg.id, msg.mediaTime, msg.bitmap, msg.videoWidth, msg.videoHeight);
        break;

      case "config":
        currentConfig = msg.config;
        if (tracker) tracker.updateConfig(msg.config);
        break;

      case "reset_tracker":
        tracker?.reset();
        break;

      case "dispose":
        session?.release?.();
        session = null;
        tracker = null;
        break;
    }
  } catch (err) {
    post({
      type: "error",
      message: String(err),
      fatal: msg.type === "init",
    });
  }
});
