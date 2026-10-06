// ─────────────────────────────────────────────────────────────────────────────
// RUN01 Vision — Camera Source
// Manages getUserMedia, device enumeration, and stream lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

export interface CameraDevice {
  deviceId: string;
  label: string;
  facingMode?: "user" | "environment" | "left" | "right";
}

export interface CameraConstraints {
  deviceId?: string;
  width: number;
  height: number;
  frameRate: number;
  facingMode?: "user" | "environment";
}

export type CameraErrorType =
  | "NotAllowedError"
  | "NotFoundError"
  | "NotReadableError"
  | "OverconstrainedError"
  | "UnknownError";

export interface CameraResult {
  stream: MediaStream;
  deviceId: string;
  width: number;
  height: number;
}

export function getCameraErrorMessage(err: unknown): { type: CameraErrorType; message: string } {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return {
          type: "NotAllowedError",
          message: "Camera access denied. Click the camera icon in your browser's address bar to grant permission.",
        };
      case "NotFoundError":
        return {
          type: "NotFoundError",
          message: "No camera found on this device.",
        };
      case "NotReadableError":
        return {
          type: "NotReadableError",
          message: "Camera is in use by another application.",
        };
      case "OverconstrainedError":
        return {
          type: "OverconstrainedError",
          message: "The requested camera settings are not supported. Try lower resolution.",
        };
      default:
        return { type: "UnknownError", message: `Camera error: ${err.message}` };
    }
  }
  return { type: "UnknownError", message: String(err) };
}

/**
 * Start a camera stream.
 * MUST be called from a user gesture handler.
 */
export async function startCamera(constraints: CameraConstraints): Promise<CameraResult> {
  const mediaConstraints: MediaStreamConstraints = {
    video: {
      deviceId: constraints.deviceId ? { exact: constraints.deviceId } : undefined,
      width: { ideal: constraints.width },
      height: { ideal: constraints.height },
      frameRate: { ideal: constraints.frameRate },
      facingMode: constraints.deviceId ? undefined : (constraints.facingMode ?? "environment"),
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack.getSettings();

  return {
    stream,
    deviceId: settings.deviceId ?? "",
    width: settings.width ?? constraints.width,
    height: settings.height ?? constraints.height,
  };
}

/**
 * Stop all tracks in a stream.
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(t => t.stop());
}

/**
 * Enumerate available video input devices.
 * Note: labels are only available AFTER getUserMedia permission is granted.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === "videoinput")
    .map(d => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${d.deviceId.slice(0, 6)}`,
    }));
}

/**
 * Attach a MediaStream to a video element.
 */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {
    // play() may throw if tab is hidden; that's OK
  });
}

/**
 * Detect if front camera should be mirrored.
 */
export function shouldMirrorCamera(facingMode?: string): boolean {
  return facingMode === "user" || facingMode === "left";
}
