import { useEffect, useRef } from "react";
import { X, AlertTriangle, Trash2, Save } from "lucide-react";

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "warning",
  isDestructive = false,
  onCancel,
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEnter = (e) => {
      if (
        e.key === "Enter" &&
        isOpen &&
        modalRef.current &&
        modalRef.current.contains(e.target)
      ) {
        e.preventDefault();
        onConfirm();
      }
    };

    const currentModalRef = modalRef.current;

    if (currentModalRef) {
      currentModalRef.addEventListener("keydown", handleEnter);
    }

    if (isOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      if (currentModalRef) {
        currentModalRef.removeEventListener("keydown", handleEnter);
      }
      document.body.style.overflow = "auto";
    };
  }, [isOpen, onConfirm]);

  if (!isOpen) return null;

  const handleCancel = (e) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  const handleConfirm = (e) => {
    e.stopPropagation();
    onConfirm();
  };

  const getIcon = () => {
    switch (type) {
      case "delete":
        return (
          <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400 midnight:text-red-400" />
        );
      case "unsaved":
        return (
          <Save className="w-8 h-8 text-amber-500 dark:text-amber-400 midnight:text-amber-400" />
        );
      case "warning":
      default:
        return (
          <AlertTriangle className="w-8 h-8 text-amber-500 dark:text-amber-400 midnight:text-amber-400" />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 midnight:bg-black/70 backdrop-blur-sm transition-opacity duration-200"
        onClick={handleCancel}
      />

      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-white dark:bg-gray-700 midnight:bg-gray-900 shadow-2xl dark:shadow-gray-900/30 midnight:shadow-black/30 transform transition-all duration-300 scale-100"
        style={{
          transformOrigin: "center",
        }}
      >
        <div className="flex items-center justify-between p-4 bg-white border-b dark:bg-gray-700 midnight:bg-gray-900 border-gray-200 dark:border-gray-600 midnight:border-gray-800">
          <h2 className="text-lg font-medium text-gray-800 dark:text-white midnight:text-indigo-200">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 p-1">{getIcon()}</div>
            <div className="text-gray-700 dark:text-gray-300 midnight:text-gray-400 mt-1">
              {message}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end p-4 bg-gray-50 border-t dark:bg-gray-700 midnight:bg-gray-900 border-gray-200 dark:border-gray-600 midnight:border-gray-800 gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 midnight:text-gray-400 
              bg-white dark:bg-gray-600 midnight:bg-gray-800 
              border border-gray-200 dark:border-gray-500 midnight:border-gray-700 
              rounded-lg 
              hover:bg-gray-50 dark:hover:bg-gray-500 midnight:hover:bg-gray-700 
              transition-all duration-200 shadow-sm hover:shadow"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-white ${
              isDestructive
                ? "bg-red-700 dark:bg-red-600 midnight:bg-red-700 hover:bg-red-900 dark:hover:bg-red-800 midnight:hover:bg-red-800"
                : "bg-black dark:bg-gray-800 midnight:bg-indigo-900 hover:bg-gray-800 dark:hover:bg-gray-900 midnight:hover:bg-indigo-800"
            } transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;