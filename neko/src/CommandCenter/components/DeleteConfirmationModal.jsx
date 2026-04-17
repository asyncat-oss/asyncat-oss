import React, { useState } from 'react';
import { AlertTriangle, X, Trash2, Loader2 } from 'lucide-react';
import Portal from '../../components/Portal';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, title, isDeleting }) => {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 p-4 animate-in fade-in duration-200">
        <div 
          className="bg-white dark:bg-gray-900 midnight:bg-slate-950 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex flex-col animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex items-center justify-between bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-950/20">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold">Delete Conversation</h2>
            </div>
            {!isDeleting && (
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent hover:bg-red-100/50 dark:hover:bg-gray-800 rounded-full p-2 transition-colors"
                disabled={isDeleting}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-6 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
            <p className="text-base mb-2">
              Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-white midnight:text-slate-100">"{title || 'this conversation'}"</span>?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              You will still be able to find it in the <span className="font-medium text-gray-600 dark:text-gray-300">Recently Deleted</span> folder from the sidebar. 
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex justify-end gap-3 rounded-b-2xl">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 text-gray-700 dark:text-gray-300 midnight:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 transition-colors font-medium cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-medium flex items-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Chat</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default DeleteConfirmationModal;
