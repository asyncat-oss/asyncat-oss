import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Trash2, Loader2, X } from 'lucide-react';
import Portal from '../../../components/Portal';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, title, isDeleting: _isDeleting }) => {
  const isProcessing = _isDeleting;

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 dark:bg-black/60"
        onMouseDown={(event) => event.target === event.currentTarget && !isProcessing && onClose()}
      >
        <div
          className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-950"
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-conversation-title"
        >
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 id="delete-conversation-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete conversation?</h2>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="-mr-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                disabled={isProcessing}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="px-5 pb-5 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
            <p className="text-sm leading-6">
              <span className="font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">“{title || 'This conversation'}”</span> will move to Recently Deleted.
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              You can recover it later from the sidebar.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5 dark:border-gray-800 midnight:border-slate-800">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

DeleteConfirmationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  isDeleting: PropTypes.bool,
};

export default DeleteConfirmationModal;
