// ModernNoteEditor.jsx - Enhanced with real-time content synchronization
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import ReactDOM from "react-dom";
import {
  Trash2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  WifiOff,
  PencilRuler,
  // History,
  Save,
  Loader,
  FileText,
  FileDown,
  Download,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { useNoteContext } from "../context/NoteContext";
import { useUser } from "../../contexts/UserContext";
import { notesApi } from "../noteApi";
import ModernBlockEditor from "./ModernBlockEditor";
import NoteBanner from "./components/NoteBanner";
import KeyboardShortcutsDropdown from "./components/KeyboardShortcutsDropdown";
// import VersionHistoryPanel from "./components/VersionHistory/VersionHistoryPanel";
// import DiffViewer from "./components/VersionHistory/DiffViewer";
import { blocksToHtml, htmlToBlocks } from "../utils/blockConverter";
import { useAutoSave, hasContentChanged } from "../utils/autoSaveUtils";
// import { versionHistoryApi } from "../noteApi";
import authService from "../../services/authService";

const ModernNoteEditor = ({ note, onBack }) => {
  const {
    applyDeltaChanges,
    deleteNote,
    markNoteHasUnsavedChanges,
    fetchNoteWithContent,
    getQueueSize,
    isOnline,
  } = useNoteContext();

  const { user, userName, userEmail } = useUser();

  // Core state
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isContentLoaded, setIsContentLoaded] = useState(false);
  const [lastSaveError, setLastSaveError] = useState(null);

  // Delta tracking state
  const [lastSyncVersion, setLastSyncVersion] = useState(null);
  const [isApplyingRemoteChanges, setIsApplyingRemoteChanges] = useState(false);

  // UI state
  const [notification, setNotification] = useState(null);
  const [showShortcutsInfo, setShowShortcutsInfo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("idle"); // idle, downloading, downloaded, failed
  const [downloadMessage, setDownloadMessage] = useState("");
  const [isDownloadDropdownClosing, setIsDownloadDropdownClosing] =
    useState(false);
  const [shouldRenderDownloadDropdown, setShouldRenderDownloadDropdown] =
    useState(false);
  // const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  // const [diffViewerData, setDiffViewerData] = useState(null);
  // const [restoringVersionId, setRestoringVersionId] = useState(null);
  const [isVisibilitySaving, setIsVisibilitySaving] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  // References
  const editorRef = useRef(null);
  const initialStateRef = useRef({ title: "", blocks: [] });
  const deleteTimeoutRef = useRef(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const isInitializedRef = useRef(false);
  const deltaQueueRef = useRef([]);
  const lastRemoteUpdateRef = useRef(0);
  const shortcutsTriggerRef = useRef(null);
  const downloadTriggerRef = useRef(null);
  const headerRef = useRef(null);
  const getEditorIsTypingRef = useRef(() => false);
  const [headerHeight, setHeaderHeight] = useState(96);

  // Update the typing getter function when editor ref is ready
  useEffect(() => {
    if (editorRef.current && editorRef.current.getIsTyping) {
      getEditorIsTypingRef.current = () => editorRef.current.getIsTyping();
    }
  }, [editorRef.current]);
  const [availablePanelHeight, setAvailablePanelHeight] = useState(() => {
    if (typeof window !== "undefined") {
      return Math.max(window.innerHeight - 96, 0);
    }
    return 0;
  });

  const noteId = note?.id || null;
  const hasBanner = Boolean(note?.metadata?.banner);

  const measureHeader = useCallback(() => {
    if (typeof window === "undefined") return;

    const headerElement = headerRef.current;
    let offset = 96;

    if (headerElement) {
      const rect = headerElement.getBoundingClientRect();
      offset = rect.top + rect.height;
    }

    setHeaderHeight((prev) => (Math.abs(prev - offset) > 0.5 ? offset : prev));

    const available = Math.max(window.innerHeight - offset, 0);
    setAvailablePanelHeight((prev) =>
      Math.abs(prev - available) > 0.5 ? available : prev
    );
  }, []);

  useLayoutEffect(() => {
    measureHeader();
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => {
      measureHeader();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureHeader]);

  useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      measureHeader();
    });

    observer.observe(headerElement);

    return () => {
      observer.disconnect();
    };
  }, [measureHeader, noteId]);

  // useEffect(() => {
  //   setVersionHistoryOpen(false);
  //   setDiffViewerData(null);
  // }, [noteId]);



  /*
  const handleShowDiff = useCallback((diffPayload) => {
    setDiffViewerData(diffPayload);
  }, []);

  const handleDiffClose = useCallback(() => {
    setDiffViewerData(null);

    // Force chart re-rendering with multiple strategies
    // Wait for DOM to update after state change
    setTimeout(() => {
      // Strategy 1: Dispatch custom event immediately
      window.dispatchEvent(
        new CustomEvent("editor-visible", { detail: { timestamp: Date.now() } })
      );
      window.dispatchEvent(new Event("resize"));

      // Strategy 2: Use animation frames for smoother rendering
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("editor-visible", {
            detail: { timestamp: Date.now() },
          })
        );
        window.dispatchEvent(new Event("resize"));

        requestAnimationFrame(() => {
          // Strategy 3: Force reflow on all canvases
          const canvases = document.querySelectorAll(
            ".editor-fullscreen canvas"
          );
          canvases.forEach((canvas) => {
            // Trigger reflow by accessing dimensions
            canvas.offsetHeight;
            if (canvas.parentElement) {
              canvas.parentElement.offsetHeight;
            }
          });

          // Strategy 4: Dispatch events again after reflow
          window.dispatchEvent(
            new CustomEvent("editor-visible", {
              detail: { timestamp: Date.now() },
            })
          );
          window.dispatchEvent(new Event("resize"));
        });
      });

      // Strategy 5: Final check after longer delay
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("editor-visible", {
            detail: { timestamp: Date.now() },
          })
        );
        window.dispatchEvent(new Event("resize"));
      }, 100);
    }, 0);
  }, []);
  */

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
                  title: content.title || "Untitled Note",
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
                  data: { to: content.title.trim() || "Untitled Note" },
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
                title: content.title.trim() || "Untitled Note",
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

  /*
  const handleVersionRestore = useCallback(
    async ({
      title: restoredTitle = "",
      content = [],
      versionId,
      versionNumber,
    }) => {
      if (!noteId) return;

      // Set restoring state
      setRestoringVersionId(versionId);

      const normalizedTitle = restoredTitle || "Untitled Note";
      const normalizedBlocks = Array.isArray(content) ? content : [];

      editorRef.current?.setContent(normalizedBlocks);
      setTitle(normalizedTitle);
      setBlocks(normalizedBlocks);
      blocksRef.current = normalizedBlocks;
      initialStateRef.current = {
        title: normalizedTitle,
        blocks: [...normalizedBlocks],
      };
      if (editorRef.current?.resetDeltaBaseline) {
        editorRef.current.resetDeltaBaseline();
      }

      try {
        if (cancelAutoSave) {
          cancelAutoSave();
        }
        if (saveNow) {
          await saveNow({
            title: normalizedTitle,
            blocks: normalizedBlocks,
          });
        }

        const restoredFrom = {};
        if (versionId) {
          restoredFrom.versionId = versionId;
        }
        if (versionNumber !== undefined && versionNumber !== null) {
          restoredFrom.versionNumber = versionNumber;
        }

        await versionHistoryApi.createAutoVersion(noteId, {
          triggerType: "restore",
          forceCreate: true,
          timestamp: new Date().toISOString(),
          restoredFrom: Object.keys(restoredFrom).length
            ? restoredFrom
            : undefined,
        });

        setNotification({
          message: "Version restored successfully",
          type: "success",
        });
      } catch (error) {
        console.error(
          "[VersionRestore] Failed to save restored version:",
          error
        );
        setNotification({
          message: "Failed to restore version",
          type: "error",
        });
      } finally {
        setRestoringVersionId(null);
        setDiffViewerData(null);
        setVersionHistoryOpen(false);
      }
    },
    [noteId, saveNow, cancelAutoSave]
  );
  */

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
        const noteTitle = noteData.title || "Untitled Note";
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
              title: note.title || "Untitled Note", 
              content: note.content || "" 
            });
          }
        })
        .catch((error) => {
          console.error("Error fetching note content:", error);
          if (note.id) {
            initializeContent({ 
              id: note.id,
              title: note.title || "Untitled Note", 
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
          const freshTitle = freshNote.title || "Untitled Note";
          setTitle(freshTitle);
          setBlocks(freshBlocks);

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

      // Cmd+Option+Shift+H or Ctrl+Alt+Shift+H to toggle version history
      // Temporarily disabled version history toggle
      // if (
      //   (e.metaKey || e.ctrlKey) &&
      //   e.altKey &&
      //   e.shiftKey &&
      //   e.code === "KeyH"
      // ) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   setVersionHistoryOpen((prev) => !prev);
      // }
    };

    // Listen for custom event dispatched by ModernBlockEditor
    // const handleToggleVersionHistory = () => {
    //   setVersionHistoryOpen((prev) => !prev);
    // };

    document.addEventListener("keydown", handleKeyDown, true);
    // window.addEventListener(
    //   "toggle-version-history",
    //   handleToggleVersionHistory
    // );

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      // window.removeEventListener(
      //   "toggle-version-history",
      //   handleToggleVersionHistory
      // );
    };
  }, []); // Empty dependencies - handlers use refs and closures

  // Handle back navigation with auto-save
  const handleBack = useCallback(async () => {
    // Prevent multiple clicks
    if (isNavigatingBack) return;

    setIsNavigatingBack(true);

    // Always trigger save before navigating, regardless of changes
    try {
      setSaveStatus("saving");

      // Get current state
      const currentState = {
        title: titleRef.current,
        blocks: blocksRef.current,
      };

      // Trigger auto-save with current content
      await saveNow(currentState);

      // Small delay to ensure database has fully committed the save
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Force create version if there are any changes before navigating
      // This bypasses the 2-minute timer to ensure changes are captured
      if (editorRef.current?.createVersionIfHasChanges) {
        try {
          const versionCreated =
            await editorRef.current.createVersionIfHasChanges(true); // Pass true to force creation
          if (versionCreated) {
            console.log(
              "[Navigation] Created version history before leaving note"
            );
          }
        } catch (error) {
          console.error(
            "[Navigation] Failed to create version before leaving:",
            error
          );
        }
      }

      setSaveStatus("saved");

      // Brief delay to show save status
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("Save before navigation failed:", error);
      setSaveStatus("error");

      // Brief delay to show error status
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reset navigation state on error so user can try again
      setIsNavigatingBack(false);
      return;
    }

    setSaveStatus(null);

    // Navigate back
    onBack();
    // Note: We don't reset isNavigatingBack here because we're leaving the component
  }, [onBack, saveNow, isNavigatingBack]);

  // Delete note
  const handleDeleteClick = useCallback(() => {
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      deleteTimeoutRef.current = setTimeout(() => {
        setDeleteConfirming(false);
      }, 3000);
    } else {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      deleteNote(note.id);
      onBack();
    }
  }, [deleteConfirming, note, deleteNote, onBack]);

  // Helper function to ensure media URLs are fresh before exporting
  const refreshMediaUrls = useCallback(
    async (blocks) => {
      if (!note?.id) {
        return { updatedBlocks: blocks, hasChanges: false };
      }

      const updatedBlocks = [...blocks];
      let hasChanges = false;
      let attachmentsApi = null;

      const ensureAttachmentsApi = async () => {
        if (!attachmentsApi) {
          ({ attachmentsApi } = await import("../noteApi"));
        }
        return attachmentsApi;
      };

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
          const api = await ensureAttachmentsApi();
          const freshBaseUrl = api.getAttachmentUrl(note.id, filename);
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

  // Animated close handler for download dropdown
  const handleCloseDownloadDropdown = useCallback(() => {
    if (!isDownloadDropdownClosing) {
      setIsDownloadDropdownClosing(true);
      setTimeout(() => {
        setIsDownloadDropdownClosing(false);
        setShouldRenderDownloadDropdown(false);
        setShowDownloadDropdown(false);
      }, 200); // Animation duration
    }
  }, [isDownloadDropdownClosing]);

  // Handle export with status updates
  const handleExport = useCallback(
    async (format) => {
      if (isExporting) return;

      setIsExporting(true);
      setDownloadStatus("downloading");
      setDownloadMessage("");
      handleCloseDownloadDropdown(); // Close dropdown with animation

      try {
        // First, refresh all image URLs to ensure they have valid tokens
        const currentBlocks = blocksRef.current;
        const { updatedBlocks, hasChanges } = await refreshMediaUrls(
          currentBlocks
        );

        // If URLs were refreshed, update the blocks state and save
        if (hasChanges) {
          setDownloadMessage("");
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

        setDownloadMessage("");

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
        a.download = `${title || "Untitled Note"}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setDownloadMessage("");
        setDownloadStatus("downloaded");

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setDownloadStatus("idle");
          setDownloadMessage("");
        }, 3000);
      } catch (error) {
        console.error(`[Export] ${format.toUpperCase()} export error:`, error);
        setDownloadMessage("Download failed");
        setDownloadStatus("failed");

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setDownloadStatus("idle");
          setDownloadMessage("");
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
      handleCloseDownloadDropdown,
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

        // Use fetch with keepalive for reliable background saving with auth headers
        if (note?.id) {
          try {
            const token = authService.getAccessToken();
            if (token) {
              // Use fetch with keepalive - works like sendBeacon but supports headers
              fetch(
                `${import.meta.env.VITE_NOTES_URL}/api/notes/${note.id}/delta`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    changeset: {
                      operations: [
                        {
                          type: "batch",
                          data: { blocks: saveData.blocks },
                        },
                        {
                          type: "update_title",
                          data: { to: saveData.title || "Untitled Note" },
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
            }
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
          const token = authService.getAccessToken();
          if (token) {
            // Use fetch with keepalive - works like sendBeacon but supports headers
            fetch(
              `${import.meta.env.VITE_NOTES_URL}/api/notes/${note.id}/delta`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  changeset: {
                    operations: [
                      {
                        type: "batch",
                        data: { blocks: saveData.blocks },
                      },
                      {
                        type: "update_title",
                        data: { to: saveData.title || "Untitled Note" },
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
          }

          // Don't prevent navigation - just save in background
        } catch (error) {
          console.warn("Background save failed:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges, note?.id]);

  // Auto-hide notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle click outside for download dropdown
  useEffect(() => {
    if (!showDownloadDropdown) return;

    const handleClickOutside = (event) => {
      if (
        downloadTriggerRef.current &&
        !downloadTriggerRef.current.contains(event.target)
      ) {
        handleCloseDownloadDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDownloadDropdown, handleCloseDownloadDropdown]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      cancelAutoSave();
    };
  }, [cancelAutoSave]);

  // Status indicator logic
  const getStatusIndicator = useCallback(() => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="w-4 h-4" />,
        text: "Offline",
        className:
          "text-orange-600 dark:text-orange-400 midnight:text-orange-400",
      };
    }

    if (saveStatus === "saving" || saveStatus === "auto-saving") {
      return {
        icon: <Clock className="w-4 h-4 animate-spin" />,
        text: "Saving...",
        className: "text-blue-600 dark:text-blue-400 midnight:text-indigo-400",
      };
    }

    if (saveStatus === "error" || lastSaveError) {
      const queueSize = getQueueSize();
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        text: queueSize > 0 ? "Queued for sync" : "Save failed",
        className:
          queueSize > 0
            ? "text-yellow-600 dark:text-yellow-500 midnight:text-yellow-400"
            : "text-red-600 dark:text-red-500 midnight:text-red-400",
      };
    }

    if (saveStatus === "saved" || saveStatus === "auto-saved") {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        text: "Saved",
        className: "text-green-600 dark:text-green-500 midnight:text-green-400",
      };
    }

    return {
      icon: <CheckCircle className="w-4 h-4" />,
      text: "Up to date",
      className: "text-gray-600 dark:text-gray-500 midnight:text-gray-400",
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
      <div className="flex h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3 animate-pulse [animation-duration:2s]">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg"></div>
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg"></div>
            </div>

            <div className="flex items-center gap-4 animate-pulse [animation-duration:2s]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded"></div>
                <div className="w-20 h-4 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded"></div>
              </div>
              <div className="w-16 h-8 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg"></div>
            </div>
          </div>

          <div className="flex-1">
            <div className="max-w-4xl mx-auto px-8 py-6 animate-pulse [animation-duration:2s]">
              <div className="mb-8">
                <div className="w-2/3 h-12 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg"></div>
              </div>

              <div className="space-y-6">
                <div className="w-full h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                <div className="w-5/6 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-gray-200 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-full mt-2"></div>
                  <div className="w-3/4 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-gray-200 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-full mt-2"></div>
                  <div className="w-2/3 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                </div>

                <div className="w-1/2 h-8 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded mt-8"></div>
                <div className="w-full h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                <div className="w-4/5 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>

                <div className="flex gap-3 mt-6">
                  <div className="w-1 h-12 bg-gray-200 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-full"></div>
                  <div className="flex-1 space-y-3">
                    <div className="w-5/6 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                    <div className="w-3/4 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                  </div>
                </div>

                <div className="w-full h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                <div className="w-3/5 h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>

                <div className="bg-gray-50 dark:bg-gray-800/20 midnight:bg-gray-900/20 rounded-lg p-3 mt-6">
                  <div className="space-y-2">
                    <div className="w-1/4 h-4 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                    <div className="w-2/3 h-4 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
                  </div>
                </div>

                <div className="w-full h-6 bg-gray-100 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusIndicator = getStatusIndicator();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
      {/* Header - Full Width */}
      <div
        ref={headerRef}
        className="flex-shrink-0 z-50 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 bg-white dark:bg-gray-900 midnight:bg-gray-950"
        style={{ userSelect: "none" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            disabled={isNavigatingBack}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
              isNavigatingBack
                ? "cursor-not-allowed"
                : "hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
            } text-gray-600 dark:text-gray-500 midnight:text-slate-400`}
          >
            <ArrowLeft className="w-5 h-5" />
            {isNavigatingBack &&
              (saveStatus === "saved" || saveStatus === null) && (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Exiting Note...</span>
                </>
              )}
          </button>
        </div>

        <div className="flex items-center gap-4">

          <div className="flex items-center gap-2">
            {/* Status Indicator */}
            {statusIndicator && (
              <div
                className={`flex items-center gap-2 text-xs font-medium ${statusIndicator.className}`}
              >
                {statusIndicator.icon}
                <span className="hidden sm:inline">{statusIndicator.text}</span>
              </div>
            )}

            {/* Download Button with Dropdown */}
            <div className="relative">
              <button
                ref={downloadTriggerRef}
                onClick={() => {
                  if (downloadStatus === "idle" && !isExporting) {
                    if (showDownloadDropdown) {
                      handleCloseDownloadDropdown();
                    } else {
                      setShowDownloadDropdown(true);
                      setShouldRenderDownloadDropdown(true);
                    }
                  }
                }}
                disabled={isExporting}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                  downloadStatus === "downloading"
                    ? "text-blue-600 dark:text-blue-400 midnight:text-blue-500"
                    : downloadStatus === "downloaded"
                    ? "text-green-600 dark:text-green-500 midnight:text-green-400"
                    : downloadStatus === "failed"
                    ? "text-red-600 dark:text-red-500 midnight:text-red-400"
                    : "text-gray-600 dark:text-gray-500 midnight:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
                }`}
                title="Download Note"
              >
                {downloadStatus === "downloading" && (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <div className="flex flex-col leading-tight">
                      <span>Downloading...</span>
                      {downloadMessage && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                          {downloadMessage}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {downloadStatus === "downloaded" && (
                  <>
                    <CircleCheck className="w-4 h-4" />
                    <span>Downloaded</span>
                  </>
                )}
                {downloadStatus === "failed" && (
                  <>
                    <CircleX className="w-4 h-4" />
                    <span>Download failed</span>
                  </>
                )}
                {downloadStatus === "idle" && (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </>
                )}
              </button>

              {shouldRenderDownloadDropdown && downloadStatus === "idle" && (
                <div
                  className="absolute left-[-1.5rem] top-6.5 mt-2 w-42 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg z-50"
                  style={{
                    animation: isDownloadDropdownClosing
                      ? "fadeOutUp 0.2s ease-in forwards"
                      : "fadeInDown 0.24s ease-out",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    onClick={() => handleExport("pdf")}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-t-lg text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 transition-colors"
                  >
                    <FileDown className="w-4 h-4 text-purple-600 dark:text-purple-400 midnight:text-purple-500" />
                    <span>Export as PDF</span>
                  </button>
                  {/* <button
                    onClick={() => handleExport("docx")}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-b-lg text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-blue-500" />
                    <span>Export as DOCX</span>
                  </button> */}
                </div>
              )}
            </div>

            {/* Delete Button */}
            <button
              onClick={handleDeleteClick}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                deleteConfirming
                  ? "bg-red-600 dark:bg-red-700 midnight:bg-red-800 text-white hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900"
                  : "text-red-600 dark:text-red-400 midnight:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 midnight:hover:bg-red-950/50"
              }`}
            >
              <Trash2 className="w-4 h-4" />
              {deleteConfirming ? "Confirm?" : "Delete"}
            </button>

            {/* Help Button with Dropdown */}
            <div className="relative">
              <button
                ref={shortcutsTriggerRef}
                onClick={() => {
                  if (!showShortcutsInfo) {
                    setShowShortcutsInfo(true);
                  }
                  // If dropdown is open, let the dropdown's click-outside logic handle closing
                }}
                className={`p-2 rounded-lg transition-colors ${
                  showShortcutsInfo
                    ? "bg-blue-100 dark:bg-blue-900/50 midnight:bg-blue-900/30 text-blue-600 dark:text-blue-500 midnight:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-700 text-gray-600 dark:text-gray-400 midnight:text-slate-300"
                }`}
                title="Toggle keyboard shortcuts"
              >
                <PencilRuler className="w-4.5 h-4.5" />
              </button>

              {/* Keyboard Shortcuts Dropdown */}
              <KeyboardShortcutsDropdown
                isVisible={showShortcutsInfo}
                onClose={() => setShowShortcutsInfo(false)}
                triggerRef={shortcutsTriggerRef}
              />
            </div>

            {/* Version History toggle temporarily disabled */}
            {/*
            <button
              onClick={() => {
                setVersionHistoryOpen((prev) => !prev);
              }}
              className={`p-2 rounded-lg transition-colors ${
                versionHistoryOpen
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 midnight:bg-blue-900/40 midnight:text-blue-200"
                  : "text-gray-600 dark:text-gray-400 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-700"
              }`}
              aria-pressed={versionHistoryOpen}
              title="Version History"
            >
              <History className="w-4 h-4" />
            </button>
            */}
          </div>
        </div>
      </div>

      {/* Content Area - Editor and Version Panel Side by Side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Content */}
        <div
          className="flex-1 overflow-y-auto editor-fullscreen"
          style={{
            transition: "margin 350ms cubic-bezier(0.4, 0.0, 0.2, 1)",
            // marginRight: versionHistoryOpen ? "0px" : "0px",
            marginRight: "0px",
          }}
        >
          <NoteBanner
            note={note}
            onBannerChange={(bannerData) => {
              if (note && editorRef.current?.getDeltaStats) {
                const currentMetadata = note.metadata || {};
                const newMetadata = {
                  ...currentMetadata,
                  banner: bannerData,
                };
                note.metadata = newMetadata;

                const changeset = {
                  operations: [
                    {
                      type: "update_metadata",
                      data: { metadata: newMetadata },
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
            // isEditable={!diffViewerData}
            isEditable={true}
          />

          <div className="relative">
            <div
              // className={diffViewerData ? "hidden" : "block"}
              className="block"
            >
              <ModernBlockEditor
                ref={editorRef}
                title={title}
                onTitleChange={handleTitleChange}
                initialBlocks={blocks}
                onContentChange={handleContentChange}
                onDeltaChange={handleDeltaChange}
                placeholder="Type '/' for commands..."
                noteId={note?.id}
              />
            </div>
            {/* Diff viewer temporarily disabled */}
            {/*
            {diffViewerData && (
              <div
                className={`max-w-5xl mx-auto px-6 ${
                  hasBanner ? "mt-6" : "mt-6 sm:mt-8 md:mt-10"
                }`}
              >
                <DiffViewer
                  noteId={noteId}
                  oldBlocks={diffViewerData.oldBlocks}
                  newBlocks={diffViewerData.newBlocks}
                  oldTitle={diffViewerData.oldTitle}
                  newTitle={diffViewerData.newTitle}
                  versionId={diffViewerData.versionId}
                  versionData={diffViewerData.versionData}
                  versionUser={diffViewerData.versionUser}
                  isLoading={diffViewerData.isLoading}
                  onClose={handleDiffClose}
                  onRestore={handleVersionRestore}
                  restoringVersionId={restoringVersionId}
                />
              </div>
            )}
            */}
          </div>
        </div>

        {/* Version History Panel temporarily disabled */}
        {/*
        <VersionHistoryPanel
          noteId={noteId}
          isOpen={versionHistoryOpen}
          onVersionRestore={handleVersionRestore}
          onShowDiff={handleShowDiff}
          headerHeight={headerHeight}
          availableHeight={availablePanelHeight}
          restoringVersionId={restoringVersionId}
        />
        */}
      </div>

      {/* Visibility-triggered Autosave Overlay - using portal to render above everything */}
      {isVisibilitySaving &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/40 dark:bg-black/60 midnight:bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 px-8 py-6 bg-white dark:bg-slate-800 midnight:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 midnight:border-slate-800">
              <div className="relative flex items-center justify-center">
                {/* Background circle (light) */}
                <div className="w-12 h-12 border-4 border-blue-200 dark:border-blue-900/40 midnight:border-blue-950/40 rounded-full"></div>

                {/* Spinning circle with visible gradient effect */}
                <div
                  className="absolute top-0 left-0 w-12 h-12 rounded-full animate-spin"
                  style={{
                    animationDuration: "0.8s",
                    border: "3px solid transparent",
                    borderTopColor: "#3b82f6",
                    borderRightColor: "#60a5fa",
                    borderBottomColor: "transparent",
                    borderLeftColor: "transparent",
                  }}
                ></div>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 midnight:text-slate-50 mb-1">
                  Loading The Latest Note Version...
                </h3>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Enhanced Notifications */}
      {notification && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 ${
            notification.type === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200 midnight:bg-green-950/90 midnight:text-green-300"
              : notification.type === "error"
              ? "bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-200 midnight:bg-red-950/90 midnight:text-red-300"
              : notification.type === "warning"
              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/80 dark:text-yellow-200 midnight:bg-yellow-950/90 midnight:text-yellow-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200 midnight:bg-blue-950/90 midnight:text-blue-300"
          }`}
          style={{
            animation: "slideInRight 0.3s ease-out",
          }}
        >
          {notification.type === "success" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {notification.type === "error" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {notification.type === "warning" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {notification.type === "info" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeOutUp {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-12px);
          }
        }
      `}</style>

     
    </div>
  );
};

export default ModernNoteEditor;
