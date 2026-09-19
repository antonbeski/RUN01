import { useEffect, useRef } from "react";
import type { FrameResult, ModelConfig } from "../../lib/cv/types";
import { drawDetections, clearCanvas } from "../../lib/cv/annotation-renderer";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frameResult: FrameResult | null;
  config: ModelConfig;
  className?: string;
}

export function AnnotationCanvas({ videoRef, frameResult, config, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d")!;
    clearCanvas(ctx);

    if (!frameResult || frameResult.detections.length === 0) return;

    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const scaleX = rect.width / (video.videoWidth || 1);
    const scaleY = rect.height / (video.videoHeight || 1);

    drawDetections(ctx, frameResult, config, scaleX, scaleY);
  }, [frameResult, config, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = video.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    });
    ro.observe(video);
    return () => ro.disconnect();
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`cv-annotation-canvas ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}