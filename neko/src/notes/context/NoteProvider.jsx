// NoteProvider.jsx - Simplified without versioning
import React, { createContext, useState, useCallback, useEffect } from "react";
import { notesApi } from "../noteApi";
import { NoteContext } from "./NoteContext";

export const NoteProvider = ({ children, session }) => {
  // Core state
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notesWithUnsavedChanges, setNotesWithUnsavedChanges] = useState({});

  // Network status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Offline queue for operations
  const [operationQueue, setOperationQueue] = useState([]);

  // Delta tracking state (simplified - no versioning)
  const [deltaSupport, setDeltaSupport] = useState(true);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Process any queued operations when coming back online
      processQueuedOperations();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Enhanced error handling
  const handleApiError = useCallback(
    (error, operation) => {
      console.error(`${operation} failed:`, error);

      // Handle specific error types
      if (error.message?.includes("Network Error") || !isOnline) {
        setError(
          `${operation} failed - you are offline. Changes will be synced when connection is restored.`
        );
      } else if (error.status === 401) {
        setError("Session expired. Please log in again.");
      } else if (error.status === 403) {
        setError("You do not have permission to perform this action.");
      } else if (error.status === 404) {
        setError("Note not found. It may have been deleted.");
      } else {
        setError(`${operation} failed: ${error.message || "Unknown error"}`);
      }

      // Auto-clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    },
    [isOnline]
  );

  // Track unsaved changes
  const markNoteHasUnsavedChanges = useCallback((noteId, hasChanges) => {
    setNotesWithUnsavedChanges((prev) => ({
      ...prev,
      [noteId]: hasChanges,
    }));
  }, []);

  // Check unsaved changes
  const hasUnsavedChanges = useCallback(
    (noteId) => {
      return !!notesWithUnsavedChanges[noteId];
    },
    [notesWithUnsavedChanges]
  );

  // Process queued operations when coming back online
  const processQueuedOperations = useCallback(async () => {
    if (!isOnline || operationQueue.length === 0) return;

    const queue = [...operationQueue];
    setOperationQueue([]);

    for (const operation of queue) {
      try {
        switch (operation.type) {
          case "delta":
            await notesApi.applyDeltaChanges(
              operation.noteId,
              operation.changeset
            );
            break;
          case "create":
            await notesApi.createNote(
              operation.noteData.title,
              operation.noteData.content,
              operation.noteData.projectId
            );
            break;
          case "delete":
            await notesApi.deleteNote(operation.noteId);
            break;
          default:
            console.warn(
              "Traditional update operations are no longer supported:",
              operation.type
            );
            break;
        }

        markNoteHasUnsavedChanges(operation.noteId, false);
      } catch (error) {
        console.error("Failed to process queued operation:", error);
        // Re-queue failed operations
        setOperationQueue((prev) => [...prev, operation]);
      }
    }
  }, [isOnline, operationQueue, markNoteHasUnsavedChanges]);

  // Load notes
  const loadNotes = useCallback(
    async (projectId) => {
      try {
        setIsLoading(true);
        setError(null);

        const fetchedNotes = await notesApi.loadNotes(projectId);
        setNotes(fetchedNotes);

        return fetchedNotes;
      } catch (err) {
        handleApiError(err, "Loading notes");
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [handleApiError]
  );

  // Fetch note with content - always fetch fresh from server
  const fetchNoteWithContent = useCallback(
    async (noteId, forceFresh = true) => {
      try {
        setError(null);

        if (!isOnline) {
          const cachedNote = notes.find((n) => n.id === noteId);
          if (cachedNote) {
            setSelectedNote(cachedNote);
            // Move accessed note to front even when offline
            setNotes((prev) => {
              const otherNotes = prev.filter((n) => n && n.id !== noteId);
              return [cachedNote, ...otherNotes];
            });
            return cachedNote;
          }
          throw new Error("Note not available offline");
        }

        // Always fetch fresh data from server with cache-busting
        const note = await notesApi.fetchNoteWithContent(noteId, forceFresh);
        setSelectedNote(note);

        // Update the note in the notes list and move it to front (most recently accessed)
        if (note && note.id) {
          setNotes((prev) => {
            const otherNotes = prev.filter((n) => n && n.id !== noteId);
            // Update the note's updatedAt to current time to reflect recent access
            const updatedNote = {
              ...note,
              updatedAt: new Date().toISOString(),
            };
            return [updatedNote, ...otherNotes];
          });
        }

        return note;
      } catch (err) {
        handleApiError(err, "Loading note");
        return null;
      }
    },
    [handleApiError, isOnline, notes]
  );

  // Create note
  const createNote = useCallback(
    async (noteData) => {
      try {
        setIsLoading(true);
        setError(null);

        if (!isOnline) {
          const operation = {
            type: "create",
            noteData,
            timestamp: Date.now(),
          };
          setOperationQueue((prev) => [...prev, operation]);

          // Create temporary local note
          const tempNote = {
            id: `temp-${Date.now()}`,
            ...noteData,
            createdat: new Date().toISOString(),
            updatedat: new Date().toISOString(),
            isTemp: true,
          };

          setNotes((prev) => [tempNote, ...prev]);
          return tempNote;
        }

        const newNote = await notesApi.createNote(
          noteData.title,
          noteData.content,
          noteData.projectId
        );
        setNotes((prev) => [newNote, ...prev]);

        return newNote;
      } catch (err) {
        handleApiError(err, "Creating note");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [handleApiError, isOnline]
  );

  // Apply delta changes (simplified - no versioning)
  const applyDeltaChanges = useCallback(
    async (noteId, changeset) => {
      try {
        // If offline, queue the delta operation
        if (!isOnline) {
          const operation = {
            type: "delta",
            noteId,
            changeset,
            timestamp: Date.now(),
          };
          setOperationQueue((prev) => [...prev, operation]);
          markNoteHasUnsavedChanges(noteId, true);

          return {
            success: false,
            queued: true,
            message: "Changes queued for sync when online",
          };
        }

        // Apply delta changes via API (version checking disabled)
        const result = await notesApi.applyDeltaChanges(noteId, changeset);

        if (result.success) {
          // Update local state with the result
          const updatedNote = result.data;

          if (updatedNote && updatedNote.id) {
            setNotes((prev) =>
              prev
                .map((note) =>
                  note && note.id === noteId ? updatedNote : note
                )
                .filter((note) => note && note.id)
            ); // Filter out any undefined notes

            if (selectedNote?.id === noteId) {
              setSelectedNote(updatedNote);
            }
          }

          markNoteHasUnsavedChanges(noteId, false);

          return result;
        } else {
          throw new Error(result.error || "Failed to apply delta changes");
        }
      } catch (err) {
        console.error("NoteProvider: Delta changes failed:", err);

        // Queue delta operations for retry when connection is restored
        const queuedOperation = {
          type: "delta",
          noteId,
          changeset,
          timestamp: Date.now(),
        };

        setOperationQueue((prev) => [...prev, queuedOperation]);
        markNoteHasUnsavedChanges(noteId, true);

        // Return a partial success to indicate it's queued
        return {
          success: false,
          queued: true,
          message: "Delta changes queued for sync when connection is restored",
        };
      }
    },
    [isOnline, markNoteHasUnsavedChanges, selectedNote]
  );

  // Delete note
  const deleteNote = useCallback(
    async (noteId) => {
      try {
        setError(null);

        if (!isOnline) {
          const operation = {
            type: "delete",
            noteId,
            timestamp: Date.now(),
          };
          setOperationQueue((prev) => [...prev, operation]);

          // Remove from local state immediately for UX
          setNotes((prev) => prev.filter((note) => note.id !== noteId));
          if (selectedNote?.id === noteId) {
            setSelectedNote(null);
          }

          return { success: true, queued: true };
        }

        const result = await notesApi.deleteNote(noteId);

        setNotes((prev) => prev.filter((note) => note.id !== noteId));
        if (selectedNote?.id === noteId) {
          setSelectedNote(null);
        }

        // Clear unsaved changes
        markNoteHasUnsavedChanges(noteId, false);

        return result;
      } catch (err) {
        handleApiError(err, "Deleting note");
        throw err;
      }
    },
    [handleApiError, isOnline, selectedNote, markNoteHasUnsavedChanges]
  );

  // Get queue size for UI feedback
  const getQueueSize = useCallback(() => {
    return operationQueue.length;
  }, [operationQueue]);

  // Context value
  const contextValue = {
    // State
    notes,
    selectedNote,
    isLoading,
    error,
    isOnline,
    deltaSupport,

    // Actions
    loadNotes,
    fetchNoteWithContent,
    createNote,
    applyDeltaChanges,
    deleteNote,

    // Utils
    markNoteHasUnsavedChanges,
    hasUnsavedChanges,
    getQueueSize,

    // Clear functions
    clearError: () => setError(null),
    setSelectedNote,
  };

  return (
    <NoteContext.Provider value={contextValue}>{children}</NoteContext.Provider>
  );
};

export default NoteProvider;
