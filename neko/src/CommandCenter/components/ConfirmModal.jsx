import { AlertTriangle, X, Loader2, Check } from 'lucide-react';
import Portal from '../../components/Portal';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', isDestructive = false, isProcessing = false }) => {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
        <div
          className="bg-white dark:bg-gray-900 midnight:bg-slate-950 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex flex-col animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className={`px-6 py-5 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex items-center justify-between ${isDestructive ? 'bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-950/20' : 'bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-900/30'}`}>
            <div className={`flex items-center gap-3 ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>
              <div className={`p-2 rounded-full ${isDestructive ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                {isDestructive ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Check className="w-5 h-5" />
                )}
              </div>
              <h2 className="text-xl font-semibold">{title}</h2>
            </div>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent hover:bg-gray-100/50 dark:hover:bg-gray-800 rounded-full p-2 transition-colors"
                disabled={isProcessing}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-6 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
            <p className="text-base whitespace-pre-line">{message}</p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex justify-end gap-3 rounded-b-2xl">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 transition-colors font-medium cursor-pointer disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isProcessing}
              className={`px-5 py-2 rounded-xl transition-colors font-medium flex items-center gap-2 cursor-pointer disabled:opacity-70 ${
                isDestructive
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 midnight:bg-indigo-600 midnight:hover:bg-indigo-500 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{confirmLabel}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ConfirmModal;
