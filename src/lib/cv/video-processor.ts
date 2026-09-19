import type { FrameResult, ModelConfig } from "./types";

export function extractFrameImageData(
  video: HTMLVideoElement,
  targetWidth?: number,
  targetHeight?: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth ?? video.videoWidth;
  canvas.height = targetHeight ?? video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function getTotalFrames(video: HTMLVideoElement, fps = 25): number {
  return Math.floor(video.duration * fps);
}

export function frameToTimestamp(frameIndex: number, fps = 25): number {
  return frameIndex / fps;
}

export function timestampToFrame(timestamp: number, fps = 25): number {
  return Math.floor(timestamp * fps);
}

export async function seekVideoToFrame(
  video: HTMLVideoElement,
  frameIndex: number,
  fps = 25,
): Promise<void> {
  return new Promise((resolve) => {
    const targetTime = frameIndex / fps;
    video.currentTime = targetTime;
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
  });
}

export type ProgressCallback = (processed: number, total: number) => void;
export type FrameCallback = (result: FrameResult) => void;

export async function processVideoFrames(
  video: HTMLVideoElement,
  runInference: (imageData: ImageData) => Promise<FrameResult["detections"]>,
  config: ModelConfig,
  onProgress: ProgressCallback,
  onFrame: FrameCallback,
  signal?: AbortSignal,
  fps = 25,
): Promise<FrameResult[]> {
  const totalFrames = getTotalFrames(video, fps);
  const results: FrameResult[] = [];
  const stride = Math.max(1, config.stride);

  for (let frame = 0; frame < totalFrames; frame += stride) {
    if (signal?.aborted) break;

    await seekVideoToFrame(video, frame, fps);
    const imageData = extractFrameImageData(video, 640, 640);
    const detections = await runInference(imageData);
    const result: FrameResult = {
      frameIndex: frame,
      timestamp: frameToTimestamp(frame, fps),
      detections,
    };
    results.push(result);
    onFrame(result);
    onProgress(frame + 1, totalFrames);

    // Yield to UI thread
    await new Promise((r) => setTimeout(r, 0));
  }

  return results;
}
