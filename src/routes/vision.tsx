import { createFileRoute } from "@tanstack/react-router";
import {
  useRef, useState, useCallback, useEffect, type ChangeEvent,
} from "react";
import {
  Play, Pause, Camera, Upload, X, Download, Cpu, ArrowLeft,
  RefreshCw, Eye, EyeOff, Activity, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Settings2, Radio,
} from "lucide-react";
import { useVisionEngine } from "../../hooks/use-vision-engine";
import type { ModelConfig } from "../lib/cv/types";
import { COCO_CLASSES, COCO_CLASS_GROUPS, DEFAULT_CONFIG } from "../lib/cv/types";
import { MODEL_MANIFEST } from "../ml/manifest";
import { listCameras } from "../video/cameraSource";
import type { CameraDevice } from "../video/cameraSource";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "RUN01 Vision — Real-Time Object Detection & Tracking" },
      {
        name: "description",
        content:
          "Browser-native real-time object detection and tracking. Upload any video or use your live camera. Runs 100% in your browser — nothing is uploaded.",
      },
    ],
  }),
  component: VisionStudio,
});

// ─────────────────────────────────────────────────────────────────────────────
function VisionStudio() {
  const engine = useVisionEngine();
  const { state, config, setConfig, videoRef, canvasRef } = engine;

  const [isPlaying, setIsPlaying] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [activeTab, setActiveTab] = useState<"file" | "camera">("file");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Video playback sync ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);

  // ── Camera list ──────────────────────────────────────────────────────────
  const loadCameras = useCallback(async () => {
    const list = await listCameras();
    setCameras(list);
    if (list.length > 0 && !selectedCamera) setSelectedCamera(list[0].deviceId);
  }, [selectedCamera]);

  const handleStartCamera = useCallback(async () => {
    await loadCameras();
    await engine.startCamera(selectedCamera || undefined, "environment");
  }, [engine, selectedCamera, loadCameras]);

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) engine.loadFile(file);
    e.target.value = ""; // reset so same file can be re-picked
  }, [engine]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("video/")) engine.loadFile(file);
  }, [engine]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      switch (e.key) {
        case " ": e.preventDefault(); isPlaying ? engine.pause() : engine.play(); break;
        case "r": case "R": engine.resetTracker(); break;
        case "s": case "S": engine.takeScreenshot(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, isPlaying]);

  const hasSource = state.sourceMode !== "idle";

  return (
    <div className="cv-studio">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="cv-studio-header">
        <a href="/" className="cv-back-link">
          <ArrowLeft size={14} />
          <span>RUN01</span>
        </a>
        <div className="cv-studio-title">
          <Eye size={16} className="text-[#9B5CF6]" />
          <span>VISION STUDIO</span>
          <span className="cv-studio-badge">REALTIME</span>
          {state.stats.backend !== "unknown" && (
            <span className={`cv-backend-badge ${state.stats.backend === "webgpu" ? "cv-backend-gpu" : "cv-backend-wasm"}`}>
              {state.stats.backend.toUpperCase()}
            </span>
          )}
        </div>
        <div className="cv-studio-actions">
          {hasSource && (
            <>
              <button onClick={engine.takeScreenshot} className="cv-header-btn" title="Screenshot (S)">
                <Camera size={13} /> SNAP
              </button>
              <button onClick={engine.exportCSV} className="cv-header-btn" title="Export CSV">
                <Download size={13} /> CSV
              </button>
              <button onClick={engine.exportJSON} className="cv-header-btn" title="Export JSON">
                <Download size={13} /> JSON
              </button>
            </>
          )}
        </div>
      </header>

      <div className="cv-studio-body">
        {/* ── Left Sidebar ────────────────────────────────────────────────── */}
        <aside className="cv-sidebar-left">

          {/* Source Picker */}
          <section className="cv-sidebar-section">
            <div className="cv-section-label">SOURCE</div>
            <div className="cv-source-tabs">
              <button
                className={`cv-source-tab ${activeTab === "file" ? "active" : ""}`}
                onClick={() => setActiveTab("file")}
              >
                <Upload size={12} /> VIDEO FILE
              </button>
              <button
                className={`cv-source-tab ${activeTab === "camera" ? "active" : ""}`}
                onClick={() => setActiveTab("camera")}
              >
                <Radio size={12} /> LIVE CAMERA
              </button>
            </div>

            {activeTab === "file" && (
              <div className="cv-file-zone">
                {state.sourceMode === "file" ? (
                  <div className="cv-source-active">
                    <span className="cv-source-active-label">Video loaded</span>
                    <button onClick={engine.clearFile} className="cv-source-clear">
                      <X size={13} /> Clear
                    </button>
                  </div>
                ) : (
                  <div
                    className="cv-upload-zone"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && fileInputRef.current?.click()}
                  >
                    <Upload size={24} className="cv-upload-icon" />
                    <p className="cv-upload-label">DROP VIDEO OR CLICK</p>
                    <p className="cv-upload-sublabel">MP4 · WebM · MOV</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            {activeTab === "camera" && (
              <div className="cv-camera-zone">
                {state.sourceMode === "camera" ? (
                  <div className="cv-source-active">
                    <Radio size={12} className="cv-live-dot" />
                    <span className="cv-source-active-label">Camera active</span>
                    <button onClick={engine.stopCamera} className="cv-source-clear">
                      <X size={13} /> Stop
                    </button>
                  </div>
                ) : (
                  <>
                    {cameras.length > 0 && (
                      <select
                        className="cv-select"
                        value={selectedCamera}
                        onChange={e => setSelectedCamera(e.target.value)}
                      >
                        {cameras.map(c => (
                          <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
                        ))}
                      </select>
                    )}
                    <button className="cv-camera-btn" onClick={handleStartCamera}>
                      <Camera size={14} /> START CAMERA
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Privacy note */}
          <section className="cv-sidebar-section cv-privacy-note">
            <span className="cv-privacy-dot" />
            Nothing is uploaded. All processing runs in your browser.
          </section>

          {/* Model config */}
          <section className="cv-sidebar-section">
            <div
              className="cv-section-label cv-collapsible"
              onClick={() => setShowControls(s => !s)}
            >
              <Settings2 size={13} /> MODEL CONFIG
              {showControls ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>

            {showControls && (
              <ModelControls config={config} setConfig={setConfig} />
            )}
          </section>

          {/* Stats */}
          {state.isRunning && (
            <section className="cv-sidebar-section">
              <div
                className="cv-section-label cv-collapsible"
                onClick={() => setShowStats(s => !s)}
              >
                <Activity size={13} /> PERFORMANCE
                {showStats ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
              {showStats && (
                <StatsPanel stats={state.stats} />
              )}
            </section>
          )}

          {/* Tracker controls */}
          {hasSource && (
            <section className="cv-sidebar-section">
              <button className="cv-preload-btn" onClick={engine.resetTracker}>
                <RefreshCw size={13} /> RESET TRACKER
              </button>
            </section>
          )}
        </aside>

        {/* ── Main video area ──────────────────────────────────────────────── */}
        <main className="cv-main">
          {state.error && (
            <div className="cv-error-banner">
              <AlertCircle size={14} />
              {state.error}
              <button onClick={() => {}} className="cv-error-dismiss">×</button>
            </div>
          )}

          {state.isLoading && (
            <div className="cv-loading-overlay">
              <Loader2 size={20} className="animate-spin" />
              <span>{state.loadingMessage}</span>
              <div className="cv-loading-bar">
                <div className="cv-loading-fill" style={{ width: `${state.loadingProgress}%` }} />
              </div>
            </div>
          )}

          {!hasSource && !state.isLoading ? (
            <EmptyState onFile={() => fileInputRef.current?.click()} onCamera={handleStartCamera} />
          ) : (
            <div className="cv-player-wrap">
              <video
                ref={videoRef}
                className="cv-video"
                playsInline
                muted
                preload="auto"
                style={{ transform: state.isMirrored ? "scaleX(-1)" : "none" }}
              />
              <canvas
                ref={canvasRef}
                className="cv-canvas-overlay"
                aria-hidden="true"
                style={{ transform: state.isMirrored ? "scaleX(-1)" : "none" }}
              />

              {/* Playback controls — file mode only */}
              {state.sourceMode === "file" && (
                <div className="cv-player-controls">
                  <button
                    onClick={isPlaying ? engine.pause : engine.play}
                    className="cv-play-btn"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                </div>
              )}

              {/* Track count badge */}
              {state.isRunning && state.stats.trackCount > 0 && (
                <div className="cv-track-badge">
                  <Eye size={11} />
                  {state.stats.trackCount} tracked
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Right sidebar — detections ───────────────────────────────────── */}
        <aside className="cv-detections-sidebar">
          <div className="cv-detections-header">
            <Cpu size={14} />
            <span>DETECTIONS</span>
            <span className="cv-detections-count">{state.tracks.length} tracks</span>
          </div>

          {state.tracks.length === 0 ? (
            <div className="cv-detections-empty">
              {hasSource ? "Waiting for detections…" : "Load a video or start camera"}
            </div>
          ) : (
            <ul className="cv-detections-list">
              {state.tracks.slice(0, 50).map(track => (
                <li key={track.id} className="cv-detection-item">
                  <span className="cv-detection-color" style={{ background: `hsl(${track.id * 47 % 360}, 70%, 55%)` }} />
                  <div className="cv-detection-info">
                    <span className="cv-detection-class">
                      {track.className}
                      <span className="cv-detection-track"> #{track.id}</span>
                    </span>
                    <span className="cv-detection-bbox">
                      {Math.round(track.bbox[0])},{Math.round(track.bbox[1])} {Math.round(track.bbox[2])}×{Math.round(track.bbox[3])}
                    </span>
                  </div>
                  <span className="cv-detection-conf">
                    {Math.round(track.score * 100)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="cv-detections-footer">
            {state.detections.length} raw detections · {state.stats.detectorHz.toFixed(1)} det/s
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EmptyState({
  onFile,
  onCamera,
}: {
  onFile: () => void;
  onCamera: () => void;
}) {
  return (
    <div className="cv-empty-state">
      <Eye size={48} className="cv-empty-icon" />
      <p className="cv-empty-title">REAL-TIME OBJECT DETECTION</p>
      <p className="cv-empty-sub">WebGPU-accelerated · Runs 100% in your browser</p>
      <div className="cv-empty-actions">
        <button className="cv-run-btn" onClick={onFile}>
          <Upload size={14} fill="currentColor" /> UPLOAD VIDEO
        </button>
        <button className="cv-run-btn cv-run-btn-secondary" onClick={onCamera}>
          <Camera size={14} /> USE CAMERA
        </button>
      </div>
      <p className="cv-empty-privacy">
        Nothing is uploaded. All AI runs on your device.
      </p>
    </div>
  );
}

function ModelControls({
  config,
  setConfig,
}: {
  config: ModelConfig;
  setConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
}) {
  const patch = (p: Partial<ModelConfig>) => setConfig(s => ({ ...s, ...p }));
  const tier1Models = MODEL_MANIFEST.filter(m => m.tier === 1);

  return (
    <div className="cv-config-panel">
      {/* Model picker */}
      <div className="cv-config-group">
        <label className="cv-config-label">MODEL</label>
        <div className="cv-select-wrap">
          <select
            value={config.modelId}
            onChange={e => patch({ modelId: e.target.value })}
            className="cv-select"
          >
            {tier1Models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="cv-select-arrow" />
        </div>
      </div>

      {/* Confidence */}
      <div className="cv-config-group">
        <label className="cv-config-label">
          CONFIDENCE
          <span className="cv-config-value">{Math.round(config.confidenceThreshold * 100)}%</span>
        </label>
        <input
          type="range" min={5} max={95} step={5}
          value={Math.round(config.confidenceThreshold * 100)}
          onChange={e => patch({ confidenceThreshold: Number(e.target.value) / 100 })}
          className="cv-slider"
        />
      </div>

      {/* IoU */}
      <div className="cv-config-group">
        <label className="cv-config-label">
          IoU (NMS)
          <span className="cv-config-value">{Math.round(config.iouThreshold * 100)}%</span>
        </label>
        <input
          type="range" min={10} max={90} step={5}
          value={Math.round(config.iouThreshold * 100)}
          onChange={e => patch({ iouThreshold: Number(e.target.value) / 100 })}
          className="cv-slider"
        />
      </div>

      {/* Class filter */}
      <div className="cv-config-group">
        <label className="cv-config-label">CLASS FILTER</label>
        <ClassFilter config={config} patch={patch} />
      </div>

      {/* Display toggles */}
      <div className="cv-config-toggles">
        {[
          { key: "showBoxes" as const, label: "Boxes" },
          { key: "showLabels" as const, label: "Labels" },
          { key: "showTrackIds" as const, label: "IDs" },
          { key: "showTrails" as const, label: "Trails" },
          { key: "showConfidence" as const, label: "Scores" },
        ].map(({ key, label }) => (
          <label key={key} className="cv-toggle">
            <input
              type="checkbox"
              checked={config[key] as boolean}
              onChange={e => patch({ [key]: e.target.checked })}
            />
            <span className="cv-toggle-label">{label}</span>
          </label>
        ))}
      </div>

      {/* Palette */}
      <div className="cv-config-group">
        <label className="cv-config-label">PALETTE</label>
        <div className="cv-palette-row">
          {(["default", "neon", "pastel", "mono"] as const).map(p => (
            <button
              key={p}
              onClick={() => patch({ palette: p })}
              className={`cv-palette-btn ${config.palette === p ? "cv-palette-btn--active" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassFilter({
  config,
  patch,
}: {
  config: ModelConfig;
  patch: (p: Partial<ModelConfig>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFilter = config.classFilter.length > 0;

  const toggleClass = (id: number) => {
    const current = config.classFilter;
    const next = current.includes(id)
      ? current.filter(c => c !== id)
      : [...current, id];
    patch({ classFilter: next });
  };

  const toggleGroup = (ids: number[]) => {
    const allOn = ids.every(id => config.classFilter.includes(id));
    if (allOn) {
      patch({ classFilter: config.classFilter.filter(c => !ids.includes(c)) });
    } else {
      const merged = [...new Set([...config.classFilter, ...ids])];
      patch({ classFilter: merged });
    }
  };

  return (
    <div className="cv-class-filter">
      <div className="cv-class-filter-header">
        <button
          className="cv-class-clear"
          onClick={() => patch({ classFilter: [] })}
          disabled={!hasFilter}
        >
          {hasFilter ? `${config.classFilter.length} active — clear` : "All classes"}
        </button>
        <button className="cv-class-expand" onClick={() => setExpanded(s => !s)}>
          {expanded ? "▲ hide" : "▼ filter"}
        </button>
      </div>

      {expanded && (
        <div className="cv-class-list">
          {Object.entries(COCO_CLASS_GROUPS).map(([group, ids]) => (
            <div key={group} className="cv-class-group">
              <button
                className="cv-class-group-btn"
                onClick={() => toggleGroup(ids)}
              >
                {group}
              </button>
              <div className="cv-class-pills">
                {ids.map(id => (
                  <button
                    key={id}
                    className={`cv-class-pill ${config.classFilter.includes(id) ? "active" : ""}`}
                    onClick={() => toggleClass(id)}
                  >
                    {COCO_CLASSES[id]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ stats }: { stats: ReturnType<typeof useVisionEngine>["state"]["stats"] }) {
  return (
    <div className="cv-stats-panel">
      <div className="cv-stat-row">
        <span className="cv-stat-label">Backend</span>
        <span className={`cv-stat-value ${stats.backend === "webgpu" ? "cv-stat-gpu" : "cv-stat-wasm"}`}>
          {stats.backend.toUpperCase()}
        </span>
      </div>
      <div className="cv-stat-row">
        <span className="cv-stat-label">Detector</span>
        <span className="cv-stat-value">{stats.detectorHz.toFixed(1)} det/s</span>
      </div>
      <div className="cv-stat-row">
        <span className="cv-stat-label">Display</span>
        <span className="cv-stat-value">{stats.displayFps.toFixed(0)} fps</span>
      </div>
      <div className="cv-stat-row">
        <span className="cv-stat-label">Latency</span>
        <span className="cv-stat-value">{stats.latencyMs.toFixed(0)} ms</span>
      </div>
      <div className="cv-stat-row">
        <span className="cv-stat-label">Tracks</span>
        <span className="cv-stat-value">{stats.trackCount}</span>
      </div>
    </div>
  );
}
