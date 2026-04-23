import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  Upload,
  Video as VideoIcon,
  Maximize2,
  Minimize2,
  Loader,
  Repeat,
  SquareX,
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Rewind,
  FastForward,
  AlertTriangle,
} from "lucide-react";
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

const VideoBlock = ({ block, onChange, contentRef, commonProps, readOnly }) => {
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

      /* Timeline slider styling */
      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        border: 2px solid white;
        margin-top: -4px;
      }

      input[type="range"]::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        border: 2px solid white;
      }

      input[type="range"]::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
      }

      input[type="range"]::-moz-range-track {
        height: 4px;
        border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
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
  const originalName = block.properties?.originalName || "";
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

  // Handle escape key to close fullscreen view
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

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
        title: "Invalid Video Format",
        message: `The selected file type is not supported. Please upload a ${ALLOWED_VIDEO_FORMAT_LABEL} video.`,
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
        title: "Video Too Large",
        message: `The selected video exceeds the ${MAX_VIDEO_SIZE_LABEL} limit. Please compress it or choose a smaller file before uploading.`,
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
        title: isSizeError ? "Video Too Large" : "Invalid Video Format",
        message: isSizeError
          ? `The selected video exceeds the ${MAX_VIDEO_SIZE_LABEL} limit. Please compress it or choose a smaller file before uploading.`
          : `The selected file type is not supported. Please upload a ${ALLOWED_VIDEO_FORMAT_LABEL} video.`,
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

  const handleCaptionChange = (newCaption) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        caption: newCaption,
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
  const sliderBackground = `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${timelineProgress}%, #4b5563 ${timelineProgress}%, #4b5563 100%)`;
  const normalizedVolume = Math.min(Math.max(volume || 0, 0), 1);
  const effectiveVolume = isMuted ? 0 : normalizedVolume;
  const volumeProgress = Math.min(Math.max(effectiveVolume * 100, 0), 100);
  const volumeBackground = `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volumeProgress}%, #4b5563 ${volumeProgress}%, #4b5563 100%)`;

  return (
    <div className="video-block group relative">
      {/* Upload button positioned at same level as block selector toggle */}
      {!videoUrl && (
        <div className="absolute right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          <button
            onClick={handleUploadClick}
            disabled={isUploading || isDeleting}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 midnight:hover:bg-blue-900/40 disabled:opacity-50 h-6"
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
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-between items-center mb-4 pr-8 ">
        <div className="flex items-center gap-2">
          {/* Size controls */}
          {videoUrl && showControls && (
            <div className="flex items-center gap-1 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg px-2 py-1 shadow-sm">
              <button
                onClick={() => handleSizeChange("small")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentSize === "small"
                    ? "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-300 midnight:text-blue-300"
                    : "text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
                }`}
              >
                S
              </button>
              <button
                onClick={() => handleSizeChange("medium")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentSize === "medium"
                    ? "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-300 midnight:text-blue-300"
                    : "text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
                }`}
              >
                M
              </button>
              <button
                onClick={() => handleSizeChange("large")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentSize === "large"
                    ? "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-300 midnight:text-blue-300"
                    : "text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
                }`}
              >
                L
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Replace button */}
          {videoUrl && showControls && (
            <button
              onClick={handleReplaceClick}
              disabled={isUploading || isDeleting}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 midnight:hover:bg-blue-900/40 disabled:opacity-50 h-6"
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
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 text-red-700 dark:text-red-300 midnight:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/40 midnight:hover:bg-red-900/40 disabled:opacity-50 h-6"
            >
              {isDeleting ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Removing...
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
        <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300 midnight:text-red-300">
            {error}
          </p>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="flex justify-center mb-2 mt-12 pl-8">
          <div
            className=""
            style={{
              width: width === "auto" ? "800px" : width,
              maxWidth: "800px",
            }}
          >
            <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 dark:bg-blue-500 midnight:bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Video container */}
      <div
        className={`video-container flex justify-center pl-10 ${
          !videoUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {videoUrl ? (
          !isVideoLoaded && (isUploading || isReplacing) ? (
            <div
              className="bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg mx-auto relative"
              style={{
                width: width === "auto" ? "800px" : width,
                height: height === "auto" ? "300px" : height,
                minHeight: "200px",
                maxWidth: "800px",
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/40 dark:bg-gray-700/60 midnight:bg-gray-800/20 backdrop-blur-sm rounded-lg">
                <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                  Loading video...
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
                  // Try to refresh the URL with a new token if it's an auth-related failure
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    // Add cache-busting parameter
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    // Only try to refresh if the URL is different (has a new token)
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
                  // Try to refresh the URL with a new token if it's an auth-related failure
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    // Add cache-busting parameter
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    // Only try to refresh if the URL is different (has a new token)
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
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 midnight:bg-black/80 backdrop-blur-sm rounded-lg transition-opacity duration-300">
                  <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                  <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                    {isUploading
                      ? `Uploading... ${uploadProgress}%`
                      : "Loading new video..."}
                  </p>
                </div>
              )}

              {/* Deleting overlay */}
              {isDeleting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/20 dark:bg-black/20 midnight:bg-black/20 backdrop-blur-sm rounded-lg">
                  <Loader className="w-12 h-12 text-red-500 mb-4 animate-spin" />
                  <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                    Removing...
                  </p>
                </div>
              )}

              {/* Buffering overlay */}
              {isVideoBuffering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg">
                  <Loader className="w-12 h-12 text-white mb-2 animate-spin" />
                  <p className="text-white font-medium text-sm">
                    Loading video...
                  </p>
                </div>
              )}

              {/* Custom Video Controls at bottom */}
              {!readOnly && (
                <div
                  className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent ${controlStyles.containerPadding} rounded-b-lg opacity-0 group-hover/video:opacity-100 transition-opacity duration-200`}
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
                    className={`w-full ${controlStyles.timelineHeight} ${controlStyles.timelineMargin} rounded-lg appearance-none cursor-pointer`}
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
                            className={`${controlStyles.volumeWidth} ${controlStyles.volumeHeight} bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500`}
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
                  className="absolute top-2 right-2 p-1 bg-black/50 dark:bg-black/50 midnight:bg-black/60 text-white rounded opacity-0 group-hover/video:opacity-100 hover:bg-black/70 dark:hover:bg-black/70 midnight:hover:bg-black/80 transition-all duration-200"
                  title="View fullscreen"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center mx-auto ${
              isDragging
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 midnight:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-500"
            } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
            style={{
              width: width === "auto" ? "800px" : width,
              height: height === "auto" ? "300px" : height,
              minHeight: "200px",
              maxWidth: "800px",
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center">
                <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-2 font-medium">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <VideoIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-2 font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-400">
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
          className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 text-center italic outline-none"
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

      {/* Expanded view modal - using portal to render outside DOM hierarchy */}
      {isExpanded &&
        videoUrl &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/80 dark:bg-black/80 midnight:bg-black/90 flex items-center justify-center p-4"
            onClick={() => setIsExpanded(false)}
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
                  // Try to refresh the URL with a new token if it's an auth-related failure
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    // Add cache-busting parameter
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    // Only try to refresh if the URL is different (has a new token)
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
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg pointer-events-none">
                  <Loader className="w-16 h-16 text-white mb-3 animate-spin" />
                  <p className="text-white font-medium">Loading video...</p>
                </div>
              )}

              {/* Custom Video Controls for fullscreen at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 opacity-0 group-hover/fullscreen:opacity-100 transition-opacity duration-200"
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
                  className="w-full h-1.5 mb-3 rounded-lg appearance-none cursor-pointer"
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
                          className="w-24 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
                <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-black/70 dark:bg-black/70 midnight:bg-black/80 text-white px-4 py-2 rounded-lg text-sm max-w-[90%] text-center pointer-events-none">
                  {caption}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Video Upload Alert Modal */}
      <VideoUploadAlertModal
        isOpen={uploadAlert.isOpen}
        onClose={handleCloseUploadAlert}
        title={uploadAlert.title || "Upload Error"}
        message={uploadAlert.message}
        fileName={uploadAlert.fileName}
        fileSize={uploadAlert.fileSize}
        maxSize={uploadAlert.maxSize}
        allowedFormats={uploadAlert.allowedFormats}
        variant={uploadAlert.variant}
      />
    </div>
  );
};

function VideoUploadAlertModal({
  isOpen,
  onClose,
  title = "Upload Error",
  message,
  fileSize,
  maxSize,
  fileName,
  allowedFormats,
  variant,
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    const handleEnter = (e) => {
      if (
        e.key === "Enter" &&
        isOpen &&
        modalRef.current &&
        modalRef.current.contains(e.target)
      ) {
        e.preventDefault();
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("keydown", handleEnter);
    }

    return () => {
      document.body.style.overflow = "auto";
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleEnter);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)}MB`;
  };

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  if (!portalTarget) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 2147483647, pointerEvents: "auto" }}
    >
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 midnight:bg-black/70 backdrop-blur-sm transition-opacity duration-200"
        style={{ zIndex: 2147483646 }}
        onClick={handleBackdropClick}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-md overflow-hidden rounded-xl bg-white dark:bg-gray-700 midnight:bg-gray-900 shadow-2xl dark:shadow-gray-900/30 midnight:shadow-black/30 transform transition-all duration-300 scale-100 mx-4"
        style={{
          transformOrigin: "center",
          zIndex: 2147483647,
        }}
      >
        {/* Header */}
        <div className="flex items-center p-4 bg-white border-b dark:bg-gray-700 midnight:bg-gray-900 border-gray-200 dark:border-gray-600 midnight:border-gray-800">
          <div className="flex items-center gap-3">
            <VideoIcon className="w-5 h-5 text-red-500 dark:text-red-400 midnight:text-red-400" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white midnight:text-indigo-200">
              {title}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 p-2 rounded-full bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20">
              <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 midnight:text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-4">
                {message}
              </div>

              {/* File Details */}
              <div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg p-4 space-y-2">
                {fileName && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                      File:
                    </span>
                    <span className="text-sm text-gray-800 dark:text-gray-200 midnight:text-gray-300 truncate max-w-48">
                      {fileName}
                    </span>
                  </div>
                )}

                {fileSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                      File Size:
                    </span>
                    <span className="text-sm font-mono text-red-600 dark:text-red-400 midnight:text-red-400">
                      {formatFileSize(fileSize)}
                    </span>
                  </div>
                )}

                {maxSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                      Max Allowed:
                    </span>
                    <span className="text-sm font-mono text-green-600 dark:text-green-400 midnight:text-green-400">
                      {maxSize}
                    </span>
                  </div>
                )}

                {allowedFormats && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                      Allowed Formats:
                    </span>
                    <span className="text-sm font-mono text-indigo-600 dark:text-indigo-300 midnight:text-indigo-200">
                      {allowedFormats}
                    </span>
                  </div>
                )}
              </div>

              {/* Tips */}
              {variant === "size" ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                    💡 Tips to reduce file size:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Trim the video length before uploading</li>
                    <li>• Lower the resolution or bitrate to shrink file size</li>
                    <li>• Convert to an efficient codec such as H.264 or HEVC</li>
                  </ul>
                </div>
              ) : variant === "format" ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                    💡 Tips to fix format issues:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Export or convert the video to MP4, WebM, OGG, MOV, or MKV</li>
                    <li>• Ensure the file extension matches the actual format</li>
                    <li>• Use a converter tool if your editor cannot export these formats</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 bg-gray-50 border-t dark:bg-gray-800 midnight:bg-gray-900 border-gray-200 dark:border-gray-600 midnight:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-white bg-blue-600 dark:bg-blue-700 midnight:bg-indigo-700 
              hover:bg-blue-700 dark:hover:bg-blue-800 midnight:hover:bg-indigo-800 
              rounded-lg transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export default VideoBlock;
