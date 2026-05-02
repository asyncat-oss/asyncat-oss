import { useState } from "react";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowLeft,
  ArrowRight,
  Search,
} from "lucide-react";

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
