// Trash (/trash): deleted chats, kept for 30 days. Each can be restored or
// deleted for good, one at a time or a selection at once.
import { useState, useEffect, useCallback } from "react";
import { trashApi } from "../api";
import eventBus from "../../utils/eventBus.js";
import { useToast, errorDetail } from "../../components/toastContext.js";
import { useConfirm } from "../../components/confirmContext.js";
import Button from "../../components/ui/Button.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import Notice from "../../components/ui/Notice.jsx";
import Skeleton from "../../components/ui/Skeleton.jsx";
import Cat from "../../components/ui/Cat.jsx";
import { Trash2, RotateCcw, CheckSquare, Square, X } from "lucide-react";
import PageHeader from '../../components/ui/PageHeader.jsx';

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const TrashPage = () => {
  const [trashItems, setTrashItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkWorking, setBulkWorking] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const loadTrash = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await trashApi.getTrash();
      setTrashItems(res?.conversations || []);
    } catch (err) {
      console.error("Failed to load trash:", err);
      // Say so, instead of showing an empty Trash.
      setLoadError(errorDetail(err) || "Unknown error");
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
      toast.error("Couldn't restore the chat", { detail: errorDetail(err) });
    }
  };

  const handlePermanentDelete = async (conv) => {
    const ok = await confirm({
      title: "Delete for good?",
      message: `"${conv.title || "Untitled"}" will be deleted for good. You can't undo this.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await trashApi.deletePermanent(conv.id);
      setTrashItems((prev) => prev.filter((c) => c.id !== conv.id));
      setSelectedItems((prev) => {
        const next = { ...prev };
        delete next[conv.id];
        return next;
      });
    } catch (err) {
      console.error("Failed to delete:", err);
      toast.error("Couldn't delete the chat permanently", { detail: errorDetail(err) });
    }
  };

  const handleEmptyTrash = async () => {
    const ok = await confirm({
      title: "Empty Trash?",
      message: `${plural(trashItems.length, "chat")} will be deleted for good. You can't undo this.`,
      confirmLabel: "Empty Trash",
      destructive: true,
    });
    if (!ok) return;
    try {
      await trashApi.emptyTrash();
      setTrashItems([]);
      setSelectedItems({});
    } catch (err) {
      console.error("Failed to empty trash:", err);
      toast.error("Couldn't empty Trash", { detail: errorDetail(err) });
    }
  };

  const selectedList = Object.values(selectedItems);
  const selectedCount = selectedList.length;
  const hasSelection = selectedCount > 0;
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
      toast.error("Couldn't restore some chats", { detail: errorDetail(err) });
      loadTrash();
    } finally {
      setBulkWorking(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedCount === 0 || bulkWorking) return;
    const items = selectedList;
    const ok = await confirm({
      title: `Delete ${plural(items.length, "chat")} for good?`,
      message: "You can't undo this.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBulkWorking(true);
    setSelectedItems({});
    setTrashItems((prev) => prev.filter((conv) => !items.some((item) => item.id === conv.id)));
    try {
      await Promise.all(items.map((item) => trashApi.deletePermanent(item.id)));
    } catch (err) {
      console.error("Failed to delete selected:", err);
      toast.error("Couldn't delete some chats", { detail: errorDetail(err) });
      loadTrash();
    } finally {
      setBulkWorking(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent">
      <PageHeader
        title="Trash"
        description="Deleted chats stay here for 30 days"
        actions={trashItems.length > 0 ? (
          <>
            <Button variant="secondary" icon={allVisibleSelected ? CheckSquare : Square} onClick={selectAllVisible}>
              {allVisibleSelected ? "Deselect all" : "Select"}
            </Button>
            <Button variant="danger" onClick={handleEmptyTrash}>
              Empty Trash
            </Button>
          </>
        ) : null}
      />
      <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col p-4 md:px-8 md:pb-8 md:pt-5">

        {hasSelection && (
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <div className="whitespace-nowrap text-xs font-medium text-fg">{selectedCount} selected</div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="xs" icon={RotateCcw} loading={bulkWorking} onClick={restoreSelected}>
                Restore
              </Button>
              <Button variant="danger" size="xs" icon={Trash2} disabled={bulkWorking} onClick={deleteSelected}>
                Delete
              </Button>
              <IconButton icon={X} label="Clear selection" size="sm" onClick={clearSelection} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-4" aria-label="Loading Trash">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 px-3 py-2.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <Notice tone="error" action={<Button variant="ghost" size="xs" onClick={loadTrash}>Try again</Button>}>
              Couldn&apos;t load Trash: {loadError}
            </Notice>
          ) : trashItems.length === 0 ? (
            <div className="mx-auto mt-10 max-w-sm text-center">
              <Cat pose="sleep" className="mx-auto w-28" outline={4} />
              <p className="mt-4 text-[15px] font-medium text-fg">Trash is empty</p>
              <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
                Chats you delete wait here for 30 days, then go for good.
              </p>
            </div>
          ) : (
            <div className="space-y-px">
              {trashItems.map((conv) => {
                const isSelected = Boolean(selectedItems[conv.id]);
                const title = conv.title || "Untitled";
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-1 rounded-lg pl-1 pr-2 transition-colors ${
                      isSelected ? "bg-selected" : "hover:bg-hover"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleSelection(e, conv)}
                      aria-label={isSelected ? `Deselect ${title}` : `Select ${title}`}
                      aria-pressed={isSelected}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        isSelected || hasSelection
                          ? "text-fg opacity-100"
                          : "text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
                      }`}
                    >
                      {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1 py-2.5 pl-1">
                      <p className="truncate text-sm font-medium text-fg">{title}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        Deleted {conv.deleted_at ? new Date(conv.deleted_at).toLocaleDateString() : "recently"}
                      </p>
                    </div>
                    <div className={`flex items-center gap-0.5 transition-opacity ${hasSelection ? "pointer-events-none opacity-0" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"}`}>
                      <IconButton icon={RotateCcw} label="Restore" size="sm" onClick={() => handleRestore(conv.id)} />
                      <IconButton
                        icon={Trash2}
                        label="Delete for good"
                        size="sm"
                        className="hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => handlePermanentDelete(conv)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrashPage;
