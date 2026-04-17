import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  Check,
  X,
  Edit,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
  SquareX,
  CircleX,
  CirclePlus,
  SquareCheck,
  Loader,
} from "lucide-react";
import { useUser } from "../../../../../contexts/UserContext";
import catDP from "../../../../../assets/dp/CAT.webp";
import dogDP from "../../../../../assets/dp/DOG.webp";
import dolphinDP from "../../../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../../../assets/dp/FOX.webp";
import lionDP from "../../../../../assets/dp/LION.webp";
import owlDP from "../../../../../assets/dp/OWL.webp";
import penguinDP from "../../../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../../../assets/dp/WOLF.webp";

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

  if (profilePicId.startsWith("https://")) {
    return profilePicId;
  }

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

const SubtaskAssigneeAvatar = ({ member, size = "small", showName = true }) => {
  const [imageLoadError, setImageLoadError] = useState(false);

  if (!member) return null;

  const sizeClasses = size === "small" ? "w-4 h-4" : "w-5 h-5";
  const profilePicture = getProfilePicture(member.profile_picture);

  const handleImageError = () => setImageLoadError(true);
  const handleImageLoad = () => setImageLoadError(false);

  return (
    <div className="flex items-center">
      <div
        className={`${sizeClasses} rounded-full border border-white dark:border-gray-700 midnight:border-gray-800 
          flex items-center justify-center overflow-hidden transition-transform duration-200 hover:scale-110 mr-1 flex-shrink-0`}
        title={member.name || member.email || "Assignee"}
      >
        {profilePicture && !imageLoadError ? (
          <img
            src={profilePicture}
            alt={member.name || member.email || "Assignee"}
            className="w-full h-full object-cover"
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-medium text-xs">
            {getMemberInitial(member)}
          </div>
        )}
      </div>
      {showName && (
        <span className="truncate">
          {member.name || member.email || "Unknown"}
        </span>
      )}
    </div>
  );
};

