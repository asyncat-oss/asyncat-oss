// sidebar/CreateWorkSpaceModal.jsx
// In solo-mode the workspace is auto-created on first boot.
// This modal is shown if somehow no workspace exists yet.
import { X } from 'lucide-react';

const CreateWorkspaceModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-3">
          <div className="text-4xl">🐱</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Workspace is being set up
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
            Your workspace is created automatically on first boot. If you see this message, try refreshing the page. If the problem persists, check that the backend started correctly and the database was seeded.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 w-full py-2 px-4 rounded-lg bg-gray-900 dark:bg-white midnight:bg-indigo-600 text-white dark:text-gray-900 midnight:text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspaceModal;
