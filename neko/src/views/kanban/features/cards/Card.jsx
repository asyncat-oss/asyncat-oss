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
  Play,
  Square,
  Calendar,
  Check,
  MoveRight,
  Edit3,
  Lock,
  Link2,
  Link,
  Loader,
} from "lucide-react";
import { useCardContext } from "../../../context/CardContext";
import { useColumnContext } from "../../../context/ColumnContext";
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

// Session-level cache for administrator details to persist across dependency updates
const administratorCache = new Map();

// Helper function to format time duration
const formatDuration = (seconds) => {
  if (!seconds) return "0h 0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

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
    // New real-time features (with fallbacks for backward compatibility)
    canUserEditCard = () => true,
    getCardEditingUser = () => null,
  } = useCardContext();

  const { columns, onCardStatusChange } = useColumnContext();

  // Import needed functions from useCardActions
  const { moveCard, fetchFreshCardData } = useCardActions();

  // Real-time editing state (with safe fallbacks)
  const canEdit = canUserEditCard(card.id);
  const editingUser = getCardEditingUser(card.id);
  const isBeingEdited = !!editingUser;

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

  // Enhanced card click handler with edit lock checking
  const handleCardClick = async () => {
    if (isDragging || isDeleting || isExiting) return;

    try {
      if (!canEdit) {
        // Show read-only version with editing indicator
        openCardWithCache();
        // Add read-only metadata
        setSelectedCard((prev) => ({
          ...prev,
          readOnly: true,
          editingUser,
        }));
        return;
      }

      // Open modal immediately with cached card data
      openCardWithCache();

      // Fetch fresh data from API in the background
      const freshCardData = await fetchFreshCardData(cardData.id);

      // Update the modal with fresh data
      setSelectedCard(freshCardData);
    } catch (error) {
      console.error("Error fetching fresh card data:", error);
      // Modal is already open with cached data, so no need for fallback
    }
  };

  const [cardData, setCardData] = useState(card);
  const [isExiting, setIsExiting] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [assigneeDetails, setAssigneeDetails] = useState([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  // Dependency state
  const [dependencyCounts, setDependencyCounts] = useState({
    hasDependencies: 0, // Number of cards this card depends on
    isBlockedBy: 0, // Number of cards that depend on this card
  });
  const [areDependenciesMet, setAreDependenciesMet] = useState(true); // Whether this card's dependencies are fulfilled
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(true); // Track loading state

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

  // Check if card has all subtasks completed
  const allSubtasksCompleted = useMemo(() => {
    if (!cardData.checklist || cardData.checklist.length === 0) {
      return false; // No subtasks to complete
    }

    return cardData.checklist.every((item) => item.completed);
  }, [cardData.checklist]);

  // Find completion columns
  const completionColumns = useMemo(() => {
    return columns.filter((col) => col.isCompletionColumn);
  }, [columns]);

  // Current column
  const currentColumn = useMemo(() => {
    return columns.find((col) => col.id === columnId);
  }, [columns, columnId]);

  // Determine if this card is being deleted from the context
  const isDeleting = deletingCards.includes(card.id);

  // Determine if card is ready to complete
  const isReadyToComplete = useMemo(() => {
    return (
      allSubtasksCompleted &&
      completionColumns.length > 0 &&
      !currentColumn?.isCompletionColumn &&
      !isFullyCompleted
    );
  }, [
    allSubtasksCompleted,
    completionColumns,
    currentColumn,
    isFullyCompleted,
  ]);

  useEffect(() => {
    // When isDeleting changes to true, trigger the exit animation
    if (isDeleting && !isExiting) {
      setIsExiting(true);
    } else if (!isDeleting && isExiting) {
      // Reset if deletion is canceled
      setIsExiting(false);
    }
  }, [isDeleting, isExiting]);

  // Fetch current user info
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const userData = await viewsApi.user.getCurrentUser();
        setCurrentUser(userData.data);
      } catch (error) {
        console.error("Error fetching current user:", error);
      }
    };

    getCurrentUser();
  }, []);

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
        const data = await viewsApi.user.getUserById(administratorId);
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
  }, [cardData.administrator_id, cardData.id]); // Simplified dependencies - only what actually matters

  // Fetch dependency counts and status
  useEffect(() => {
    const fetchDependencyCounts = async () => {
      setIsLoadingDependencies(true);
      try {
        // Get dependencies where this card is the source (cards this card depends on)
        const hasDependenciesResponse =
          await viewsApi.dependency.getDependencies(cardData.id);
        const hasDependenciesCount = Array.isArray(hasDependenciesResponse)
          ? hasDependenciesResponse.length
          : 0;

        // Get dependent cards (cards that depend on this card)
        const dependentCardsResponse =
          await viewsApi.dependency.getDependentCards(cardData.id);
        const dependentCardsCount = Array.isArray(dependentCardsResponse)
          ? dependentCardsResponse.length
          : 0;

        setDependencyCounts({
          hasDependencies: hasDependenciesCount,
          isBlockedBy: dependentCardsCount,
        });

        // Check if dependencies are met (only if card has dependencies)
        if (hasDependenciesCount > 0) {
          const statusResponse =
            await viewsApi.dependency.checkDependenciesStatus(cardData.id);
          setAreDependenciesMet(statusResponse.areDependenciesMet);
        } else {
          // No dependencies means they're met by default
          setAreDependenciesMet(true);
        }
      } catch (error) {
        console.error("Error fetching dependency counts:", error);
        // Silently fail - dependency indicators just won't show
        // Assume dependencies are met on error to not block card unnecessarily
        setAreDependenciesMet(true);
      } finally {
        setIsLoadingDependencies(false);
      }
    };

    fetchDependencyCounts();
  }, [cardData.id]);

  // Load time entries for this card
  const loadTimeEntries = React.useCallback(async () => {
    // Check if user is authenticated before making API calls
    if (!authService.isAuthenticated()) {
      setActiveTimer(null);
      return;
    }

    try {
      setIsLoading(true);
      const data = await viewsApi.time.getTimeEntries(card.id);

      // Check if there's an active timer
      const active = data.find((entry) => !entry.endTime);
      setActiveTimer(active);
    } catch (error) {
      console.error("Error loading time entries:", error);
    } finally {
      setIsLoading(false);
    }
  }, [card.id]);

  // Start a timer
  const startTimer = async (e) => {
    if (e) {
      e.stopPropagation(); // Prevent card selection
    }

    // Check if user is authenticated before making API calls
    if (!authService.isAuthenticated()) {
      return;
    }

    try {
      setIsLoading(true);
      const newTimer = await viewsApi.time.startTimer(card.id);
      setActiveTimer(newTimer);
      loadTimeEntries();
    } catch (error) {
      console.error("Error starting timer:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Stop the active timer
  const stopTimer = async (e) => {
    if (e) {
      e.stopPropagation(); // Prevent card selection
    }

    if (!activeTimer) return;

    // Check if user is authenticated before making API calls
    if (!authService.isAuthenticated()) {
      return;
    }

    try {
      setIsLoading(true);
      await viewsApi.time.stopTimer(card.id, "");

      setActiveTimer(null);
      loadTimeEntries();

      // Update the card data with new time information
      const updatedCard = await viewsApi.card.getCard(card.id);
      setCardData((prev) => ({
        ...prev,
        timeSpent: updatedCard.timeSpent || 0,
      }));
    } catch (error) {
      console.error("Error stopping timer:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle automatic completion of a task
  const handleCompleteTask = async (e) => {
    if (e) {
      e.stopPropagation(); // Prevent card selection
    }

    // If no completion columns available, show the card details instead
    if (completionColumns.length === 0) {
      openCardWithCache();
      return;
    }

    // If there's only one completion column, use it automatically
    if (completionColumns.length === 1) {
      completeCardToColumn(completionColumns[0].id);
    } else {
      // Show completion target selection
      setCompletionTarget("select");
    }
  };

  // Complete card to a specific column
  const completeCardToColumn = async (targetColumnId) => {
    if (!targetColumnId) return;

    try {
      setIsCompletingTask(true);

      // Determine status change
      const sourceColumn = columns.find((col) => col.id === columnId);
      const targetColumn = columns.find((col) => col.id === targetColumnId);
      const oldStatus = sourceColumn?.isCompletionColumn
        ? "completed"
        : "in-progress";
      const newStatus = targetColumn?.isCompletionColumn
        ? "completed"
        : "in-progress";

      // Move the card to the completion column
      const result = await moveCard(card.id, columnId, targetColumnId);

      // Check if the move was blocked due to dependencies
      if (result && result.blocked) {
        // You could show a toast notification here
        alert(result.reason || "Cannot complete card");
        return;
      }

      // Update local card data with completion status
      setCardData((prev) => ({
        ...prev,
        columnId: targetColumnId,
        completedAt: new Date().toISOString(),
      }));

      // Notify about status change to update dependent cards
      if (onCardStatusChange && oldStatus !== newStatus) {
        await onCardStatusChange(card.id, newStatus, oldStatus);
      }

      // Hide completion targets
      setCompletionTarget(null);
    } catch (error) {
      console.error("Error completing card:", error);
    } finally {
      setIsCompletingTask(false);
    }
  };

  // Update elapsed time for active timer
  useEffect(() => {
    let interval;

    if (activeTimer) {
      interval = setInterval(() => {
        const startTime = new Date(activeTimer.startTime);
        const now = new Date();
        setElapsedTime(Math.floor((now - startTime) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer]);

  // Check if current user is the administrator or subtask assignee of this card
  const isUserAssigned = useMemo(() => {
    if (!currentUser) {
      return false;
    }

    // Check if current user's ID matches the administrator ID
    if (cardData.administrator_id) {
      const administratorId =
        typeof cardData.administrator_id === "object"
          ? cardData.administrator_id.id
          : cardData.administrator_id;
      if (administratorId === currentUser.id) {
        return true;
      }
    }

    // Check preloaded administrator data
    if (cardData.administrator && typeof cardData.administrator === "object") {
      if (cardData.administrator.id === currentUser.id) {
        return true;
      }
    }

    // Check preloaded administrator data (capital A)
    if (cardData.Administrator && typeof cardData.Administrator === "object") {
      if (cardData.Administrator.id === currentUser.id) {
        return true;
      }
    }

    // Check if current user is assigned to any subtask
    if (cardData.checklist && Array.isArray(cardData.checklist)) {
      return cardData.checklist.some((subtask) => {
        if (subtask.assignees && Array.isArray(subtask.assignees)) {
          return subtask.assignees.some((assignee) => {
            const assigneeId =
              typeof assignee === "object" ? assignee.id : assignee;
            return assigneeId === currentUser.id;
          });
        }
        return false;
      });
    }

    return false;
  }, [
    currentUser,
    cardData.administrator_id,
    cardData.administrator,
    cardData.Administrator,
    cardData.checklist,
  ]);

  // Load time entries on mount
  useEffect(() => {
    loadTimeEntries();
  }, [card.id, loadTimeEntries]);

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
    disabled: isBeingEdited || !areDependenciesMet, // Disable dragging if being edited or dependencies not met
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
    return cardData.completedAt || new Date().toISOString();
  };

  // Editing user avatar component for real-time features
  const EditingUserAvatar = ({ user }) => {
    const profilePic = getProfilePicture(user.profilePicture);

    return (
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border border-blue-200 dark:border-blue-700 midnight:border-blue-800 overflow-hidden">
          {profilePic ? (
            <img
              src={profilePic}
              alt={user.userName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-blue-100 dark:bg-blue-900 midnight:bg-blue-900 text-blue-600 dark:text-blue-300 midnight:text-blue-300 flex items-center justify-center text-xs font-medium">
              {user.userName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-medium">
          {user.userName}
        </span>
      </div>
    );
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

  // Calculate total time (current timer + previously recorded time)
  const totalTimeSpent =
    (cardData.timeSpent || 0) + (activeTimer ? elapsedTime : 0);

  // Enhanced card styling with editing indicators
  const getCardClasses = () => {
    let baseClasses = `p-4 rounded-xl mb-3 touch-none transition-all duration-200 search-result-card`;

    // Fixed width for all cards to prevent layout shifts
    baseClasses += ` w-full max-w-sm`;

    // Cursor based on drag state
    if (!areDependenciesMet) {
      baseClasses += ` cursor-not-allowed`;
    } else {
      baseClasses += ` cursor-grab`;
    }

    // Background and ring styling based on card state
    if (!areDependenciesMet) {
      // Blocked by dependencies - red/orange border
      baseClasses += ` bg-orange-50/30 dark:bg-orange-900/10 midnight:bg-orange-950/10 ring-2 ring-orange-400 dark:ring-orange-600 midnight:ring-orange-700`;
    } else if (isBeingEdited) {
      baseClasses += ` bg-blue-50/50 dark:bg-blue-900/10 midnight:bg-blue-950/10 ring-2 ring-blue-200 dark:ring-blue-700 midnight:ring-blue-800`;
    } else if (isFullyCompleted) {
      baseClasses += ` bg-green-50/50 dark:bg-green-900/5 midnight:bg-green-950/5 ring-2 ring-green-200 dark:ring-green-800 midnight:ring-green-900 completed-card`;
    } else if (isReadyToComplete) {
      baseClasses += ` bg-white dark:bg-gray-900 midnight:bg-gray-950 ring-2 ring-green-200 dark:ring-green-800 midnight:ring-green-900`;
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

    if (isBeingEdited) {
      baseClasses += ` cursor-not-allowed`;
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
        {...(isBeingEdited ? {} : listeners)} // Only enable drag listeners if not being edited
        className={getCardClasses()}
        style={style}
        onClick={handleCardClick}
      >
        {/* NEW: Editing indicator banner for completed cards */}
        {isBeingEdited && (
          <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-700 midnight:border-blue-800">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
                <span className="font-medium text-blue-700 dark:text-blue-400 midnight:text-blue-400">
                  Being edited by
                </span>
                <EditingUserAvatar user={editingUser} />
              </div>
              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 midnight:text-blue-400">
                <Lock className="w-3 h-3" />
              </div>
            </div>
          </div>
        )}

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
            disabled={isBeingEdited}
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

          {/* Show time spent */}
          {totalTimeSpent > 0 && (
            <div className="flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              {formatDuration(totalTimeSpent)}
            </div>
          )}

          {/* Attachments display disabled */}
          {getAttachmentCount() > 0 && (
            <div className="flex items-center">
              <Paperclip className="w-3 h-3 mr-1" />
              {getAttachmentCount()}
            </div>
          )}

          {/* Dependency indicators for completed cards */}
          {isLoadingDependencies ? (
            <div className="flex items-center text-gray-400 dark:text-gray-500 text-xs">
              <Loader className="w-3 h-3 animate-spin mr-1" />
              <span>Loading Dependencies</span>
            </div>
          ) : (
            <>
              {dependencyCounts.hasDependencies > 0 && (
                <div
                  className="flex items-center text-blue-600 dark:text-blue-400 midnight:text-blue-500"
                  title={`This card depends on ${
                    dependencyCounts.hasDependencies
                  } other card${
                    dependencyCounts.hasDependencies > 1 ? "s" : ""
                  }`}
                >
                  <Link2 className="w-3 h-3 mr-1" />
                  {dependencyCounts.hasDependencies}
                </div>
              )}

              {dependencyCounts.isBlockedBy > 0 && (
                <div
                  className="flex items-center text-purple-600 dark:text-purple-400 midnight:text-purple-500"
                  title={`${dependencyCounts.isBlockedBy} card${
                    dependencyCounts.isBlockedBy > 1 ? "s" : ""
                  } depend${
                    dependencyCounts.isBlockedBy === 1 ? "s" : ""
                  } on this card`}
                >
                  <Link className="w-3 h-3 mr-1" />
                  {dependencyCounts.isBlockedBy}
                </div>
              )}
            </>
          )}
        </div>

        {/* Administrator row */}
        {cardData.administrator_id && (
          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800/30 midnight:border-green-900/30 flex justify-end">
            <div className="flex -space-x-2">
              {isLoadingAssignees ? (
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse"></div>
              ) : (
                <>
                  {/* Show single administrator */}
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
      {...(isBeingEdited ? {} : listeners)} // Only enable drag listeners if not being edited
      className={getCardClasses()}
      style={style}
      onClick={handleCardClick}
    >
      {/* NEW: Editing indicator banner */}
      {isBeingEdited && (
        <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-700 midnight:border-blue-800">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
              <span className="font-medium text-blue-700 dark:text-blue-400 midnight:text-blue-400">
                Being edited by
              </span>
              <EditingUserAvatar user={editingUser} />
            </div>
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 midnight:text-blue-400">
              <Lock className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* NEW: Blocked by dependencies indicator */}
      {!areDependenciesMet && dependencyCounts.hasDependencies > 0 && (
        <div className="mb-2 px-2 py-1 bg-orange-100 dark:bg-orange-900/20 midnight:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-700 midnight:border-orange-800">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-orange-600 dark:text-orange-400 midnight:text-orange-400" />
              <span className="font-medium text-orange-700 dark:text-orange-400 midnight:text-orange-400">
                Blocked by {dependencyCounts.hasDependencies}{" "}
                {dependencyCounts.hasDependencies === 1
                  ? "dependency"
                  : "dependencies"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 midnight:text-orange-400">
              <Link2 className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

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
          disabled={isBeingEdited}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Ready to complete notification banner */}
      {isReadyToComplete && !isBeingEdited && (
        <div
          className="mb-2 px-2 py-1 text-xs rounded-md flex items-center justify-between
                       bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 
                       text-green-700 dark:text-green-500 midnight:text-green-500"
        >
          <div className="flex items-center">
            <CheckCircle className="w-3 h-3 mr-1 flex-shrink-0" />
            <span>All subtasks complete</span>
          </div>

          <button
            onClick={handleCompleteTask}
            disabled={isCompletingTask}
            className="ml-2 flex items-center text-green-600 dark:text-green-400 midnight:text-green-400 hover:underline"
          >
            {isCompletingTask ? (
              <div className="w-3 h-3 border-2 border-t-transparent border-green-600 dark:border-green-400 midnight:border-green-400 rounded-full animate-spin mr-1"></div>
            ) : (
              <MoveRight className="w-3 h-3 mr-1" />
            )}
            <span>Complete</span>
          </button>
        </div>
      )}

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

      {/* Card metrics with dependencies indicator */}
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

        {/* Dependency indicators */}
        {isLoadingDependencies ? (
          <div className="flex items-center text-gray-400 dark:text-gray-500 text-xs">
            <Loader className="w-3 h-3 animate-spin mr-1" />
            <span>Loading Dependencies</span>
          </div>
        ) : (
          <>
            {dependencyCounts.hasDependencies > 0 && (
              <div
                className="flex items-center text-blue-600 dark:text-blue-400 midnight:text-blue-500"
                title={`This card depends on ${
                  dependencyCounts.hasDependencies
                } other card${dependencyCounts.hasDependencies > 1 ? "s" : ""}`}
              >
                <Link2 className="w-3 h-3 mr-1" />
                {dependencyCounts.hasDependencies}
              </div>
            )}

            {dependencyCounts.isBlockedBy > 0 && (
              <div
                className="flex items-center text-purple-600 dark:text-purple-400 midnight:text-purple-500"
                title={`${dependencyCounts.isBlockedBy} card${
                  dependencyCounts.isBlockedBy > 1 ? "s" : ""
                } depend${
                  dependencyCounts.isBlockedBy === 1 ? "s" : ""
                } on this card`}
              >
                <Link className="w-3 h-3 mr-1" />
                {dependencyCounts.isBlockedBy}
              </div>
            )}
          </>
        )}

        {/* Time tracking indicator */}
        {totalTimeSpent > 0 && (
          <div className="flex items-center text-gray-500 dark:text-gray-200 midnight:text-gray-500">
            <Clock className="w-3 h-3 mr-1" />
            {formatDuration(totalTimeSpent)}
          </div>
        )}

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

      {/* Integrated Administrator Section */}
      {cardData.administrator_id && (
        <div className="flex items-center">
          <span className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-500 mr-2 flex items-center">
            <User className="w-3 h-3 mr-1" />
            Administrator
          </span>

          <div className="flex -space-x-2">
            {isLoadingAssignees ? (
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse"></div>
            ) : (
              <>
                {/* Show single administrator */}
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

      {/* Completion Target Column Selector */}
      {completionTarget === "select" && completionColumns.length > 1 && (
        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 rounded-md border border-green-200 dark:border-green-900 midnight:border-green-900/50">
          <div className="text-xs font-medium text-green-700 dark:text-green-500 midnight:text-green-400 mb-1.5">
            Move to completion column:
          </div>
          <div className="flex flex-wrap gap-1">
            {completionColumns.map((col) => (
              <button
                key={col.id}
                onClick={(e) => {
                  e.stopPropagation();
                  completeCardToColumn(col.id);
                }}
                disabled={isCompletingTask}
                className="px-2 py-1 text-xs rounded 
                          bg-green-200 dark:bg-green-800 midnight:bg-green-900
                          text-green-700 dark:text-green-300 midnight:text-green-300
                          hover:bg-green-300 dark:hover:bg-green-700 midnight:hover:bg-green-800
                          disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {col.title}
              </button>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCompletionTarget(null);
              }}
              className="px-2 py-1 text-xs rounded 
                          bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800
                          text-gray-700 dark:text-gray-300 midnight:text-gray-300
                          hover:bg-gray-300 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Quick Time Tracking Control */}
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600 midnight:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-500">
            {activeTimer ? (
              <div className="flex items-center">
                <div className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                <span>Timer running: {formatDuration(elapsedTime)}</span>
              </div>
            ) : (
              <span>Total time: {formatDuration(cardData.timeSpent || 0)}</span>
            )}
          </div>

          {isUserAssigned && !isBeingEdited && (
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent card selection
                activeTimer ? stopTimer(e) : startTimer(e);
              }}
              disabled={isLoading}
              className={`p-1.5 rounded-md text-xs flex items-center ${
                activeTimer
                  ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 midnight:bg-red-900/10 midnight:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 midnight:hover:bg-red-900/20"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300 midnight:bg-gray-800 midnight:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-550 midnight:hover:bg-gray-750"
              }`}
            >
              {isLoading ? (
                <div className="w-3 h-3 border-2 border-t-transparent border-gray-600 dark:border-gray-300 midnight:border-gray-400 rounded-full animate-spin"></div>
              ) : activeTimer ? (
                <>
                  <Square className="w-3 h-3 mr-1" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  <span>Start</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Card;
