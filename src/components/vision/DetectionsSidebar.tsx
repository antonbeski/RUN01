import type { FrameResult, ModelConfig } from "../../lib/cv/types";
import { PALETTES } from "../../lib/cv/types";
import { ScanSearch } from "lucide-react";

interface Props {
  frameResult: FrameResult | null;
  config: ModelConfig;
  totalDetections: number;
}

export function DetectionsSidebar({ frameResult, config, totalDetections }: Props) {
  const palette = PALETTES[config.palette] ?? PALETTES.default;
  const detections = frameResult?.detections ?? [];

  return (
    <aside className="cv-detections-sidebar">
      <div className="cv-detections-header">
        <ScanSearch size={14} />
        <span>DETECTIONS</span>
        <span className="cv-detections-count">{detections.length} this frame</span>
      </div>

      {detections.length === 0 ? (
        <div className="cv-detections-empty">
          {frameResult ? "No detections on this frame" : "Process video to see results"}
        </div>
      ) : (
        <ul className="cv-detections-list">
          {detections.map((det, i) => {
            const color = palette[(det.trackId ?? det.classId) % palette.length];
            const [bx, by, bw, bh] = det.bbox;
            return (
              <li key={i} className="cv-detection-item">
                <span
                  className="cv-detection-color"
                  style={{ background: color }}
                />
                <div className="cv-detection-info">
                  <span className="cv-detection-class">
                    {det.className}
                    {det.trackId !== undefined && (
                      <span className="cv-detection-track"> #{det.trackId}</span>
                    )}
                  </span>
                  <span className="cv-detection-bbox">
                    {Math.round(bx)},{Math.round(by)} {Math.round(bw)}&times;{Math.round(bh)}
                  </span>
                </div>
                <span
                  className="cv-detection-conf"
                  style={{ color }}
                >
                  {Math.round(det.confidence * 100)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="cv-detections-footer">
        {totalDetections} total detections
      </div>
    </aside>
  );
}