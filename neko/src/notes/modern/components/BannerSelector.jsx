import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { Image, Loader, Palette, Trash2, Upload, X, AlertTriangle } from "lucide-react";
import { attachmentApi } from "../../attachmentApi";
import AlertModal from "../AlertModal";

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_IMAGE_FORMAT_LABEL = "JPG, JPEG, PNG, GIF, WebP";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE_LABEL = "10MB";

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

const BannerSelector = ({ note, onBannerChange, onClose }) => {
  const [activeTab, setActiveTab] = useState("colors");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadAlert, setUploadAlert] = useState(createInitialUploadAlert());
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });
  const fileInputRef = useRef(null);

  // Predefined color options
  const colorOptions = [
    { name: "Blue", value: "#3B82F6" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Pink", value: "#EC4899" },
    { name: "Red", value: "#EF4444" },
    { name: "Orange", value: "#F97316" },
    { name: "Yellow", value: "#EAB308" },
    { name: "Green", value: "#10B981" },
    { name: "Teal", value: "#14B8A6" },
    { name: "Indigo", value: "#6366F1" },
    { name: "Cyan", value: "#06B6D4" },
  ];

  // Predefined gradient options
  const gradientOptions = [
    { name: "Sunset", value: "linear-gradient(45deg, #FF6B6B, #FFE66D)" },
    { name: "Ocean", value: "linear-gradient(45deg, #667eea, #764ba2)" },
    { name: "Forest", value: "linear-gradient(45deg, #11998e, #38ef7d)" },
    { name: "Lavender", value: "linear-gradient(45deg, #a8edea, #fed6e3)" },
    { name: "Fire", value: "linear-gradient(45deg, #ff9a9e, #fecfef)" },
    { name: "Sky", value: "linear-gradient(45deg, #a1c4fd, #c2e9fb)" },
    { name: "Cosmic", value: "linear-gradient(45deg, #2E3192, #1BFFFF)" },
    { name: "Peach", value: "linear-gradient(45deg, #ffecd2, #fcb69f)" },
  ];

  const handleColorSelect = async (color) => {
    try {
      await attachmentApi.setBanner(note.id, "color", { color });
      onBannerChange({ type: "color", color });
    } catch (error) {
      // Silently handle error
    }
  };

  const handleGradientSelect = async (gradient) => {
    try {
      await attachmentApi.setBanner(note.id, "gradient", { gradient });
      onBannerChange({ type: "gradient", gradient });
    } catch (error) {
      // Silently handle error
    }
  };

  const handleCloseUploadAlert = () => {
    setUploadAlert(createInitialUploadAlert());
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

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
        message: `The selected file type is not supported. Please upload a ${ALLOWED_IMAGE_FORMAT_LABEL} image for banner.`,
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
        message: `The selected banner image is ${sizeInMb}MB, which exceeds the ${MAX_IMAGE_SIZE_LABEL} limit. Please choose a smaller file or compress it before uploading.`,
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

    setIsUploading(true);
    setUploadProgress(0);
    let uploadSucceeded = false;

    try {
      const result = await attachmentApi.uploadBannerImage(
        note.id,
        file,
        (progress) => setUploadProgress(progress)
      );

      // Ensure we pass all necessary data for the banner
      const bannerData = {
        type: "image",
        filename: result.filename,
        url:
          result.url ||
          attachmentApi.getAttachmentUrl(note.id, result.filename),
        originalName: result.originalName,
        contentType: result.contentType || file.type,
        uploadedAt: result.uploadedAt || new Date().toISOString(),
      };

      onBannerChange(bannerData);
      uploadSucceeded = true;
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: "Upload Failed",
        message: "Failed to upload image. Please try again.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }

    if (uploadSucceeded) {
      onClose?.();
    }
  };

  const handleRemoveBanner = async () => {
    try {
      await attachmentApi.removeBanner(note.id);
      onBannerChange(null);
    } catch (error) {
      // Silently handle error
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
            Choose Banner
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <button
            onClick={() => setActiveTab("colors")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "colors"
                ? "text-blue-600 dark:text-blue-400 midnight:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 midnight:border-blue-400"
                : "text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-slate-300"
            }`}
          >
            <Palette className="w-4 h-4 inline mr-2" />
            Colors
          </button>
          <button
            onClick={() => setActiveTab("gradients")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "gradients"
                ? "text-blue-600 dark:text-blue-400 midnight:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 midnight:border-blue-400"
                : "text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-slate-300"
            }`}
          >
            Gradients
          </button>
          <button
            onClick={() => setActiveTab("image")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "image"
                ? "text-blue-600 dark:text-blue-400 midnight:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 midnight:border-blue-400"
                : "text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-slate-300"
            }`}
          >
            <Image className="w-4 h-4 inline mr-2" />
            Image
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          {activeTab === "colors" && (
            <div className="grid grid-cols-5 gap-3">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorSelect(color.value)}
                  className="aspect-square rounded-lg border-2 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 transition-colors"
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          )}

          {activeTab === "gradients" && (
            <div className="grid grid-cols-2 gap-3">
              {gradientOptions.map((gradient) => (
                <button
                  key={gradient.name}
                  onClick={() => handleGradientSelect(gradient.value)}
                  className="h-16 rounded-lg border-2 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 transition-colors"
                  style={{ background: gradient.value }}
                  title={gradient.name}
                />
              ))}
            </div>
          )}

          {activeTab === "image" && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 transition-colors flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader className="w-8 h-8 mb-2 animate-spin" />
                    <span className="text-sm font-medium">
                      Uploading... {Math.round(uploadProgress)}%
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">Upload Image</span>
                  </>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-500 midnight:text-slate-500 mt-1">
                  PNG, JPG up to 10MB
                </span>
              </button>

              {isUploading && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-blue-600 dark:bg-blue-500 midnight:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <button
            onClick={handleRemoveBanner}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 midnight:hover:bg-red-950/30 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Remove Banner
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Banner Upload Alert Modal */}
      <BannerUploadAlertModal
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

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
};

function BannerUploadAlertModal({
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
            <Image className="w-5 h-5 text-red-500 dark:text-red-400 midnight:text-red-400" />
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
                    <li>• Compress the image using online tools</li>
                    <li>• Reduce image dimensions or resolution before uploading</li>
                    <li>• Convert to a more efficient format such as WebP or JPEG</li>
                  </ul>
                </div>
              ) : variant === "format" ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                    Tips to fix format issues:
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-500 midnight:text-blue-400 space-y-1">
                    <li>• Export or convert the image to JPG, PNG, GIF, or WebP</li>
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

export default BannerSelector;
