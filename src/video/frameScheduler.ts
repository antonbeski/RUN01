// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision — Frame Scheduler
// Uses requestVideoFrameCallback (with rAF fallback) to drive the inference
// pipeline at exactly the video frame rate, decoupled from display rendering.
// ─────────────────────────────────────────────────────────────────────────────

export type FrameCallback = (
  mediaTime: number,
  bitmap: ImageBitmap,
  videoWidth: number,
  videoHeight: number,
  frameId: number,
) => void;

export interface FrameSchedulerOptions {
  /** Target capture width (image will be captured at video native size, but
   *  createImageBitmap will resize if specified) */
  captureWidth?: number;
  captureHeight?: number;
  /** Minimum seconds between captured frames (throttle for slow devices) */
  minInterval?: number;
}

let _frameId = 0;

export class FrameScheduler {
  private video: HTMLVideoElement;
  private callback: FrameCallback;
  private options: Required<FrameSchedulerOptions>;
  private running = false;
  private lastCaptureTime = -Infinity;
  private lastVideoTime = -1;
  private rafId: number | null = null;
  private useRVFC: boolean;

  constructor(
    video: HTMLVideoElement,
    callback: FrameCallback,
    options: FrameSchedulerOptions = {},
  ) {
    this.video = video;
    this.callback = callback;
    this.options = {
      captureWidth: options.captureWidth ?? 0, // 0 = native
      captureHeight: options.captureHeight ?? 0,
      minInterval: options.minInterval ?? 0,
    };
    this.useRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.useRVFC) {
      this.scheduleRVFC();
    } else {
      this.scheduleRAF();
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setMinInterval(secs: number): void {
    this.options.minInterval = secs;
  }

  // ── requestVideoFrameCallback path ────────────────────────────────────────
  private scheduleRVFC(): void {
    if (!this.running) return;
    (this.video as HTMLVideoElement & {
      requestVideoFrameCallback: (cb: (now: DOMHighResTimeStamp, meta: { mediaTime: number }) => void) => number;
    }).requestVideoFrameCallback(this.onRVFC.bind(this));
  }

  private onRVFC(_now: DOMHighResTimeStamp, meta: { mediaTime: number }): void {
    if (!this.running) return;
    this.processFrame(meta.mediaTime);
    this.scheduleRVFC(); // re-register for next frame
  }

  // ── requestAnimationFrame fallback ────────────────────────────────────────
  private scheduleRAF(): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.onRAF.bind(this));
  }

  private onRAF(): void {
    if (!this.running) return;
    const mediaTime = this.video.currentTime;
    // Skip if same video frame
    if (mediaTime !== this.lastVideoTime) {
      this.lastVideoTime = mediaTime;
      this.processFrame(mediaTime);
    }
    this.scheduleRAF();
  }

  // ── Shared capture logic ──────────────────────────────────────────────────
  private processFrame(mediaTime: number): void {
    const now = performance.now() / 1000;
    if (now - this.lastCaptureTime < this.options.minInterval) return;
    if (this.video.paused || this.video.ended || this.video.readyState < 2) return;

    const vW = this.video.videoWidth;
    const vH = this.video.videoHeight;
    if (vW === 0 || vH === 0) return;

    this.lastCaptureTime = now;

    // Create bitmap, optionally resizing
    const opts: ImageBitmapOptions = {};
    if (this.options.captureWidth > 0 && this.options.captureHeight > 0) {
      opts.resizeWidth = this.options.captureWidth;
      opts.resizeHeight = this.options.captureHeight;
      opts.resizeQuality = "low";
    }

    createImageBitmap(this.video, opts).then(bitmap => {
      const frameId = ++_frameId;
      this.callback(mediaTime, bitmap, vW, vH, frameId);
    }).catch(() => {
      // video may not be ready; ignore
    });
  }
}
