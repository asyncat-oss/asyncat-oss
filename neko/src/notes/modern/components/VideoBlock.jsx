// A video block: upload or drop a video, play it with our own controls,
// pick a size, replace or remove it, and watch it full screen.

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Video as VideoIcon,
  Maximize2,
  Minimize2,
  Loader2 as Loader,
  Repeat,
  SquareX,
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Rewind,
  FastForward,
} from "lucide-react";
import { Segmented } from "../../../components/ui/Tabs.jsx";
import UploadAlertDialog from "./UploadAlertDialog";
import MediaViewer from "./MediaViewer";
import { ensureNoteRangeStyle, rangeFill } from "./mediaRange";
import { attachmentsApi } from "../../noteApi";
import { useNoteContext } from "../../context/NoteContext";

const CONTROL_SIZE_STYLES = {
  small: {
    containerPadding: "p-2",
    timelineHeight: "h-1",
    timelineMargin: "mb-2",
    controlsGap: "gap-2",
    buttonPadding: "p-1",
    playIcon: "w-4 h-4",
    skipIcon: "w-3 h-3",
    icon: "w-4 h-4",
    timeText: "text-[11px] px-1.5",
    volumeWidth: "w-16",
    volumeHeight: "h-1",
  },
  medium: {
    containerPadding: "p-3",
    timelineHeight: "h-1.5",
    timelineMargin: "mb-2",
    controlsGap: "gap-2",
    buttonPadding: "p-1.5",
    playIcon: "w-5 h-5",
    skipIcon: "w-4 h-4",
    icon: "w-5 h-5",
    timeText: "text-xs px-2",
    volumeWidth: "w-20",
    volumeHeight: "h-1.5",
  },
  large: {
    containerPadding: "p-4",
    timelineHeight: "h-2",
    timelineMargin: "mb-3",
    controlsGap: "gap-3",
    buttonPadding: "p-2",
    playIcon: "w-6 h-6",
    skipIcon: "w-5 h-5",
    icon: "w-6 h-6",
    timeText: "text-sm px-2.5",
    volumeWidth: "w-24",
    volumeHeight: "h-2",
  },
};

const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
  "application/x-matroska",
];
const ALLOWED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".qt",
  ".mkv",
];
const ALLOWED_VIDEO_FORMAT_LABEL = "MP4, WebM, OGG, MOV (QuickTime), MKV";
const MAX_VIDEO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_LABEL = "5MB";

const SIZE_ITEMS = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
];
const SIZE_TIPS = [
  "Trim the video",
  "Lower its resolution or bitrate",
  "Save it with an efficient codec such as H.264 or HEVC",
];
const FORMAT_TIPS = [
  "Save or convert it to MP4, WebM, OGG, MOV or MKV",
  "Check the file's extension matches its format",
  "Use a converter if your editor can't save these formats",
];

const createInitialUploadAlert = () => ({
  isOpen: false,
  variant: null,
  title: "",
  message: "",
  fileName: "",
  fileSize: 0,
  maxSize: "",
  allowedFormats: "",
});

