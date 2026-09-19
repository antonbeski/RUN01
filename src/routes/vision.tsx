import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, RotateCcw, Download, Cpu, ArrowLeft, Zap } from "lucide-react";
import { useCVProcessor } from "../../hooks/use-cv-processor";
import { VideoUploadZone } from "../components/vision/VideoUploadZone";
import { ModelConfigPanel } from "../components/vision/ModelConfigPanel";
import { AnnotationCanvas } from "../components/vision/AnnotationCanvas";
import { FrameScrubber } from "../components/vision/FrameScrubber";
import { DetectionsSidebar } from "../components/vision/DetectionsSidebar";
import { ProcessingStatus } from "../components/vision/ProcessingStatus";
import { seekVideoToFrame, timestampToFrame } from "../lib/cv/video-processor";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "RUN01 Vision — Video Computer Vision Studio" },
      { name: "description", content: "Upload any video. Run object detection, tracking, segmentation, and pose estimation directly in your browser." },
    ],
  }),
  component: VisionStudio,
});

interface VideoMeta {
  name: string;
  duration: number;
  size: number;
  width: number;
  height: number;
}

function VisionStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps] = useState(25);

  const {
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
    exportJSON,
  } = useCVProcessor();

  const totalDetections = job.results.reduce((sum, r) => sum + r.detections.length, 0);

  const handleVideoSelected = useCallback((file: File, url: string) => {
    setVideoUrl(url);
    const video = document.createElement("video");
    video.src = url;
    video.onloadedmetadata = () => {
      setVideoMeta({
        name: file.name,
        duration: video.duration,
        size: file.size,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
  }, []);

  const handleClear = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoMeta(null);
    setIsPlaying(false);
    reset();
  }, [videoUrl, reset]);

  const handleRun = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    await startProcessing(video);
  }, [startProcessing]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPlaying(true); }
    else { video.pause(); setIsPlaying(false); }
  }, []);

  // Sync scrubber to video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      setCurrentFrame(timestampToFrame(video.currentTime, fps));
    };
    const onEnded = () => setIsPlaying(false);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [setCurrentFrame, fps]);

  // Seek video when scrubber changes
  const handleSeek = useCallback(async (frame: number) => {
    setCurrentFrame(frame);
    const video = videoRef.current;
    if (!video) return;
    await seekVideoToFrame(video, frame, fps);
  }, [setCurrentFrame, fps]);

  return (
    <div className="cv-studio">
      {/* Header */}
      <header className="cv-studio-header">
        <a href="/" className="cv-back-link">
          <ArrowLeft size={14} />
          <span>RUN01</span>
        </a>
        <div className="cv-studio-title">
          <Cpu size={16} className="text-[#9B5CF6]" />
          <span>VISION STUDIO</span>
          <span className="cv-studio-badge">BETA</span>
        </div>
        <div className="cv-studio-actions">
          {job.status === "done" && (
            <button onClick={exportJSON} className="cv-header-btn">
              <Download size={13} /> EXPORT JSON
            </button>
          )}
        </div>
      </header>

      <div className="cv-studio-body">
        {/* Left Sidebar — config */}
        <aside className="cv-sidebar-left">
          <section className="cv-sidebar-section">
            <div className="cv-section-label">VIDEO INPUT</div>
            <VideoUploadZone
              onVideoSelected={handleVideoSelected}
              onClear={handleClear}
              videoUrl={videoUrl}
              videoMeta={videoMeta}
            />
          </section>

          <section className="cv-sidebar-section">
            <ModelConfigPanel
              config={config}
              onChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
              disabled={job.status === "processing" || isModelLoading}
            />
          </section>

          {videoUrl && (
            <section className="cv-sidebar-section cv-sidebar-run">
              {job.status === "idle" || job.status === "done" || job.status === "error" ? (
                <>
                  <button
                    onClick={handleRun}
                    className="cv-run-btn"
                    disabled={isModelLoading}
                  >
                    <Zap size={14} fill="currentColor" />
                    {job.status === "done" ? "RE-RUN" : "RUN VISION"}
                  </button>
                  {job.status === "idle" && (
                    <button
                      onClick={loadModelForConfig}
                      className="cv-preload-btn"
                      disabled={isModelLoading}
                    >
                      {isModelLoading ? "Loading..." : "PRE-LOAD MODEL"}
                    </button>
                  )}
                </>
              ) : (
                <button onClick={stopProcessing} className="cv-stop-btn-main">
                  <RotateCcw size={13} /> STOP
                </button>
              )}
              <ProcessingStatus
                job={job}
                isModelLoading={isModelLoading}
                onStop={stopProcessing}
              />
            </section>
          )}
        </aside>

        {/* Centre — video player + canvas */}
        <main className="cv-main">
          {!videoUrl ? (
            <div className="cv-empty-state">
              <Cpu size={48} className="cv-empty-icon" />
              <p className="cv-empty-title">UPLOAD A VIDEO TO BEGIN</p>
              <p className="cv-empty-sub">Supports MP4 · WebM · MOV · AVI</p>
              <p className="cv-empty-sub">Object Detection · Tracking · Segmentation · Pose</p>
            </div>
          ) : (
            <>
              <div className="cv-player-wrap">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="cv-video"
                  playsInline
                  muted
                  preload="auto"
                />
                <AnnotationCanvas
                  videoRef={videoRef}
                  frameResult={currentFrameResult}
                  config={config}
                  className="cv-canvas-overlay"
                />
                {/* Playback controls overlay */}
                <div className="cv-player-controls">
                  <button onClick={togglePlay} className="cv-play-btn" aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </button>
                </div>
              </div>

              {/* Frame scrubber */}
              {videoMeta && (
                <FrameScrubber
                  currentFrame={currentFrame}
                  totalFrames={Math.floor(videoMeta.duration * fps)}
                  processedFrames={job.processedFrames}
                  onSeek={handleSeek}
                  fps={fps}
                />
              )}
            </>
          )}
        </main>

        {/* Right Sidebar — detections */}
        <DetectionsSidebar
          frameResult={currentFrameResult}
          config={config}
          totalDetections={totalDetections}
        />
      </div>
    </div>
  );
}