// Enhanced Task Creation Form Component
const EnhancedTaskCreationForm = ({
  onAddTask,
  projectMembers = [],
  isLoadingMembers = false,
  disabled = false,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
}) => {
  const [taskText, setTaskText] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [duration, setDuration] = useState({ hours: 0, minutes: 0 });
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    positioning: "fixed",
  });
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState("");

  const textInputRef = useRef(null);
  const modalRef = useRef(null);
  const containerRef = useRef(null);

  // Notify parent about unsaved text changes
  useEffect(() => {
    if (onUnsavedTextChange) {
      onUnsavedTextChange(taskText.trim().length > 0);
    }
  }, [taskText, onUnsavedTextChange]);

  // Calculate modal position when showing
  const calculateModalPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const modalWidth = Math.max(400, rect.width);

      // Always position directly below the input container
      const top = rect.bottom + 8;
      let left = rect.left;

      // Ensure modal doesn't overflow horizontally
      if (left + modalWidth > viewportWidth - 20) {
        left = viewportWidth - modalWidth - 20;
      }
      if (left < 20) left = 20;

      setModalPosition({
        top,
        left,
        width: modalWidth,
        positioning: "fixed",
      });
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    setShowModal(true);
    calculateModalPosition();
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target) &&
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setShowModal(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle window resize and scroll
  useEffect(() => {
    const handleResize = () => {
      if (showModal) {
        calculateModalPosition();
      }
    };

    const handleScroll = () => {
      if (showModal) {
        calculateModalPosition();
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true); // Use capture to catch all scroll events
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [showModal]);

  const handleAddTask = () => {
    if (!taskText.trim() || disabled) return;

    const totalMinutes = duration.hours * 60 + duration.minutes;

    const newTask = {
      id: Date.now(),
      text: taskText.trim(),
      completed: false,
      assignees: selectedAssignees,
      duration: totalMinutes > 0 ? totalMinutes : null,
    };

    // Close modal immediately to provide immediate feedback
    setShowModal(false);

    // Blur the input to prevent modal from reopening immediately
    if (textInputRef.current) {
      textInputRef.current.blur();
    }

    onAddTask(newTask);

    // Reset form
    setTaskText("");
    setSelectedAssignees([]);
    setDuration({ hours: 0, minutes: 0 });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
    if (e.key === "Escape") {
      setShowModal(false);
    }
  };

  const toggleAssignee = (memberId) => {
    setSelectedAssignees((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const removeAssignee = (memberId) => {
    setSelectedAssignees((prev) => prev.filter((id) => id !== memberId));
  };

  const formatDuration = () => {
    const { hours, minutes } = duration;
    if (hours === 0 && minutes === 0) return "";

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(" ");
  };

  const getMemberInitial = (member) => {
    if (member.name) {
      return member.name.charAt(0).toUpperCase();
    }
    if (member.email) {
      return member.email.charAt(0).toUpperCase();
    }
    return "?";
  };

  const getProfilePictureForAssignee = (profilePicId) => {
    if (!profilePicId) return null;

    // Check if it's a custom uploaded image (URL starts with https://)
    if (profilePicId.startsWith("https://")) {
      return profilePicId;
    }

    // Handle predefined avatars using the global profilePictureMap
    if (profilePictureMap[profilePicId]) {
      return profilePictureMap[profilePicId];
    }

    // For other custom images, construct URL
    if (profilePicId.startsWith("http")) return profilePicId;
    return `${import.meta.env.VITE_MAIN_URL}${profilePicId}`;
  };

  return (
    <div className="relative">
      {/* Main Input */}
      <div
        ref={containerRef}
        className="flex items-center space-x-2 p-3 border rounded-lg transition-all duration-200 border-gray-200 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600"
      >
        <input
          ref={textInputRef}
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder={
            false ? "Complete dependencies to add subtasks" : "Add a subtask..."
          }
          disabled={disabled}
          className={`flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-indigo-100 placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-500 ${
            false ? "cursor-not-allowed opacity-60" : ""
          }`}
        />

        {/* Summary indicators */}
        <div className="flex items-center space-x-2 text-sm">
          {selectedAssignees.length > 0 && (
            <div className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500">
              <Users className="w-4 h-4" />
              <span>{selectedAssignees.length}</span>
            </div>
          )}
          {formatDuration() && (
            <div className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500">
              <Clock className="w-4 h-4" />
              <span>{formatDuration()}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddTask}
          disabled={!taskText.trim() || disabled}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors ${
            !taskText.trim() || disabled
              ? "text-gray-300 dark:text-gray-600 midnight:text-gray-700 cursor-not-allowed"
              : taskText.trim().length > 0
              ? shouldBounceSaveAll
                ? "text-red-500 dark:text-red-400 midnight:text-red-400 animate-bounce"
                : "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 midnight:hover:text-indigo-300"
              : "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 midnight:hover:text-indigo-300"
          }`}
          title={
            false ? "Cannot add subtasks until all dependencies are met" : ""
          }
        >
          <CirclePlus className="w-5 h-5" />
          <span className="text-sm font-medium">Add Subtask</span>
        </button>
      </div>

      {/* Enhanced Modal */}
      {showModal &&
        createPortal(
          <div
            ref={modalRef}
            className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg shadow-lg flex flex-col"
            style={{
              top: modalPosition.top,
              left: modalPosition.left,
              width: modalPosition.width,
              minWidth: "400px",
              maxHeight: `${Math.max(
                200,
                window.innerHeight - modalPosition.top - 20
              )}px`,
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
                Subtask Details
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSelectedAssignees([]);
                    setDuration({ hours: 0, minutes: 0 });
                    setAssigneeSearchTerm("");
                  }}
                  className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-red-900 text-black dark:text-red-400 midnight:text-red-300 text-xs font-medium flex items-center gap-1.5"
                >
                  <SquareX className="w-3 h-3" />
                  Clear
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-y-auto min-h-0 overscroll-contain">
              <div className="grid grid-cols-2 gap-4">
                {/* Left Side - Assignees */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                      Assignees
                    </h4>
                  </div>

                  {/* Search Input */}
                  <div>
                    <input
                      type="text"
                      placeholder="Search assignees..."
                      value={assigneeSearchTerm}
                      onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  {/* Selected Assignees */}
                  {selectedAssignees.length > 0 && (
                    <div className="space-y-2">
                      {selectedAssignees.map((assigneeId) => {
                        const member = projectMembers.find(
                          (m) => m.id === assigneeId
                        );
                        if (!member) return null;

                        const profilePicture = getProfilePictureForAssignee(
                          member.profile_picture
                        );

                        return (
                          <div
                            key={assigneeId}
                            className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-md"
                          >
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                {profilePicture ? (
                                  <img
                                    src={profilePicture}
                                    alt={member.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-medium">
                                    {getMemberInitial(member)}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                                {member.name}
                              </span>
                            </div>
                            <button
                              onClick={() => removeAssignee(assigneeId)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Available Members */}
                  <div className="space-y-1 max-h-32 overflow-y-auto overscroll-contain">
                    {projectMembers
                      .filter(
                        (member) =>
                          !selectedAssignees.includes(member.id) &&
                          (member.name
                            ?.toLowerCase()
                            .includes(assigneeSearchTerm.toLowerCase()) ||
                            member.email
                              ?.toLowerCase()
                              .includes(assigneeSearchTerm.toLowerCase()))
                      )
                      .map((member) => {
                        const profilePicture = getProfilePictureForAssignee(
                          member.profile_picture
                        );

                        return (
                          <button
                            key={member.id}
                            onClick={() => toggleAssignee(member.id)}
                            className="w-full flex items-center space-x-2 p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-md transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                              {profilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={member.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-medium">
                                  {getMemberInitial(member)}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 truncate">
                                {member.name}
                              </div>
                              <div className="text-xs text-gray-500 midnight:text-gray-500 truncate">
                                {member.email}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    {projectMembers.filter(
                      (member) =>
                        !selectedAssignees.includes(member.id) &&
                        (member.name
                          ?.toLowerCase()
                          .includes(assigneeSearchTerm.toLowerCase()) ||
                          member.email
                            ?.toLowerCase()
                            .includes(assigneeSearchTerm.toLowerCase()))
                    ).length === 0 &&
                      assigneeSearchTerm && (
                        <div className="text-sm text-gray-500 midnight:text-gray-500 text-center py-2">
                          No members found matching &quot;{assigneeSearchTerm}
                          &quot;
                        </div>
                      )}
                  </div>

                  {isLoadingMembers && (
                    <div className="text-sm text-gray-500 midnight:text-gray-500 text-center py-2">
                      Loading members...
                    </div>
                  )}
                </div>

                {/* Right Side - Duration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                        Estimated Duration
                      </h4>
                    </div>
                    {formatDuration() && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300">
                        Total: {formatDuration()}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Duration Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                          Hours
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={duration.hours}
                            onChange={(e) =>
                              setDuration((prev) => ({
                                ...prev,
                                hours: Math.max(
                                  0,
                                  parseInt(e.target.value) || 0
                                ),
                              }))
                            }
                            className="w-full px-2 py-1.5 pr-6 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              type="button"
                              onClick={() =>
                                setDuration((prev) => ({
                                  ...prev,
                                  hours: Math.min(23, prev.hours + 1),
                                }))
                              }
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDuration((prev) => ({
                                  ...prev,
                                  hours: Math.max(0, prev.hours - 1),
                                }))
                              }
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                          Minutes
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={duration.minutes}
                            onChange={(e) =>
                              setDuration((prev) => ({
                                ...prev,
                                minutes: Math.max(
                                  0,
                                  parseInt(e.target.value) || 0
                                ),
                              }))
                            }
                            className="w-full px-2 py-1.5 pr-6 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              type="button"
                              onClick={() =>
                                setDuration((prev) => ({
                                  ...prev,
                                  minutes: Math.min(59, prev.minutes + 1),
                                }))
                              }
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDuration((prev) => ({
                                  ...prev,
                                  minutes: Math.max(0, prev.minutes - 1),
                                }))
                              }
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Duration Buttons */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                        Quick Options
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                        {[
                          {
                            label: "30m",
                            hours: 0,
                            minutes: 30,
                          },
                          {
                            label: "1h",
                            hours: 1,
                            minutes: 0,
                          },
                          {
                            label: "2h",
                            hours: 2,
                            minutes: 0,
                          },
                          {
                            label: "4h",
                            hours: 4,
                            minutes: 0,
                          },
                        ].map((option) => (
                          <button
                            key={option.label}
                            onClick={() =>
                              setDuration({
                                hours: option.hours,
                                minutes: option.minutes,
                              })
                            }
                            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

// Improved collapsible text component with natural word wrapping
const CollapsibleTaskText = ({ text, maxLength = 100, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const textRef = useRef(null);

  // Check if text exceeds maxLength
  const needsCollapsing = text?.length > maxLength;

  // Get truncated text with ellipsis
  const truncatedText = needsCollapsing
    ? `${text.substring(0, maxLength)}...`
    : text;

  // Toggle expanded state
  const toggleExpand = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative">
      {/* When expanded, we use natural line wrapping without hyphens */}
      <div
        ref={textRef}
        className={`text-sm break-words ${className} 
          ${!isExpanded && needsCollapsing ? "line-clamp-2" : ""}`}
        style={{
          wordWrap: "break-word", // Legacy property for compatibility
          overflowWrap: "break-word", // Modern property for word wrapping
          wordBreak: "normal", // Use natural word breaks
          whiteSpace: "normal", // Allow normal whitespace handling
          ...(isExpanded ? { maxWidth: "100%" } : {}),
        }}
      >
        {isExpanded ? text : truncatedText}
      </div>

      {needsCollapsing && (
        <button
          type="button"
          onClick={toggleExpand}
          className="mt-1 text-xs flex items-center text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 midnight:hover:text-indigo-300 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              <span>Show more</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

// Duration Display Component
const DurationDisplay = ({ duration, className = "" }) => {
  if (
    !duration ||
    duration === 0 ||
    duration === "0" ||
    parseInt(duration) <= 0
  ) {
    return null;
  }

  const durationNum = parseInt(duration || 0);
  if (!duration || durationNum <= 0 || isNaN(durationNum)) return null;

  const hours = Math.floor(durationNum / 60);
  const minutes = durationNum % 60;

  let displayText = "";
  if (hours > 0 && minutes > 0) {
    displayText = `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    displayText = `${hours}h`;
  } else {
    displayText = `${minutes}m`;
  }

  return (
    <div
      className={`flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300 ${className}`}
    >
      <Clock className="w-3 h-3" />
      <span>{displayText}</span>
    </div>
  );
};

// Unified Subtask Edit Modal Component
const UnifiedSubtaskEditModal = ({
  task,
  onUpdate,
  onClose,
  coordinates,
  projectMembers = [],
  onAssigneeChange,
}) => {
  const [duration, setDuration] = useState({ hours: 0, minutes: 0 });
  const [selectedAssignees, setSelectedAssignees] = useState(
    task.assignees || []
  );
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (task.duration) {
      const totalMinutes = parseInt(task.duration) || 0;
      setDuration({
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
      });
    }
  }, [task.duration]);

  const handleConfirm = () => {
    const totalMinutes = duration.hours * 60 + duration.minutes;
    const updatedTask = {
      ...task,
      duration: totalMinutes > 0 ? totalMinutes : null,
      assignees: selectedAssignees,
    };

    // Only update local state, don't save to backend
    onUpdate(updatedTask);

    if (onAssigneeChange) {
      onAssigneeChange(task.id, selectedAssignees);
    }

    onClose();
  };

  const formatDuration = () => {
    const { hours, minutes } = duration;
    if (hours === 0 && minutes === 0) return "";

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(" ");
  };

  const toggleAssignee = (memberId) => {
    setSelectedAssignees((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const removeAssignee = (memberId) => {
    setSelectedAssignees((prev) => prev.filter((id) => id !== memberId));
  };

  const getMemberInitial = (member) => {
    if (member.name) {
      return member.name.charAt(0).toUpperCase();
    }
    if (member.email) {
      return member.email.charAt(0).toUpperCase();
    }
    return "?";
  };

  const getProfilePictureForAssignee = (profilePicId) => {
    if (!profilePicId) return null;

    if (profilePicId.startsWith("https://")) {
      return profilePicId;
    }

    if (profilePictureMap[profilePicId]) {
      return profilePictureMap[profilePicId];
    }

    if (profilePicId.startsWith("http")) return profilePicId;
    return `${import.meta.env.VITE_MAIN_URL}${profilePicId}`;
  };

  return (
    <div
      ref={modalRef}
      data-unified-subtask-modal="true"
      className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg shadow-lg flex flex-col"
      style={{
        top: coordinates.top,
        left: coordinates.left,
        width: "420px",
        maxHeight: `${Math.max(
          200,
          window.innerHeight - coordinates.top - 20
        )}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
          Subtask Details
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
        {/* Assignees Section */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Users className="w-3 h-3 text-gray-500" />
            <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
              Assignees
            </h4>
          </div>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Search assignees..."
            value={assigneeSearchTerm}
            onChange={(e) => setAssigneeSearchTerm(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {/* Selected Assignees */}
          {selectedAssignees.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                Selected ({selectedAssignees.length})
              </div>
              <div className="space-y-1 max-h-20 overflow-y-auto overscroll-contain">
                {selectedAssignees.map((assigneeId) => {
                  const member = projectMembers.find(
                    (m) => m.id === assigneeId
                  );
                  if (!member) return null;

                  const profilePicture = getProfilePictureForAssignee(
                    member.profile_picture
                  );

                  return (
                    <div
                      key={assigneeId}
                      className="flex items-center justify-between p-1.5 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-md"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                          {profilePicture ? (
                            <img
                              src={profilePicture}
                              alt={member.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-medium">
                              {getMemberInitial(member)}
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                          {member.name}
                        </span>
                      </div>
                      <button
                        onClick={() => removeAssignee(assigneeId)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Members */}
          <div className="space-y-1 max-h-32 overflow-y-auto overscroll-contain">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
              Available Members
            </div>
            {projectMembers
              .filter(
                (member) =>
                  !selectedAssignees.includes(member.id) &&
                  (member.name
                    ?.toLowerCase()
                    .includes(assigneeSearchTerm.toLowerCase()) ||
                    member.email
                      ?.toLowerCase()
                      .includes(assigneeSearchTerm.toLowerCase()))
              )
              .map((member) => {
                const profilePicture = getProfilePictureForAssignee(
                  member.profile_picture
                );

                return (
                  <button
                    key={member.id}
                    onClick={() => toggleAssignee(member.id)}
                    className="w-full flex items-center space-x-2 p-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                      {profilePicture ? (
                        <img
                          src={profilePicture}
                          alt={member.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-medium">
                          {getMemberInitial(member)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 truncate">
                        {member.name}
                      </div>
                      <div className="text-xs text-gray-500 midnight:text-gray-500 truncate">
                        {member.email}
                      </div>
                    </div>
                  </button>
                );
              })}
            {projectMembers.filter(
              (member) =>
                !selectedAssignees.includes(member.id) &&
                (member.name
                  ?.toLowerCase()
                  .includes(assigneeSearchTerm.toLowerCase()) ||
                  member.email
                    ?.toLowerCase()
                    .includes(assigneeSearchTerm.toLowerCase()))
            ).length === 0 &&
              assigneeSearchTerm && (
                <div className="text-sm text-gray-500 midnight:text-gray-500 text-center py-2">
                  No members found matching &quot;
                  {assigneeSearchTerm}&quot;
                </div>
              )}
          </div>
        </div>

        {/* Duration Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-3 h-3 text-gray-500" />
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                Estimated Duration
              </h4>
            </div>
            {formatDuration() && (
              <div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300">
                Total: {formatDuration()}
              </div>
            )}
          </div>

          {/* Duration Inputs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                Hours
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={duration.hours}
                  onChange={(e) =>
                    setDuration((prev) => ({
                      ...prev,
                      hours: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2 py-1.5 pr-6 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                  <button
                    type="button"
                    onClick={() =>
                      setDuration((prev) => ({
                        ...prev,
                        hours: Math.min(23, prev.hours + 1),
                      }))
                    }
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDuration((prev) => ({
                        ...prev,
                        hours: Math.max(0, prev.hours - 1),
                      }))
                    }
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                Minutes
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={duration.minutes}
                  onChange={(e) =>
                    setDuration((prev) => ({
                      ...prev,
                      minutes: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2 py-1.5 pr-6 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                  <button
                    type="button"
                    onClick={() =>
                      setDuration((prev) => ({
                        ...prev,
                        minutes: Math.min(59, prev.minutes + 1),
                      }))
                    }
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDuration((prev) => ({
                        ...prev,
                        minutes: Math.max(0, prev.minutes - 1),
                      }))
                    }
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Duration Buttons */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
              Quick Options
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "30m", hours: 0, minutes: 30 },
                { label: "1h", hours: 1, minutes: 0 },
                { label: "2h", hours: 2, minutes: 0 },
                { label: "4h", hours: 4, minutes: 0 },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() =>
                    setDuration({
                      hours: option.hours,
                      minutes: option.minutes,
                    })
                  }
                  className="px-1.5 py-1 text-xs border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 midnight:text-gray-400"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
        <button
          onClick={() => {
            setTaskText(task.text || "");
            setDuration({ hours: 0, minutes: 0 });
            setSelectedAssignees([]);
            setAssigneeSearchTerm("");
          }}
          className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-blue-900 text-black dark:text-blue-400 midnight:text-blue-300 text-xs font-medium flex items-center gap-1.5"
        >
          <SquareX className="w-3 h-3" />
          Clear
        </button>
        <div className="flex space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-red-900 text-black dark:text-red-400 midnight:text-red-300 text-xs font-medium flex items-center gap-1.5"
          >
            <CircleX className="w-3 h-3" />
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-indigo-300 text-xs font-medium flex items-center gap-1.5"
          >
            <SquareCheck className="w-3 h-3" />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const TaskChecklist = ({
  tasks = [],
  onUpdate,
  readOnly = false,
  projectMembers = [],
  isLoadingMembers = false,
  onAssigneeChange,
  showAddInput = true,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
  disableCompletion = false, // New prop to disable only task completion
  positioningConfig = {
    preferredPosition: "auto",
    modalSelector: null,
    forcePosition: false,
    offsetAdjustment: { top: 2, right: 0 },
    avoidElements: [],
  },
}) => {
  const { userId } = useUser();
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskText, setEditTaskText] = useState("");
  const editInputRef = useRef(null);
  const taskListRef = useRef(null);
  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);
  const [currentEditTask, setCurrentEditTask] = useState(null);
  const [unifiedModalCoordinates, setUnifiedModalCoordinates] = useState({
    top: 0,
    left: 0,
  });

  // Focus the edit input when editing starts
  useEffect(() => {
    if (editingTaskId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTaskId]);

  // Add click outside handler for modals
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showDurationEditor &&
        !event.target.closest("[data-duration-editor]")
      ) {
        setShowDurationEditor(false);
      }

      if (
        showUnifiedModal &&
        !event.target.closest("[data-unified-subtask-modal]")
      ) {
        setShowUnifiedModal(false);
        setCurrentEditTask(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDurationEditor, showUnifiedModal]);

  const handleEnhancedAddTask = (newTaskObj) => {
    if (readOnly) return;
    onUpdate([...tasks, newTaskObj]);
  };

  // Helper function to check if current user can toggle a subtask
  const canUserToggleSubtask = (task) => {
    // If subtask has no assignees, anyone can toggle it
    if (!task.assignees || task.assignees.length === 0) {
      return true;
    }
    // Check if current user is one of the assignees
    return task.assignees.includes(userId);
  };

  const handleToggleTask = (taskId) => {
    if (readOnly || disableCompletion) return;

    // Prevent completing subtasks if dependencies are not met
    const task = tasks.find((t) => t.id === taskId);
    if (task && !task.completed && false) {
      // Don't allow completing subtasks when dependencies are unmet
      return;
    }

    // Only allow assignees to toggle subtask completion
    if (task && !canUserToggleSubtask(task)) {
      return;
    }

    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );

    onUpdate(updatedTasks);
  };

  const handleDeleteTask = (taskId) => {
    if (readOnly) return;

    // Prevent deleting subtasks if dependencies are not met
    if (false) {
      return;
    }

    const updatedTasks = tasks.filter((task) => task.id !== taskId);
    onUpdate(updatedTasks);
  };

  const handleEditKeyDown = (e, task) => {
    if (e.key === "Enter") {
      handleSaveEdit(task.id);
    } else if (e.key === "Escape") {
      setEditingTaskId(null);
      setEditTaskText(""); // Reset the edit text
    }
  };

  const handleRemoveAssignee = (taskId, assigneeIdToRemove) => {
    if (readOnly || false) return;

    // Prevent removing assignees from completed subtasks
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.completed) return;

    const updatedTasks = tasks.map((task) => {
      if (task.id === taskId) {
        const currentAssignees = task.assignees || [];
        const newAssignees = currentAssignees.filter(
          (id) => id !== assigneeIdToRemove
        );
        return { ...task, assignees: newAssignees };
      }
      return task;
    });

    onUpdate(updatedTasks);

    if (onAssigneeChange) {
      onAssigneeChange(
        taskId,
        updatedTasks.find((t) => t.id === taskId)?.assignees || []
      );
    }
  };

  const handleSaveEdit = (taskId) => {
    if (!editTaskText.trim() || readOnly || false) return;

    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, text: editTaskText.trim() } : task
    );

    onUpdate(updatedTasks);
    setEditingTaskId(null);
  };

  const handleOpenUnifiedModal = (task, event) => {
    if (readOnly || task.completed) return;

    // Get button position relative to viewport
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate modal position - more compact size
    const modalWidth = 420;
    const modalHeight = 480;

    // Check if we're inside AddCardModal vs CardDetailModal
    const isInAddCardModal =
      event.currentTarget.closest('[class*="max-w-3xl"]') !== null ||
      event.currentTarget.closest(".fixed") !== null ||
      event.currentTarget.closest('[role="dialog"]') !== null;

    const { top: topOffset, right: rightOffset } =
      positioningConfig.offsetAdjustment;

    let top, left;

    if (isInAddCardModal) {
      // For AddCardModal - simpler, more reliable positioning

      // Always position below the button
      top = buttonRect.bottom + 2 + topOffset;
      left = buttonRect.left - rightOffset;

      // If there's enough space to the right, position there instead
      if (buttonRect.right + modalWidth + 20 < viewportWidth) {
        left = buttonRect.right + 12;
        top = buttonRect.top - 20;
      }
    } else {
      // For CardDetailModal - always position below the button
      top = buttonRect.bottom + 8;
      left = buttonRect.right - modalWidth + rightOffset;
    }

    // Ensure modal stays within viewport horizontally
    if (left + modalWidth > viewportWidth - 20) {
      left = viewportWidth - modalWidth - 20;
    }
    if (left < 20) left = 20;

    setUnifiedModalCoordinates({ top, left });
    setCurrentEditTask(task);
    setShowUnifiedModal(true);
  };

  const handleUnifiedTaskUpdate = async (updatedTask) => {
    if (readOnly) return;

    const updatedTasks = tasks.map((task) =>
      task.id === updatedTask.id ? updatedTask : task
    );

    // Update local state only, don't trigger immediate save
    onUpdate(updatedTasks, false); // Pass false to indicate no immediate save needed
  };

  const findMemberById = (memberId) => {
    // First check if member is in project members
    const projectMember = projectMembers.find(
      (member) => member.id === memberId
    );
    if (projectMember) return projectMember;

    // If not found in project members, check for preloaded assignee details in tasks
    for (const task of tasks) {
      if (task.assigneeDetails && Array.isArray(task.assigneeDetails)) {
        const preloadedMember = task.assigneeDetails.find(
          (detail) => detail.id === memberId
        );
        if (preloadedMember) return preloadedMember;
      }
    }

    return null;
  };

  const handleOpenDurationEditor = (taskId, event) => {
    if (readOnly || false) return;

    // Prevent editing duration for completed subtasks
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.completed) return;

    // Get button position relative to viewport
    const buttonRect = event.currentTarget.getBoundingClientRect();

    // Calculate dropdown position
    const dropdownWidth = 300;
    const dropdownHeight = 200;

    let top = buttonRect.bottom + 1;
    let left = buttonRect.right - dropdownWidth;

    // Ensure dropdown stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < 10) left = 10;
    if (left + dropdownWidth > viewportWidth - 10) {
      left = viewportWidth - dropdownWidth - 10;
    }
    if (top < 10) top = 10;
    if (top + dropdownHeight > viewportHeight - 10) {
      top = buttonRect.top - dropdownHeight - 2;
      if (top < 10) top = 10;
    }

    setShowDurationEditor(true);
  };

  return (
    <div className="space-y-2">
      {/* Enhanced Add New Task Input */}
      {showAddInput && (
        <EnhancedTaskCreationForm
          onAddTask={handleEnhancedAddTask}
          projectMembers={projectMembers}
          isLoadingMembers={isLoadingMembers}
          disabled={readOnly}
          onUnsavedTextChange={onUnsavedTextChange}
          shouldBounceSaveAll={shouldBounceSaveAll}
        />
      )}
      {/* Task List */}
      <ul className="space-y-2" ref={taskListRef}>
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`flex items-start justify-between p-2 rounded-lg group
              ${
                task.completed
                  ? "bg-gray-50 dark:bg-gray-700/40 midnight:bg-indigo-700/20 text-gray-500 dark:text-red-700 midnight:text-gray-800"
                  : false
                  ? "bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/20 opacity-60"
                  : "bg-gray-50 dark:bg-gray-700 midnight:bg-indigo-800/60"
              }`}
          >
            <div className="flex items-start flex-1 text-gray-900 dark:text-gray-300 midnight:text-indigo-400">
              <button
                type="button"
                onClick={() => handleToggleTask(task.id)}
                disabled={
                  readOnly ||
                  disableCompletion ||
                  editingTaskId === task.id ||
                  (!task.completed && false) ||
                  !canUserToggleSubtask(task)
                }
                className={`flex-shrink-0 w-5 h-5 rounded-sm border mr-2 mt-0.5
                  ${
                    task.completed
                      ? canUserToggleSubtask(task)
                        ? "bg-gray-600 dark:bg-gray-900 midnight:bg-indigo-600 border-gray-500 dark:border-gray-800 midnight:border-indigo-700 text-white dark:text-gray-200 midnight:text-indigo-100"
                        : "bg-gray-600 dark:bg-gray-900 midnight:bg-indigo-600 border-gray-500 dark:border-gray-800 midnight:border-indigo-700 text-white dark:text-gray-200 midnight:text-indigo-100 cursor-not-allowed opacity-70"
                      : disableCompletion
                      ? "border-gray-300 dark:border-gray-500 midnight:border-gray-600 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 cursor-not-allowed opacity-50"
                      : !canUserToggleSubtask(task)
                      ? "border-gray-300 dark:border-gray-500 midnight:border-gray-600 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 cursor-not-allowed opacity-50"
                      : false
                      ? "border-orange-300 dark:border-orange-500 midnight:border-orange-600 bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/20 cursor-not-allowed opacity-60"
                      : "border-gray-300 dark:border-gray-500 midnight:border-gray-600 bg-white dark:bg-gray-800 midnight:bg-gray-900"
                  }
                  transition-colors flex items-center justify-center`}
                title={
                  disableCompletion
                    ? "Subtasks cannot be completed during card creation"
                    : !canUserToggleSubtask(task)
                    ? "Only assigned users can mark this subtask as done"
                    : !task.completed && false
                    ? "Cannot complete subtasks until all dependencies are met"
                    : ""
                }
              >
                {task.completed && (
                  <Check className="w-4 h-4 text-green-500 dark:text-green-400 midnight:text-green-400" />
                )}
                {!task.completed && disableCompletion && (
                  <div className="w-3 h-1 bg-blue-500 dark:bg-blue-400 midnight:bg-blue-400 rounded-sm"></div>
                )}
                {!task.completed && !disableCompletion && false && (
                  <div className="w-2 h-2 bg-orange-400 dark:bg-orange-500 midnight:bg-orange-500 rounded-full"></div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                {editingTaskId === task.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTaskText}
                    onChange={(e) => setEditTaskText(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, task)}
                    onBlur={() => handleSaveEdit(task.id)}
                    className="w-full bg-transparent border-none focus:outline-none text-sm text-gray-800 dark:text-white midnight:text-indigo-100"
                    autoFocus
                  />
                ) : (
                  <div
                    onClick={() => {
                      if (!readOnly && !task.completed) {
                        setEditingTaskId(task.id);
                        setEditTaskText(task.text);
                      }
                    }}
                    className={`w-full text-left ${
                      !readOnly && !task.completed ? "cursor-pointer" : ""
                    }`}
                    title={
                      task.completed
                        ? "Cannot edit completed subtasks"
                        : false
                        ? "Cannot edit subtasks until all dependencies are met"
                        : ""
                    }
                  >
                    <CollapsibleTaskText
                      text={task.text}
                      maxLength={100}
                      className={task.completed ? "line-through" : ""}
                    />
                  </div>
                )}

                {/* Assignees */}
                {task.assignees &&
                  task.assignees.length > 0 &&
                  (() => {
                    // Check if ALL assignees can be resolved to actual member data
                    const canResolveAllAssignees = task.assignees.every(
                      (assigneeId) => findMemberById(assigneeId) !== null
                    );
                    const showLoading =
                      isLoadingMembers || !canResolveAllAssignees;

                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {showLoading ? (
                          <div className="flex items-center bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-xs rounded-full py-0.5 px-2">
                            <Loader className="w-3 h-3 mr-1 animate-spin" />
                            <span>Loading assignees...</span>
                          </div>
                        ) : (
                          task.assignees.map((assigneeId) => {
                            const member = findMemberById(assigneeId);
                            if (!member) return null;

                            return (
                              <div
                                key={assigneeId}
                                className="flex items-center bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20
              text-indigo-700 dark:text-indigo-400 midnight:text-indigo-500
              text-xs rounded-full py-0.5 px-2 max-w-[150px]"
                              >
                                <SubtaskAssigneeAvatar
                                  member={member}
                                  size="small"
                                  showName={true}
                                />
                                {!readOnly && !task.completed && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveAssignee(task.id, assigneeId)
                                    }
                                    className="ml-1 text-indigo-600 dark:text-indigo-500 midnight:text-indigo-600 hover:text-indigo-800 dark:hover:text-indigo-400 midnight:hover:text-indigo-400"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
              </div>
            </div>

            <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {!readOnly && editingTaskId !== task.id && (
                <>
                  {/* Unified Edit button */}
                  <button
                    type="button"
                    onClick={(e) =>
                      !task.completed && handleOpenUnifiedModal(task, e)
                    }
                    disabled={task.completed}
                    className={`p-1 rounded-full transition-colors ${
                      task.completed
                        ? "text-gray-300 dark:text-gray-600 midnight:text-gray-600 cursor-not-allowed"
                        : "text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
                    }`}
                    title={
                      task.completed
                        ? "Cannot edit completed subtasks"
                        : false
                        ? "Cannot edit subtasks until all dependencies are met"
                        : "Edit subtask"
                    }
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={false}
                    className="p-1 rounded-full transition-colors text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-red-600 dark:hover:text-red-400 midnight:hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
                    title="Delete subtask"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Duration Display - find this section and replace it */}
            {task.duration && task.duration > 0 && (
              <div className="mt-1">
                <button
                  onClick={(e) =>
                    !task.completed && handleOpenDurationEditor(task.id, e)
                  }
                  disabled={readOnly || task.completed}
                  className={`text-xs rounded px-1 py-0.5 transition-colors ${
                    task.completed
                      ? "text-gray-400 dark:text-gray-600 midnight:text-gray-600 cursor-not-allowed"
                      : "text-blue-600 dark:text-blue-400 midnight:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/10"
                  } disabled:cursor-not-allowed`}
                  title={
                    task.completed
                      ? "Cannot edit duration of completed subtasks"
                      : false
                      ? "Cannot edit duration until all dependencies are met"
                      : ""
                  }
                >
                  <DurationDisplay duration={task.duration} />
                </button>
              </div>
            )}

            {/* Unified Subtask Edit Modal */}
            {showUnifiedModal &&
              currentEditTask &&
              currentEditTask.id === task.id &&
              createPortal(
                <UnifiedSubtaskEditModal
                  task={currentEditTask}
                  onUpdate={handleUnifiedTaskUpdate}
                  onClose={() => {
                    setShowUnifiedModal(false);
                    setCurrentEditTask(null);
                  }}
                  coordinates={unifiedModalCoordinates}
                  projectMembers={projectMembers}
                  onAssigneeChange={onAssigneeChange}
                />,
                document.body
              )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TaskChecklist;
