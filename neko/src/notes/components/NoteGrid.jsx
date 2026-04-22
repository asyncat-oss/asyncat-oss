import { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Search, Trash2, Grid, List, UserRound } from "lucide-react";
import NoteCard from "./NoteCard";
import NoteListView, { NoteListSkeleton } from "./NoteListView";
import { useUser } from "../../contexts/UserContext";

// Import stock profile pictures
import catDP from "../../assets/dp/CAT.webp";
import dogDP from "../../assets/dp/DOG.webp";
import dolphinDP from "../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../assets/dp/DRAGON.webp";
import elephantDP from "../../assets/dp/ELEPHANT.webp";
import foxDP from "../../assets/dp/FOX.webp";
import lionDP from "../../assets/dp/LION.webp";
import owlDP from "../../assets/dp/OWL.webp";
import penguinDP from "../../assets/dp/PENGUIN.webp";
import wolfDP from "../../assets/dp/WOLF.webp";

const profilePictureMap = {
  CAT: catDP,
  DOG: dogDP,
  DOLPHIN: dolphinDP,
  DRAGON: dragonDP,
  ELEPHANT: elephantDP,
  FOX: foxDP,
  LION: lionDP,
  OWL: owlDP,
  PENGUIN: penguinDP,
  WOLF: wolfDP,
};

// Helper function to get profile picture URL
const getProfilePicture = (profilePicId) => {
  if (!profilePicId) return null;

  // Check if it's a custom uploaded image (URL starts with https://)
  if (profilePicId.startsWith("https://")) {
    return profilePicId;
  }

  // Handle predefined avatars
  if (profilePictureMap[profilePicId]) {
    return profilePictureMap[profilePicId];
  }
  return null;
};

const possibleOwnerKeys = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "authorId",
  "author_id",
  "createdBy",
  "created_by",
  "createdById",
  "created_by_id",
  "createdByUserId",
  "created_by_user_id",
];

const isNoteCreatedByUser = (note, userId) => {
  if (!note || !userId) return false;

  const normalizedUserId = String(userId);
  const candidates = new Set();

  possibleOwnerKeys.forEach((key) => {
    if (note?.[key] !== undefined && note?.[key] !== null) {
      candidates.add(String(note[key]));
    }
  });

  if (note?.users) {
    if (note.users.id !== undefined && note.users.id !== null) {
      candidates.add(String(note.users.id));
    }
    if (note.users.user_id !== undefined && note.users.user_id !== null) {
      candidates.add(String(note.users.user_id));
    }
    if (note.users.userId !== undefined && note.users.userId !== null) {
      candidates.add(String(note.users.userId));
    }
  }

  if (note?.createdBy && typeof note.createdBy === "object") {
    if (note.createdBy.id !== undefined && note.createdBy.id !== null) {
      candidates.add(String(note.createdBy.id));
    }
    if (
      note.createdBy.user_id !== undefined &&
      note.createdBy.user_id !== null
    ) {
      candidates.add(String(note.createdBy.user_id));
    }
  }

  return candidates.has(normalizedUserId);
};

