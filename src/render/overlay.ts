// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision — Overlay Renderer
// Draws detection boxes, track IDs, trails, confidence on a canvas.
// Runs entirely on the main thread inside requestVideoFrameCallback.
// ─────────────────────────────────────────────────────────────────────────────

import type { Detection, Track, ModelConfig } from "../lib/cv/types";
import { PALETTES } from "../lib/cv/types";

// ─── Coordinate mapping ─────────────────────────────────────────────────────

/**
 * Compute the mapping from video space to canvas space.
 * The video element uses object-fit: contain by default.
 */
export function computeVideoRect(video: HTMLVideoElement): {
  x: number; y: number; w: number; h: number;
  scaleX: number; scaleY: number;
} {
  const vW = video.videoWidth;
  const vH = video.videoHeight;
  const cW = video.clientWidth;
  const cH = video.clientHeight;

  if (vW === 0 || vH === 0 || cW === 0 || cH === 0) {
    return { x: 0, y: 0, w: cW, h: cH, scaleX: 1, scaleY: 1 };
  }

  // object-fit: contain
  const scale = Math.min(cW / vW, cH / vH);
  const dW = vW * scale;
  const dH = vH * scale;
  const dx = (cW - dW) / 2;
  const dy = (cH - dH) / 2;

  return {
    x: dx,
    y: dy,
    w: dW,
    h: dH,
    scaleX: scale,
    scaleY: scale,
  };
}

// ─── Color helpers ──────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function trackColor(trackId: number, palette: string[]): string {
  return palette[trackId % palette.length];
}

function classColor(classId: number, palette: string[]): string {
  return palette[classId % palette.length];
}

// ─── Drawing functions ──────────────────────────────────────────────────────

const FONT = "bold 11px 'DM Mono', monospace";
const BADGE_PAD = 4;
const BOX_LINE = 2;
const MAX_DRAW = 200;

export function clearOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawTrackOverlay(
  ctx: CanvasRenderingContext2D,
  tracks: Track[],
  config: ModelConfig,
  rect: { x: number; y: number; w: number; h: number; scaleX: number; scaleY: number },
): void {
  const palette = PALETTES[config.palette] ?? PALETTES.default;
  ctx.font = FONT;

  const toDisplay = tracks.slice(0, MAX_DRAW);

  for (const track of toDisplay) {
    const color = trackColor(track.id, palette);
    const [bx, by, bw, bh] = track.bbox;

    // Convert to canvas space
    const cx = rect.x + bx * rect.scaleX;
    const cy = rect.y + by * rect.scaleY;
    const cw = bw * rect.scaleX;
    const ch = bh * rect.scaleY;

    if (cw < 2 || ch < 2) continue;

    // Trail
    if (config.showTrails && track.trail.length > 1) {
      drawTrail(ctx, track, rect, color, config.trailLength);
    }

    if (!config.showBoxes) continue;

    // Box fill
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(cx, cy, cw, ch);

    // Box stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = BOX_LINE;
    ctx.strokeRect(cx, cy, cw, ch);

    // Label badge
    if (config.showLabels || config.showTrackIds || config.showConfidence) {
      const parts: string[] = [];
      if (config.showLabels) parts.push(track.className);
      if (config.showTrackIds) parts.push(`#${track.id}`);
      if (config.showConfidence) parts.push(`${Math.round(track.score * 100)}%`);
      const label = parts.join(" ");

      ctx.font = FONT;
      const tw = ctx.measureText(label).width;
      const badgeW = tw + BADGE_PAD * 2;
      const badgeH = 18;
      const bxPos = cx;
      const byPos = cy - badgeH > 0 ? cy - badgeH : cy;

      ctx.fillStyle = color;
      ctx.fillRect(bxPos, byPos, badgeW, badgeH);
      ctx.fillStyle = "#000";
      ctx.fillText(label, bxPos + BADGE_PAD, byPos + badgeH - 4);
    }
  }
}

export function drawDetectionOverlay(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  config: ModelConfig,
  rect: { x: number; y: number; w: number; h: number; scaleX: number; scaleY: number },
): void {
  const palette = PALETTES[config.palette] ?? PALETTES.default;
  ctx.font = FONT;

  for (const det of detections.slice(0, MAX_DRAW)) {
    const color = det.trackId !== undefined
      ? trackColor(det.trackId, palette)
      : classColor(det.classId, palette);

    const [bx, by, bw, bh] = det.bbox;
    const cx = rect.x + bx * rect.scaleX;
    const cy = rect.y + by * rect.scaleY;
    const cw = bw * rect.scaleX;
    const ch = bh * rect.scaleY;

    if (cw < 2 || ch < 2) continue;

    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = color;
    ctx.lineWidth = BOX_LINE;
    ctx.strokeRect(cx, cy, cw, ch);

    if (config.showLabels || config.showConfidence) {
      const label = [
        config.showLabels ? det.className : "",
        config.showConfidence ? `${Math.round(det.confidence * 100)}%` : "",
      ].filter(Boolean).join(" ");
      const tw = ctx.measureText(label).width;
      const bw2 = tw + BADGE_PAD * 2;
      const bh2 = 18;
      const bxPos = cx;
      const byPos = cy - bh2 > 0 ? cy - bh2 : cy;
      ctx.fillStyle = color;
      ctx.fillRect(bxPos, byPos, bw2, bh2);
      ctx.fillStyle = "#000";
      ctx.fillText(label, bxPos + BADGE_PAD, byPos + bh2 - 4);
    }
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  track: Track,
  rect: { x: number; y: number; scaleX: number; scaleY: number },
  color: string,
  maxLen: number,
): void {
  const pts = track.trail.slice(-maxLen);
  if (pts.length < 2) return;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const alpha = i / pts.length;
    ctx.strokeStyle = hexToRgba(color, alpha * 0.8);
    ctx.beginPath();
    ctx.moveTo(rect.x + pts[i-1].x * rect.scaleX, rect.y + pts[i-1].y * rect.scaleY);
    ctx.lineTo(rect.x + pts[i].x   * rect.scaleX, rect.y + pts[i].y   * rect.scaleY);
    ctx.stroke();
  }
}

export function drawStatsHUD(
  ctx: CanvasRenderingContext2D,
  stats: {
    backend: string;
    detectorHz: number;
    displayFps: number;
    latencyMs: number;
    objects: number;
    tracks: number;
  },
  canvasW: number,
): void {
  const lines = [
    `${stats.backend.toUpperCase()} · ${stats.detectorHz.toFixed(1)} det/s · ${stats.displayFps.toFixed(0)} fps`,
    `Latency ${stats.latencyMs.toFixed(0)}ms · ${stats.tracks} tracks · ${stats.objects} det`,
  ];
  ctx.font = "11px 'DM Mono', monospace";
  const padding = 8;
  const lineH = 16;
  const w = 340;
  const h = lines.length * lineH + padding;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(canvasW - w - padding, padding, w, h);

  ctx.fillStyle = "#9B5CF6";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], canvasW - w, padding + (i + 1) * lineH);
  }
}
