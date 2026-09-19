import type { ModelConfig, CVTask, ModelSize } from "../../lib/cv/types";
import { Settings2, ChevronDown } from "lucide-react";

interface Props {
  config: ModelConfig;
  onChange: (patch: Partial<ModelConfig>) => void;
  disabled?: boolean;
}

const TASKS: { value: CVTask; label: string }[] = [
  { value: "detect", label: "Object Detection" },
  { value: "track", label: "Object Tracking" },
  { value: "segment", label: "Instance Segmentation" },
  { value: "pose", label: "Pose Estimation" },
];

const SIZES: { value: ModelSize; label: string; note: string }[] = [
  { value: "nano", label: "Nano", note: "~6 MB - Fastest" },
  { value: "small", label: "Small", note: "~22 MB - Balanced" },
  { value: "medium", label: "Medium", note: "~50 MB - Best accuracy" },
];

const PALETTES = ["default", "neon", "pastel", "mono"] as const;

export function ModelConfigPanel({ config, onChange, disabled }: Props) {
  return (
    <div className="cv-config-panel">
      <div className="cv-config-header">
        <Settings2 size={14} />
        <span>MODEL CONFIG</span>
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">TASK</label>
        <div className="cv-select-wrap">
          <select
            disabled={disabled}
            value={config.task}
            onChange={(e) => onChange({ task: e.target.value as CVTask })}
            className="cv-select"
          >
            {TASKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={12} className="cv-select-arrow" />
        </div>
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">MODEL SIZE</label>
        <div className="cv-size-pills">
          {SIZES.map((s) => (
            <button
              key={s.value}
              disabled={disabled}
              onClick={() => onChange({ modelSize: s.value })}
              className={`cv-size-pill ${config.modelSize === s.value ? "cv-size-pill--active" : ""}`}
              title={s.note}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">
          CONFIDENCE
          <span className="cv-config-value">{Math.round(config.confidenceThreshold * 100)}%</span>
        </label>
        <input
          type="range" min={0} max={100} step={1}
          value={Math.round(config.confidenceThreshold * 100)}
          disabled={disabled}
          onChange={(e) => onChange({ confidenceThreshold: Number(e.target.value) / 100 })}
          className="cv-slider"
        />
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">
          IoU THRESHOLD
          <span className="cv-config-value">{Math.round(config.iouThreshold * 100)}%</span>
        </label>
        <input
          type="range" min={0} max={100} step={1}
          value={Math.round(config.iouThreshold * 100)}
          disabled={disabled}
          onChange={(e) => onChange({ iouThreshold: Number(e.target.value) / 100 })}
          className="cv-slider"
        />
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">
          FRAME STRIDE
          <span className="cv-config-value">every {config.stride}f</span>
        </label>
        <input
          type="range" min={1} max={10} step={1}
          value={config.stride}
          disabled={disabled}
          onChange={(e) => onChange({ stride: Number(e.target.value) })}
          className="cv-slider"
        />
      </div>

      <div className="cv-config-group">
        <label className="cv-config-label">BOX PALETTE</label>
        <div className="cv-palette-row">
          {PALETTES.map((p) => (
            <button
              key={p}
              disabled={disabled}
              onClick={() => onChange({ palette: p })}
              className={`cv-palette-btn ${config.palette === p ? "cv-palette-btn--active" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-config-toggles">
        {[
          { key: "showLabels" as const, label: "Labels" },
          { key: "showConfidence" as const, label: "Scores" },
          { key: "showTrails" as const, label: "Trails" },
        ].map(({ key, label }) => (
          <label key={key} className="cv-toggle">
            <input
              type="checkbox"
              checked={config[key]}
              disabled={disabled}
              onChange={(e) => onChange({ [key]: e.target.checked })}
            />
            <span className="cv-toggle-label">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}