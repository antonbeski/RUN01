import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  currentFrame: number;
  totalFrames: number;
  processedFrames: number;
  onSeek: (frame: number) => void;
  fps?: number;
}

function formatTimestamp(frame: number, fps: number): string {
  const seconds = frame / fps;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function FrameScrubber({ currentFrame, totalFrames, processedFrames, onSeek, fps = 25 }: Props) {
  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onSeek(Number(e.target.value)),
    [onSeek],
  );

  const step = (delta: number) =>
    onSeek(Math.max(0, Math.min(totalFrames - 1, currentFrame + delta)));

  const processedPercent = totalFrames > 0 ? (processedFrames / totalFrames) * 100 : 0;

  return (
    <div className="cv-scrubber">
      <div className="cv-scrubber-info">
        <span className="cv-frame-badge">Frame {currentFrame}</span>
        <span className="cv-time-display">
          {formatTimestamp(currentFrame, fps)} / {formatTimestamp(Math.max(totalFrames, 1), fps)}
        </span>
      </div>

      <div className="cv-scrubber-controls">
        <button onClick={() => step(-1)} className="cv-scrubber-btn" aria-label="Previous frame">
          <ChevronLeft size={16} />
        </button>

        <div className="cv-scrubber-track">
          <div
            className="cv-scrubber-processed"
            style={{ width: `${processedPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            step={1}
            value={currentFrame}
            onChange={handleSlider}
            className="cv-scrubber-range"
            aria-label="Frame scrubber"
          />
        </div>

        <button onClick={() => step(1)} className="cv-scrubber-btn" aria-label="Next frame">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}