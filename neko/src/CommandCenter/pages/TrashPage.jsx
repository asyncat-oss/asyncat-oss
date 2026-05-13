import { useState, useEffect, useCallback } from "react";
import { trashApi } from "../api";
import eventBus from "../../utils/eventBus.js";
import { Trash2, RotateCcw, MessageSquare, AlertTriangle } from "lucide-react";

const TrashPage = () => {
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
      eventBus.emit("conversationsUpdated");
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
    <div className="h-full flex flex-col bg-transparent">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-none text-gray-950 dark:text-gray-100 midnight:text-slate-100">
              Trash
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              Deleted conversations are kept for 30 days
            </p>
          </div>
          {trashItems.length > 0 && (
            <button
              onClick={() => setConfirmDelete({ type: "empty", count: trashItems.length })}
              className="h-8 rounded-lg px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 midnight:hover:bg-red-950/30"
            >
              Empty trash ({trashItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {loading ? (
            <div className="flex items-center py-12">
              <div className="text-sm text-gray-400 dark:text-gray-500">Loading...</div>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-500 midnight:border-slate-800 midnight:text-slate-500">
                <Trash2 className="w-4 h-4" />
              </div>
              <h2 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">
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
                  className="group flex items-center gap-3 border-b border-gray-100 px-3 py-3 transition-colors hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-gray-800/35 midnight:border-slate-800 midnight:hover:bg-slate-900/45"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 midnight:border-slate-800 midnight:bg-slate-950 midnight:text-slate-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
                      {conv.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                      Deleted {conv.deleted_at ? new Date(conv.deleted_at).toLocaleDateString() : "recently"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleRestore(conv.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-gray-800 dark:hover:text-emerald-400"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: "single", conv })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
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
                className="h-8 rounded-lg px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirmDelete.type === "empty"
                    ? handleEmptyTrash()
                    : handlePermanentDelete(confirmDelete.conv.id)
                }
                className="h-8 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700"
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
