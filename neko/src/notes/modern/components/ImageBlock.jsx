// An image block: upload or drop an image, pick a size, replace or remove
// it, and open it full screen. Empty, it is a drop zone.

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Image as ImageIcon,
  Maximize2,
  Loader2 as Loader,
  Repeat,
  SquareX,
} from "lucide-react";
import { Segmented } from "../../../components/ui/Tabs.jsx";
import UploadAlertDialog from "./UploadAlertDialog";
import MediaViewer from "./MediaViewer";
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

const SIZE_ITEMS = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
];
const SIZE_TIPS = [
  "Compress the image",
  "Make it smaller in width and height",
  "Save it as WebP or JPEG",
];
const FORMAT_TIPS = [
  "Save or convert it to JPG, PNG, GIF, WebP or SVG",
  "Check the file's extension matches its format",
  "Check the image opens before uploading it",
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

const ImageBlock = ({ block, onChange, contentRef, readOnly }) => {
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
        title: "This image format isn't supported",
        message: "An image can be a JPG, PNG, GIF, WebP or SVG file.",
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
        title: "This image is too big",
        message: `It is ${sizeInMb}MB, and an image can be up to ${MAX_IMAGE_SIZE_LABEL}.`,
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
        title: isSizeError ? "This image is too big" : "This image format isn't supported",
        message: isSizeError
          ? `An image can be up to ${MAX_IMAGE_SIZE_LABEL}.`
          : "An image can be a JPG, PNG, GIF, WebP or SVG file.",
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
          {imageUrl && showControls && (
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
          {imageUrl && showControls && (
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
          {imageUrl && showControls && (
            <button
              onClick={handleDeleteImage}
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

      {/* Image container */}
      <div
        className={`image-container flex justify-center @2xl:pl-10 ${
          !imageUrl ? "mt-15" : "pt-6"
        }`}
        style={{ maxWidth: "100%" }}
      >
        {imageUrl ? (
          !isImageLoaded ? (
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
                  Loading image…
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
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-canvas/80 transition-opacity duration-300">
                  <Loader className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                  <p className="text-[13px] text-fg-muted">
                    {isUploading
                      ? `Uploading… ${uploadProgress}%`
                      : "Loading the new image…"}
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

              {/* Expand/Collapse button - hide in readOnly mode */}
              {!isUploading && !isDeleting && showControls && !readOnly && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="absolute right-2 top-2 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 group-hover/image:opacity-100"
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
                <ImageIcon className="mb-3 h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
                <p className="mb-1 text-[13px] font-medium text-fg-muted">
                  Click to upload or drag and drop
                </p>
                <p className="text-[12px] text-fg-subtle">
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
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.svg"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* The image full screen */}
      {isExpanded && imageUrl && (
        <MediaViewer
          label={caption ? `Image: ${caption}` : "Image"}
          onClose={() => setIsExpanded(false)}
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
              <div className="absolute bottom-4 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-center text-[13px] text-white">
                {caption}
              </div>
            )}
          </div>
        </MediaViewer>
      )}

      {/* Image Upload Alert Modal */}
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

export default ImageBlock;
