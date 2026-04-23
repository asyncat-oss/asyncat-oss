import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

const AlertModal = ({
  isOpen,
  onClose,
  title = "Alert",
  message = "",
  type = "info", // 'info', 'success', 'error', 'warning'
  buttonText = "OK",
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!isOpen || !isMounted) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return (
          <CheckCircle className="w-6 h-6 text-green-500 dark:text-green-400 midnight:text-green-300" />
        );
      case "error":
        return (
          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 midnight:text-red-300" />
        );
      case "warning":
        return (
          <AlertCircle className="w-6 h-6 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-300" />
        );
      default:
        return (
          <Info className="w-6 h-6 text-blue-500 dark:text-blue-400 midnight:text-blue-300" />
        );
    }
  };

  const getColors = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-green-50 dark:bg-green-900/20 midnight:bg-green-950/30",
          border:
            "border-green-200 dark:border-green-800 midnight:border-green-900",
          button:
            "bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 midnight:bg-green-700 midnight:hover:bg-green-800 focus:ring-green-500",
        };
      case "error":
        return {
          bg: "bg-red-50 dark:bg-red-900/20 midnight:bg-red-950/30",
          border: "border-red-200 dark:border-red-800 midnight:border-red-900",
          button:
            "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 midnight:bg-red-700 midnight:hover:bg-red-800 focus:ring-red-500",
        };
      case "warning":
        return {
          bg: "bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-950/30",
          border:
            "border-yellow-200 dark:border-yellow-800 midnight:border-yellow-900",
          button:
            "bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 midnight:bg-yellow-700 midnight:hover:bg-yellow-800 focus:ring-yellow-500",
        };
      default:
        return {
          bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/30",
          border:
            "border-blue-200 dark:border-blue-800 midnight:border-blue-900",
          button:
            "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 midnight:bg-blue-700 midnight:hover:bg-blue-800 focus:ring-blue-500",
        };
    }
  };

  const colors = getColors();

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 midnight:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
      style={{ zIndex: 9999 }}
    >
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        <div className="flex items-start space-x-3 mb-4">
          <div
            className={`p-2 rounded-full ${colors.bg} ${colors.border} border`}
          >
            {getIcon()}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100 mb-2">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 midnight:text-slate-400 text-sm">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 midnight:focus:ring-offset-gray-950 transition-colors ${colors.button}`}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AlertModal;
