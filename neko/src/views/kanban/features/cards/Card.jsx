import React, { useState, useEffect, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MoreHorizontal,
  Clock,
  CheckCircle,
  Paperclip,
  Siren,
  Disc3Icon,
  LifeBuoy,
  BadgeAlert,
  User,
  Calendar,
  Check,
} from "lucide-react";
import { useCardContext } from "../../../context/viewContexts";
import { useColumnContext } from "../../../context/viewContexts";
import { useCardActions } from "../../../hooks/useCardActions";
import viewsApi from "../../../viewsApi";
import authService from "../../../../services/authService";

// Import profile pictures
import catDP from "../../../../assets/dp/CAT.webp";
import dogDP from "../../../../assets/dp/DOG.webp";
import dolphinDP from "../../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../../assets/dp/FOX.webp";
import lionDP from "../../../../assets/dp/LION.webp";
import owlDP from "../../../../assets/dp/OWL.webp";
import penguinDP from "../../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../../assets/dp/WOLF.webp";

// Mapping for profile pictures
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

// Session-level cache for administrator details.
const administratorCache = new Map();

// Format predicted time in minutes to readable form (e.g., "4h 30m" or "2h")
const formatPredictedTime = (minutes) => {
  if (!minutes && minutes !== 0) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

// Get confidence level color class
const getPredictionConfidenceColor = (confidence) => {
  switch (confidence) {
    case "high":
      return "text-green-600 dark:text-green-400 midnight:text-green-500";
    case "medium":
      return "text-yellow-600 dark:text-yellow-400 midnight:text-yellow-500";
    case "low":
      return "text-orange-600 dark:text-orange-400 midnight:text-orange-500";
    default:
      return "text-gray-500 dark:text-gray-400 midnight:text-gray-500";
  }
};

// Check if a due date has passed
const isDueDatePassed = (dueDate) => {
  if (!dueDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to beginning of day for accurate comparison

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0); // Set to beginning of day

  return due < today;
};

// Get formatted date for completion display
const formatCompletionDate = (date) => {
  if (!date) return "";

  const options = { month: "short", day: "numeric" };
  return new Date(date).toLocaleDateString(undefined, options);
};

const Card = ({ card, columnId, index, dragOverlay, zoomLevel = 90 }) => {
  const {
    setSelectedCard,
    deletingCards,
  } = useCardContext();

  const { columns } = useColumnContext();

  // Import needed functions from useCardActions
  const { fetchFreshCardData } = useCardActions();

  // Helper function to open card with cached data
  const openCardWithCache = () => {
    // Create enhanced checklist with assignee details attached to individual items
    const enhancedChecklist =
      cardData.checklist?.map((item) => {
        if (
          item.assignees &&
          Array.isArray(item.assignees) &&
          item.assignees.length > 0
        ) {
          // Find assignee details for this specific item
          const itemAssigneeDetails = [];
          item.assignees.forEach((assigneeId) => {
            const assigneeDetail = assigneeDetails.find(
              (detail) =>
                detail.id === assigneeId ||
                detail.id ===
                  (typeof assigneeId === "object" ? assigneeId.id : assigneeId)
            );
            if (assigneeDetail) {
              itemAssigneeDetails.push(assigneeDetail);
            }
          });

          return {
            ...item,
            assigneeDetails:
              itemAssigneeDetails.length > 0 ? itemAssigneeDetails : undefined,
          };
        }
        return item;
      }) || [];

    const cardDataWithCache = {
      ...cardData,
      // Include cached administrator details if available (first item in assigneeDetails is administrator)
      administratorDetails: assigneeDetails[0] || null,
      // Enhanced checklist with assignee details attached to individual items
      checklist: enhancedChecklist,
    };

    setSelectedCard(cardDataWithCache);
  };

  // Card click handler
  const handleCardClick = async () => {
    if (isDragging || isDeleting || isExiting) return;

    try {
      // Open modal immediately with cached card data
      openCardWithCache();

      // Fetch fresh data from API in the background
      const freshCardData = await fetchFreshCardData(cardData.id);

      // Update the modal with fresh data
      setSelectedCard(freshCardData);
    } catch (error) {
      console.error("Error fetching fresh card data:", error);
    }
  };

  const [cardData, setCardData] = useState(card);
  const [isExiting, setIsExiting] = useState(false);
  const [assigneeDetails, setAssigneeDetails] = useState([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);

  // Memoized duration calculation from incomplete checklist items
  const displayDuration = useMemo(() => {
    if (!cardData.checklist || cardData.checklist.length === 0) {
      return 0;
    }

    return cardData.checklist.reduce((total, item) => {
      if (!item.completed) {
        const itemDuration = parseInt(item.duration) || 0;
        return total + itemDuration;
      }
      return total;
    }, 0);
  }, [cardData.checklist]);

  // Update cardData when card prop changes (important for real-time updates)
  useEffect(() => {
    setCardData(card);
  }, [card]);

  // Check if card is fully completed (100% progress)
  const isFullyCompleted = cardData.progress === 100;

  // Determine if this card is being deleted from the context
  const isDeleting = deletingCards.includes(card.id);

  useEffect(() => {
    // When isDeleting changes to true, trigger the exit animation
    if (isDeleting && !isExiting) {
      setIsExiting(true);
    } else if (!isDeleting && isExiting) {
      // Reset if deletion is canceled
      setIsExiting(false);
    }
  }, [isDeleting, isExiting]);

  // Fetch administrator details
  useEffect(() => {
    const fetchAdministratorDetails = async () => {
      if (!cardData.administrator_id) {
        setAssigneeDetails([]);
        return;
      }

      // Check persistent cache first
      const cacheKey = `${cardData.id}-${cardData.administrator_id}`;
      if (administratorCache.has(cacheKey)) {
        const cachedData = administratorCache.get(cacheKey);

        setAssigneeDetails([cachedData]);
        return;
      }

      // Check if administrator details are already preloaded
      if (cardData.administratorDetails) {
        setAssigneeDetails([cardData.administratorDetails]);
        // Store in cache for future use
        administratorCache.set(cacheKey, cardData.administratorDetails);
        return;
      }

      // Check if administrator details are preloaded in the administrator object
      if (
        cardData.administrator &&
        typeof cardData.administrator === "object"
      ) {
        setAssigneeDetails([cardData.administrator]);
        // Store in cache for future use
        administratorCache.set(cacheKey, cardData.administrator);
        return;
      }

      // Check if administrator details are preloaded in the Administrator object (capital A)
      if (
        cardData.Administrator &&
        typeof cardData.Administrator === "object"
      ) {
        setAssigneeDetails([cardData.Administrator]);
        // Store in cache for future use
        administratorCache.set(cacheKey, cardData.Administrator);
        return;
      }

      // Check if user is authenticated before making API calls
      if (!authService.isAuthenticated()) {
        setAssigneeDetails([]);
        return;
      }
      try {
        setIsLoadingAssignees(true);

        // Extract the actual administrator ID (handle both string and object cases)
        const administratorId =
          typeof cardData.administrator_id === "object"
            ? cardData.administrator_id.id
            : cardData.administrator_id;

        // Fetch administrator details
        const data = await viewsApi.user.getById(administratorId);
        setAssigneeDetails([data.data]); // Single administrator in array for consistent rendering

        // Store in cache for future use
        administratorCache.set(cacheKey, data.data);
      } catch (error) {
        console.error("Error fetching administrator details:", error);
        setAssigneeDetails([]);
      } finally {
        setIsLoadingAssignees(false);
      }
    };

    fetchAdministratorDetails();
  }, [cardData.administrator_id, cardData.id]);

  const defaultCardStyles = {
    fontFamily: "sans-serif",
    fontSize: "14px",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    color: "#000000",
  };

  const cardStyles = {
    ...defaultCardStyles,
    ...(card.styles || {}),
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      card,
      columnId, // Make sure this is passed
      index,
    },
  });

  useEffect(() => {
    setCardData(card);
  }, [card]);

  useEffect(() => {
    const currentColumn = columns.find((col) => col.id === columnId);
    const currentCard =
      currentColumn?.Cards?.find((c) => c.id === card.id) ||
      currentColumn?.cards?.find((c) => c.id === card.id);

    if (currentCard) {
      setCardData(currentCard);
    }
  }, [columns, columnId, card.id]);

  const getPriorityIcon = (priority) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return (
          <Siren className="w-4 h-4 text-red-400 dark:text-red-600 midnight:text-red-700" />
        );
      case "medium":
        return (
          <Disc3Icon className="w-4 h-4 text-yellow-400 dark:text-yellow-600 midnight:text-yellow-700" />
        );
      case "low":
        return (
          <LifeBuoy className="w-4 h-4 text-green-400 dark:text-green-600 midnight:text-green-700" />
        );
      default:
        return (
          <BadgeAlert className="w-4 h-4 text-gray-500 midnight:text-gray-700" />
        );
    }
  };

  const getProgressColor = (progress) => {
    if (progress < 25) return "bg-red-400 dark:bg-red-600 midnight:bg-red-600";
    if (progress < 50)
      return "bg-yellow-400 dark:bg-yellow-600 midnight:bg-yellow-600";
    if (progress < 75)
      return "bg-blue-400 dark:bg-blue-600 midnight:bg-indigo-600";
    return "bg-green-400 dark:bg-green-600 midnight:bg-green-600";
  };

  // Attachments temporarily disabled
  const getAttachmentCount = () => {
    const attachmentsCount = cardData.attachments?.length || 0;
    const filesCount = cardData.files?.length || 0;
    return attachmentsCount + filesCount;
  };

  // Get user profile picture from profile picture ID
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

  // Get initial for member
  const getMemberInitial = (member) => {
    // Try all possible locations for the name or email
    const name = member.name || "";
    if (name) return name.charAt(0).toUpperCase();

    const email = member.email || "";
    if (email) return email.charAt(0).toUpperCase();

    return "U"; // Default fallback
  };

  // Get display name for tooltip
  const getMemberDisplayName = (member) => {
    return member.name || member.email || "Member";
  };

  // Get completion date - for completed cards
  const getCompletionDate = () => {
    // For demo, using current date - in a real app you would store the completion date
    // when the card's progress reaches 100%
    return new Date().toISOString();
  };

  const style = {
    transform:
      isDeleting || isExiting
        ? "scale(0.95) translateY(-10px)"
        : dragOverlay
        ? undefined // No transform for drag overlay - let DragOverlay handle positioning
        : isDragging
        ? "rotate(2deg) scale(1.02)" // Slight rotation and scale for dragging state
        : CSS.Transform.toString(transform),
    opacity:
      isDeleting || isExiting
        ? 0
        : isDragging && !dragOverlay
        ? 0.5 // Make original card semi-transparent while dragging
        : 1,
    height: isDeleting || isExiting ? "0" : "auto",
    margin: isDeleting || isExiting ? "0" : undefined,
    padding: isDeleting || isExiting ? "0" : undefined,
    overflow: isDeleting || isExiting ? "hidden" : undefined,
    transition:
      isDeleting || isExiting
        ? "transform 300ms, opacity 300ms, height 300ms, margin 300ms, padding 300ms"
        : dragOverlay
        ? "none" // No transitions for drag overlay
        : transition || "transform 200ms, opacity 200ms",
    // Fixed width for consistency
    width: dragOverlay ? "18rem" : undefined,
    // Ensure proper layering
    zIndex: isDragging && !dragOverlay ? 1 : undefined,
  };

  if (!cardData) return null;

  // Enhanced card styling with editing indicators
  const getCardClasses = () => {
    let baseClasses = `p-4 rounded-xl mb-3 touch-none transition-all duration-200 search-result-card`;

    // Fixed width for all cards to prevent layout shifts
    baseClasses += ` w-full max-w-sm`;

    baseClasses += ` cursor-grab`;

    // Background and ring styling based on card state
    if (isFullyCompleted) {
      baseClasses += ` bg-green-50/50 dark:bg-green-900/5 midnight:bg-green-950/5 ring-2 ring-green-200 dark:ring-green-800 midnight:ring-green-900 completed-card`;
    } else {
      baseClasses += ` bg-white dark:bg-gray-900 midnight:bg-gray-950 ring-1 ring-gray-900/5 dark:ring-white/10 midnight:ring-white/5`;
    }

    // Interaction states
    if (dragOverlay) {
      baseClasses += ` shadow-2xl ring-2 ring-blue-400/50 dark:ring-blue-500/50 midnight:ring-blue-500/50 cursor-grabbing`;
    } else if (isDragging) {
      baseClasses += ` shadow-lg ring-2 ring-blue-300/30 dark:ring-blue-400/30 midnight:ring-blue-400/30`;
    } else {
      baseClasses += ` shadow-sm hover:shadow-md hover:ring-gray-900/10 dark:hover:ring-white/20 midnight:hover:ring-white/10`;
    }

    // Disabled states
    if (isDeleting || isExiting) {
      baseClasses += ` pointer-events-none`;
    }

    return baseClasses;
  };

  // For completed cards, render a simplified version
  if (isFullyCompleted) {
    return (
      <div
        id={`card-${card.id}`}
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={getCardClasses()}
        style={style}
        onClick={handleCardClick}
      >
        {/* Header with title and menu button */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500 midnight:text-green-500 mr-2" />
            <h3
              className="font-medium text-gray-900 dark:text-white midnight:text-indigo-200 line-clamp-1"
              style={{
                ...cardStyles,
                color: document.documentElement.classList.contains("dark")
                  ? cardStyles.color === "#000000"
                    ? "#FFFFFF"
                    : cardStyles.color
                  : document.documentElement.classList.contains("midnight")
                  ? cardStyles.color === "#000000"
                    ? "#a5b4fc" // indigo-200
                    : cardStyles.color
                  : cardStyles.color,
              }}
            >
              {cardData.title}
            </h3>
          </div>
          <button
            className="p-1 rounded text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-800"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Completed info */}
        <div
          className="mb-3 px-2 py-1 text-xs rounded-md flex items-center justify-between
                     bg-green-100 dark:bg-green-900/30 midnight:bg-green-900/20
                     text-green-700 dark:text-green-400 midnight:text-green-500"
        >
          <span className="font-medium flex items-center">
            <Check className="w-3 h-3 mr-1" />
            Completed
          </span>
          <span className="flex items-center">
            <Calendar className="w-3 h-3 mr-1" />
            {formatCompletionDate(getCompletionDate())}
          </span>
        </div>

        {/* Key stats for completed card - reduced to just essential info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-400">
          {/* Show priority */}
          <div className="flex items-center">
            {getPriorityIcon(cardData.priority)}
            <span className="ml-1">{cardData.priority}</span>
          </div>

          {/* Attachments display disabled */}
          {getAttachmentCount() > 0 && (
            <div className="flex items-center">
              <Paperclip className="w-3 h-3 mr-1" />
              {getAttachmentCount()}
            </div>
          )}

        </div>

        {/* Owner row */}
        {cardData.administrator_id && (
          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800/30 midnight:border-green-900/30 flex justify-end">
            <div className="flex -space-x-2">
              {isLoadingAssignees ? (
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse"></div>
              ) : (
                <>
                  {/* Show single owner */}
                  {assigneeDetails.map((member) => {
                    const profilePicture = getProfilePicture(
                      member.profile_picture
                    );

                    return (
                      <div
                        key={member.id}
                        className="w-6 h-6 rounded-full border-2 border-green-50 dark:border-green-900/10 midnight:border-green-950/5
                  flex items-center justify-center text-xs font-medium
                  transition-transform duration-200 hover:scale-110"
                        title={getMemberDisplayName(member)}
                      >
                        {profilePicture ? (
                          <img
                            src={profilePicture}
                            alt={getMemberDisplayName(member)}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-full bg-indigo-100 dark:bg-indigo-900/50 midnight:bg-indigo-900/30 
                                 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-300
                                 flex items-center justify-center"
                          >
                            {getMemberInitial(member)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // For non-completed cards, render the full detailed version
  return (
    <div
      id={`card-${card.id}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={getCardClasses()}
      style={style}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          className="font-medium text-gray-900 dark:text-white midnight:text-indigo-200 line-clamp-1"
          style={{
            ...cardStyles,
            color: document.documentElement.classList.contains("dark")
              ? cardStyles.color === "#000000"
                ? "#FFFFFF"
                : cardStyles.color
              : document.documentElement.classList.contains("midnight")
              ? cardStyles.color === "#000000"
                ? "#a5b4fc" // indigo-200
                : cardStyles.color
              : cardStyles.color,
          }}
        >
          {cardData.title}
        </h3>
        <button
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-all duration-200"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Overdue indicator banner */}
      {cardData.dueDate && (
        <div
          className={`mb-2 px-2 py-1 text-xs rounded-md flex items-center justify-between
                       ${
                         isDueDatePassed(cardData.dueDate)
                           ? "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 text-red-600 dark:text-red-400 midnight:text-red-500"
                           : new Date(cardData.dueDate).toDateString() ===
                             new Date().toDateString()
                           ? "bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 text-yellow-600 dark:text-yellow-400 midnight:text-yellow-500"
                           : "bg-gray-50 dark:bg-gray-700/50 midnight:bg-gray-800/50 text-gray-600 dark:text-gray-300 midnight:text-gray-400"
                       }`}
        >
          <span className="font-medium flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            {isDueDatePassed(cardData.dueDate)
              ? "Overdue"
              : new Date(cardData.dueDate).toDateString() ===
                new Date().toDateString()
              ? "Due today"
              : "Due"}
          </span>
          <span>{new Date(cardData.dueDate).toLocaleDateString()}</span>
        </div>
      )}

      {cardData.description && (
        <p
          className="mb-3 line-clamp-2 text-gray-600 dark:text-gray-300 midnight:text-gray-400"
          style={{
            ...cardStyles,
            color: document.documentElement.classList.contains("dark")
              ? cardStyles.color === "#000000"
                ? "#D1D5DB"
                : cardStyles.color
              : document.documentElement.classList.contains("midnight")
              ? cardStyles.color === "#000000"
                ? "#9ca3af" // gray-400
                : cardStyles.color
              : cardStyles.color,
          }}
        >
          {cardData.description}
        </p>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor(
              cardData.progress
            )} transition-all duration-300`}
            style={{ width: `${cardData.progress || 0}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-500">
            Progress
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-400">
            {cardData.progress || 0}%
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getPriorityIcon(cardData.priority)}
          <span className="text-gray-600 dark:text-gray-300 midnight:text-gray-400">
            {cardData.priority} Priority
          </span>
        </div>
      </div>

      {/* Estimated Duration display */}
      {displayDuration > 0 && (
        <div className="mb-2">
          <div className="flex items-center text-blue-600 dark:text-blue-400 midnight:text-blue-500">
            <Clock className="w-3 h-3 mr-1" />
            <span>{formatPredictedTime(displayDuration)}</span>
            <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500">
              est. remain
            </span>
          </div>
        </div>
      )}

      {/* Card metrics */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
        <div className="flex items-center text-gray-500 dark:text-gray-200 midnight:text-gray-500">
          <CheckCircle className="w-3 h-3 mr-1" />
          {cardData.tasks?.completed || 0}/{cardData.tasks?.total || 0}
        </div>

        {/* Attachments count disabled */}
        <div className="flex items-center text-gray-500 dark:text-gray-200 midnight:text-gray-500">
          <Paperclip className="w-3 h-3 mr-1" />
          {getAttachmentCount()}
        </div>

        {/* Time prediction indicator */}
        {cardData.predictedMinutes > 0 && (
          <div className="flex items-center text-gray-500 dark:text-gray-200 midnight:text-gray-500">
            <Clock className="w-3 h-3 mr-1" />
            <div className="flex items-center group relative">
              <span className="mr-1">≈</span>
              {formatPredictedTime(cardData.predictedMinutes)}
              {/* Tooltip on hover */}
              <div
                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 
                            bg-gray-800 text-white text-xs rounded py-1 px-2 hidden group-hover:block z-10
                            dark:bg-black midnight:bg-black shadow-lg"
              >
                <div className="text-center mb-1 font-medium">
                  Estimated time:{" "}
                  {formatPredictedTime(cardData.predictedMinutes)}
                </div>
                {cardData.predictedConfidence && (
                  <div className="flex justify-center items-center">
                    <span
                      className={`text-xs ${getPredictionConfidenceColor(
                        cardData.predictedConfidence
                      )}`}
                    >
                      {cardData.predictedConfidence.charAt(0).toUpperCase() +
                        cardData.predictedConfidence.slice(1)}{" "}
                      confidence
                    </span>
                  </div>
                )}
                <div
                  className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 
                              rotate-45 w-2 h-2 bg-gray-800 dark:bg-black midnight:bg-black"
                ></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Integrated Owner Section */}
      {cardData.administrator_id && (
        <div className="flex items-center">
          <span className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-500 mr-2 flex items-center">
            <User className="w-3 h-3 mr-1" />
            Owner
          </span>

          <div className="flex -space-x-2">
            {isLoadingAssignees ? (
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse"></div>
            ) : (
              <>
                {/* Show single owner */}
                {assigneeDetails.map((member) => {
                  const profilePicture = getProfilePicture(
                    member.profile_picture
                  );

                  return (
                    <div
                      key={member.id}
                      className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-700 midnight:border-gray-900
              flex items-center justify-center text-xs font-medium
              transition-transform duration-200 hover:scale-110"
                      title={getMemberDisplayName(member)}
                    >
                      {profilePicture ? (
                        <img
                          src={profilePicture}
                          alt={getMemberDisplayName(member)}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full rounded-full bg-indigo-100 dark:bg-indigo-900/50 midnight:bg-indigo-900/30 
                             text-indigo-600 dark:text-indigo-400 midnight:text-indigo-300
                             flex items-center justify-center"
                        >
                          {getMemberInitial(member)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default Card;
