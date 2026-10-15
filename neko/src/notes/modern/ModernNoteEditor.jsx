// ModernNoteEditor.jsx - Enhanced with real-time content synchronization
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Trash2,
  CheckCircle,
  AlertCircle,
  WifiOff,
  Keyboard,
  Loader2,
  FileDown,
  Download,
  CircleCheck,
  CircleX,
} from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import Skeleton from "../../components/ui/Skeleton.jsx";
import { Menu, MenuItem } from "../../components/ui/Menu.jsx";
import { useConfirm } from "../../components/confirmContext";
import { useNoteContext } from "../context/NoteContext";
import { attachmentsApi, notesApi } from "../noteApi";
import ModernBlockEditor from "./ModernBlockEditor";
import NoteBanner from "./components/NoteBanner";
import KeyboardShortcutsDropdown from "./components/KeyboardShortcutsDropdown";
import { htmlToBlocks } from "../utils/blockConverter";
import { useAutoSave, hasContentChanged } from "../utils/autoSaveUtils";

// What a note with an empty title is called.
const UNTITLED = "Untitled note";

// The saved metadata of a note as an object (the API may send it as JSON text).
const parseMetadata = (metadata) => {
  if (!metadata) return {};
  if (typeof metadata !== "string") return metadata;
  try {
    return JSON.parse(metadata) || {};
  } catch {
    return {};
  }
};

