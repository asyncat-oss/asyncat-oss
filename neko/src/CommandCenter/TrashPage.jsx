import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { trashApi } from "./commandCenterApi";
import { Trash2, RotateCcw, MessageSquare, X, AlertTriangle } from "lucide-react";

const TrashPage = () => {
  const navigate = useNavigate();
  const [trashItems, setTrashItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trashApi.getTrash();
      setTrashItems(res?.conversations || []);
    } catch (err) {
      console.error("Failed to load trash:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = async (id) => {
    try {
      await trashApi.restore(id);
      setTrashItems((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to restore:", err);
    }
  };

  const handlePermanentDelete = async (id) => {
    try {
      await trashApi.deletePermanent(id);
      setTrashItems((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
    setConfirmDelete(null);
  };

  const handleEmptyTrash = async () => {
    try {
      await trashApi.emptyTrash();
      setTrashItems([]);
    } catch (err) {
      console.error("Failed to empty trash:", err);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                Trash
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                Deleted conversations are kept for 30 days
              </p>
            </div>
          </div>
          {trashItems.length > 0 && (
            <button
              onClick={() => setConfirmDelete({ type: "empty", count: trashItems.length })}
              className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Empty trash ({trashItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400 dark:text-gray-500">Loading...</div>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-gray-400 dark:text-gray-600" />
              </div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-2">
                Trash is empty
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 max-w-xs">
                Deleted conversations will appear here for 30 days before being permanently removed.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trashItems.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 midnight:bg-gray-800 border border-gray-100 dark:border-gray-700 midnight:border-gray-700 rounded-lg hover:border-gray-200 dark:hover:border-gray-600 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
                      {conv.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                      Deleted {conv.deleted_at ? new Date(conv.deleted_at).toLocaleDateString() : "recently"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRestore(conv.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: "single", conv })}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                {confirmDelete.type === "empty" ? "Empty trash?" : "Delete permanently?"}
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-6">
              {confirmDelete.type === "empty"
                ? `This will permanently delete ${confirmDelete.count} conversation${confirmDelete.count > 1 ? "s" : ""}. This action cannot be undone.`
                : `"${confirmDelete.conv?.title || "Untitled"}" will be permanently deleted. This action cannot be undone.`}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirmDelete.type === "empty"
                    ? handleEmptyTrash()
                    : handlePermanentDelete(confirmDelete.conv.id)
                }
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrashPage;