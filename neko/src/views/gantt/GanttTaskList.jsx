import { useState } from "react";
import {
  ArrowUpDown,
  Clock,
  AlertCircle,
  CheckCircle,
  Link2,
  User,
  Calendar,
} from "lucide-react";
import { formatDate, getProgressColor } from "./GanttUtils";

// Import profile pictures
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

// Priority Badge Component
const PriorityBadge = ({ priority }) => {
  const styles = {
    High: "bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 text-red-700 dark:text-red-400 midnight:text-red-300 border border-red-200 dark:border-red-800 midnight:border-red-900",
    Medium:
      "bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border border-amber-200 dark:border-amber-800 midnight:border-amber-900",
    Low: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900",
    default:
      "bg-gray-50 dark:bg-gray-900/10 midnight:bg-gray-900/5 text-gray-700 dark:text-gray-400 midnight:text-gray-500 border border-gray-200 dark:border-gray-800 midnight:border-gray-900",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${
        styles[priority] || styles.default
      }`}
    >
      {priority || "None"}
    </span>
  );
};

// Status Badge Component
const StatusBadge = ({ columnTitle, isCompletionColumn }) => {
  const getStatusColor = () => {
    if (isCompletionColumn) {
      return "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900";
    }
    return "bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/5 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-900";
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${getStatusColor()}`}
    >
      {columnTitle}
    </span>
  );
};

