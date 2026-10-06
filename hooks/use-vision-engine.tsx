// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision — useVisionEngine Hook
// Connects the inference worker, frame scheduler, overlay rendering, and
// camera/file sources into a single clean API for the React UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useCallback, useEffect } from "react";
import type {
  ModelConfig,
  Track,
  Detection,
  BackendType,
} from "../lib/cv/types";
import { DEFAULT_CONFIG } from "../lib/cv/types";
import { FrameScheduler } from "../video/frameScheduler";
import type { WorkerInMessage, WorkerOutMessage } from "../lib/cv/types";

export type SourceMode = "idle" | "file" | "camera";

export interface VisionStats {
  backend: BackendType;
  detectorHz: number;
  displayFps: number;
  latencyMs: number;
  objectCount: number;
  trackCount: number;
}

export interface VisionEngineState {
  sourceMode: SourceMode;
  isLoading: boolean;
  loadingProgress: number;
  loadingMessage: string;
  isRunning: boolean;
  error: string | null;
  tracks: Track[];
  detections: Detection[];
  stats: VisionStats;
  isMirrored: boolean;
}

export interface VisionEngineAPI {
  state: VisionEngineState;
  config: ModelConfig;
  setConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Source control
  startCamera: (deviceId?: string, facingMode?: "user" | "environment") => Promise<void>;
  stopCamera: () => void;
  loadFile: (file: File) => void;
  clearFile: () => void;
  // Playback
  play: () => void;
  pause: () => void;
  // Model
  resetTracker: () => void;
  // Export
  exportJSON: () => void;
  exportCSV: () => void;
  takeScreenshot: () => void;
}

const DEFAULT_STATS: VisionStats = {
  backend: "unknown",
  detectorHz: 0,
  displayFps: 0,
  latencyMs: 0,
  objectCount: 0,
  trackCount: 0,
};

