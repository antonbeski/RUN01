import { useState, useRef, useCallback } from "react";
import type { CVJob, ModelConfig } from "../src/lib/cv/types";
import { DEFAULT_CONFIG } from "../src/lib/cv/types";
import { processVideoFrames, timestampToFrame } from "../src/lib/cv/video-processor";
import { loadModel, runInference } from "../src/lib/cv/onnx-inference";

const EMPTY_JOB: CVJob = {
  id: "",
  status: "idle",
  progress: 0,
  totalFrames: 0,
  processedFrames: 0,
  results: [],
  mode: "browser",
};

export function useCVProcessor() {
  const [job, setJob] = useState<CVJob>({ ...EMPTY_JOB, id: crypto.randomUUID() });
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<unknown>(null);

  const currentFrameResult = job.results.find((r) => r.frameIndex === currentFrame) ?? null;

  const loadModelForConfig = useCallback(async () => {
    setIsModelLoading(true);
    try {
      sessionRef.current = await loadModel(config.task, config.modelSize);
    } finally {
      setIsModelLoading(false);
    }
  }, [config.task, config.modelSize]);

  const startProcessing = useCallback(async (video: HTMLVideoElement) => {
    if (!sessionRef.current) {
      await loadModelForConfig();
    }
    if (!sessionRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const id = crypto.randomUUID();
    const origW = video.videoWidth;
    const origH = video.videoHeight;

    setJob({
      id,
      status: "processing",
      progress: 0,
      totalFrames: 0,
      processedFrames: 0,
      results: [],
      mode: "browser",
    });

    try {
      const results = await processVideoFrames(
        video,
        (imgData) => runInference(sessionRef.current!, imgData, config, origW, origH),
        config,
        (processed, total) => {
          setJob((prev) => ({
            ...prev,
            processedFrames: processed,
            totalFrames: total,
            progress: Math.round((processed / total) * 100),
          }));
        },
        (frameResult) => {
          setJob((prev) => ({
            ...prev,
            results: [...prev.results, frameResult],
          }));
        },
        controller.signal,
      );

      setJob((prev) => ({
        ...prev,
        status: controller.signal.aborted ? "idle" : "done",
        progress: 100,
        results,
      }));
    } catch (err) {
      setJob((prev) => ({ ...prev, status: "error", error: String(err) }));
    }
  }, [config, loadModelForConfig]);

  const stopProcessing = useCallback(() => {
    abortRef.current?.abort();
    setJob((prev) => ({ ...prev, status: "idle" }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setJob({ ...EMPTY_JOB, id: crypto.randomUUID() });
    setCurrentFrame(0);
  }, []);

  const seekToTimestamp = useCallback((ts: number, fps = 25) => {
    setCurrentFrame(timestampToFrame(ts, fps));
  }, []);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(job.results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run01-cv-detections-${job.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [job.results, job.id]);

  return {
    job,
    config,
    setConfig,
    currentFrame,
    setCurrentFrame,
    currentFrameResult,
    isModelLoading,
    startProcessing,
    stopProcessing,
    reset,
    loadModelForConfig,
    seekToTimestamp,
    exportJSON,
  };
}