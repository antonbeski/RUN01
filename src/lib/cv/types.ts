// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision Studio — Shared Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type CVTask = "detect" | "track" | "segment" | "pose";
export type ModelSize = "nano" | "small" | "medium";
export type ProcessingMode = "realtime" | "accurate" | "eco";
export type BackendType = "webgpu" | "wasm" | "unknown";
export type InputSize = 320 | 384 | 512 | 640;

export interface Point { x: number; y: number; }
export type BBox = [number, number, number, number]; // x, y, w, h (image-space pixels)

export interface Keypoint {
  x: number;
  y: number;
  confidence: number;
  name?: string;
}

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  bbox: BBox; // x,y,w,h in original video pixels
  mask?: number[][];
  keypoints?: Keypoint[];
  trackId?: number;
  color?: string;
}

export interface Track {
  id: number;
  classId: number;
  className: string;
  score: number;         // EMA score
  bbox: BBox;           // current predicted/measured box
  state: "active" | "lost" | "removed";
  age: number;          // frames since confirmed
  hitStreak: number;    // consecutive matches
  timeSinceUpdate: number; // seconds since last detection update
  velocity: [number, number]; // vx, vy in px/s (image space)
  trail: Point[];       // center trail history
}

export interface FrameResult {
  frameIndex: number;
  timestamp: number;    // video mediaTime
  detections: Detection[];
  tracks: Track[];
  timings?: {
    pre: number;
    infer: number;
    post: number;
    track: number;
    total: number;
  };
}

export interface CVJob {
  id: string;
  status: "idle" | "processing" | "done" | "error";
  progress: number;
  totalFrames: number;
  processedFrames: number;
  results: FrameResult[];
  outputUrl?: string;
  error?: string;
  mode: ProcessingMode;
  backend: BackendType;
  fps: number;         // actual detection fps
  displayFps: number;  // actual display fps
  latencyMs: number;   // end-to-end latency
}

export interface ModelManifestEntry {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  description: string;
  sizeMB: number;
  license: string;
  source: string;
  inputWidth: number;
  inputHeight: number;
  inputLayout: "NCHW" | "NHWC";
  inputColorOrder: "RGB" | "BGR";
  inputMean: [number, number, number];
  inputStd: [number, number, number];
  inputScale: number;
  inputDtype: "float32" | "float16";
  outputType: "detr" | "yolov8" | "yolox" | "rtdetr";
  numClasses: number;
  classIdOffset: number; // 0 for standard 80-class, 1 for 91-class COCO
  defaultScore: number;
  defaultNms: number;
  recommended: { webgpu: boolean; wasm: boolean };
  // Chunked file info (0B.3 approach)
  chunks?: Array<{ file: string; bytes: number; sha256: string }>;
  sha256?: string;
  totalBytes?: number;
}

export interface ModelConfig {
  task: CVTask;
  modelId: string;
  inputSize: InputSize;
  confidenceThreshold: number;
  iouThreshold: number;
  lowScoreThreshold: number;  // for ByteTrack second association
  classFilter: number[];
  processingMode: ProcessingMode;
  // Display
  showBoxes: boolean;
  showLabels: boolean;
  showConfidence: boolean;
  showTrackIds: boolean;
  showTrails: boolean;
  trailLength: number;
  palette: "default" | "neon" | "pastel" | "mono";
  // Tracking
  trackBuffer: number; // seconds to keep lost tracks
  minHits: number;     // min consecutive detections to confirm track
}

export const DEFAULT_CONFIG: ModelConfig = {
  task: "detect",
  modelId: "yolov8n-cdn",
  inputSize: 640,
  confidenceThreshold: 0.35,
  iouThreshold: 0.45,
  lowScoreThreshold: 0.10,
  classFilter: [],
  processingMode: "realtime",
  showBoxes: true,
  showLabels: true,
  showConfidence: true,
  showTrackIds: true,
  showTrails: true,
  trailLength: 30,
  palette: "default",
  trackBuffer: 2.0,
  minHits: 2,
};

export const COCO_CLASSES: string[] = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
  "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
  "remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier",
  "toothbrush",
];

export const COCO_CLASS_GROUPS: Record<string, number[]> = {
  People: [0],
  Vehicles: [1, 2, 3, 4, 5, 6, 7, 8],
  Animals: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  Electronics: [62, 63, 64, 65, 66, 67, 72, 73, 74, 75, 76],
  "Food & Kitchen": [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
  "Sports & Outdoors": [29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
  Furniture: [56, 57, 58, 59, 60, 61],
};

export const PALETTES: Record<string, string[]> = {
  default: ["#9B5CF6","#F97316","#EC4899","#10B981","#3B82F6","#EAB308","#EF4444","#06B6D4","#8B5CF6","#84CC16","#F59E0B","#14B8A6"],
  neon: ["#FF00FF","#00FFFF","#00FF00","#FFFF00","#FF6600","#FF0099","#00FF99","#9900FF","#0099FF","#FF9900","#FF0033","#33FF00"],
  pastel: ["#FFB3BA","#FFDFBA","#FFFFBA","#BAFFC9","#BAE1FF","#D4BAFF","#FFB3E6","#B3FFE6","#FFE4B3","#B3D4FF","#FFC9BA","#C9FFB3"],
  mono: Array(12).fill("#FFFFFF"),
};

// Worker message types
export type WorkerInMessage =
  | { type: "init"; modelId: string; config: ModelConfig; wasmPaths: string }
  | { type: "frame"; id: number; mediaTime: number; bitmap: ImageBitmap; videoWidth: number; videoHeight: number }
  | { type: "config"; config: ModelConfig }
  | { type: "reset_tracker" }
  | { type: "dispose" };

export type WorkerOutMessage =
  | { type: "ready"; backend: BackendType; warmupMs: number }
  | { type: "loading"; progress: number; message: string }
  | { type: "result"; id: number; mediaTime: number; detections: Detection[]; tracks: Track[]; timings: FrameResult["timings"] }
  | { type: "error"; message: string; fatal: boolean };
