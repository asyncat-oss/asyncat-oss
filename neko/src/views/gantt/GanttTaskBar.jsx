import { useState } from "react";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowLeft,
  ArrowRight,
  Search,
} from "lucide-react";

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

// Assignee Avatars Component with Profile Pictures
const AssigneeAvatars = ({ assigneeIds, assigneeDetails, size = "small" }) => {
  // React hooks must be called first, before any conditions or early returns
  const [imageLoadError, setImageLoadError] = useState(false);

  if (!assigneeIds || assigneeIds.length === 0) return null;

  const sizeClasses = size === "small" ? "w-4 h-4 text-xs" : "w-5 h-5 text-sm";

  // Profile picture mapping (keep existing)
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

  const handleImageError = () => {
    setImageLoadError(true);
  };

  const handleImageLoad = () => {
    setImageLoadError(false);
  };

  return (
    <div className="flex -space-x-1">
      {assigneeIds.slice(0, 3).map((assigneeId) => {
        const id =
          typeof assigneeId === "object" && assigneeId !== null
            ? assigneeId.id
            : assigneeId;
        const member = assigneeDetails[id];

        if (!member) return null;

        const profilePicture = getProfilePicture(member.profile_picture);

        return (
          <div
            key={id}
            className={`${sizeClasses} rounded-full border border-white/50 
              transition-transform duration-200 hover:scale-110 backdrop-blur-sm overflow-hidden`}
            title={member.name || member.email || "Assignee"}
          >
            {profilePicture && !imageLoadError ? (
              <img
                src={profilePicture}
                alt={member.name || "Assignee"}
                className="w-full h-full object-cover"
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            ) : (
              <div
                className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 
                  text-gray-600 dark:text-gray-300 midnight:text-gray-400 
                  flex items-center justify-center font-medium"
              >
                {getMemberInitial(member)}
              </div>
            )}
          </div>
        );
      })}
      
      {assigneeIds.length > 3 && (
        <div
          className={`${sizeClasses} rounded-full border border-white/50 
            bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 
            text-gray-600 dark:text-gray-300 midnight:text-gray-400 
            flex items-center justify-center font-medium backdrop-blur-sm`}
          title={`+${assigneeIds.length - 3} more assignees`}
        >
          +{assigneeIds.length - 3}
        </div>
      )}
    </div>
  );
};

