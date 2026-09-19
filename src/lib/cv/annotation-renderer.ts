import type { Detection, FrameResult, ModelConfig } from "./types";
import { PALETTES } from "./types";

const FONT = "bold 12px 'DM Mono', monospace";
const BADGE_PADDING = 4;
const BOX_LINE = 2;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getDetectionColor(detection: Detection, _config: ModelConfig, palette: string[]): string {
  if (detection.color) return detection.color;
  const idx = detection.trackId !== undefined
    ? detection.trackId % palette.length
    : detection.classId % palette.length;
  return palette[idx];
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  frameResult: FrameResult,
  config: ModelConfig,
  scaleX: number,
  scaleY: number,
): void {
  const palette = PALETTES[config.palette] ?? PALETTES.default;
  ctx.font = FONT;

  for (const det of frameResult.detections) {
    const color = getDetectionColor(det, config, palette);
    const [bx, by, bw, bh] = det.bbox;
    const x = bx * scaleX;
    const y = by * scaleY;
    const w = bw * scaleX;
    const h = bh * scaleY;

    // Box fill (translucent)
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(x, y, w, h);

    // Box border
    ctx.strokeStyle = color;
    ctx.lineWidth = BOX_LINE;
    ctx.strokeRect(x, y, w, h);

    if (config.showLabels || config.showConfidence) {
      const label = [
        config.showLabels ? det.className : "",
        config.showConfidence ? Math.round(det.confidence * 100).toString() : "",
      ].filter(Boolean).join(" ");

      const metrics = ctx.measureText(label);
      const badgeW = metrics.width + BADGE_PADDING * 2;
      const badgeH = 18;
      const bxPos = x;
      const byPos = y - badgeH > 0 ? y - badgeH : y;

      ctx.fillStyle = color;
      ctx.fillRect(bxPos, byPos, badgeW, badgeH);

      ctx.fillStyle = "#000000";
      ctx.fillText(label, bxPos + BADGE_PADDING, byPos + badgeH - 4);
    }

    // Pose skeleton
    if (config.task === "pose" && det.keypoints && det.keypoints.length > 0) {
      drawPoseSkeleton(ctx, det.keypoints, scaleX, scaleY, color);
    }
  }
}

const SKELETON_CONNECTIONS: [number, number][] = [
  [0,1],[0,2],[1,3],[2,4],
  [5,6],[5,7],[7,9],[6,8],[8,10],
  [5,11],[6,12],[11,12],
  [11,13],[13,15],[12,14],[14,16],
];

function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: { x:number; y:number; confidence:number }[],
  sx: number,
  sy: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const kpA = keypoints[a];
    const kpB = keypoints[b];
    if (!kpA || !kpB || kpA.confidence < 0.3 || kpB.confidence < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(kpA.x * sx, kpA.y * sy);
    ctx.lineTo(kpB.x * sx, kpB.y * sy);
    ctx.stroke();
  }
  for (const kp of keypoints) {
    if (kp.confidence < 0.3) continue;
    ctx.beginPath();
    ctx.arc(kp.x * sx, kp.y * sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function drawTrails(
  ctx: CanvasRenderingContext2D,
  trackHistory: Map<number, { x: number; y: number }[]>,
  config: ModelConfig,
  scaleX: number,
  scaleY: number,
  palette: string[],
): void {
  for (const [trackId, positions] of trackHistory) {
    if (positions.length < 2) continue;
    const color = palette[trackId % palette.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const recent = positions.slice(-config.trailLength);
    for (let i = 0; i < recent.length; i++) {
      const p = recent[i];
      const alpha = (i + 1) / recent.length;
      ctx.globalAlpha = alpha * 0.8;
      if (i === 0) ctx.moveTo(p.x * scaleX, p.y * scaleY);
      else ctx.lineTo(p.x * scaleX, p.y * scaleY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