const NoteGrid = ({
  notes,
  onSelectNote,
  onCreateNew,
  searchQuery,
  setSearchQuery,
  onDeleteNotes,
  getProjectNameForNote,
  isAllNotesView,
  isLoading = false,
}) => {
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [showMyNotesOnly, setShowMyNotesOnly] = useState(false);

  // Add view mode state with localStorage persistence
  const [viewMode, setViewMode] = useState(() => {
    const savedViewMode = localStorage.getItem("noteViewMode");
    return savedViewMode || "grid";
  });

  const { user } = useUser();
  const currentUserId = user?.id ? String(user.id) : null;

  // Add delete confirmation state
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const deleteTimeoutRef = useRef(null);

  // Save view mode preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("noteViewMode", viewMode);
  }, [viewMode]);

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    let filtered = Array.isArray(notes) ? [...notes] : [];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (note) =>
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (note.content &&
            note.content.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (showMyNotesOnly && currentUserId) {
      filtered = filtered.filter((note) =>
        isNoteCreatedByUser(note, currentUserId)
      );
    }

    return filtered;
  }, [notes, searchQuery, showMyNotesOnly, currentUserId]);

  useEffect(() => {
    if (!showMyNotesOnly) return;

    setSelectedNotes((prev) => {
      const visibleIds = new Set(filteredNotes.map((note) => note.id));
      const next = prev.filter((note) => visibleIds.has(note.id));
      return next.length === prev.length ? prev : next;
    });
  }, [showMyNotesOnly, filteredNotes]);

  // Toggle selection of a single note
  const toggleNoteSelection = (note) => {
    setSelectedNotes((prev) => {
      // Check if note is already selected
      const isAlreadySelected = prev.some((n) => n.id === note.id);

      if (isAlreadySelected) {
        // Remove note from selection
        return prev.filter((n) => n.id !== note.id);
      } else {
        // Add note to selection
        return [...prev, note];
      }
    });
  };

  // Select all notes
  const selectAllNotes = () => {
    if (!Array.isArray(filteredNotes) || filteredNotes.length === 0) {
      setSelectedNotes([]);
      return;
    }

    if (selectedNotes.length === filteredNotes.length) {
      // If all visible notes are already selected, deselect all
      setSelectedNotes([]);
    } else {
      // Otherwise, select all visible notes
      setSelectedNotes([...filteredNotes]);
    }
  };

  // Handle delete button click with inline confirmation
  const handleDeleteClick = () => {
    if (selectedNotes.length === 0) return;

    if (!deleteConfirming) {
      setDeleteConfirming(true);
      // Reset confirmation after 3 seconds
      deleteTimeoutRef.current = setTimeout(() => {
        setDeleteConfirming(false);
      }, 3000);
    } else {
      // Actually delete
      onDeleteNotes(selectedNotes);
      setSelectedNotes([]);
      setDeleteConfirming(false);
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  // Reset delete confirmation when selection changes
  useEffect(() => {
    if (selectedNotes.length === 0 && deleteConfirming) {
      setDeleteConfirming(false);
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    }
  }, [selectedNotes.length, deleteConfirming]);

  // Handler for view mode changes
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
  };

  const toggleMyNotesFilter = () => {
    if (!currentUserId) return;
    setShowMyNotesOnly((prev) => !prev);
  };

  // Grid skeleton component
  const NoteGridSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 p-6 overflow-y-auto">
      {Array(8)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 midnight:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 midnight:border-slate-600 animate-pulse"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700"></div>
                <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded"></div>
              </div>
              <div className="mb-4 min-h-[3.5rem]">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-1/2"></div>
              </div>
              <div className="flex items-center">
                <div className="w-3.5 h-3.5 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded mr-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-20"></div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full relative bg-white dark:bg-gray-900 midnight:bg-gray-950">
      {/* Actions Bar */}
      <div className="flex items-center justify-between gap-4 p-4 mb-4 backdrop-blur-sm sticky top-0 z-20 bg-white/90 dark:bg-gray-900/90 midnight:bg-gray-950/90">
        {/* Search & filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes by title..."
              className="pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-700 dark:text-gray-200 midnight:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-indigo-500 transition-all w-72 border border-transparent dark:border-gray-700 midnight:border-gray-700"
              style={{ minWidth: "240px" }}
            />
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
          </div>
          <button
            onClick={toggleMyNotesFilter}
            disabled={!currentUserId}
            className={`group px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              showMyNotesOnly && currentUserId
                ? "bg-indigo-50 dark:bg-indigo-700/20 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-200 border-indigo-200 dark:border-indigo-600 midnight:border-indigo-700 shadow-sm"
                : "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
            } ${!currentUserId ? "opacity-60 cursor-not-allowed" : ""}`}
            title={
              currentUserId
                ? showMyNotesOnly
                  ? "Show All Notes"
                  : "Show Only Notes You Created"
                : "Sign In to Filter by Creator"
            }
            type="button"
          >
            <UserRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Created By Me</span>
          </button>
        </div>
        {/* Actions on the right */}
        <div className="flex items-center gap-3">
          {selectedNotes.length > 0 && (
            <>
              <div className="text-gray-700 dark:text-gray-300 midnight:text-indigo-300">
                {selectedNotes.length}{" "}
                {selectedNotes.length === 1 ? "item" : "items"} selected
              </div>
              <button
                onClick={selectAllNotes}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 text-gray-700 dark:text-gray-300 midnight:text-indigo-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
              >
                {selectedNotes.length === filteredNotes.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
              <button
                onClick={handleDeleteClick}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  deleteConfirming
                    ? "bg-red-600 dark:bg-red-700 midnight:bg-red-800 text-white hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900"
                    : "bg-red-600 dark:bg-red-700 midnight:bg-red-800 text-white dark:text-gray-100 midnight:text-indigo-100 hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {deleteConfirming ? "Sure?" : "Delete"}
              </button>
            </>
          )}
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange("grid")}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-gray-700 midnight:bg-gray-700 text-gray-800 dark:text-white midnight:text-indigo-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 midnight:text-indigo-300 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-indigo-200"
              }`}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewModeChange("list")}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-gray-700 midnight:bg-gray-700 text-gray-800 dark:text-white midnight:text-indigo-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 midnight:text-indigo-300 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-indigo-200"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-green-300 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Create Note</span>
          </button>
        </div>
      </div>

      {/* Notes Content */}
      {isLoading && notes.length === 0 ? (
        // Show appropriate skeleton based on view mode
        viewMode === "grid" ? (
          <NoteGridSkeleton />
        ) : (
          <div className="px-6 pb-6 overflow-y-auto">
            <NoteListSkeleton />
          </div>
        )
      ) : filteredNotes.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 p-6 overflow-y-auto auto-rows-max">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={onSelectNote}
                isSelected={selectedNotes.some((n) => n.id === note.id)}
                onToggleSelect={toggleNoteSelection}
                projectName={
                  getProjectNameForNote ? getProjectNameForNote(note) : null
                }
                userData={note.users}
                getProfilePicture={getProfilePicture}
              />
            ))}
          </div>
        ) : (
          <div className="px-6 pb-6 overflow-y-auto">
            <NoteListView
              notes={filteredNotes}
              onSelectNote={onSelectNote}
              selectedNotes={selectedNotes}
              onToggleSelect={toggleNoteSelection}
              getProjectNameForNote={getProjectNameForNote}
              isMyNotesFilterActive={showMyNotesOnly && Boolean(currentUserId)}
            />
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-lg mx-6 mb-6">
          <div className="text-center p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              {searchQuery ? (
                <Search className="w-8 h-8 text-gray-400 dark:text-gray-500 midnight:text-indigo-500" />
              ) : (
                <Search className="w-8 h-8 text-gray-400 dark:text-gray-500 midnight:text-indigo-500" />
              )}
            </div>
            <p className="text-gray-500 dark:text-gray-400 midnight:text-indigo-400 mb-4">
              {searchQuery
                ? "No notes match the current search."
                : "No notes found. Create your first note to get started."}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateNew}
                className="px-6 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-green-300 rounded-lg flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Create Your First Note</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteGrid;
