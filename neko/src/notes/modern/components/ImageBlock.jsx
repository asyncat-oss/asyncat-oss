import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  Upload,
  Image as ImageIcon,
  Maximize2,
  Loader,
  Repeat,
  SquareX,
  AlertTriangle,
} from "lucide-react";
import { attachmentsApi } from "../../noteApi";
import { useNoteContext } from "../../context/NoteContext";

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];
const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
];
const ALLOWED_IMAGE_FORMAT_LABEL = "JPG, JPEG, PNG, GIF, WebP, SVG";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE_LABEL = "5MB";

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

const ImageBlock = ({ block, onChange, contentRef, commonProps, readOnly }) => {
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploadAlert, setUploadAlert] = useState(createInitialUploadAlert());
  const [isReplacing, setIsReplacing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const controlRevealTimeoutRef = useRef(null);
  const imageRetryRef = useRef({ filename: "", attempts: 0 });
  const { selectedNote } = useNoteContext();

  const imageUrl = block.properties?.url || "";
  const [isImageLoaded, setIsImageLoaded] = useState(!!imageUrl);
  const [showImage, setShowImage] = useState(() => !!imageUrl);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const filename = block.properties?.filename || "";
  const caption = block.properties?.caption || "";
  const alt = block.properties?.alt || "Image";
  const width = block.properties?.width || "600px";
  const height = block.properties?.height || "auto";
  const originalName = block.properties?.originalName || "";
  const currentSize = block.properties?.size || "medium";

  const handleCloseUploadAlert = () => {
    setUploadAlert(createInitialUploadAlert());
  };

  const handleImageLoad = () => {
    imageRetryRef.current = { filename, attempts: 0 };
    setIsImageLoaded(true);
    setError(null);
    setTimeout(() => {
      setShowImage(true);
      scheduleControlReveal();
    }, 50);
  };

  const handleImageLoadError = () => {
    if (
      filename &&
      selectedNote?.id &&
      imageRetryRef.current.filename !== filename
    ) {
      imageRetryRef.current = { filename, attempts: 0 };
    }

    if (
      filename &&
      selectedNote?.id &&
      imageRetryRef.current.attempts < 1
    ) {
      imageRetryRef.current.attempts += 1;
      const newUrl = attachmentsApi.getAttachmentUrl(selectedNote.id, filename);
      const separator = newUrl.includes("?") ? "&" : "?";
      const refreshedUrl = `${newUrl}${separator}retry=${imageRetryRef.current.attempts}&t=${Date.now()}`;

      if (refreshedUrl !== imageUrl) {
        onChange(block.id, {
          properties: {
            ...block.properties,
            url: refreshedUrl,
          },
        });
        return;
      }
    }

    setError("Failed to load image");
    setIsImageLoaded(false);
    setShowImage(false);
    setShouldAnimate(false);
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

    // Reset any previous alert state
    setUploadAlert(createInitialUploadAlert());

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    const isMimeAllowed = ALLOWED_IMAGE_MIME_TYPES.includes(mimeType);
    const appearsToBeImage =
      mimeType.startsWith("image/") || mimeType === "" || hasAllowedExtension;

    if (!appearsToBeImage || (!isMimeAllowed && !hasAllowedExtension)) {
      setUploadAlert({
        isOpen: true,
        variant: "format",
        title: "Invalid Image Format",
        message: `The selected file type is not supported. Please upload a ${ALLOWED_IMAGE_FORMAT_LABEL} image.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: "",
        allowedFormats: ALLOWED_IMAGE_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
      setUploadAlert({
        isOpen: true,
        variant: "size",
        title: "Image Too Large",
        message: `The selected image is ${sizeInMb}MB, which exceeds the ${MAX_IMAGE_SIZE_LABEL} limit. Please choose a smaller file or compress it before uploading.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: MAX_IMAGE_SIZE_LABEL,
        allowedFormats: ALLOWED_IMAGE_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate image file with shared helper for consistency
    const validation = attachmentsApi.validateImageFile(file);

    if (!validation.isValid) {
      const firstError = validation.errors[0] || "Image validation failed.";
      const normalizedError = firstError.toLowerCase();
      const isSizeError =
        normalizedError.includes("size") || normalizedError.includes("limit");

      setUploadAlert({
        isOpen: true,
        variant: isSizeError ? "size" : "format",
        title: isSizeError ? "Image Too Large" : "Invalid Image Format",
        message: isSizeError
          ? `The selected image exceeds the ${MAX_IMAGE_SIZE_LABEL} limit. Please choose a smaller file or compress it before uploading.`
          : `The selected file type is not supported. Please upload a ${ALLOWED_IMAGE_FORMAT_LABEL} image.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: isSizeError ? MAX_IMAGE_SIZE_LABEL : "",
        allowedFormats: ALLOWED_IMAGE_FORMAT_LABEL,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    // Set replacing flag if there's already an image
    setIsReplacing(!!imageUrl);

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

        // Add cache-busting parameter to ensure onLoad fires for same image
        const separator = attachmentUrl.includes("?") ? "&" : "?";
        const cacheBustedUrl = `${attachmentUrl}${separator}t=${Date.now()}`;

        // Set loading state to maintain placeholder size until image loads
        setIsImageLoaded(false);
        setShowImage(false);
        setShouldAnimate(true);
        setShowControls(false);

        onChange(block.id, {
          properties: {
            ...block.properties,
            url: cacheBustedUrl,
            filename: result.data.filename,
            originalName: result.data.originalName,
            alt: result.data.originalName,
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
      setError(err.message || "Failed to upload image");
      // Reset states immediately on error
      setIsUploading(false);
      setUploadProgress(0);
      setIsReplacing(false);
      setIsImageLoaded(false);
      setShowImage(false);
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

  const handleDeleteImage = async () => {
    setIsDeleting(true);
    setError(null);

    if (filename && selectedNote?.id) {
      try {
        await attachmentsApi.deleteAttachment(selectedNote.id, filename);
      } catch (err) {
        setError("Failed to delete image from server");
        // Continue with removal from block even if deletion fails
      }
    }

    onChange(block.id, {
      properties: {
        ...block.properties,
        url: "",
        filename: "",
        originalName: "",
        alt: "Image",
        size: null,
        contentType: null,
      },
    });

    setIsImageLoaded(false);
    setShowImage(false);
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

  return (
    <div className="image-block group relative">
      {/* Upload button positioned at same level as block selector toggle */}
      {!imageUrl && (
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
          {imageUrl && showControls && (
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
          {imageUrl && showControls && (
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
          {imageUrl && showControls && (
            <button
              onClick={handleDeleteImage}
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

      {/* Image container */}
      <div
        className={`image-container flex justify-center pl-10 ${
          !imageUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {imageUrl ? (
          !isImageLoaded ? (
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
                  Loading image...
                </p>
              </div>
              {/* Hidden image for loading */}
              <img
                src={imageUrl}
                alt={alt}
                style={{ display: "none" }}
                onLoad={handleImageLoad}
                onError={handleImageLoadError}
              />
            </div>
          ) : (
            <div className="relative inline-block group/image">
              {/* Main visible image */}
              <img
                src={imageUrl}
                alt={alt}
                style={{
                  width: width === "auto" ? "auto" : width,
                  height: height === "auto" ? "auto" : height,
                  maxWidth: "100%",
                  margin: "0 auto",
                  animation:
                    shouldAnimate && showImage && !readOnly
                      ? "revealFromTop 5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards"
                      : "none",
                  clipPath: shouldAnimate && !readOnly
                    ? showImage
                      ? "inset(0 0 0 0)"
                      : "inset(0 0 100% 0)"
                    : "inset(0 0 0 0)",
                }}
                className={`rounded-lg shadow-sm hover:shadow-md transition-all duration-300`}
                onLoad={handleImageLoad}
                onError={handleImageLoadError}
              />

              {/* Replacing overlay - shows throughout the entire replacement process */}
              {isReplacing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 midnight:bg-black/80 backdrop-blur-sm rounded-lg transition-opacity duration-300">
                  <Loader className="w-12 h-12 text-blue-500 mb-4 animate-spin" />
                  <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-medium">
                    {isUploading
                      ? `Uploading... ${uploadProgress}%`
                      : "Loading new image..."}
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

              {/* Expand/Collapse button - hide in readOnly mode */}
              {!isUploading && !isDeleting && showControls && !readOnly && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="absolute top-2 right-2 p-1 bg-black/50 dark:bg-black/50 midnight:bg-black/60 text-white rounded opacity-0 group-hover/image:opacity-100 hover:bg-black/70 dark:hover:bg-black/70 midnight:hover:bg-black/80 transition-all duration-200"
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
                <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-2 font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-400">
                  JPG, JPEG, PNG, GIF, WebP, SVG up to 5MB
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
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.svg"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Expanded view modal - using portal to render outside DOM hierarchy */}
      {isExpanded &&
        imageUrl &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/80 dark:bg-black/80 midnight:bg-black/90 flex items-center justify-center p-4"
            onClick={() => setIsExpanded(false)}
          >
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={imageUrl}
                alt={alt}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{
                  maxWidth: "calc(100vw - 2rem)",
                  maxHeight: "calc(100vh - 2rem)",
                }}
                onClick={(e) => e.stopPropagation()}
                onError={handleImageLoadError}
              />
              {caption && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 dark:bg-black/70 midnight:bg-black/80 text-white px-4 py-2 rounded-lg text-sm max-w-[90%] text-center">
                  {caption}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Image Upload Alert Modal */}
      <ImageUploadAlertModal
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

function ImageUploadAlertModal({
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
            <ImageIcon className="w-5 h-5 text-red-500 dark:text-red-400 midnight:text-red-400" />
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
                    <li>• Compress the image using online tools</li>
                    <li>• Reduce image dimensions or resolution before uploading</li>
                    <li>• Convert to a more efficient format such as WebP or JPEG</li>
                  </ul>
                </div>
              ) : variant === "format" ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                    💡 Tips to fix format issues:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Export or convert the image to JPG, PNG, GIF, WebP, or SVG</li>
                    <li>• Ensure the file extension matches the actual image format</li>
                    <li>• Verify the image opens correctly before uploading</li>
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

export default ImageBlock;
