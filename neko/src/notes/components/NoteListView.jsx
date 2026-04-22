import { useState, useMemo } from "react";
import {
  FileText,
  Clock,
  Check,
  Hash,
  List,
  Quote,
  Info,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  UserRound,
  CheckCircle,
} from "lucide-react";
import { attachmentApi } from "../attachmentApi";

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

const soraFontBase = "font-sora";

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

const formatDate = (dateString) => {
  if (!dateString) return "Not set";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

// Get banner data from note metadata
const getBannerData = (note) => {
  try {
    if (note.metadata) {
      const metadata =
        typeof note.metadata === "string"
          ? JSON.parse(note.metadata)
          : note.metadata;
      return metadata.banner || null;
    }
  } catch (e) {
    console.error("Error parsing note metadata:", e);
  }
  return null;
};

const getBannerStyle = (note) => {
  const bannerData = getBannerData(note);
  if (!bannerData) return {};

  switch (bannerData.type) {
    case "color":
      return { backgroundColor: bannerData.color };
    case "gradient":
      return { background: bannerData.gradient };
    case "image":
      return {
        backgroundImage: `url(${attachmentApi.getAttachmentUrl(
          note.id,
          bannerData.filename
        )})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    default:
      return {};
  }
};

// Skeleton loading component for the modern table view
export const NoteListSkeleton = () => {
  const skeletonRows = Array(8).fill(0);

  return (
    <div className={`${soraFontBase} animate-pulse`}>
      {skeletonRows.map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-1 md:grid-cols-[1fr_200px_250px] gap-4 py-4 px-6 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20"
        >
          {/* Column 1: Note */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded flex-shrink-0"></div>
            <div className="w-10 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
              <div className="w-48 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
            </div>
          </div>

          {/* Column 2: Created By */}
          <div className="hidden md:flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full flex-shrink-0"></div>
            <div className="w-20 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
          </div>

          {/* Column 3: Date */}
          <div className="hidden md:flex items-center gap-2">
            <div className="w-32 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const NoteListView = ({
  notes,
  onSelectNote,
  selectedNotes = [],
  onToggleSelect,
  loading = false,
  isMyNotesFilterActive = false,
}) => {
  const [sortByCreated, setSortByCreated] = useState(false);
  const [titleSortOrder, setTitleSortOrder] = useState(null); // null, 'asc', or 'desc'

  // Sort notes based on current sort mode
  const sortedNotes = useMemo(() => {
    if (!Array.isArray(notes)) return [];

    const notesCopy = [...notes];

    // If title sort is active, use that
    if (titleSortOrder) {
      return notesCopy.sort((a, b) => {
        const titleA = (a.title || "Untitled Note").toLowerCase();
        const titleB = (b.title || "Untitled Note").toLowerCase();

        if (titleSortOrder === "asc") {
          return titleA.localeCompare(titleB);
        } else {
          return titleB.localeCompare(titleA);
        }
      });
    }

    // Otherwise use date sorting
    if (sortByCreated) {
      // Sort by created date (earliest first)
      return notesCopy.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.createdat || 0);
        const dateB = new Date(b.createdAt || b.createdat || 0);
        return dateA - dateB;
      });
    } else {
      // Sort by updated date (most recent first)
      return notesCopy.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.updatedat || 0);
        const dateB = new Date(b.updatedAt || b.updatedat || 0);
        return dateB - dateA;
      });
    }
  }, [notes, sortByCreated, titleSortOrder]);

  const visibleNotes = useMemo(
    () => sortedNotes.filter((note) => note && note.id),
    [sortedNotes]
  );

  const hasVisibleNotes = visibleNotes.length > 0;

  // Show skeleton if loading
  if (loading) {
    return <NoteListSkeleton />;
  }

  const handleNoteClick = (note) => {
    onSelectNote(note);
  };

  const handleCheckboxClick = (e, note) => {
    e.stopPropagation();
    onToggleSelect(note);
  };

  const isNoteSelected = (note) => {
    return selectedNotes.some((n) => n.id === note.id);
  };

  const handleSortToggle = () => {
    // Reset title sort when switching date sort
    setTitleSortOrder(null);
    setSortByCreated(!sortByCreated);
  };

  const handleTitleSort = () => {
    if (!titleSortOrder || titleSortOrder === "desc") {
      setTitleSortOrder("asc");
    } else {
      setTitleSortOrder("desc");
    }
  };

  return (
    <div className={`${soraFontBase}`}>
      {hasVisibleNotes ? (
        <>
          {/* Table Header - Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_250px] gap-4 py-3 px-6 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-indigo-300 bg-gray-50/30 dark:bg-gray-800/20 midnight:bg-gray-900/10 border-b border-gray-200/30 dark:border-gray-700/20 midnight:border-gray-800/15">
            {/* Column 1: Note */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-5"></div> {/* Space for checkbox */}
              <div className="w-10"></div> {/* Space for banner */}
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400 flex-shrink-0" />
                <span>Note</span>
                <button
                  onClick={handleTitleSort}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
                  title={
                    !titleSortOrder || titleSortOrder === "desc"
                      ? "Sort A to Z"
                      : "Sort Z to A"
                  }
                >
                  {!titleSortOrder || titleSortOrder === "desc" ? (
                    <ArrowDownAZ className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
                  ) : (
                    <ArrowUpAZ className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Column 2: Created By */}
            <div className="hidden md:flex items-center gap-1.5">
              <UserRound className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400 flex-shrink-0" />
              <span>Created By</span>
            </div>

            {/* Column 3: Date */}
            <div className="hidden md:flex items-center gap-1.5 ml-8">
              <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400 flex-shrink-0" />
              <span>{sortByCreated ? "Date Created" : "Last Modified"}</span>
              <button
                onClick={handleSortToggle}
                className="ml-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
                title={sortByCreated ? "Last Modified" : "Date Created"}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
              </button>
            </div>
          </div>

          {/* Note Rows - Grid Layout */}
          <div className="divide-y divide-gray-100/50 dark:divide-gray-700/30 midnight:divide-gray-800/20">
            {visibleNotes.map((note) => {
              const isSelected = isNoteSelected(note);
              return (
                <div
                  key={note.id}
                  className={`group grid grid-cols-1 md:grid-cols-[1fr_200px_250px] gap-4 py-4 px-6 cursor-pointer transition-all duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20 ${
                    isSelected
                      ? "bg-gray-50/70 dark:bg-gray-800/40 midnight:bg-gray-900/25"
                      : ""
                  }`}
                  onClick={() => handleNoteClick(note)}
                >
                  {/* Column 1: Note info */}
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Selection Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center cursor-pointer transition-all flex-shrink-0 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      } ${
                        isSelected
                          ? "bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-400 text-white"
                          : "bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
                      }`}
                      onClick={(e) => handleCheckboxClick(e, note)}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>

                    {/* Banner Preview */}
                    <div className="w-10 h-8 rounded overflow-hidden flex-shrink-0">
                      {getBannerData(note) ? (
                        <div
                          className="w-full h-full"
                          style={getBannerStyle(note)}
                        >
                          <div className="w-full h-full bg-black/10"></div>
                        </div>
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 flex items-center justify-center">
                          <FileText className="w-3 h-3 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* Note title */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-lg text-gray-900 dark:text-white midnight:text-indigo-50 truncate">
                        {note?.title || "Untitled Note"}
                      </h3>
                    </div>
                  </div>

                  {/* Column 2: Created By */}
                  <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 midnight:text-indigo-200">
                    {note.users ? (
                      <>
                        {getProfilePicture(note.users.profile_picture) ? (
                          <div className="w-6 h-6 min-w-[24px] min-h-[24px] max-w-[24px] max-h-[24px] rounded-full overflow-hidden flex-shrink-0">
                            <img
                              src={getProfilePicture(
                                note.users.profile_picture
                              )}
                              alt={note.users.name || "User"}
                              className="w-6 h-6 min-w-[24px] min-h-[24px] max-w-[24px] max-h-[24px] object-cover block"
                              style={{ width: "24px", height: "24px" }}
                            />
                          </div>
                        ) : (
                          <div className="w-6 h-6 min-w-[24px] min-h-[24px] max-w-[24px] max-h-[24px] rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 dark:bg-indigo-900 midnight:bg-indigo-800 flex items-center justify-center">
                            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300 midnight:text-indigo-200">
                              {(note.users.name || "U")[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="truncate">
                          {note.users.name || "Unknown"}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-6 h-6 min-w-[24px] min-h-[24px] max-w-[24px] max-h-[24px] rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 dark:bg-indigo-900 midnight:bg-indigo-800 flex items-center justify-center">
                          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300 midnight:text-indigo-200">
                            U
                          </span>
                        </div>
                        <span className="truncate">Unknown User</span>
                      </>
                    )}
                  </div>

                  {/* Column 3: Date */}
                  <div className="hidden md:flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 midnight:text-indigo-200">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400 flex-shrink-0" />
                    <span className="whitespace-nowrap">
                      {sortByCreated
                        ? formatDate(note.createdAt || note.createdat)
                        : formatDate(note.updatedAt || note.updatedat)}
                    </span>
                  </div>

                  {/* Mobile view - Show essential info */}
                  <div className="md:hidden flex items-center gap-2 col-span-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-indigo-300">
                      {formatDate(note.updatedAt || note.updatedat)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto mb-3 opacity-40">
            <FileText className="w-full h-full text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-indigo-300">
            {isMyNotesFilterActive
              ? "You haven't created any notes yet."
              : "No notes to display"}
          </p>
        </div>
      )}
    </div>
  );
};

export default NoteListView;
