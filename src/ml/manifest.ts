// ─────────────────────────────────────────────────────────────────────────────
// Model manifest — describes available models
// FREE-FOREVER: runtime fetch only from own origin
// Models fetched from CDN are the fallback for non-self-hosted builds
// ─────────────────────────────────────────────────────────────────────────────

import type { ModelManifestEntry } from "../lib/cv/types";

// CDN-based models (fetched at runtime from Hugging Face)
// Note: In a production self-hosted build, these would be
// chunked and committed to public/models/ per section 0B.3
// For development purposes, we use CDN URLs.
export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    id: "yolov8n-cdn",
    name: "YOLOv8 Nano (Fast)",
    tier: 1,
    description: "Fastest model. Best for live camera and real-time. ~6MB.",
    sizeMB: 6,
    license: "AGPL-3.0",
    source: "https://huggingface.co/onnx-community/yolov8n",
    inputWidth: 640,
    inputHeight: 640,
    inputLayout: "NCHW",
    inputColorOrder: "RGB",
    inputMean: [0, 0, 0],
    inputStd: [1, 1, 1],
    inputScale: 1/255,
    inputDtype: "float32",
    outputType: "yolov8",
    numClasses: 80,
    classIdOffset: 0,
    defaultScore: 0.35,
    defaultNms: 0.45,
    recommended: { webgpu: true, wasm: true },
    // CDN URL — used when chunks are not available locally
    chunks: undefined,
  },
  {
    id: "yolov8s-cdn",
    name: "YOLOv8 Small (Balanced)",
    tier: 1,
    description: "Good balance of speed and accuracy. ~22MB.",
    sizeMB: 22,
    license: "AGPL-3.0",
    source: "https://huggingface.co/onnx-community/yolov8s",
    inputWidth: 640,
    inputHeight: 640,
    inputLayout: "NCHW",
    inputColorOrder: "RGB",
    inputMean: [0, 0, 0],
    inputStd: [1, 1, 1],
    inputScale: 1/255,
    inputDtype: "float32",
    outputType: "yolov8",
    numClasses: 80,
    classIdOffset: 0,
    defaultScore: 0.35,
    defaultNms: 0.45,
    recommended: { webgpu: true, wasm: false },
    chunks: undefined,
  },
  {
    id: "yolov8m-cdn",
    name: "YOLOv8 Medium (Accurate)",
    tier: 1,
    description: "Best accuracy for standard classes. ~50MB.",
    sizeMB: 50,
    license: "AGPL-3.0",
    source: "https://huggingface.co/onnx-community/yolov8m",
    inputWidth: 640,
    inputHeight: 640,
    inputLayout: "NCHW",
    inputColorOrder: "RGB",
    inputMean: [0, 0, 0],
    inputStd: [1, 1, 1],
    inputScale: 1/255,
    inputDtype: "float32",
    outputType: "yolov8",
    numClasses: 80,
    classIdOffset: 0,
    defaultScore: 0.35,
    defaultNms: 0.45,
    recommended: { webgpu: true, wasm: false },
    chunks: undefined,
  },
];

/** CDN base URLs for fetching models at runtime */
export const MODEL_CDN_URLS: Record<string, string> = {
  "yolov8n-cdn": "/models/yolov8n.onnx",
  "yolov8s-cdn": "https://huggingface.co/onnx-community/yolov8s/resolve/main/yolov8s.onnx",
  "yolov8m-cdn": "https://huggingface.co/onnx-community/yolov8m/resolve/main/yolov8m.onnx",
};

export function getModelManifest(id: string): ModelManifestEntry | undefined {
  return MODEL_MANIFEST.find(m => m.id === id);
}

export function getDefaultModelId(hasWebGPU: boolean, deviceMemoryGB: number): string {
  if (!hasWebGPU || deviceMemoryGB <= 4) return "yolov8n-cdn";
  return "yolov8n-cdn"; // default to nano for speed; user can upgrade
}