// Out of Range Indicator Component
const OutOfRangeIndicator = ({ card, taskBar, setSelectedCard, position }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();

    const cardForModal = {
      ...card,
      startDate: card.originalStartDate || card.startDate,
      endDate: card.originalEndDate || card.endDate,
      dueDate: card.originalDueDate || card.dueDate,
    };

    setSelectedCard(cardForModal);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year:
        new Date(date).getFullYear() !== new Date().getFullYear()
          ? "numeric"
          : undefined,
    });
  };

  const positionIcon = position === "before" ? ArrowLeft : ArrowRight;
  const PositionIcon = positionIcon;

  return (
    <div
      className={`absolute top-1/2 transform -translate-y-1/2 h-8 ${
        taskBar.bgColor
      } ${taskBar.borderColor} 
        cursor-pointer transition-all duration-200 hover:shadow-md rounded-sm
        ${
          isHovered ? "shadow-lg scale-110" : "shadow-sm"
        } border-2 border-dashed
      `}
      style={taskBar.style}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${card.title} (${formatDate(
        card.originalStartDate || card.startDate
      )} - ${formatDate(
        card.originalEndDate || card.endDate
      )}) - Outside current view`}
    >
      {/* Background with pattern */}
      <div className="absolute inset-0 bg-white/20 pointer-events-none opacity-80" />

      {/* Position indicator */}
      <div className="relative h-full flex items-center justify-center">
        <PositionIcon className="w-3 h-3 text-white drop-shadow-sm animate-pulse" />
        <Search className="w-2 h-2 text-white/80 absolute -top-1 -right-1" />
      </div>

      {/* Hover tooltip */}
      {isHovered && (
        <div
          className={`absolute ${
            position === "before" ? "left-full ml-2" : "right-full mr-2"
          } top-1/2 transform -translate-y-1/2 
          bg-gray-900 dark:bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg`}
        >
          <div className="font-semibold">{card.title}</div>
          <div className="text-gray-300">
            {formatDate(card.originalStartDate || card.startDate)} -{" "}
            {formatDate(card.originalEndDate || card.endDate)}
          </div>
          <div className="text-yellow-300 text-xs">Click to view details</div>
        </div>
      )}
    </div>
  );
};

const GanttTaskBar = ({
  card,
  taskBar,
  setSelectedCard,
  assigneeDetails,
  isSearchResult = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Handle out-of-range search results
  if (taskBar.isOutOfRange && taskBar.isSearchResult) {
    return (
      <OutOfRangeIndicator
        card={card}
        taskBar={taskBar}
        setSelectedCard={setSelectedCard}
        position={taskBar.indicatorPosition}
      />
    );
  }

  // Handle click to view details
  const handleClick = (e) => {
    e.stopPropagation();

    // Create a card object with original dates for the modal
    const cardForModal = {
      ...card,
      startDate: card.originalStartDate || card.startDate,
      endDate: card.originalEndDate || card.endDate,
      dueDate: card.originalDueDate || card.dueDate,
    };

    setSelectedCard(cardForModal);
  };

  // Format date range for tooltip
  const formatDateRange = () => {
    const start = card.originalStartDate || card.startDate;
    const end = card.originalEndDate || card.endDate;

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year:
          new Date(date).getFullYear() !== new Date().getFullYear()
            ? "numeric"
            : undefined,
      });
    };

    const startStr = formatDate(start);
    const endStr = formatDate(end);

    // Convert to Date objects before comparing
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate.toDateString() === endDate.toDateString()) {
      return startStr;
    }
    return `${startStr} → ${endStr}`;
  };

  // Show task duration in days
  const getTaskDuration = () => {
    const start = new Date(card.originalStartDate || card.startDate);
    const end = new Date(card.originalEndDate || card.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays === 1 ? "1 day" : `${diffDays} days`;
  };

  return (
    <div
      id={`task-bar-${card.id}`}
      className={`absolute top-1/2 transform -translate-y-1/2 h-8 border ${
        taskBar.borderColor
      } ${taskBar.bgColor} 
        cursor-pointer transition-all duration-200 hover:shadow-md
        ${isHovered ? "shadow-lg" : "shadow-sm"}
        ${isSearchResult ? "ring-2 ring-yellow-400/50 ring-offset-1" : ""}
      `}
      style={{
        ...taskBar.style,
        borderRadius: "0px", // Remove border radius for perfect edge-to-edge fit
        margin: "0", // Remove any margins or padding that might cause gaps
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${card.title} (${formatDateRange()}) - ${getTaskDuration()}${
        taskBar.isClippedStart || taskBar.isClippedEnd
          ? " - Extends beyond visible period"
          : ""
      }${isSearchResult ? " - Search Result" : ""}`}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      {/* Search result indicator */}
      {isSearchResult && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 border border-white rounded-full shadow-sm">
          <Search className="w-1.5 h-1.5 text-gray-800 absolute top-0.5 left-0.5" />
        </div>
      )}

      {/* Task content */}
      <div
        className={`relative h-full flex items-center justify-between px-2 ${
          taskBar.isClippedStart ? "pl-4" : ""
        } ${taskBar.isClippedEnd ? "pr-4" : ""}`}
      >
        <div className="flex items-center min-w-0 flex-1">
          {/* Status icon */}
          <div className="flex-shrink-0 mr-2">
            {card.progress === 100 || card.isCompletionColumn ? (
              <CheckCircle className="w-4 h-4 text-white/90 drop-shadow-sm" />
            ) : card.priority === "High" ? (
              <AlertCircle className="w-4 h-4 text-white/90 drop-shadow-sm animate-pulse" />
            ) : (
              <Clock className="w-4 h-4 text-white/90 drop-shadow-sm" />
            )}
          </div>

          {/* Task title */}
          <span className="text-sm font-semibold text-white truncate drop-shadow-sm">
            {card.title}
          </span>
        </div>

        {/* Right side content */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Subtask assignees avatars */}
          {(() => {
            // Collect all unique subtask assignees
            const subtaskAssignees = new Set();
            if (card.checklist && Array.isArray(card.checklist)) {
              card.checklist.forEach((subtask) => {
                if (subtask.assignees && Array.isArray(subtask.assignees)) {
                  subtask.assignees.forEach((assignee) => {
                    const assigneeId = typeof assignee === "object" ? assignee.id : assignee;
                    if (assigneeId) {
                      subtaskAssignees.add(assigneeId);
                    }
                  });
                }
              });
            }
            
            const uniqueAssigneeIds = Array.from(subtaskAssignees);
            
            return uniqueAssigneeIds.length > 0 ? (
              <AssigneeAvatars
                assigneeIds={uniqueAssigneeIds}
                assigneeDetails={assigneeDetails}
                size="small"
              />
            ) : null;
          })()}

          {/* Progress percentage - show on hover */}
          {isHovered && (
            <span className="text-xs font-medium text-white/80 bg-black/20 px-1.5 py-0.5 rounded">
              {card.progress || 0}%
            </span>
          )}
        </div>
      </div>

      {/* Dependencies indicator */}
      {card.dependencies && card.dependencies.length > 0 && (
        <div className="absolute -left-1 top-1/2 transform -translate-y-1/2">
          <div className="w-2 h-2 rounded-full bg-yellow-400 border border-white shadow-sm animate-pulse" />
        </div>
      )}

      {/* Hover effects */}
      {isHovered && (
        <div className="absolute inset-0 bg-white/5 pointer-events-none" />
      )}
    </div>
  );
};

export default GanttTaskBar;