// Assignee Avatars Component with Profile Pictures
const AssigneeAvatars = ({
  assigneeIds,
  assigneeDetails,
  isLoadingAssignees,
  size = "small",
}) => {
  if (!assigneeIds || assigneeIds.length === 0) return null;

  const sizeClasses = size === "small" ? "w-5 h-5 text-xs" : "w-6 h-6 text-sm";

  // Profile picture mapping
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

  const getMemberInitial = (member) => {
    if (!member) return "U";

    const name = member.name || "";
    if (name) return name.charAt(0).toUpperCase();

    const email = member.email || "";
    if (email) return email.charAt(0).toUpperCase();

    return "U";
  };

  const ProfileImage = ({ member, sizeClasses }) => {
    const [imageLoadError, setImageLoadError] = useState(false);
    const profilePicture = getProfilePicture(member.profile_picture);

    const handleImageError = () => {
      setImageLoadError(true);
    };

    const handleImageLoad = () => {
      setImageLoadError(false);
    };

    return (
      <div
        className={`${sizeClasses} rounded-full border-2 border-white dark:border-gray-800 midnight:border-gray-900 
          flex items-center justify-center font-medium shadow-sm
          transition-transform duration-200 hover:scale-110 hover:z-10 overflow-hidden`}
        title={member.name || member.email || "Member"}
      >
        {profilePicture && !imageLoadError ? (
          <img
            src={profilePicture}
            alt={member.name || member.email || "Member"}
            className="w-full h-full object-cover"
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-medium">
            {getMemberInitial(member)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex -space-x-1">
      {isLoadingAssignees ? (
        <div
          className={`${sizeClasses} rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse`}
        ></div>
      ) : (
        <>
          {assigneeIds.slice(0, 3).map((assigneeId, index) => {
            const id =
              typeof assigneeId === "object" && assigneeId !== null
                ? assigneeId.id
                : assigneeId;
            const member = assigneeDetails[id];

            if (!member) return null;

            return (
              <ProfileImage
                key={id}
                member={member}
                sizeClasses={sizeClasses}
              />
            );
          })}

          {assigneeIds.length > 3 && (
            <div
              className={`${sizeClasses} rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 border-2 border-white dark:border-gray-800 midnight:border-gray-900 flex items-center justify-center text-gray-600 dark:text-gray-400 midnight:text-gray-500 font-medium shadow-sm`}
            >
              +{assigneeIds.length - 3}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Task List Header Component (extracted to be used separately)
export const GanttTaskListHeader = ({ cards, handleSort, sortConfig }) => {
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return (
        <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400 dark:text-gray-500 midnight:text-gray-600 transition-colors" />
      );
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUpDown className="w-3 h-3 ml-1 text-blue-500 dark:text-blue-400 midnight:text-blue-300 rotate-180 transition-all duration-200" />
    ) : (
      <ArrowUpDown className="w-3 h-3 ml-1 text-blue-500 dark:text-blue-400 midnight:text-blue-300 transition-all duration-200" />
    );
  };

  return (
    <div className="h-20 flex items-center justify-between px-4 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
      <button
        onClick={() => handleSort("title")}
        className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
      >
        Tasks ({cards.length}){getSortIcon("title")}
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSort("progress")}
          className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
        >
          Progress
          {getSortIcon("progress")}
        </button>
      </div>
    </div>
  );
};

const GanttTaskList = ({
  cards,
  assigneeDetails,
  isLoadingAssignees,
  setSelectedCard,
  renderHeaderOnly = false,
  handleSort,
  sortConfig,
}) => {
  // If only rendering header, return just the header component
  if (renderHeaderOnly) {
    return (
      <GanttTaskListHeader
        cards={cards}
        handleSort={handleSort}
        sortConfig={sortConfig}
      />
    );
  }

  return (
    <div className="w-80 flex-shrink-0">
      {/* Task List Content - No header, no separate scrolling */}
      <div className="p-0">
        {/* REMOVED: Empty state check - let the parent handle empty states */}
        <div className="space-y-0">
          {cards.map((card, index) => {
            // Enhanced zebra striping with better contrast matching the gantt grid
            const isEvenRow = index % 2 === 0;
            const zebraStripeClass = isEvenRow
              ? "bg-white dark:bg-gray-900 midnight:bg-gray-950"
              : "bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-900/80";

            return (
              <div
                key={`${card.id}-${index}`}
                className={`relative h-[140px] border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-800/20 cursor-pointer transition-all duration-200 group flex flex-col justify-between ${zebraStripeClass}`}
                onClick={() => {
                  const cardForModal = {
                    ...card,
                    startDate: card.originalStartDate || card.startDate,
                    endDate: card.originalEndDate || card.endDate,
                    dueDate: card.originalDueDate || card.dueDate,
                  };
                  setSelectedCard(cardForModal);
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center min-w-0 flex-1">
                    {/* Status icon */}
                    {card.progress === 100 || card.isCompletionColumn ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 midnight:text-emerald-500 mr-2 flex-shrink-0" />
                    ) : card.priority === "High" ? (
                      <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 midnight:text-red-500 mr-2 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mr-2 flex-shrink-0" />
                    )}

                    {/* Task title */}
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 midnight:group-hover:text-blue-300 transition-colors">
                      {card.title}
                    </h3>
                  </div>

                  {/* Priority badge */}
                  <div className="flex-shrink-0 ml-2">
                    <PriorityBadge priority={card.priority} />
                  </div>
                </div>

                <div className="space-y-2 flex-1">
                  {/* Status and Due Date */}
                  <div className="flex items-center justify-between text-xs">
                    <StatusBadge
                      columnTitle={card.columnTitle}
                      isCompletionColumn={card.isCompletionColumn}
                    />
                    <div className="flex items-center text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>{formatDate(card.dueDate)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                        Progress
                      </span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                        {card.progress || 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(
                          card.progress || 0
                        )}`}
                        style={{ width: `${card.progress || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom row - Assignees and Dependencies */}
                <div className="flex items-center justify-between mt-2">
                  {/* Administrator */}
                  <div className="flex items-center">
                    {card.administrator_id ? (
                      <div className="flex items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mr-2 flex items-center">
                          <User className="w-3 h-3 mr-1" />
                          Administrator
                        </span>
                        <AssigneeAvatars
                          assigneeIds={[card.administrator_id]} // Pass as array with single administrator
                          assigneeDetails={assigneeDetails}
                          isLoadingAssignees={isLoadingAssignees}
                          size="small"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600">
                        No administrator
                      </span>
                    )}
                  </div>

                  {/* Dependencies indicator */}
                  {card.dependencies && card.dependencies.length > 0 && (
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                      <Link2 className="w-3 h-3 mr-1" />
                      <span>{card.dependencies.length}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GanttTaskList;