const VideoBlock = ({ block, onChange, contentRef, readOnly }) => {
  // Add CSS animation styles
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes revealFromTop {
        0% {
          clip-path: inset(0 0 100% 0);
        }
        100% {
          clip-path: inset(0 0 0 0);
        }
      }

    `;
    document.head.appendChild(style);
    ensureNoteRangeStyle();
    return () => document.head.removeChild(style);
  }, []);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploadAlert, setUploadAlert] = useState(createInitialUploadAlert);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const controlRevealTimeoutRef = useRef(null);
  const { selectedNote } = useNoteContext();
  const videoRef = useRef(null);
  const fullscreenVideoRef = useRef(null);

  const videoUrl = block.properties?.url || "";
  const [isVideoLoaded, setIsVideoLoaded] = useState(!!videoUrl);
  const [showVideo, setShowVideo] = useState(() => !!videoUrl);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const filename = block.properties?.filename || "";
  const caption = block.properties?.caption || "";
  const currentSize = block.properties?.size || "medium";

  // Custom video controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const handleCloseUploadAlert = () => {
    setUploadAlert(createInitialUploadAlert());
  };

  const scheduleControlReveal = () => {
    if (controlRevealTimeoutRef.current) {
      clearTimeout(controlRevealTimeoutRef.current);
      controlRevealTimeoutRef.current = null;
    }

    if (shouldAnimate) {
      controlRevealTimeoutRef.current = setTimeout(() => {
        setShowControls(true);
        setShouldAnimate(false);
        controlRevealTimeoutRef.current = null;
      }, 5000);
    } else {
      setShowControls(true);
    }
  };

  useEffect(() => {
    return () => {
      if (controlRevealTimeoutRef.current) {
        clearTimeout(controlRevealTimeoutRef.current);
        controlRevealTimeoutRef.current = null;
      }
    };
  }, []);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    if (!selectedNote?.id) {
      setError("No note selected for upload");
      return;
    }

    const file = files[0];

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const hasAllowedExtension = ALLOWED_VIDEO_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    const isMimeAllowed =
      ALLOWED_VIDEO_MIME_TYPES.includes(mimeType) || mimeType === "video/mkv";
    const appearsToBeVideo =
      mimeType.startsWith("video/") || mimeType === "" || hasAllowedExtension;

    if (!appearsToBeVideo || (!isMimeAllowed && !hasAllowedExtension)) {
      setUploadAlert({
        isOpen: true,
        variant: "format",
        title: "This video format isn't supported",
        message: "A video can be an MP4, WebM, OGG, MOV or MKV file.",
        fileName: file.name,
        fileSize: file.size,
        maxSize: "",
        allowedFormats: ALLOWED_VIDEO_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setUploadAlert({
        isOpen: true,
        variant: "size",
        title: "This video is too big",
        message: `A video can be up to ${MAX_VIDEO_SIZE_LABEL}.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: MAX_VIDEO_SIZE_LABEL,
        allowedFormats: ALLOWED_VIDEO_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate video file using shared helper for consistency
    const validation = attachmentsApi.validateVideoFile(file);

    if (!validation.isValid) {
      const firstError = validation.errors[0] || "Video validation failed.";
      const normalizedError = firstError.toLowerCase();
      const isSizeError =
        normalizedError.includes("size") || normalizedError.includes("limit");
      const variant = isSizeError ? "size" : "format";

      setUploadAlert({
        isOpen: true,
        variant,
        title: isSizeError ? "This video is too big" : "This video format isn't supported",
        message: isSizeError
          ? `A video can be up to ${MAX_VIDEO_SIZE_LABEL}.`
          : "A video can be an MP4, WebM, OGG, MOV or MKV file.",
        fileName: file.name,
        fileSize: file.size,
        maxSize: isSizeError ? MAX_VIDEO_SIZE_LABEL : "",
        allowedFormats: ALLOWED_VIDEO_FORMAT_LABEL,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    // Set replacing flag if there's already a video
    setIsReplacing(!!videoUrl);

    try {
      // Create a unique filename by adding timestamp and random string to avoid conflicts
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 char random string
      const fileExtension = file.name.split(".").pop();
      const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const uniqueFile = new File(
        [file],
        `${baseName}_${timestamp}_${randomSuffix}.${fileExtension}`,
        {
          type: file.type,
          lastModified: file.lastModified,
        }
      );

      const result = await attachmentsApi.uploadAttachment(
        selectedNote.id,
        uniqueFile,
        (progress) => setUploadProgress(progress)
      );

      if (result.success) {
        const attachmentUrl = attachmentsApi.getAttachmentUrl(
          selectedNote.id,
          result.data.filename
        );

        // Add cache-busting parameter to ensure onLoadedData fires for same video
        const separator = attachmentUrl.includes("?") ? "&" : "?";
        const cacheBustedUrl = `${attachmentUrl}${separator}t=${Date.now()}`;

        // Set loading state to maintain placeholder size until video loads
        setIsVideoLoaded(false);
        setShowVideo(false);
        setShouldAnimate(true);
        setShowControls(false);

        onChange(block.id, {
          properties: {
            ...block.properties,
            url: cacheBustedUrl,
            filename: result.data.filename,
            originalName: result.data.originalName,
            size: "medium",
            width: "600px",
            height: "auto",
            contentType: result.data.contentType,
          },
        });

        // Reset upload states
        setIsUploading(false);
        setUploadProgress(0);
        setIsReplacing(false);

        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (err) {
      console.error("Video upload error:", err);
      setError(err.message || "Failed to upload video");
      // Reset states immediately on error
      setIsUploading(false);
      setUploadProgress(0);
      setIsReplacing(false);
      setIsVideoLoaded(false);
      setShowVideo(false);
      setShouldAnimate(false);
      setShowControls(false);

      // Clear file input to allow same file to be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleSizeChange = (size) => {
    let newWidth, newHeight;

    switch (size) {
      case "small":
        newWidth = "300px";
        newHeight = "auto";
        break;
      case "medium":
        newWidth = "600px";
        newHeight = "auto";
        break;
      case "large":
        newWidth = "800px";
        newHeight = "auto";
        break;
      default:
        newWidth = "600px";
        newHeight = "auto";
    }

    onChange(block.id, {
      properties: {
        ...block.properties,
        width: newWidth,
        height: newHeight,
        size: size,
      },
    });
  };

  // Custom video control handlers - work with both regular and fullscreen videos
  const getActiveVideo = () => {
    return isExpanded ? fullscreenVideoRef.current : videoRef.current;
  };

  const togglePlayPause = () => {
    const video = getActiveVideo();
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const video = getActiveVideo();
    if (video) {
      const videoDuration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : duration;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const boundedTime =
        videoDuration && videoDuration > 0
          ? Math.min(Math.max(time, 0), videoDuration)
          : Math.max(time, 0);
      setCurrentTime(boundedTime);
      if (
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.duration !== duration
      ) {
        setDuration(video.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = getActiveVideo();
    if (video) {
      const metaDuration = Number.isFinite(video.duration)
        ? Math.max(video.duration, 0)
        : 0;
      setDuration(metaDuration);
    }
  };

  const handleSeek = (e) => {
    const video = getActiveVideo();
    if (!video) return;
    const seekTime = parseFloat(e.target.value);
    if (Number.isNaN(seekTime)) return;
    const videoDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : duration;
    const boundedSeek =
      videoDuration && videoDuration > 0
        ? Math.min(Math.max(seekTime, 0), videoDuration)
        : Math.max(seekTime, 0);
    video.currentTime = boundedSeek;
    setCurrentTime(boundedSeek);
  };

  const handleVolumeChange = (e) => {
    const video = getActiveVideo();
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    if (Number.isNaN(newVolume)) return;
    const boundedVolume = Math.min(Math.max(newVolume, 0), 1);
    video.volume = boundedVolume;
    video.muted = boundedVolume === 0;
    setVolume(boundedVolume);
    setIsMuted(boundedVolume === 0);
  };

  const toggleMute = () => {
    const video = getActiveVideo();
    if (!video) return;
    if (isMuted) {
      const restoredVolume = volume || 0.5;
      video.muted = false;
      video.volume = restoredVolume;
      setVolume(restoredVolume);
      setIsMuted(false);
    } else {
      video.volume = 0;
      video.muted = true;
      setIsMuted(true);
    }
  };

  const skip = (seconds) => {
    const video = getActiveVideo();
    if (!video) return;
    const videoDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : duration;
    const fallbackDuration =
      videoDuration && videoDuration > 0
        ? videoDuration
        : Math.max((video.currentTime || 0) + seconds, 0);
    const targetTime = Math.max(
      0,
      Math.min(fallbackDuration, (video.currentTime || 0) + seconds)
    );
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getVolumeIcon = (size = "w-5 h-5") => {
    const normalizedVolume = Math.min(Math.max(volume || 0, 0), 1);
    const effectiveVolume = isMuted ? 0 : normalizedVolume;
    if (effectiveVolume === 0) {
      return <VolumeX className={size} />;
    } else if (effectiveVolume < 0.5) {
      return <Volume1 className={size} />;
    } else {
      return <Volume2 className={size} />;
    }
  };

  const handleDeleteVideo = async () => {
    setIsDeleting(true);
    setError(null);

    if (filename && selectedNote?.id) {
      try {
        await attachmentsApi.deleteAttachment(selectedNote.id, filename);
      } catch (err) {
        console.error("Failed to delete attachment:", err);
        setError("Failed to delete video from server");
        // Continue with removal from block even if deletion fails
      }
    }

    onChange(block.id, {
      properties: {
        ...block.properties,
        url: "",
        filename: "",
        originalName: "",
        size: null,
        contentType: null,
      },
    });

    setIsVideoLoaded(false);
    setShowVideo(false);
    setShouldAnimate(false);
    setShowControls(false);

    setIsDeleting(false);
  };

  const handleReplaceClick = () => {
    // Clear the file input to allow same file to be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Trigger file picker
    fileInputRef.current?.click();
  };

  const handleUploadClick = () => {
    // Clear the file input to allow same file to be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Trigger file picker
    fileInputRef.current?.click();
  };

  const width = block.properties?.width || "600px";
  const height = block.properties?.height || "auto";
  const controlSizeKey = CONTROL_SIZE_STYLES[currentSize]
    ? currentSize
    : "medium";
  const controlStyles = CONTROL_SIZE_STYLES[controlSizeKey];
  const activeVideoElement = isExpanded
    ? fullscreenVideoRef.current
    : videoRef.current;
  const derivedDuration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : Number.isFinite(activeVideoElement?.duration) &&
        activeVideoElement.duration > 0
      ? activeVideoElement.duration
      : 0;
  const safeCurrentTime =
    derivedDuration > 0
      ? Math.min(Math.max(currentTime || 0, 0), derivedDuration)
      : Math.max(currentTime || 0, 0);
  const timelineProgress =
    derivedDuration > 0
      ? Math.min(
          Math.max((safeCurrentTime / derivedDuration) * 100, 0),
          100
        )
      : 0;
  // Over the video, the unplayed part of a track is translucent white.
  const sliderBackground = rangeFill(timelineProgress, "rgb(255 255 255 / 0.35)");
  const normalizedVolume = Math.min(Math.max(volume || 0, 0), 1);
  const effectiveVolume = isMuted ? 0 : normalizedVolume;
  const volumeProgress = Math.min(Math.max(effectiveVolume * 100, 0), 100);
  const volumeBackground = rangeFill(volumeProgress, "rgb(255 255 255 / 0.35)");

  return (
    <div className="video-block group relative">
      {/* Upload button positioned at same level as block selector toggle */}
      {!videoUrl && (
        <div className="absolute right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          <button
            onClick={handleUploadClick}
            disabled={isUploading || isDeleting}
            className="flex h-6 items-center gap-1 rounded-md border border-line-strong bg-canvas px-2 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader className="w-3 h-3 animate-spin" />
                {uploadProgress}%
              </>
            ) : (
              <>
                <Upload className="w-3 h-3" />
                Upload
              </>
            )}
          </button>
        </div>
      )}

      {/* Controls - shown on hover */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="flex items-center gap-2">
          {/* Size controls */}
          {videoUrl && showControls && (
            <Segmented
              size="sm"
              role="radiogroup"
              label="Size"
              value={currentSize}
              onChange={handleSizeChange}
              items={SIZE_ITEMS}
            />
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Replace button */}
          {videoUrl && showControls && (
            <button
              onClick={handleReplaceClick}
              disabled={isUploading || isDeleting}
              className="flex h-6 items-center gap-1 rounded-md border border-line-strong bg-canvas px-2 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  {uploadProgress}%
                </>
              ) : (
                <>
                  <Repeat className="w-3 h-3" />
                  Replace
                </>
              )}
            </button>
          )}

          {/* Delete button */}
          {videoUrl && showControls && (
            <button
              onClick={handleDeleteVideo}
              disabled={isUploading || isDeleting}
              className="flex h-6 items-center gap-1 rounded-md px-2 text-[12px] text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              {isDeleting ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Removing…
                </>
              ) : (
                <>
                  <SquareX className="w-3 h-3" />
                  Remove
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2">
          <p className="text-[13px] text-red-700 dark:text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mb-2 mt-12 flex justify-center @2xl:pl-8">
          <div
            className=""
            style={{
              width: width === "auto" ? "800px" : width,
              maxWidth: "100%",
            }}
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Video container */}
      <div
        className={`video-container flex justify-center @2xl:pl-10 ${
          !videoUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {videoUrl ? (
          !isVideoLoaded && (isUploading || isReplacing) ? (
            <div
              className="relative mx-auto rounded-lg bg-hover"
              style={{
                width: width === "auto" ? "800px" : width,
                height: height === "auto" ? "300px" : height,
                minHeight: "200px",
                maxWidth: "100%",
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg">
                <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                <p className="text-[13px] text-fg-muted">
                  Loading video…
                </p>
              </div>
              {/* Hidden video for loading */}
              <video
                src={videoUrl}
                style={{ display: "none" }}
                onLoadedData={() => {
                  setIsVideoLoaded(true);
                  setTimeout(() => {
                    setShowVideo(true);
                    // Show controls after reveal animation if needed
                    scheduleControlReveal();
                  }, 50);
                }}
                onError={() => {
                  // Retry the local URL with a cache-busting parameter.
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    // Add cache-busting parameter
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    // Only retry when the URL changes.
                    if (refreshedUrl !== videoUrl) {
                      onChange(block.id, {
                        properties: {
                          ...block.properties,
                          url: refreshedUrl,
                        },
                      });
                      return; // Don't set error state yet, let the refresh attempt happen
                    }
                  }

                  setError("Failed to load video");
                  setIsVideoLoaded(false);
                  setShowVideo(false);
                  setShouldAnimate(false);
                }}
              />
            </div>
          ) : (
            <div className="relative inline-block group/video">
              {/* Main visible video */}
              <video
                ref={videoRef}
                src={videoUrl}
                style={{
                  width: width === "auto" ? "auto" : width,
                  height: height === "auto" ? "auto" : height,
                  maxWidth: "100%",
                  margin: "0 auto",
                  animation:
                    shouldAnimate && showVideo && !readOnly
                      ? "revealFromTop 5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards"
                      : "none",
                  clipPath:
                    shouldAnimate && !readOnly
                      ? showVideo
                        ? "inset(0 0 0 0)"
                        : "inset(0 0 100% 0)"
                      : "inset(0 0 0 0)",
                }}
                className={`rounded-lg shadow-sm hover:shadow-md transition-all duration-300`}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsVideoBuffering(true)}
                onCanPlay={() => setIsVideoBuffering(false)}
                onLoadedData={() => {
                  setIsVideoLoaded(true);
                  setTimeout(() => {
                    setShowVideo(true);
                    // Show controls after reveal animation if needed
                    scheduleControlReveal();
                  }, 50);
                }}
                onError={() => {
                  // Retry the local URL with a cache-busting parameter.
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    // Add cache-busting parameter
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    // Only retry when the URL changes.
                    if (refreshedUrl !== videoUrl) {
                      onChange(block.id, {
                        properties: {
                          ...block.properties,
                          url: refreshedUrl,
                        },
                      });
                      return; // Don't set error state yet, let the refresh attempt happen
                    }
                  }

                  setError("Failed to load video");
                  setIsVideoLoaded(false);
                  setShowVideo(false);
                  setShouldAnimate(false);
                }}
              />

              {/* Replacing overlay - shows throughout the entire replacement process */}
              {isReplacing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-canvas/80 transition-opacity duration-300">
                  <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                  <p className="text-[13px] text-fg-muted">
                    {isUploading
                      ? `Uploading… ${uploadProgress}%`
                      : "Loading the new video…"}
                  </p>
                </div>
              )}

              {/* Deleting overlay */}
              {isDeleting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-canvas/60">
                  <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                  <p className="text-[13px] text-fg-muted">
                    Removing…
                  </p>
                </div>
              )}

              {/* Buffering overlay */}
              {isVideoBuffering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40">
                  <Loader className="mb-2 h-5 w-5 animate-spin text-white" />
                  <p className="text-[13px] text-white">
                    Loading video…
                  </p>
                </div>
              )}

              {/* Custom Video Controls at bottom */}
              {!readOnly && (
                <div
                  className={`absolute bottom-0 left-0 right-0 bg-black/55 ${controlStyles.containerPadding} rounded-b-lg opacity-0 group-hover/video:opacity-100 transition-opacity duration-200`}
                >
                  {/* Timeline */}
                  <input
                    type="range"
                    min="0"
                    max={derivedDuration || 0}
                    step="0.01"
                    value={safeCurrentTime}
                    onChange={handleSeek}
                    onInput={handleSeek}
                    className={`note-range w-full ${controlStyles.timelineHeight} ${controlStyles.timelineMargin} rounded-lg appearance-none cursor-pointer`}
                    style={{
                      background: sliderBackground,
                      WebkitAppearance: "none",
                      MozAppearance: "none",
                      outline: "none",
                    }}
                  />

                  {/* Controls Row */}
                  <div className="flex items-center justify-between text-white">
                    <div className={`flex items-center ${controlStyles.controlsGap}`}>
                      {/* Play/Pause */}
                      <button
                        onClick={togglePlayPause}
                        className={`${controlStyles.buttonPadding} hover:bg-white/20 rounded transition-colors`}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <Pause className={controlStyles.playIcon} />
                        ) : (
                          <Play className={controlStyles.playIcon} />
                        )}
                      </button>

                      {/* Skip Backward */}
                      <button
                        onClick={() => skip(-5)}
                        className={`${controlStyles.buttonPadding} hover:bg-white/20 rounded transition-colors`}
                        title="Rewind 5 seconds"
                      >
                        <Rewind className={controlStyles.skipIcon} />
                      </button>

                      {/* Skip Forward */}
                      <button
                        onClick={() => skip(5)}
                        className={`${controlStyles.buttonPadding} hover:bg-white/20 rounded transition-colors`}
                        title="Forward 5 seconds"
                      >
                        <FastForward className={controlStyles.skipIcon} />
                      </button>

                      {/* Time Display */}
                      <span className={`${controlStyles.timeText} font-medium`}>
                        {formatTime(safeCurrentTime)} / {formatTime(derivedDuration)}
                      </span>
                    </div>

                    <div className={`flex items-center ${controlStyles.controlsGap}`}>
                      {/* Volume Control */}
                      <div
                        className={`flex items-center ${controlStyles.controlsGap}`}
                        onMouseEnter={() => setShowVolumeSlider(true)}
                        onMouseLeave={() => setShowVolumeSlider(false)}
                        onFocus={() => setShowVolumeSlider(true)}
                        onBlur={() => setShowVolumeSlider(false)}
                      >
                        <button
                          onClick={toggleMute}
                          className={`${controlStyles.buttonPadding} hover:bg-white/20 rounded transition-colors`}
                          title={isMuted ? "Unmute" : "Mute"}
                        >
                          {getVolumeIcon(controlStyles.icon)}
                        </button>

                        {/* Horizontal Volume Slider */}
                        {showVolumeSlider && (
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={effectiveVolume}
                            onChange={handleVolumeChange}
                            onInput={handleVolumeChange}
                            className={`note-range ${controlStyles.volumeWidth} ${controlStyles.volumeHeight} rounded-lg appearance-none cursor-pointer`}
                            style={{
                              background: volumeBackground,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fullscreen button stays in top-right - hide in readOnly mode */}
              {!isUploading && !isDeleting && showControls && !readOnly && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="absolute right-2 top-2 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 group-hover/video:opacity-100"
                  title="View fullscreen"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )
        ) : (
          <div
            className={`mx-auto flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-accent bg-accent-soft"
                : "border-line-strong hover:bg-hover"
            } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
            style={{
              width: width === "auto" ? "800px" : width,
              height: height === "auto" ? "300px" : height,
              minHeight: "200px",
              maxWidth: "100%",
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center">
                <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                <p className="text-[13px] font-medium text-fg-muted">
                  Uploading… {uploadProgress}%
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <VideoIcon className="mb-3 h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
                <p className="mb-1 text-[13px] font-medium text-fg-muted">
                  Click to upload or drag and drop
                </p>
                <p className="text-[12px] text-fg-subtle">
                  MP4, WebM, OGG, MOV, MKV up to 5MB
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="mt-2">
        <div
          ref={contentRef}
          className="text-center text-[13px] italic text-fg-muted outline-none"
          style={{ minHeight: "1.2em" }}
        >
          {caption || ""}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.ogg,.mov,.qt,.mkv"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* The video full screen */}
      {isExpanded && videoUrl && (
        <MediaViewer
          label={caption ? `Video: ${caption}` : "Video"}
          onClose={() => setIsExpanded(false)}
        >
          <div className="relative w-full h-full flex items-center justify-center group/fullscreen">
            <video
              ref={fullscreenVideoRef}
              src={videoUrl}
              autoPlay
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{
                maxWidth: "calc(100vw - 2rem)",
                maxHeight: "calc(100vh - 2rem)",
              }}
              onClick={(e) => e.stopPropagation()}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setIsVideoBuffering(true)}
              onCanPlay={() => setIsVideoBuffering(false)}
              onError={() => {
                // Retry the local URL with a cache-busting parameter.
                if (filename && selectedNote?.id) {
                  const newUrl = attachmentsApi.getAttachmentUrl(
                    selectedNote.id,
                    filename
                  );
                  // Add cache-busting parameter
                  const separator = newUrl.includes("?") ? "&" : "?";
                  const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                  // Only retry when the URL changes.
                  if (refreshedUrl !== videoUrl) {
                    onChange(block.id, {
                      properties: {
                        ...block.properties,
                        url: refreshedUrl,
                      },
                    });
                  }
                }
              }}
            />

            {/* Buffering overlay for fullscreen */}
            {isVideoBuffering && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40">
                <Loader className="mb-2 h-6 w-6 animate-spin text-white" />
                <p className="text-[13px] text-white">Loading video…</p>
              </div>
            )}

            {/* Custom Video Controls for fullscreen at bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-black/60 p-4 opacity-0 transition-opacity duration-200 group-hover/fullscreen:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Timeline */}
              <input
                type="range"
                min="0"
                max={derivedDuration || 0}
                step="0.01"
                value={safeCurrentTime}
                onChange={handleSeek}
                onInput={handleSeek}
                className="note-range w-full h-1.5 mb-3 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: sliderBackground,
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  outline: "none",
                }}
              />

              {/* Controls Row */}
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6" />
                    )}
                  </button>

                  {/* Skip Backward */}
                  <button
                    onClick={() => skip(-5)}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    title="Rewind 5 seconds"
                  >
                    <Rewind className="w-5 h-5" />
                  </button>

                  {/* Skip Forward */}
                  <button
                    onClick={() => skip(5)}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    title="Forward 5 seconds"
                  >
                    <FastForward className="w-5 h-5" />
                  </button>

                  {/* Time Display */}
                  <span className="text-sm font-medium px-2">
                    {formatTime(safeCurrentTime)} / {formatTime(derivedDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Volume Control */}
                  <div
                    className="flex items-center gap-2"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-white/20 rounded transition-colors"
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {getVolumeIcon("w-6 h-6")}
                    </button>

                    {/* Horizontal Volume Slider */}
                    {showVolumeSlider && (
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={effectiveVolume}
                        onChange={handleVolumeChange}
                        onInput={handleVolumeChange}
                        className="note-range w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: volumeBackground,
                        }}
                      />
                    )}
                  </div>

                  {/* Exit Fullscreen Button */}
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    title="Exit fullscreen"
                  >
                    <Minimize2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            {caption && (
              <div className="pointer-events-none absolute bottom-24 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-center text-[13px] text-white">
                {caption}
              </div>
            )}
          </div>
        </MediaViewer>
      )}

      {/* Video Upload Alert Modal */}
      <UploadAlertDialog
        isOpen={uploadAlert.isOpen}
        onClose={handleCloseUploadAlert}
        title={uploadAlert.title || undefined}
        message={uploadAlert.message}
        fileName={uploadAlert.fileName}
        fileSize={uploadAlert.fileSize}
        maxSize={uploadAlert.maxSize}
        allowedFormats={uploadAlert.allowedFormats}
        tips={
          uploadAlert.variant === "size"
            ? SIZE_TIPS
            : uploadAlert.variant === "format"
            ? FORMAT_TIPS
            : []
        }
      />
    </div>
  );
};

export default VideoBlock;
