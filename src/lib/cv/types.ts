// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Computer Vision Studio — Shared Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type CVTask = "detect" | "track" | "segment" | "pose";
export type ModelSize = "nano" | "small" | "medium";
export type ProcessingMode = "browser" | "backend";

export interface Point { x: number; y: number; }
export type BBox = [number, number, number, number];

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
  bbox: BBox;
  mask?: number[][];
  keypoints?: Keypoint[];
  trackId?: number;
  color?: string;
}

export interface FrameResult {
  frameIndex: number;
  timestamp: number;
  detections: Detection[];
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
}

export interface ModelConfig {
  task: CVTask;
  modelSize: ModelSize;
  confidenceThreshold: number;
  iouThreshold: number;
  classFilter: number[];
  stride: number;
  showLabels: boolean;
  showConfidence: boolean;
  showTrails: boolean;
  trailLength: number;
  palette: "default" | "neon" | "pastel" | "mono";
}

export const DEFAULT_CONFIG: ModelConfig = {
  task: "detect",
  modelSize: "nano",
  confidenceThreshold: 0.45,
  iouThreshold: 0.45,
  classFilter: [],
  stride: 1,
  showLabels: true,
  showConfidence: true,
  showTrails: true,
  trailLength: 20,
  palette: "default",
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

export const PALETTES: Record<string, string[]> = {
  default: ["#9B5CF6","#F97316","#EC4899","#10B981","#3B82F6","#EAB308","#EF4444","#06B6D4","#8B5CF6","#84CC16","#F59E0B","#14B8A6"],
  neon: ["#FF00FF","#00FFFF","#00FF00","#FFFF00","#FF6600","#FF0099","#00FF99","#9900FF","#0099FF","#FF9900","#FF0033","#33FF00"],
  pastel: ["#FFB3BA","#FFDFBA","#FFFFBA","#BAFFC9","#BAE1FF","#D4BAFF","#FFB3E6","#B3FFE6","#FFE4B3","#B3D4FF","#FFC9BA","#C9FFB3"],
  mono: Array(12).fill("#FFFFFF"),
};
