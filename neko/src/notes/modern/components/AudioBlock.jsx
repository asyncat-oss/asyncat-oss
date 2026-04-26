import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  Upload,
  Volume2 as AudioIcon,
  Loader,
  Repeat,
  SquareX,
  Play,
  Pause,
  Volume1,
  VolumeX,
  Rewind,
  FastForward,
  AlertTriangle,
} from "lucide-react";
import { attachmentsApi } from "../../noteApi";
import { useNoteContext } from "../../context/NoteContext";

const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/m4a",
  "audio/flac",
];
const ALLOWED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".webm",
  ".aac",
  ".m4a",
  ".flac",
];
const ALLOWED_AUDIO_FORMAT_LABEL = "MP3, WAV, OGG, WebM, AAC, M4A, FLAC";
const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_SIZE_LABEL = "5MB";

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

const AudioBlock = ({ block, onChange, contentRef, readOnly }) => {
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
    return () => document.head.removeChild(style);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploadAlert, setUploadAlert] = useState(createInitialUploadAlert());
  const [isReplacing, setIsReplacing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const controlRevealTimeoutRef = useRef(null);
  const { selectedNote } = useNoteContext();
  const audioRef = useRef(null);
  const isSeekingRef = useRef(false);
  const sliderRef = useRef(null);

  const audioUrl = block.properties?.url || "";
  const [isAudioLoaded, setIsAudioLoaded] = useState(!!audioUrl);
  const [showAudio, setShowAudio] = useState(() => !!audioUrl);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const filename = block.properties?.filename || "";
  const caption = block.properties?.caption || "";

  // Custom audio controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioBuffering, setIsAudioBuffering] = useState(false);
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

    // Reset any previous alert state
    setUploadAlert(createInitialUploadAlert());

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const hasAllowedExtension = ALLOWED_AUDIO_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    const isMimeAllowed = ALLOWED_AUDIO_MIME_TYPES.includes(mimeType);
    const appearsToBeAudio =
      mimeType.startsWith("audio/") || mimeType === "" || hasAllowedExtension;

    if (!appearsToBeAudio || (!isMimeAllowed && !hasAllowedExtension)) {
      setUploadAlert({
        isOpen: true,
        variant: "format",
        title: "Invalid Audio Format",
        message: `The selected file type is not supported. Please upload a ${ALLOWED_AUDIO_FORMAT_LABEL} audio file.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: "",
        allowedFormats: ALLOWED_AUDIO_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
      setUploadAlert({
        isOpen: true,
        variant: "size",
        title: "Audio Too Large",
        message: `The selected audio file is ${sizeInMb}MB, which exceeds the ${MAX_AUDIO_SIZE_LABEL} limit. Please choose a smaller file or compress it before uploading.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: MAX_AUDIO_SIZE_LABEL,
        allowedFormats: ALLOWED_AUDIO_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate audio file with shared helper for consistency
    const validation = attachmentsApi.validateAudioFile(file);

    if (!validation.isValid) {
      const firstError = validation.errors[0] || "Audio validation failed.";
      const normalizedError = firstError.toLowerCase();
      const isSizeError =
        normalizedError.includes("size") || normalizedError.includes("limit");

      setUploadAlert({
        isOpen: true,
        variant: isSizeError ? "size" : "format",
        title: isSizeError ? "Audio Too Large" : "Invalid Audio Format",
        message: isSizeError
          ? `The selected audio file exceeds the ${MAX_AUDIO_SIZE_LABEL} limit. Please choose a smaller file or compress it before uploading.`
          : `The selected file type is not supported. Please upload a ${ALLOWED_AUDIO_FORMAT_LABEL} audio file.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: isSizeError ? MAX_AUDIO_SIZE_LABEL : "",
        allowedFormats: ALLOWED_AUDIO_FORMAT_LABEL,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    // Set replacing flag if there's already an audio file
    setIsReplacing(!!audioUrl);

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

        // Add cache-busting parameter to ensure onLoadedData fires for same audio
        const separator = attachmentUrl.includes("?") ? "&" : "?";
        const cacheBustedUrl = `${attachmentUrl}${separator}t=${Date.now()}`;

        // Set loading state to maintain placeholder size until audio loads
        setIsAudioLoaded(false);
        setShowAudio(false);
        setShouldAnimate(true);
        setShowControls(false);

        onChange(block.id, {
          properties: {
            ...block.properties,
            url: cacheBustedUrl,
            filename: result.data.filename,
            originalName: result.data.originalName,
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
      setError(err.message || "Failed to upload audio");
      // Reset states immediately on error
      setIsUploading(false);
      setUploadProgress(0);
      setIsReplacing(false);
      setIsAudioLoaded(false);
      setShowAudio(false);
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

  const handleCaptionChange = (newCaption) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        caption: newCaption,
      },
    });
  };

  // Custom audio control handlers
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    // Don't update state while user is actively seeking
    if (isSeekingRef.current) {
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      const audioDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : duration;
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const boundedTime =
        audioDuration && audioDuration > 0
          ? Math.min(Math.max(time, 0), audioDuration)
          : Math.max(time, 0);

      setCurrentTime(boundedTime);

      if (
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        audio.duration !== duration
      ) {
        setDuration(audio.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio) {
      const metaDuration = Number.isFinite(audio.duration)
        ? Math.max(audio.duration, 0)
        : 0;
      setDuration(metaDuration);
    }
  };

  const handleSeekStart = () => {
    isSeekingRef.current = true;
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;

    const seekTime = parseFloat(e.target.value);
    if (Number.isNaN(seekTime)) return;

    const audioDuration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : duration;
    const boundedSeek =
      audioDuration && audioDuration > 0
        ? Math.min(Math.max(seekTime, 0), audioDuration)
        : Math.max(seekTime, 0);

    // Update visual slider immediately for smooth dragging
    setCurrentTime(boundedSeek);

    // Only update audio.currentTime if ready
    if (audio.readyState >= 2) {
      try {
        audio.currentTime = boundedSeek;
      } catch (err) {
        // Silently handle error
      }
    }
  };

  const handleSeekEnd = () => {
    const audio = audioRef.current;
    if (audio) {
      // Ensure state matches audio element
      setCurrentTime(audio.currentTime);
    }
    isSeekingRef.current = false;
  };

  const handleVolumeChange = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newVolume = parseFloat(e.target.value);
    if (Number.isNaN(newVolume)) return;
    const boundedVolume = Math.min(Math.max(newVolume, 0), 1);
    audio.volume = boundedVolume;
    audio.muted = boundedVolume === 0;
    setVolume(boundedVolume);
    setIsMuted(boundedVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      const restoredVolume = volume || 0.5;
      audio.muted = false;
      audio.volume = restoredVolume;
      setVolume(restoredVolume);
      setIsMuted(false);
    } else {
      audio.volume = 0;
      audio.muted = true;
      setIsMuted(true);
    }
  };

  const skip = (seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const audioDuration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : duration;
    const fallbackDuration =
      audioDuration && audioDuration > 0
        ? audioDuration
        : Math.max((audio.currentTime || 0) + seconds, 0);
    const targetTime = Math.max(
      0,
      Math.min(fallbackDuration, (audio.currentTime || 0) + seconds)
    );
    audio.currentTime = targetTime;
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
      return <AudioIcon className={size} />;
    }
  };

  const handleDeleteAudio = async () => {
    setIsDeleting(true);
    setError(null);

    if (filename && selectedNote?.id) {
      try {
        await attachmentsApi.deleteAttachment(selectedNote.id, filename);
      } catch (err) {
        setError("Failed to delete audio from server");
        // Continue with removal from block even if deletion fails
      }
    }

    onChange(block.id, {
      properties: {
        ...block.properties,
        url: "",
        filename: "",
        originalName: "",
        contentType: null,
      },
    });

    setIsAudioLoaded(false);
    setShowAudio(false);
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

  const derivedDuration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : Number.isFinite(audioRef.current?.duration) &&
        audioRef.current.duration > 0
      ? audioRef.current.duration
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
    <div className="audio-block group relative">
      {/* Upload button positioned at same level as block selector toggle */}
      {!audioUrl && (
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
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-end items-center mb-4 pr-8 ">
        <div className="flex items-center gap-2">
          {/* Replace button */}
          {audioUrl && showControls && (
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
          {audioUrl && showControls && (
            <button
              onClick={handleDeleteAudio}
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
          <div className="w-full max-w-2xl">
            <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 dark:bg-blue-500 midnight:bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Audio container */}
      <div
        className={`audio-container flex justify-center pl-10 ${
          !audioUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {audioUrl ? (
          !isAudioLoaded && (isUploading || isReplacing) ? (
            <div
              className="bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg mx-auto relative"
              style={{
                width: "600px",
                height: "120px",
                maxWidth: "600px",
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/40 dark:bg-gray-700/60 midnight:bg-gray-800/20 backdrop-blur-sm rounded-lg">
                <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                  Loading audio...
                </p>
              </div>
              {/* Hidden audio for loading */}
              <audio
                src={audioUrl}
                preload="auto"
                style={{ display: "none" }}
                onLoadedData={() => {
                  setIsAudioLoaded(true);
                  setTimeout(() => {
                    setShowAudio(true);
                    scheduleControlReveal();
                  }, 50);
                }}
                onError={() => {
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    if (refreshedUrl !== audioUrl) {
                      onChange(block.id, {
                        properties: {
                          ...block.properties,
                          url: refreshedUrl,
                        },
                      });
                      return;
                    }
                  }
                  setError("Failed to load audio");
                  setIsAudioLoaded(false);
                  setShowAudio(false);
                  setShouldAnimate(false);
                }}
              />
            </div>
          ) : (
            <div className="relative inline-block group/audio w-full max-w-2xl">
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                style={{ display: "none" }}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onSeeking={() => { isSeekingRef.current = true; }}
                onSeeked={() => {
                  isSeekingRef.current = false;
                  const audio = audioRef.current;
                  if (audio) {
                    setCurrentTime(audio.currentTime);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsAudioBuffering(true)}
                onCanPlay={() => setIsAudioBuffering(false)}
                onLoadedData={() => {
                  setIsAudioLoaded(true);
                  setTimeout(() => {
                    setShowAudio(true);
                    scheduleControlReveal();
                  }, 50);
                }}
                onError={() => {
                  if (filename && selectedNote?.id) {
                    const newUrl = attachmentsApi.getAttachmentUrl(
                      selectedNote.id,
                      filename
                    );
                    const separator = newUrl.includes("?") ? "&" : "?";
                    const refreshedUrl = `${newUrl}${separator}t=${Date.now()}`;

                    if (refreshedUrl !== audioUrl) {
                      onChange(block.id, {
                        properties: {
                          ...block.properties,
                          url: refreshedUrl,
                        },
                      });
                      return;
                    }
                  }
                  setError("Failed to load audio");
                  setIsAudioLoaded(false);
                  setShowAudio(false);
                  setShouldAnimate(false);
                }}
              />

              {/* Custom Audio Player UI */}
              <div
                className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 p-4"
                style={{
                  animation:
                    shouldAnimate && showAudio && !readOnly
                      ? "revealFromTop 5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards"
                      : "none",
                  clipPath: shouldAnimate && !readOnly
                    ? showAudio
                      ? "inset(0 0 0 0)"
                      : "inset(0 0 100% 0)"
                    : "inset(0 0 0 0)",
                }}
              >
                {/* Timeline */}
                <input
                  ref={sliderRef}
                  type="range"
                  min="0"
                  max={derivedDuration || 0}
                  step="0.01"
                  value={safeCurrentTime}
                  onMouseDown={handleSeekStart}
                  onTouchStart={handleSeekStart}
                  onInput={handleSeek}
                  onChange={handleSeekEnd}
                  onMouseUp={handleSeekEnd}
                  onTouchEnd={handleSeekEnd}
                  className="w-full h-1.5 mb-3 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: sliderBackground,
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    outline: "none",
                  }}
                />

                {/* Controls Row */}
                <div className="flex items-center justify-between text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                  <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlayPause}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded transition-colors"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>

                    {/* Skip Backward */}
                    <button
                      onClick={() => skip(-5)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded transition-colors"
                      title="Rewind 5 seconds"
                    >
                      <Rewind className="w-4 h-4" />
                    </button>

                    {/* Skip Forward */}
                    <button
                      onClick={() => skip(5)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded transition-colors"
                      title="Forward 5 seconds"
                    >
                      <FastForward className="w-4 h-4" />
                    </button>

                    {/* Time Display */}
                    <span className="text-xs px-2 font-medium">
                      {formatTime(safeCurrentTime)} / {formatTime(derivedDuration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Volume Control */}
                    <div
                      className="flex items-center gap-2"
                      onMouseEnter={() => setShowVolumeSlider(true)}
                      onMouseLeave={() => setShowVolumeSlider(false)}
                      onFocus={() => setShowVolumeSlider(true)}
                      onBlur={() => setShowVolumeSlider(false)}
                    >
                      <button
                        onClick={toggleMute}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded transition-colors"
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {getVolumeIcon("w-5 h-5")}
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
                          className="w-20 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          style={{
                            background: volumeBackground,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Buffering overlay */}
                {isAudioBuffering && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 midnight:bg-black/80 backdrop-blur-sm rounded-lg">
                    <Loader className="w-8 h-8 text-blue-500 mb-2 animate-spin" />
                    <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium text-sm">
                      Loading...
                    </p>
                  </div>
                )}
              </div>

              {/* Replacing overlay */}
              {isReplacing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 midnight:bg-black/80 backdrop-blur-sm rounded-lg transition-opacity duration-300">
                  <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                  <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                    {isUploading
                      ? `Uploading... ${uploadProgress}%`
                      : "Loading new audio..."}
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
              width: "600px",
              height: "150px",
              maxWidth: "600px",
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
                <AudioIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-2 font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-400">
                  MP3, WAV, OGG, WebM, AAC, M4A, FLAC up to 5MB
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
        accept="audio/*,.mp3,.wav,.ogg,.webm,.aac,.m4a,.flac"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Audio Upload Alert Modal */}
      <AudioUploadAlertModal
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

function AudioUploadAlertModal({
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
            <AudioIcon className="w-5 h-5 text-red-500 dark:text-red-400 midnight:text-red-400" />
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
                    Tips to reduce file size:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Trim the audio length before uploading</li>
                    <li>• Lower the bitrate to reduce file size</li>
                    <li>• Convert to MP3 or OGG format</li>
                  </ul>
                </div>
              ) : variant === "format" ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                    Tips to fix format issues:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Export or convert the audio to MP3, WAV, OGG, WebM, AAC, M4A, or FLAC</li>
                    <li>• Ensure the file extension matches the actual format</li>
                    <li>• Use an audio converter tool if needed</li>
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

export default AudioBlock;
