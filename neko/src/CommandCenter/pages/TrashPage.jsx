import { useState, useEffect, useCallback } from "react";
import { trashApi } from "../api";
import eventBus from "../../utils/eventBus.js";
import { Trash2, RotateCcw, AlertTriangle, CheckSquare, Square, X } from "lucide-react";

const TrashPage = () => {
  const [trashItems, setTrashItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkWorking, setBulkWorking] = useState(false);

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
      setSelectedItems((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      eventBus.emit("conversationsUpdated");
    } catch (err) {
      console.error("Failed to restore:", err);
    }
  };

  const handlePermanentDelete = async (id) => {
    try {
      await trashApi.deletePermanent(id);
      setTrashItems((prev) => prev.filter((c) => c.id !== id));
      setSelectedItems((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error("Failed to delete:", err);
    }
    setConfirmDelete(null);
  };

  const handleEmptyTrash = async () => {
    try {
      await trashApi.emptyTrash();
      setTrashItems([]);
      setSelectedItems({});
    } catch (err) {
      console.error("Failed to empty trash:", err);
    }
    setConfirmDelete(null);
  };

  const selectedList = Object.values(selectedItems);
  const selectedCount = selectedList.length;
  const allVisibleSelected = trashItems.length > 0 && trashItems.every((item) => selectedItems[item.id]);

  const toggleSelection = (e, conv) => {
    e.stopPropagation();
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[conv.id]) delete next[conv.id];
      else next[conv.id] = { id: conv.id, title: conv.title || "Untitled" };
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        trashItems.forEach((item) => delete next[item.id]);
      } else {
        trashItems.forEach((item) => {
          next[item.id] = { id: item.id, title: item.title || "Untitled" };
        });
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedItems({});

  const restoreSelected = async () => {
    if (selectedCount === 0 || bulkWorking) return;
    const items = selectedList;
    setBulkWorking(true);
    setSelectedItems({});
    setTrashItems((prev) => prev.filter((conv) => !items.some((item) => item.id === conv.id)));
    try {
      await Promise.all(items.map((item) => trashApi.restore(item.id)));
      eventBus.emit("conversationsUpdated");
    } catch (err) {
      console.error("Failed to restore selected:", err);
      loadTrash();
    } finally {
      setBulkWorking(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedCount === 0 || bulkWorking) return;
    const items = selectedList;
    setBulkWorking(true);
    setSelectedItems({});
    setTrashItems((prev) => prev.filter((conv) => !items.some((item) => item.id === conv.id)));
    try {
      await Promise.all(items.map((item) => trashApi.deletePermanent(item.id)));
    } catch (err) {
      console.error("Failed to delete selected:", err);
      loadTrash();
    } finally {
      setBulkWorking(false);
      setConfirmDelete(null);
    }
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
          <div className="flex items-center gap-2">
            {trashItems.length > 0 && (
              <button
                onClick={selectAllVisible}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:border-slate-800 midnight:text-slate-300 midnight:hover:bg-slate-900"
              >
                {allVisibleSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                {allVisibleSelected ? "Deselect all" : "Select"}
              </button>
            )}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {selectedCount > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
                {selectedCount} selected
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={restoreSelected}
                  disabled={bulkWorking}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                >
                  <RotateCcw className="w-4 h-4" />
                  {bulkWorking ? "Working" : "Restore"}
                </button>
                <button
                  onClick={() => setConfirmDelete({ type: "selected", count: selectedCount })}
                  disabled={bulkWorking}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={clearSelection}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
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
              {trashItems.map((conv) => {
                const isSelected = Boolean(selectedItems[conv.id]);
                const hasSelection = selectedCount > 0;
                return (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "bg-gray-100/80 dark:bg-gray-800/50 midnight:bg-slate-900/60"
                      : "hover:bg-gray-100/70 dark:hover:bg-gray-800/35 midnight:hover:bg-slate-900/45"
                  }`}
                >
                  <button
                    onClick={(e) => toggleSelection(e, conv)}
                    title={isSelected ? "Deselect" : "Select"}
                    className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                      isSelected || hasSelection
                        ? "opacity-100 text-gray-700 dark:text-gray-200"
                        : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
                      {conv.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                      Deleted {conv.deleted_at ? new Date(conv.deleted_at).toLocaleDateString() : "recently"}
                    </p>
                  </div>
                  <div className={`flex items-center gap-0.5 transition-opacity ${hasSelection ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"}`}>
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
                );
              })}
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
                : confirmDelete.type === "selected"
                ? `This will permanently delete ${confirmDelete.count} selected conversation${confirmDelete.count > 1 ? "s" : ""}. This action cannot be undone.`
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
                    : confirmDelete.type === "selected"
                    ? deleteSelected()
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
