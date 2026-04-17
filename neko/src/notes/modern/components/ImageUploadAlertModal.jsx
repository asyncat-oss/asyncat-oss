import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Image as ImageIcon } from "lucide-react";

const ImageUploadAlertModal = ({
  isOpen,
  onClose,
  title = "Upload Error",
  message,
  fileSize,
  maxSize = "5MB",
  fileName,
}) => {
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

  return createPortal(
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

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                    Max Allowed:
                  </span>
                  <span className="text-sm font-mono text-green-600 dark:text-green-400 midnight:text-green-400">
                    {maxSize}
                  </span>
                </div>
              </div>

              {/* Tips */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 midnight:text-blue-300 mb-1">
                  💡 Tips to reduce file size:
                </h4>
                <ul className="text-xs text-blue-700 dark:text-blue-400 midnight:text-blue-400 space-y-1">
                  <li>• Compress the image using online tools</li>
                  <li>• Reduce image dimensions/resolution</li>
                  <li>• Convert to a more efficient format (WebP, JPEG)</li>
                </ul>
              </div>
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
};

export default ImageUploadAlertModal;
