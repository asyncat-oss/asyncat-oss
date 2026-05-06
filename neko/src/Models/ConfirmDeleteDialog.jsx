import { Trash2 } from 'lucide-react';

const ConfirmDeleteDialog = ({ model, onConfirm, onCancel }) => {
  if (!model) return null;
  const identifier = model.isExternal ? model.name : model.filename;
  const isExternal = model.isExternal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
              {isExternal ? 'Remove from library?' : 'Delete model?'}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 break-all">
              <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">{identifier}</span>
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {isExternal
                ? 'The file on disk will not be affected.'
                : 'This will permanently delete the file from your disk.'}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-600 text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            {isExternal ? 'Remove' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteDialog;