// Always shown inside a chat's side panel; onBack closes it (after a delete).
const ModernNoteEditor = ({ note, onBack }) => {
  const {
    applyDeltaChanges,
    deleteNote,
    markNoteHasUnsavedChanges,
    fetchNoteWithContent,
    getQueueSize,
    isOnline,
  } = useNoteContext();

  // Core state
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [lastSaveError, setLastSaveError] = useState(null);

  // Delta tracking state
  const [lastSyncVersion, setLastSyncVersion] = useState(null);
  const [isApplyingRemoteChanges, setIsApplyingRemoteChanges] = useState(false);

  // The note's saved metadata (its banner, mainly), as loaded from den.
  const [noteMetadata, setNoteMetadata] = useState({});

  // UI state
  const [showShortcutsInfo, setShowShortcutsInfo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("idle"); // idle, downloading, downloaded, failed
  const [isVisibilitySaving, setIsVisibilitySaving] = useState(false);
  const confirm = useConfirm();

  // References
  const editorRef = useRef(null);
  const initialStateRef = useRef({ title: "", blocks: [] });
  const isInitializedRef = useRef(false);
  const deltaQueueRef = useRef([]);
  const shortcutsTriggerRef = useRef(null);
  const downloadTriggerRef = useRef(null);
  const getEditorIsTypingRef = useRef(() => false);

  // Update the typing getter function when editor ref is ready
  useEffect(() => {
    if (editorRef.current && editorRef.current.getIsTyping) {
      getEditorIsTypingRef.current = () => editorRef.current.getIsTyping();
    }
  }, [editorRef.current]);

  // Enhanced auto-save with delta support and broadcasting - less aggressive
  const { scheduleAutoSave, saveNow, cancelAutoSave } = useAutoSave(
    (content) => {
      return (async () => {
        try {
          setLastSaveError(null);

          if (content.changeset && !isApplyingRemoteChanges) {
            // Save to database
            const result = await applyDeltaChanges(note.id, content.changeset, {
              title: content.title,
              blocks: content.blocks,
            });

            if (result.success) {
              if (editorRef.current?.resetDeltaBaseline) {
                editorRef.current.resetDeltaBaseline();
              }

              setLastSyncVersion(result.newVersion);

              if (!result.conflicts) {
                initialStateRef.current = {
                  title: content.title || UNTITLED,
                  blocks: [...content.blocks],
                };
              }
            } else if (result.queued) {
              // Operation was queued due to connection issues
            }

            return result;
          } else {
            // Only create fallback batch operations if we have no pending deltas
            // Check if editor has pending operations first
            let hasIncrementalChanges = false;
            if (editorRef.current?.getDeltaStats) {
              const stats = editorRef.current.getDeltaStats();
              hasIncrementalChanges = stats && stats.pendingOperations > 0;
            }

            if (hasIncrementalChanges) {
              // Get the actual delta changeset from the editor
              if (editorRef.current?.generateChangeset) {
                const changeset = editorRef.current.generateChangeset();
                if (changeset && changeset.operations.length > 0) {
                  // Use the incremental changeset instead of batch operation
                  const result = await applyDeltaChanges(note.id, changeset, {
                    title: content.title,
                    blocks: content.blocks,
                  });

                  if (result.success && editorRef.current?.resetDeltaBaseline) {
                    editorRef.current.resetDeltaBaseline();
                  }

                  return result;
                }
              }
            }

            // Fallback to batch operation only if no incremental changes
            const changeset = {
              operations: [
                {
                  type: "batch",
                  data: { blocks: content.blocks },
                },
                {
                  type: "update_title",
                  data: { to: content.title.trim() || UNTITLED },
                },
              ],
              baselineVersion: lastSyncVersion,
            };

            const result = await applyDeltaChanges(note.id, changeset, {
              title: content.title,
              blocks: content.blocks,
            });

            if (result && result.success) {
              initialStateRef.current = {
                title: content.title.trim() || UNTITLED,
                blocks: [...content.blocks],
              };
            }

            return result;
          }
        } catch (error) {
          console.error("Save error:", error);
          setLastSaveError(error.message);

          if (content.changeset) {
            deltaQueueRef.current.push(content.changeset);
          }

          throw error;
        }
      })();
    },
    {
      delay: 2000, // Reasonable delay for smooth typing
      enabled: isOnline && isContentLoaded && !isApplyingRemoteChanges,
      onStatusChange: setSaveStatus,
      getIsTyping: () => getEditorIsTypingRef.current(),
    }
  );

  // Handle delta changes from editor with broadcasting - with typing detection
  const handleDeltaChange = useCallback(
    (changeset, isTyping = false) => {
      if (
        !changeset ||
        changeset.operations.length === 0 ||
        isApplyingRemoteChanges
      )
        return;

      const currentTitle = titleRef.current;
      const currentBlocks = blocksRef.current;

      // Only schedule auto-save with changeset if we have valid operations
      if (changeset.operations.length > 0) {
        scheduleAutoSaveRef.current?.(
          {
            title: currentTitle,
            blocks: currentBlocks,
            changeset: changeset,
          },
          isTyping
        );
      }
    },
    [isApplyingRemoteChanges]
  );

  // References for stable access to current values
  const titleRef = useRef("");
  const blocksRef = useRef([]);
  const scheduleAutoSaveRef = useRef(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  useEffect(() => {
    scheduleAutoSaveRef.current = scheduleAutoSave;
  }, [scheduleAutoSave]);

  // Check if content has changed
  const hasChanges = useCallback(() => {
    if (!isInitializedRef.current) return false;

    if (editorRef.current?.getDeltaStats) {
      const stats = editorRef.current.getDeltaStats();
      return stats && stats.pendingOperations > 0;
    }

    const currentContent = { title, blocks };
    const initialContent = initialStateRef.current;
    return hasContentChanged(initialContent, currentContent);
  }, [title, blocks]);

  // Update unsaved changes status
  useEffect(() => {
    if (isInitializedRef.current && note?.id) {
      const changesExist = hasChanges();
      markNoteHasUnsavedChanges(note.id, changesExist);
    }
  }, [note?.id, hasChanges, markNoteHasUnsavedChanges]);

  // Initialize editor content - always fetch fresh data when note changes
  useEffect(() => {
    // Initialize when we have a note and haven't loaded content yet
    if (note && !isContentLoaded && !isInitializedRef.current) {
      // Mark as initializing to prevent duplicate fetch attempts
      // Note: We set this flag again in initializeContent to handle the race condition
      // where the reset effect might run between this line and initializeContent completing
      isInitializedRef.current = true;

      const initializeContent = (noteData) => {
        const noteTitle = noteData.title || UNTITLED;
        let initialBlocks = [];

        if (noteData.content) {
          try {
            if (noteData.metadata) {
              const metadata =
                typeof noteData.metadata === "string"
                  ? JSON.parse(noteData.metadata)
                  : noteData.metadata;

              if (metadata.blocks && metadata.version === 2) {
                initialBlocks = metadata.blocks;
              } else {
                initialBlocks = htmlToBlocks(noteData.content);
              }
            } else {
              initialBlocks = htmlToBlocks(noteData.content);
            }
          } catch (error) {
            console.error("Error parsing note content:", error);
            initialBlocks = htmlToBlocks(noteData.content || "");
          }
        }

        if (initialBlocks.length === 0) {
          initialBlocks = [
            {
              id: `block-${Date.now()}`,
              type: "text",
              content: "",
              properties: {},
            },
          ];
        }

        setTitle(noteTitle);
        setBlocks(initialBlocks);
        setNoteMetadata(parseMetadata(noteData.metadata));

        initialStateRef.current = {
          title: noteTitle,
          blocks: [...initialBlocks],
        };

        // IMPORTANT: Set both flags together to ensure the loading screen condition
        // (!note || !isContentLoaded || !isInitializedRef.current) becomes false
        // This must be set here (not just at effect start) because the reset effect
        // might run after this effect starts but before initializeContent completes
        isInitializedRef.current = true;
        setIsContentLoaded(true);

        setTimeout(() => {
          if (editorRef.current?.resetDeltaBaseline) {
            editorRef.current.resetDeltaBaseline();
          }
        }, 100);
      };

      // ALWAYS fetch fresh data from server with forceFresh=true to get the most recent autosaved content
      // This bypasses all caching layers and ensures we never load stale data when opening a note
      fetchNoteWithContent(note.id, true)
        .then((fullNote) => {
          // Handle case where fullNote is null (API error handled internally)
          // or note.id mismatch (user navigated to different note during fetch)
          if (fullNote && note.id === fullNote.id) {
            initializeContent(fullNote);
          } else if (!fullNote && note.id) {
            // Fallback: initialize with basic note data if fetch returned null
            console.warn("fetchNoteWithContent returned null, using fallback initialization");
            initializeContent({ 
              id: note.id,
              title: note.title || UNTITLED, 
              content: note.content || "" 
            });
          }
        })
        .catch((error) => {
          console.error("Error fetching note content:", error);
          if (note.id) {
            initializeContent({ 
              id: note.id,
              title: note.title || UNTITLED, 
              content: "" 
            });
          }
        });
    }
  }, [note?.id, isContentLoaded, fetchNoteWithContent]);

  // Reset state when switching between different notes
  const previousNoteIdRef = useRef(null);

  useEffect(() => {
    const currentNoteId = note?.id;
    const previousNoteId = previousNoteIdRef.current;

    // Only reset when switching FROM an existing note TO a different note
    // Don't reset when first selecting a note (previousNoteId is null/undefined)
    // This prevents a race condition where the reset effect could undo the
    // initialization effect's work on first note selection
    if (currentNoteId && previousNoteId && currentNoteId !== previousNoteId) {
      setSaveStatus(null);
      setIsContentLoaded(false);
      isInitializedRef.current = false;
      setLastSaveError(null);
      setTitle("");
      setBlocks([]);
      setNoteMetadata({});
      setIsApplyingRemoteChanges(false);
    }

    previousNoteIdRef.current = currentNoteId;
  }, [note?.id]);

  // Handle visibility change - save when hidden, fetch and load when visible
  useEffect(() => {
    if (!note?.id || !isContentLoaded) return;

    const handleVisibilityChange = async () => {
      // Save when becoming hidden
      if (document.hidden) {
        try {
          const currentState = {
            title: titleRef.current,
            blocks: blocksRef.current,
          };

          // Save current content silently without overlay
          await saveNow(currentState);

          // Create version if there are changes
          if (editorRef.current?.createVersionIfHasChanges) {
            try {
              await editorRef.current.createVersionIfHasChanges();
            } catch (error) {
              // Suppress error - non-critical
            }
          }
        } catch (error) {
          console.error("Auto-save on visibility loss failed:", error);
        }
      }
      // Fetch and load fresh data when becoming visible
      else if (document.visibilityState === "visible") {
        try {
          // Show loading overlay while fetching
          setIsVisibilitySaving(true);

          // Fetch the latest content from server
          const freshNote = await fetchNoteWithContent(note.id, true);

          if (!freshNote || freshNote.id !== note.id) {
            setIsVisibilitySaving(false);
            return;
          }

          // Parse the fresh content
          let freshBlocks = [];
          if (freshNote.content) {
            try {
              if (freshNote.metadata) {
                const metadata =
                  typeof freshNote.metadata === "string"
                    ? JSON.parse(freshNote.metadata)
                    : freshNote.metadata;

                if (metadata.blocks && metadata.version === 2) {
                  freshBlocks = metadata.blocks;
                } else {
                  freshBlocks = htmlToBlocks(freshNote.content);
                }
              } else {
                freshBlocks = htmlToBlocks(freshNote.content);
              }
            } catch (error) {
              console.error("Error parsing refreshed note content:", error);
              freshBlocks = htmlToBlocks(freshNote.content || "");
            }
          }

          // Update the editor with fresh content
          const freshTitle = freshNote.title || UNTITLED;
          setTitle(freshTitle);
          setBlocks(freshBlocks);
          setNoteMetadata(parseMetadata(freshNote.metadata));

          // Update the editor component directly
          if (editorRef.current?.setContent) {
            editorRef.current.setContent(freshBlocks);
          }

          // Reset the baseline to avoid false change detection
          initialStateRef.current = {
            title: freshTitle,
            blocks: [...freshBlocks],
          };

          if (editorRef.current?.resetDeltaBaseline) {
            editorRef.current.resetDeltaBaseline();
          }

          // Hide loading overlay
          setIsVisibilitySaving(false);
        } catch (error) {
          console.error("Auto-load on visibility gain failed:", error);
          setIsVisibilitySaving(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [note?.id, isContentLoaded, fetchNoteWithContent, saveNow]);

  // Handle title changes
  const handleTitleChange = useCallback(
    (newTitle) => {
      if (!isInitializedRef.current || isApplyingRemoteChanges) return;
      setTitle(newTitle);
    },
    [isApplyingRemoteChanges]
  );

  // Handle content changes
  const handleContentChange = useCallback(
    (newBlocks) => {
      if (!isInitializedRef.current || isApplyingRemoteChanges) return;
      setBlocks(newBlocks);
    },
    [isApplyingRemoteChanges]
  );

  // Process queued delta operations when coming back online
  useEffect(() => {
    if (isOnline && deltaQueueRef.current.length > 0) {
      const processQueue = async () => {
        while (deltaQueueRef.current.length > 0) {
          const changeset = deltaQueueRef.current.shift();
          try {
            await applyDeltaChanges(note.id, changeset);
          } catch (error) {
            console.error("Failed to apply queued changeset:", error);
            deltaQueueRef.current.unshift(changeset);
            break;
          }
        }
      };

      processQueue();
    }
  }, [isOnline, note?.id, applyDeltaChanges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "s":
            e.preventDefault();
            if (hasChanges()) {
              if (
                editorRef.current?.getDeltaStats &&
                editorRef.current?.generateChangeset
              ) {
                const stats = editorRef.current.getDeltaStats();
                if (stats && stats.pendingOperations > 0) {
                  const changeset = editorRef.current.generateChangeset();
                  saveNow({
                    title: titleRef.current,
                    blocks: blocksRef.current,
                    changeset,
                  });
                } else {
                  // Use fallback save method if no pending operations
                  const changeset = {
                    operations: [],
                    baselineVersion: lastSyncVersion,
                  };
                  saveNow({
                    title: titleRef.current,
                    blocks: blocksRef.current,
                    changeset,
                  });
                }
              } else {
                console.warn("No delta operations available for manual save");
              }
            }
            break;
        }
      }

    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []); // Empty dependencies - handlers use refs and closures

  // Delete note, once the user confirms.
  const handleDeleteClick = useCallback(async () => {
    const confirmed = await confirm({
      title: "Delete this note?",
      message: `"${title || UNTITLED}" and its attachments will be gone for good.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    deleteNote(note.id);
    onBack();
  }, [confirm, title, note, deleteNote, onBack]);

  // Helper function to ensure media URLs are fresh before exporting
  const refreshMediaUrls = useCallback(
    async (blocks) => {
      if (!note?.id) {
        return { updatedBlocks: blocks, hasChanges: false };
      }

      const updatedBlocks = [...blocks];
      let hasChanges = false;

      const normalizeWithoutCacheBuster = (rawUrl) => {
        if (!rawUrl) return "";

        try {
          const [base, remainder] = rawUrl.split("?");
          if (!remainder) return rawUrl;

          const [query, hash] = remainder.split("#");
          const params = new URLSearchParams(query);
          params.delete("t");
          const normalizedQuery = params.toString();

          return `${base}${normalizedQuery ? `?${normalizedQuery}` : ""}${
            hash ? `#${hash}` : ""
          }`;
        } catch (error) {
          return rawUrl;
        }
      };

      const appendCacheBuster = (url) => {
        const timestamp = Date.now();
        const separator = url.includes("?") ? "&" : "?";
        return `${url}${separator}t=${timestamp}`;
      };

      for (let i = 0; i < updatedBlocks.length; i++) {
        const block = updatedBlocks[i];
        const filename = block?.properties?.filename;
        if (!filename) continue;

        const isImage = block.type === "image";
        const isVideo = block.type === "video";
        const isAudio = block.type === "audio";

        if (!isImage && !isVideo && !isAudio) continue;

        try {
          const freshBaseUrl = attachmentsApi.getAttachmentUrl(note.id, filename);
          const shouldCacheBust = isVideo || isAudio;
          const nextUrl = shouldCacheBust
            ? appendCacheBuster(freshBaseUrl)
            : freshBaseUrl;

          const currentComparable = shouldCacheBust
            ? normalizeWithoutCacheBuster(block.properties?.url)
            : block.properties?.url;
          const nextComparable = shouldCacheBust
            ? normalizeWithoutCacheBuster(nextUrl)
            : nextUrl;

          if (!currentComparable || currentComparable !== nextComparable) {
            updatedBlocks[i] = {
              ...block,
              properties: {
                ...block.properties,
                url: nextUrl,
              },
            };
            hasChanges = true;
          }
        } catch (error) {
          console.warn(
            `[Export] Failed to refresh URL for ${block.type}: ${filename}`,
            error
          );
        }
      }

      return { updatedBlocks, hasChanges };
    },
    [note?.id]
  );

  // Handle export with status updates
  const handleExport = useCallback(
    async (format) => {
      if (isExporting) return;

      setIsExporting(true);
      setDownloadStatus("downloading");
      setShowDownloadMenu(false);

      try {
        // First, refresh all image URLs to ensure they have valid tokens
        const currentBlocks = blocksRef.current;
        const { updatedBlocks, hasChanges } = await refreshMediaUrls(
          currentBlocks
        );

        // If URLs were refreshed, update the blocks state and save
        if (hasChanges) {
          setBlocks(updatedBlocks);
          blocksRef.current = updatedBlocks;

          // Save with updated image URLs
          await saveNow({
            title: titleRef.current,
            blocks: updatedBlocks,
          });

          // Brief delay to ensure the save is committed to database
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          // No image URL changes, just save current state
          await saveNow({
            title: titleRef.current,
            blocks: currentBlocks,
          });
        }

        // Export the note
        let blob;
        if (format === "docx") {
          blob = await notesApi.exportAsDocx(note.id);
        } else if (format === "pdf") {
          blob = await notesApi.exportAsPdf(note.id);
        } else {
          throw new Error(`Unknown format: ${format}`);
        }

        // Download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || UNTITLED}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setDownloadStatus("downloaded");

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setDownloadStatus("idle");
        }, 3000);
      } catch (error) {
        console.error(`[Export] ${format.toUpperCase()} export error:`, error);
        setDownloadStatus("failed");

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setDownloadStatus("idle");
        }, 3000);
      } finally {
        setIsExporting(false);
      }
    },
    [
      note,
      title,
      saveNow,
      isExporting,
      refreshMediaUrls,
    ]
  );

  // Setup auto-save cleanup
  useEffect(() => {
    // Cleanup any pending auto-saves when component unmounts
    return () => {
      if (hasChanges()) {
        // Last attempt to save on unmount
        const saveData = {
          title: titleRef.current,
          blocks: blocksRef.current,
        };

        // Use fetch with keepalive for reliable background saving.
        if (note?.id) {
          try {
            fetch(
                `${import.meta.env.VITE_NOTES_URL}/api/notes/${note.id}/delta`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    changeset: {
                      operations: [
                        {
                          type: "batch",
                          data: { blocks: saveData.blocks },
                        },
                        {
                          type: "update_title",
                          data: { to: saveData.title || UNTITLED },
                        },
                      ],
                      baselineVersion: null,
                    },
                    timestamp: Date.now(),
                    context: {
                      userAgent: navigator.userAgent,
                      source: "cleanup-save",
                    },
                  }),
                  keepalive: true, // This ensures the request completes even if page unloads
                }
              ).catch((error) => {
                console.warn("Cleanup save failed:", error);
              });
          } catch (error) {
            console.warn("Cleanup save failed:", error);
          }
        }
      }
    };
  }, [note?.id, hasChanges]);

  // Handle browser refresh/close with auto-save
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (hasChanges()) {
        // Attempt to save synchronously (limited time)
        try {
          // Use navigator.sendBeacon for reliable saving during page unload
          const saveData = {
            title: titleRef.current,
            blocks: blocksRef.current,
          };

          // Try to save immediately without waiting using fetch with keepalive
          fetch(
              `${import.meta.env.VITE_NOTES_URL}/api/notes/${note.id}/delta`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  changeset: {
                    operations: [
                      {
                        type: "batch",
                        data: { blocks: saveData.blocks },
                      },
                      {
                        type: "update_title",
                        data: { to: saveData.title || UNTITLED },
                      },
                    ],
                    baselineVersion: null,
                  },
                  timestamp: Date.now(),
                  context: {
                    userAgent: navigator.userAgent,
                    source: "beforeunload-save",
                  },
                }),
                keepalive: true, // This ensures the request completes even if page unloads
              }
            ).catch((error) => {
              console.warn("Beforeunload save failed:", error);
            });

          // Don't prevent navigation - just save in background
        } catch (error) {
          console.warn("Background save failed:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges, note?.id]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAutoSave();
    };
  }, [cancelAutoSave]);

  // Status indicator logic
  const getStatusIndicator = useCallback(() => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-3.5 w-3.5" />,
        text: "Offline",
        className: "text-amber-700 dark:text-amber-400",
      };
    }

    if (saveStatus === "saving" || saveStatus === "auto-saving") {
      return {
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        text: "Saving…",
        className: "text-fg-subtle",
      };
    }

    if (saveStatus === "error" || lastSaveError) {
      const queueSize = getQueueSize();
      return {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        text: queueSize > 0 ? "Queued for sync" : "Save failed",
        className:
          queueSize > 0
            ? "text-amber-700 dark:text-amber-400"
            : "text-red-600 dark:text-red-400",
      };
    }

    if (saveStatus === "saved" || saveStatus === "auto-saved") {
      return {
        icon: <CheckCircle className="h-3.5 w-3.5" />,
        text: "Saved",
        className: "text-fg-subtle",
      };
    }

    return {
      icon: <CheckCircle className="h-3.5 w-3.5" />,
      text: "Up to date",
      className: "text-fg-subtle",
    };
  }, [isOnline, saveStatus, lastSaveError, getQueueSize]);

  // Auto-clear saved status after delay - prevent flashing
  useEffect(() => {
    if (saveStatus === "auto-saved") {
      const t = setTimeout(() => {
        setSaveStatus(null);
      }, 1200); // Shorter delay for auto-saved
      return () => clearTimeout(t);
    } else if (saveStatus === "saved") {
      const t = setTimeout(() => {
        setSaveStatus(null);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [saveStatus]);

  // Loading skeleton
  if (!note || !isContentLoaded || !isInitializedRef.current) {
    return (
      <div className="flex h-full flex-col bg-canvas" aria-busy="true">
        <div className="flex items-center justify-end gap-2 border-b border-line px-3 py-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
        <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-10 sm:px-8">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-8 h-7 w-1/2" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
    );
  }

  const statusIndicator = getStatusIndicator();

  return (
    <div className="flex h-full flex-col bg-canvas text-fg">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-end gap-1 border-b border-line bg-canvas px-3 py-2"
        style={{ userSelect: "none" }}
      >
        {statusIndicator && (
          <div
            className={`mr-1 flex items-center gap-1.5 text-[12px] ${statusIndicator.className}`}
            title={statusIndicator.text}
          >
            {statusIndicator.icon}
            <span className="hidden sm:inline">{statusIndicator.text}</span>
          </div>
        )}

        {/* Download, with a menu of formats */}
        {downloadStatus === "idle" ? (
          <Button
            ref={downloadTriggerRef}
            variant="ghost"
            icon={Download}
            onClick={() => setShowDownloadMenu((open) => !open)}
            disabled={isExporting}
            aria-haspopup="menu"
            aria-expanded={showDownloadMenu}
            title="Download note"
          >
            <span className="hidden sm:inline">Download</span>
          </Button>
        ) : (
          <div
            role="status"
            className={`flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium ${
              downloadStatus === "downloaded"
                ? "text-emerald-700 dark:text-emerald-400"
                : downloadStatus === "failed"
                ? "text-red-600 dark:text-red-400"
                : "text-fg-muted"
            }`}
          >
            {downloadStatus === "downloading" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {downloadStatus === "downloaded" && (
              <CircleCheck className="h-3.5 w-3.5" />
            )}
            {downloadStatus === "failed" && <CircleX className="h-3.5 w-3.5" />}
            <span>
              {downloadStatus === "downloading"
                ? "Downloading…"
                : downloadStatus === "downloaded"
                ? "Downloaded"
                : "Download failed"}
            </span>
          </div>
        )}
        <Menu
          anchorRef={downloadTriggerRef}
          open={showDownloadMenu && downloadStatus === "idle"}
          onClose={() => setShowDownloadMenu(false)}
          placement="bottom-end"
          width={200}
          label="Download"
        >
          <MenuItem
            icon={FileDown}
            label="Export as PDF"
            onSelect={() => handleExport("pdf")}
          />
        </Menu>

        <Button
          variant="danger"
          icon={Trash2}
          onClick={handleDeleteClick}
          aria-label="Delete note"
          title="Delete note"
        >
          <span className="hidden sm:inline">Delete</span>
        </Button>

        <IconButton
          ref={shortcutsTriggerRef}
          icon={Keyboard}
          label="Keyboard shortcuts"
          side="bottom"
          aria-expanded={showShortcutsInfo}
          className={showShortcutsInfo ? "bg-selected text-fg" : ""}
          onClick={() => setShowShortcutsInfo((open) => !open)}
        />
        <KeyboardShortcutsDropdown
          isVisible={showShortcutsInfo}
          onClose={() => setShowShortcutsInfo(false)}
          triggerRef={shortcutsTriggerRef}
        />
      </div>

      {/* Content. Positioned, so the editor's notifications and the loading
          veil sit over the visible note rather than the whole window. */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto editor-fullscreen">
          <NoteBanner
            note={{ ...note, metadata: noteMetadata }}
            onBannerChange={(bannerData) => {
              if (note && editorRef.current?.getDeltaStats) {
                setNoteMetadata((current) => ({ ...current, banner: bannerData }));

                // den merges this into the note's metadata.
                const changeset = {
                  operations: [
                    {
                      type: "update_metadata",
                      data: { metadata: { banner: bannerData } },
                    },
                  ],
                  baselineVersion: lastSyncVersion,
                };

                applyDeltaChanges(note.id, changeset, {
                  title: title,
                  blocks: blocks,
                });
              }
            }}
            isEditable={true}
          />

          <ModernBlockEditor
            ref={editorRef}
            title={title}
            onTitleChange={handleTitleChange}
            initialBlocks={blocks}
            onContentChange={handleContentChange}
            onDeltaChange={handleDeltaChange}
            placeholder="Type '/' for commands…"
            noteId={note?.id}
          />
        </div>

        {/* Back on the page: the latest version is loading, so nothing typed now is lost. */}
        {isVisibilitySaving && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-canvas/70 pt-24">
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-line bg-elevated px-4 py-2.5 text-[13px] text-fg-muted shadow-sm"
            >
              <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
              Loading the latest version…
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModernNoteEditor;
