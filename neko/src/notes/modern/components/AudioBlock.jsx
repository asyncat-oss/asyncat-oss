// An audio block: upload or drop a recording and play it with our own
// controls, or replace or remove it. Empty, it is a drop zone.

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Volume2 as AudioIcon,
  Loader2 as Loader,
  Repeat,
  SquareX,
  Play,
  Pause,
  Volume1,
  VolumeX,
  Rewind,
  FastForward,
} from "lucide-react";
import UploadAlertDialog from "./UploadAlertDialog";
import { ensureNoteRangeStyle, rangeFill } from "./mediaRange";
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

const SIZE_TIPS = [
  "Trim the recording",
  "Lower its bitrate",
  "Save it as MP3 or OGG",
];
const FORMAT_TIPS = [
  "Save or convert it to MP3, WAV, OGG, WebM, AAC, M4A or FLAC",
  "Check the file's extension matches its format",
  "Use an audio converter if you need to",
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
    ensureNoteRangeStyle();
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
        title: "This audio format isn't supported",
        message: "A recording can be an MP3, WAV, OGG, WebM, AAC, M4A or FLAC file.",
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
        title: "This recording is too big",
        message: `It is ${sizeInMb}MB, and a recording can be up to ${MAX_AUDIO_SIZE_LABEL}.`,
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
        title: isSizeError ? "This recording is too big" : "This audio format isn't supported",
        message: isSizeError
          ? `A recording can be up to ${MAX_AUDIO_SIZE_LABEL}.`
          : "A recording can be an MP3, WAV, OGG, WebM, AAC, M4A or FLAC file.",
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
  const sliderBackground = rangeFill(timelineProgress, "var(--as-line-strong)");
  const normalizedVolume = Math.min(Math.max(volume || 0, 0), 1);
  const effectiveVolume = isMuted ? 0 : normalizedVolume;
  const volumeProgress = Math.min(Math.max(effectiveVolume * 100, 0), 100);
  const volumeBackground = rangeFill(volumeProgress, "var(--as-line-strong)");

  return (
    <div className="audio-block group relative">
      {/* Upload button positioned at same level as block selector toggle */}
      {!audioUrl && (
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
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="flex items-center gap-2">
          {/* Replace button */}
          {audioUrl && showControls && (
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
          {audioUrl && showControls && (
            <button
              onClick={handleDeleteAudio}
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
          <div className="w-full max-w-2xl">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Audio container */}
      <div
        className={`audio-container flex justify-center @2xl:pl-10 ${
          !audioUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {audioUrl ? (
          !isAudioLoaded && (isUploading || isReplacing) ? (
            <div
              className="relative mx-auto rounded-lg bg-hover"
              style={{
                width: "600px",
                height: "120px",
                maxWidth: "100%",
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg">
                <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                <p className="text-[13px] text-fg-muted">
                  Loading audio…
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
                className="rounded-xl border border-line bg-surface p-4"
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
                  className="note-range mb-3 h-1.5 w-full cursor-pointer appearance-none rounded-lg"
                  style={{
                    background: sliderBackground,
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    outline: "none",
                  }}
                />

                {/* Controls Row */}
                <div className="flex items-center justify-between text-fg">
                  <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlayPause}
                      className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                      className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                      title="Rewind 5 seconds"
                    >
                      <Rewind className="w-4 h-4" />
                    </button>

                    {/* Skip Forward */}
                    <button
                      onClick={() => skip(5)}
                      className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                        className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                          className="note-range h-1.5 w-20 cursor-pointer appearance-none rounded-lg"
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-canvas/80">
                    <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                    <p className="text-[13px] text-fg-muted">
                      Loading…
                    </p>
                  </div>
                )}
              </div>

              {/* Replacing overlay */}
              {isReplacing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-canvas/80 transition-opacity duration-300">
                  <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                  <p className="text-[13px] text-fg-muted">
                    {isUploading
                      ? `Uploading… ${uploadProgress}%`
                      : "Loading the new audio…"}
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
              width: "600px",
              height: "150px",
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
                <AudioIcon className="mb-3 h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
                <p className="mb-1 text-[13px] font-medium text-fg-muted">
                  Click to upload or drag and drop
                </p>
                <p className="text-[12px] text-fg-subtle">
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
        accept="audio/*,.mp3,.wav,.ogg,.webm,.aac,.m4a,.flac"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Audio Upload Alert Modal */}
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

export default AudioBlock;
