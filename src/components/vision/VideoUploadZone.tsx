import { useRef, useState } from "react";
import { Upload, Film, X } from "lucide-react";

interface VideoUploadZoneProps {
  onVideoSelected: (file: File, url: string) => void;
  onClear: () => void;
  videoUrl: string | null;
  videoMeta: { name: string; duration: number; size: number; width: number; height: number } | null;
}

export function VideoUploadZone({ onVideoSelected, onClear, videoUrl, videoMeta }: VideoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    onVideoSelected(file, url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  if (videoUrl && videoMeta) {
    return (
      <div className="cv-upload-done">
        <Film size={18} className="text-[#9B5CF6]" />
        <div className="cv-upload-meta">
          <span className="cv-upload-filename">{videoMeta.name}</span>
          <span className="cv-upload-info">
            {videoMeta.width}&times;{videoMeta.height} &middot; {formatDuration(videoMeta.duration)} &middot; {formatSize(videoMeta.size)}
          </span>
        </div>
        <button onClick={onClear} className="cv-upload-clear" aria-label="Remove video">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`cv-upload-zone ${dragging ? "cv-upload-zone--active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleChange}
      />
      <Upload size={28} className="cv-upload-icon" />
      <p className="cv-upload-label">DROP VIDEO HERE</p>
      <p className="cv-upload-sublabel">MP4 &middot; WebM &middot; MOV &middot; AVI</p>
    </div>
  );
}