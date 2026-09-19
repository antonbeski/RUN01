import type { CVJob } from "../../lib/cv/types";
import { Loader2, CheckCircle2, AlertCircle, Square } from "lucide-react";

interface Props {
  job: CVJob;
  isModelLoading: boolean;
  onStop: () => void;
}

export function ProcessingStatus({ job, isModelLoading, onStop }: Props) {
  if (isModelLoading) {
    return (
      <div className="cv-status cv-status--loading">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading ONNX model...</span>
      </div>
    );
  }

  if (job.status === "processing") {
    return (
      <div className="cv-status cv-status--processing">
        <div className="cv-status-row">
          <Loader2 size={14} className="animate-spin" />
          <span>Frame {job.processedFrames} / {job.totalFrames}</span>
          <button onClick={onStop} className="cv-stop-btn" aria-label="Stop processing">
            <Square size={10} fill="currentColor" /> STOP
          </button>
        </div>
        <div className="cv-progress-bar">
          <div className="cv-progress-fill" style={{ width: `${job.progress}%` }} />
        </div>
        <span className="cv-progress-pct">{job.progress}%</span>
      </div>
    );
  }

  if (job.status === "done") {
    return (
      <div className="cv-status cv-status--done">
        <CheckCircle2 size={14} />
        <span>Done &mdash; {job.results.length} frames processed</span>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div className="cv-status cv-status--error">
        <AlertCircle size={14} />
        <span>{job.error ?? "Processing failed"}</span>
      </div>
    );
  }

  return null;
}