export function useVisionEngine(): VisionEngineAPI {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const workerBusyRef = useRef(false);
  const workerReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Perf tracking
  const detFrameTimesRef = useRef<number[]>([]);
  const displayFrameTimesRef = useRef<number[]>([]);
  const lastLatencyRef = useRef(0);

  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<VisionEngineState>({
    sourceMode: "idle",
    isLoading: false,
    loadingProgress: 0,
    loadingMessage: "",
    isRunning: false,
    error: null,
    tracks: [],
    detections: [],
    stats: DEFAULT_STATS,
    isMirrored: false,
  });

  // Current results for the render loop (ref to avoid stale closures)
  const currentTracksRef = useRef<Track[]>([]);
  const currentDetectionsRef = useRef<Detection[]>([]);
  const currentBackendRef = useRef<BackendType>("unknown");

  // ─── Worker lifecycle ──────────────────────────────────────────────────────
  const initWorker = useCallback((modelId: string, cfg: ModelConfig) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "dispose" } satisfies WorkerInMessage);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    workerReadyRef.current = false;
    workerBusyRef.current = false;

    setState(s => ({
      ...s,
      isLoading: true,
      loadingProgress: 0,
      loadingMessage: "Starting worker…",
      error: null,
    }));

    const worker = new Worker(
      new URL("../workers/inference.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case "loading":
          setState(s => ({
            ...s,
            loadingProgress: msg.progress,
            loadingMessage: msg.message,
          }));
          break;

        case "ready":
          workerReadyRef.current = true;
          currentBackendRef.current = msg.backend;
          setState(s => ({
            ...s,
            isLoading: false,
            loadingProgress: 100,
            loadingMessage: "",
            isRunning: true,
            stats: { ...s.stats, backend: msg.backend },
          }));
          startRenderLoop();
          break;

        case "result":
          workerBusyRef.current = false;
          currentTracksRef.current = msg.tracks;
          currentDetectionsRef.current = msg.detections;
          lastLatencyRef.current = msg.timings?.total ?? 0;
          // Record detection time for Hz calculation
          detFrameTimesRef.current.push(performance.now());
          if (detFrameTimesRef.current.length > 30) detFrameTimesRef.current.shift();
          break;

        case "error":
          setState(s => ({
            ...s,
            isLoading: false,
            error: msg.message,
            isRunning: !msg.fatal,
          }));
          if (msg.fatal) workerBusyRef.current = false;
          break;
      }
    };

    worker.onerror = (e) => {
      setState(s => ({ ...s, isLoading: false, error: e.message }));
    };

    // Send init message
    worker.postMessage({
      type: "init",
      modelId,
      config: cfg,
      wasmPaths: "/ort/",
    } satisfies WorkerInMessage);
  }, []);

  // ─── Config sync to worker ─────────────────────────────────────────────────
  useEffect(() => {
    if (workerRef.current && workerReadyRef.current) {
      workerRef.current.postMessage({ type: "config", config } satisfies WorkerInMessage);
    }
  }, [config]);

  // Re-init worker when model changes
  const prevModelIdRef = useRef(config.modelId);
  useEffect(() => {
    if (config.modelId !== prevModelIdRef.current) {
      prevModelIdRef.current = config.modelId;
      initWorker(config.modelId, config);
    }
  }, [config.modelId, config, initWorker]);

  // ─── Render loop (main thread overlay drawing) ─────────────────────────────
  const startRenderLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Sync canvas size to video display size (accounting for DPR)
      const dpr = window.devicePixelRatio || 1;
      const rect = video.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Draw tracks
      const tracks = currentTracksRef.current;
      const detections = currentDetectionsRef.current;
      if ((tracks.length > 0 || detections.length > 0) && video.videoWidth > 0) {
        drawTracksOnCanvas(ctx, tracks, detections, video, config);
      }

      // Track display FPS
      displayFrameTimesRef.current.push(performance.now());
      if (displayFrameTimesRef.current.length > 60) displayFrameTimesRef.current.shift();

      // Update stats every 30 frames
      if (displayFrameTimesRef.current.length > 2 && displayFrameTimesRef.current.length % 30 === 0) {
        const displayTimes = displayFrameTimesRef.current;
        const displayFps = displayTimes.length > 1
          ? 1000 * (displayTimes.length - 1) / (displayTimes[displayTimes.length - 1] - displayTimes[0])
          : 0;

        const detTimes = detFrameTimesRef.current;
        const detHz = detTimes.length > 1
          ? 1000 * (detTimes.length - 1) / (detTimes[detTimes.length - 1] - detTimes[0])
          : 0;

        setState(s => ({
          ...s,
          tracks: currentTracksRef.current,
          detections: currentDetectionsRef.current,
          stats: {
            backend: currentBackendRef.current,
            detectorHz: detHz,
            displayFps,
            latencyMs: lastLatencyRef.current,
            objectCount: currentDetectionsRef.current.length,
            trackCount: currentTracksRef.current.length,
          },
        }));
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
  }, [config]);

  // ─── Frame scheduler → worker ──────────────────────────────────────────────
  const startScheduler = useCallback((video: HTMLVideoElement) => {
    schedulerRef.current?.stop();
    schedulerRef.current = new FrameScheduler(video, (mediaTime, bitmap, vW, vH, frameId) => {
      if (!workerRef.current || !workerReadyRef.current || workerBusyRef.current) {
        bitmap.close(); // drop frame: worker busy or not ready
        return;
      }
      workerBusyRef.current = true;
      workerRef.current.postMessage(
        { type: "frame", id: frameId, mediaTime, bitmap, videoWidth: vW, videoHeight: vH } satisfies WorkerInMessage,
        [bitmap], // transfer ownership
      );
    });
    schedulerRef.current.start();
  }, []);

  // ─── Source: File ──────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    // Clean up any existing source
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = null;
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      setState(s => ({ ...s, sourceMode: "file", isMirrored: false }));
      initWorker(config.modelId, config);
    };

    video.onerror = () => {
      setState(s => ({ ...s, error: "Cannot decode this video. Try MP4 (H.264) or WebM (VP9)." }));
    };
  }, [config, initWorker]);

  const clearFile = useCallback(() => {
    schedulerRef.current?.stop();
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.src = "";
      video.srcObject = null;
    }
    currentTracksRef.current = [];
    currentDetectionsRef.current = [];
    setState(s => ({ ...s, sourceMode: "idle", isRunning: false, tracks: [], detections: [] }));
  }, []);

  // ─── Source: Camera ────────────────────────────────────────────────────────
  const startCamera = useCallback(async (
    deviceId?: string,
    facingMode: "user" | "environment" = "environment",
  ) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }

    setState(s => ({ ...s, isLoading: true, loadingMessage: "Requesting camera…", error: null }));

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: deviceId ? undefined : facingMode,
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const mirrored = settings.facingMode === "user";

      setState(s => ({
        ...s,
        sourceMode: "camera",
        isLoading: false,
        isMirrored: mirrored,
        error: null,
      }));

      initWorker(config.modelId, config);

      // Handle track ended (device unplugged)
      track.onended = () => {
        setState(s => ({ ...s, sourceMode: "idle", isRunning: false, error: "Camera disconnected." }));
      };
    } catch (err) {
      const errMsg = err instanceof DOMException
        ? (err.name === "NotAllowedError"
          ? "Camera access denied. Allow access in browser settings."
          : err.name === "NotFoundError"
            ? "No camera found."
            : err.message)
        : String(err);
      setState(s => ({ ...s, isLoading: false, error: errMsg }));
    }
  }, [config, initWorker]);

  const stopCamera = useCallback(() => {
    schedulerRef.current?.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    currentTracksRef.current = [];
    currentDetectionsRef.current = [];
    setState(s => ({ ...s, sourceMode: "idle", isRunning: false }));
  }, []);

  // ─── Playback controls ────────────────────────────────────────────────────
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
  }, []);

  // ─── Start scheduler when video metadata loaded & worker ready ─────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onReady = () => {
      if (state.isRunning) {
        startScheduler(video);
      }
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("play", onReady);
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("play", onReady);
    };
  }, [state.isRunning, startScheduler]);

  // Stop scheduler when video pauses
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPause = () => schedulerRef.current?.stop();
    const onPlay = () => {
      if (state.isRunning) startScheduler(video);
    };
    const onSeeking = () => {
      // Reset tracker on seek to avoid ghost IDs
      if (workerRef.current && workerReadyRef.current) {
        workerRef.current.postMessage({ type: "reset_tracker" } satisfies WorkerInMessage);
      }
      currentTracksRef.current = [];
    };

    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("seeking", onSeeking);
    return () => {
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("seeking", onSeeking);
    };
  }, [state.isRunning, startScheduler]);

  // ─── Visibility change: pause inference when tab hidden ──────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        schedulerRef.current?.stop();
      } else if (state.isRunning) {
        const video = videoRef.current;
        if (video && !video.paused) startScheduler(video);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [state.isRunning, startScheduler]);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      schedulerRef.current?.stop();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "dispose" } satisfies WorkerInMessage);
        workerRef.current.terminate();
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    };
  }, []);

  // ─── Tracker reset ─────────────────────────────────────────────────────────
  const resetTracker = useCallback(() => {
    if (workerRef.current && workerReadyRef.current) {
      workerRef.current.postMessage({ type: "reset_tracker" } satisfies WorkerInMessage);
    }
    currentTracksRef.current = [];
    currentDetectionsRef.current = [];
  }, []);

  // ─── Exports ───────────────────────────────────────────────────────────────
  const exportJSON = useCallback(() => {
    const data = {
      tracks: currentTracksRef.current,
      detections: currentDetectionsRef.current,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `run01-vision-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportCSV = useCallback(() => {
    const rows = ["id,class,score,x,y,w,h"];
    for (const t of currentTracksRef.current) {
      rows.push(`${t.id},${t.className},${t.score.toFixed(3)},${t.bbox.map(v => v.toFixed(1)).join(",")}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `run01-vision-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const offscreen = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    const ctx2 = offscreen.getContext("2d")!;
    ctx2.drawImage(video, 0, 0);
    ctx2.drawImage(canvas, 0, 0, video.videoWidth, video.videoHeight);
    offscreen.convertToBlob({ type: "image/png" }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `run01-vision-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  return {
    state,
    config,
    setConfig,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    loadFile,
    clearFile,
    play,
    pause,
    resetTracker,
    exportJSON,
    exportCSV,
    takeScreenshot,
  };
}

// ─── Canvas drawing helper ─────────────────────────────────────────────────
import { PALETTES } from "../lib/cv/types";
import type { Track, Detection, ModelConfig as MC } from "../lib/cv/types";

function drawTracksOnCanvas(
  ctx: CanvasRenderingContext2D,
  tracks: Track[],
  _detections: Detection[],
  video: HTMLVideoElement,
  config: MC,
): void {
  const palette = PALETTES[config.palette] ?? PALETTES.default;

  // Video letterbox rect within canvas CSS space
  const vW = video.videoWidth;
  const vH = video.videoHeight;
  const cW = video.clientWidth;
  const cH = video.clientHeight;
  const scale = Math.min(cW / vW, cH / vH);
  const dW = vW * scale;
  const dH = vH * scale;
  const ox = (cW - dW) / 2;
  const oy = (cH - dH) / 2;

  ctx.font = "bold 11px 'DM Mono', monospace";

  for (const track of tracks.slice(0, 200)) {
    const color = palette[track.id % palette.length];
    const [bx, by, bw, bh] = track.bbox;
    const cx = ox + bx * scale;
    const cy = oy + by * scale;
    const cw = bw * scale;
    const ch = bh * scale;
    if (cw < 2 || ch < 2) continue;

    // Trail
    if (config.showTrails && track.trail.length > 1) {
      const pts = track.trail.slice(-config.trailLength);
      for (let i = 1; i < pts.length; i++) {
        const alpha = i / pts.length;
        ctx.strokeStyle = hexRgba(color, alpha * 0.8);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ox + pts[i-1].x * scale, oy + pts[i-1].y * scale);
        ctx.lineTo(ox + pts[i].x   * scale, oy + pts[i].y   * scale);
        ctx.stroke();
      }
    }

    if (!config.showBoxes) continue;

    // Fill
    ctx.fillStyle = hexRgba(color, 0.12);
    ctx.fillRect(cx, cy, cw, ch);

    // Stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    // Label
    const parts: string[] = [];
    if (config.showLabels) parts.push(track.className);
    if (config.showTrackIds) parts.push(`#${track.id}`);
    if (config.showConfidence) parts.push(`${Math.round(track.score * 100)}%`);
    const label = parts.join(" ");
    if (label) {
      const tw = ctx.measureText(label).width;
      const bw2 = tw + 8;
      const bh2 = 18;
      const lx = cx;
      const ly = cy - bh2 > 0 ? cy - bh2 : cy;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, bw2, bh2);
      ctx.fillStyle = "#000";
      ctx.fillText(label, lx + 4, ly + bh2 - 4);
    }
  }

  // Stats HUD
  const backend = "WebGPU";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(cW - 280, 8, 272, 36);
  ctx.fillStyle = "#9B5CF6";
  ctx.font = "10px 'DM Mono', monospace";
  ctx.fillText(`${backend} · ${tracks.length} tracks`, cW - 272, 24);
}

function hexRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
