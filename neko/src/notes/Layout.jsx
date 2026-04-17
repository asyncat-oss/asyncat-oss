import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNoteContext } from "./context/NoteContext";
import NoteGrid from "./components/NoteGrid";
import ModernNoteEditor from "./modern/ModernNoteEditor";
import EmptyState from "./components/EmptyState";
import AlertModal from "./modern/AlertModal";
import { FileWarning, Wifi, WifiOff, RefreshCw } from "lucide-react";

const Layout = ({ selectedProject }) => {
  const {
    notes,
    loadNotes,
    isLoading,
    error,
    selectedNote,
    setSelectedNote,
    createNote,
    deleteNote,
    hasUnsavedChanges,
    fetchNoteWithContent,
    isOnline,
    getQueueSize,
    clearError,
  } = useNoteContext();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  // Memoized filtered notes for better performance
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;

    const query = searchQuery.toLowerCase();
    return notes.filter(
      (note) =>
        note.title?.toLowerCase().includes(query) ||
        note.content?.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);

  // Load notes when component mounts or dependencies change
  useEffect(() => {
    const loadData = async () => {
      try {
        const projectId = selectedProject?.id;
        if (projectId) {
          await loadNotes(projectId);
        }
        setLastRefresh(new Date());
      } catch (error) {
        // Error handled by context
      }
    };

    loadData();
  }, [selectedProject, loadNotes]);

  // Check for note to open from Universal Search
  useEffect(() => {
    const noteIdToOpen = sessionStorage.getItem("openNoteId");
    const shouldEdit = sessionStorage.getItem("editMode") === "true";

    if (noteIdToOpen && notes.length > 0) {
      // Find the note in the loaded notes
      const noteToOpen = notes.find((note) => note.id === noteIdToOpen);
      if (noteToOpen) {
        // Clear the session storage flags
        sessionStorage.removeItem("openNoteId");
        sessionStorage.removeItem("editMode");

        // Select and load the note
        setSelectedNote(noteToOpen);
        fetchNoteWithContent(noteToOpen.id);
      }
    }
  }, [notes, setSelectedNote, fetchNoteWithContent]);

  // Enhanced create note handler
  const handleCreateNew = useCallback(async () => {
    try {
      const projectId = selectedProject?.id;

      // Validate that we have a project ID
      if (!projectId) {
        setAlertModal({
          isOpen: true,
          title: "No Project Selected",
          message: "Please select a project before creating a note",
          type: "warning",
        });
        return;
      }

      // Check for unsaved changes in current note
      if (selectedNote && hasUnsavedChanges(selectedNote.id)) {
        if (selectedNote.showSaveModalBeforeNavigating) {
          await selectedNote.showSaveModalBeforeNavigating(async () => {
            const newNote = await createNote({
              title: "Untitled Note",
              content: "<p><br></p>",
              projectId: projectId,
            });
            if (newNote) {
              setSelectedNote(newNote);
            }
          });
          return;
        }
      }

      // Create note directly
      const newNote = await createNote({
        title: "Untitled Note",
        content: "<p><br></p>",
        projectId: projectId,
      });
      if (newNote) {
        setSelectedNote(newNote);
      }
    } catch (error) {
      // Error handled by context
    }
  }, [
    selectedNote,
    hasUnsavedChanges,
    selectedProject,
    createNote,
    setSelectedNote,
  ]);

  // Enhanced note selection handler
  const handleSelectNote = useCallback(
    async (newNote) => {
      if (selectedNote && selectedNote.id === newNote.id) return;

      try {
        // Handle unsaved changes
        if (selectedNote && hasUnsavedChanges(selectedNote.id)) {
          if (selectedNote.showSaveModalBeforeNavigating) {
            await selectedNote.showSaveModalBeforeNavigating(async () => {
              await selectNoteWithContent(newNote);
            });
          } else {
            await selectNoteWithContent(newNote);
          }
        } else {
          await selectNoteWithContent(newNote);
        }
      } catch (error) {
        setSelectedNote(newNote); // Fallback
      }
    },
    [selectedNote, hasUnsavedChanges, setSelectedNote]
  );

  // Helper function to select note and fetch content if needed
  const selectNoteWithContent = useCallback(
    async (note) => {
      // Immediately set the selected note to allow instant opening
      setSelectedNote(note);

      // Always fetch note content to ensure it's up-to-date and to trigger reordering
      try {
        const fullNote = await fetchNoteWithContent(note.id);
        // Update the selected note with the full content when it loads
        if (fullNote) {
          setSelectedNote(fullNote);
        }
      } catch (error) {
        // Note is already selected, so user can still interact with it
      }
    },
    [fetchNoteWithContent, setSelectedNote]
  );

  // Handle back to grid
  const handleBackToGrid = useCallback(() => {
    setSelectedNote(null);
  }, [setSelectedNote]);

  // Enhanced refresh handler
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    clearError();

    try {
      const projectId = selectedProject?.id;
      if (projectId) {
        await loadNotes(projectId);
      }
      setLastRefresh(new Date());
    } catch (error) {
      // Error handled by context
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, selectedProject, loadNotes, clearError]);

  // Handle batch delete
  const handleDeleteNotes = useCallback(
    async (notesToDelete) => {
      try {
        for (const note of notesToDelete) {
          await deleteNote(note.id);
        }

        // Refresh the notes list
        const projectId = selectedProject?.id;
        if (projectId) {
          loadNotes(projectId);
        }
      } catch (error) {
        // Error handled by context
      }
    },
    [deleteNote, selectedProject, loadNotes]
  );

  // Error state
  if (error && notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <div className="flex flex-col items-center max-w-md text-center">
          <FileWarning className="w-16 h-16 text-red-500 dark:text-red-400 midnight:text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 midnight:text-red-500 mb-2">
            Error Loading Notes
          </h2>
          <p className="text-gray-600 dark:text-gray-300 midnight:text-gray-400 mb-6">
            {error}
          </p>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 bg-red-500 dark:bg-red-600 midnight:bg-red-700 hover:bg-red-600 dark:hover:bg-red-700 midnight:hover:bg-red-800 text-white rounded-lg transition-colors"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                "Try Again"
              )}
            </button>
            <button
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
              onClick={clearError}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state: show NoteGrid with EmptyState inside grid area
  if (filteredNotes.length === 0 && !selectedNote && !isLoading) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
        {/* Status bar */}
        {!isOnline && (
          <div className="bg-orange-100 dark:bg-orange-900 midnight:bg-orange-950 border-b border-orange-200 dark:border-orange-800 midnight:border-orange-900 px-4 py-2">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200 midnight:text-orange-300">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">
                You're offline. Changes will be saved when connection is
                restored.
              </span>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900 midnight:bg-red-950 border-b border-red-200 dark:border-red-800 midnight:border-red-900 px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-red-800 dark:text-red-200 midnight:text-red-300 text-sm">
                {error}
              </span>
              <button
                onClick={clearError}
                className="text-red-600 dark:text-red-400 midnight:text-red-500 hover:text-red-800 dark:hover:text-red-200 midnight:hover:text-red-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Main content: NoteGrid with EmptyState inside */}
        <NoteGrid
          notes={[]}
          onSelectNote={handleSelectNote}
          onCreateNew={handleCreateNew}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onDeleteNotes={handleDeleteNotes}
          isLoading={isLoading}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          lastRefresh={lastRefresh}
          isOnline={isOnline}
          // Render EmptyState inside grid area
          renderEmpty={() => <EmptyState onCreateNew={handleCreateNew} />}
        />
      </div>
    );
  }

  // Show note editor if a note is selected - UPDATED: Full screen with sidebar
  if (selectedNote) {
    return (
      <div className="h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
        {/* Offline status bar */}
        {!isOnline && (
          <div className="bg-orange-100 dark:bg-orange-900 midnight:bg-orange-950 border-b border-orange-200 dark:border-orange-800 midnight:border-orange-900 px-4 py-2 z-60">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200 midnight:text-orange-300">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">
                You're offline. Changes will be saved when connection is
                restored.
              </span>
            </div>
          </div>
        )}

        <ModernNoteEditor note={selectedNote} onBack={handleBackToGrid} />
      </div>
    );
  }

  // Show notes grid
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
      {/* Status bar */}
      {!isOnline && (
        <div className="bg-orange-100 dark:bg-orange-900 midnight:bg-orange-950 border-b border-orange-200 dark:border-orange-800 midnight:border-orange-900 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200 midnight:text-orange-300">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">
                You're offline. Changes will be saved when connection is
                restored.
              </span>
            </div>
            {getQueueSize() > 0 && (
              <span className="text-xs text-orange-700 dark:text-orange-300 midnight:text-orange-400">
                {getQueueSize()} pending changes
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900 midnight:bg-red-950 border-b border-red-200 dark:border-red-800 midnight:border-red-900 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-red-800 dark:text-red-200 midnight:text-red-300 text-sm">
              {error}
            </span>
            <button
              onClick={clearError}
              className="text-red-600 dark:text-red-400 midnight:text-red-500 hover:text-red-800 dark:hover:text-red-200 midnight:hover:text-red-300"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <NoteGrid
        notes={filteredNotes}
        onSelectNote={handleSelectNote}
        onCreateNew={handleCreateNew}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onDeleteNotes={handleDeleteNotes}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastRefresh={lastRefresh}
        isOnline={isOnline}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
};

export default Layout;
