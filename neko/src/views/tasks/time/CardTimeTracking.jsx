import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, Play, Square, Edit, Trash, AlertCircle } from "lucide-react";
import viewsApi from "../../viewsApi";

// Format seconds to hours and minutes
const formatDuration = (seconds) => {
  if (!seconds) return "0h 0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
};

// Format time difference in a human-readable way
const formatTimeDiff = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  const diffInSeconds = Math.floor((end - start) / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInHours > 0) {
    return `${diffInHours}h ${diffInMinutes % 60}m`;
  } else {
    return `${diffInMinutes}m`;
  }
};

// Format a date relative to now
const formatTimeAgo = (date) => {
  const now = new Date();
  const pastDate = new Date(date);
  const diffInSeconds = Math.floor((now - pastDate) / 1000);

  if (diffInSeconds < 60) return "just now";

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths}mo ago`;
};

const CardTimeTracking = ({ card, onCardUpdated, readOnly = false }) => {
  const [timeEntries, setTimeEntries] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [editingEntry, setEditingEntry] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Stable card ID reference
  const cardId = useMemo(() => card.id, [card.id]);

  // Load time entries for this card - memoized to prevent infinite loops
  const loadTimeEntries = useCallback(async () => {
    if (readOnly) {
      return;
    }

    try {
      setIsLoading(true);
      const data = await viewsApi.time.getTimeEntries(cardId);
      setTimeEntries(data);

      // Check if there's an active timer
      const active = data.find((entry) => !entry.endTime);
      setActiveTimer(active);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error("Error loading time entries:", error);
    } finally {
      setIsLoading(false);
    }
  }, [cardId, readOnly]);

  // Start a timer
  const startTimer = async () => {
    if (readOnly) return;
    
    try {
      setIsLoading(true);
      const newTimer = await viewsApi.time.startTimer(cardId);
      setActiveTimer(newTimer);
      loadTimeEntries();
    } catch (error) {
      console.error("Error starting timer:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Stop the active timer
  const stopTimer = async () => {
    if (!activeTimer || readOnly) return;

    try {
      setIsLoading(true);
      const timeEntry = await viewsApi.time.stopTimer(cardId, description);
      setActiveTimer(null);
      setDescription("");
      loadTimeEntries();
    } catch (error) {
      console.error("Error stopping timer:", error);
    } finally {
      setIsLoading(false);
    }
  }; // Delete a time entry
  const deleteTimeEntry = async (id) => {
    try {
      await viewsApi.time.deleteTimeEntry(id);
      loadTimeEntries(); // Refresh the list
    } catch (error) {
      console.error("Error deleting time entry:", error);
    }
  };

  // Update a time entry
  const updateTimeEntry = async (id, updatedData) => {
    try {
      await viewsApi.time.updateTimeEntry(id, updatedData);
      loadTimeEntries(); // Refresh the list
    } catch (error) {
      console.error("Error updating time entry:", error);
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

  // Fetch current user info - memoized to prevent duplicate calls
  const getCurrentUser = useCallback(async () => {
    try {
      const userData = await viewsApi.user.getCurrentUser();
      setCurrentUser(userData.data);
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  }, []);

  useEffect(() => {
    getCurrentUser();
  }, [getCurrentUser]);

  // Load time entries on mount - only once to prevent excessive API calls
  useEffect(() => {
    if (!hasLoadedOnce) {
      loadTimeEntries();
    }
  }, [loadTimeEntries, hasLoadedOnce]);

  // Check if current user is the administrator of this card
  const isUserAdministrator = useMemo(() => {
    if (!currentUser || !card.administrator_id) {
      return false;
    }

    const administratorId =
      typeof card.administrator_id === "object"
        ? card.administrator_id.id
        : card.administrator_id;
    return administratorId === currentUser.id;
  }, [currentUser, card.administrator_id]);

  // Check if current user is assigned to any subtask
  const isUserSubtaskAssignee = useMemo(() => {
    if (!currentUser || !card.checklist || !Array.isArray(card.checklist)) {
      return false;
    }

    return card.checklist.some((subtask) => {
      if (subtask.assignees && Array.isArray(subtask.assignees)) {
        return subtask.assignees.some((assignee) => {
          const assigneeId =
            typeof assignee === "object" ? assignee.id : assignee;
          return assigneeId === currentUser.id;
        });
      }
      return false;
    });
  }, [currentUser, card.checklist]);

  // Check if current user is assigned to this card (administrator or subtask assignee)
  const isUserAssigned = useMemo(() => {
    return isUserAdministrator || isUserSubtaskAssignee;
  }, [isUserAdministrator, isUserSubtaskAssignee]);

  // Calculate total time spent (filtered by permissions)
  const totalTimeSpent = useMemo(() => {
    const filteredEntries = timeEntries.filter((entry) => {
      // Administrators can see all time entries
      if (isUserAdministrator) {
        return entry.endTime; // Only completed entries
      }
      // Subtask assignees can only see their own entries
      if (isUserSubtaskAssignee && entry.User) {
        return entry.endTime && entry.User.id === currentUser?.id;
      }
      return false;
    });

    return filteredEntries.reduce((total, entry) => {
      const start = new Date(entry.startTime);
      const end = new Date(entry.endTime);
      return total + Math.floor((end - start) / 1000);
    }, 0);
  }, [
    timeEntries,
    isUserAdministrator,
    isUserSubtaskAssignee,
    currentUser?.id,
  ]);

  return (
    <div className="w-full space-y-6">
      {/* Timer Controls */}
      <div className="space-y-4">
        {!isUserAssigned && !activeTimer ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Only administrators and subtask assignees can track time
              </p>
              <p className="text-xs text-gray-500">
                You need to be the administrator or assigned to a subtask to
                start a timer
              </p>
            </div>
          </div>
        ) : activeTimer ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {formatDuration(elapsedTime)}
                </span>
                <span className="text-xs text-gray-500">running</span>
              </div>

              {(isUserAssigned || activeTimer.User?.id === currentUser?.id) && (
                <button
                  onClick={stopTimer}
                  disabled={isLoading}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                >
                  <Square className="w-4 h-4" />
                  <span>Stop</span>
                </button>
              )}
            </div>

            {(isUserAssigned || activeTimer.User?.id === currentUser?.id) && (
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What are you working on?"
                className="w-full px-0 py-2 border-0 border-b border-gray-200 dark:border-gray-700 bg-transparent text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
              />
            )}
          </div>
        ) : (
          <button
            onClick={startTimer}
            disabled={isLoading || !isUserAssigned}
            className="flex items-center justify-center space-x-2 w-full py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            <span>Start Timer</span>
          </button>
        )}
      </div>

      {/* Time Summary */}
      <div className="flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-800">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Total logged
        </span>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {formatDuration(totalTimeSpent)}
        </span>
      </div>

      {/* Time Entries List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Time Entries
          </h5>
          {timeEntries.length > 0 && (
            <span className="text-xs text-gray-500">
              {timeEntries.length}{" "}
              {timeEntries.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {isLoading && timeEntries.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-5 w-5 border-2 border-gray-300 rounded-full border-t-gray-600"></div>
            </div>
          ) : timeEntries.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No time entries yet</p>
            </div>
          ) : (
            timeEntries
              .filter((entry) => {
                // Administrators can see all time entries
                if (isUserAdministrator) {
                  return true;
                }
                // Subtask assignees can only see their own entries
                if (isUserSubtaskAssignee && entry.User) {
                  return entry.User.id === currentUser?.id;
                }
                return false;
              })
              .map((entry) => (
                <div
                  key={entry.id}
                  className="group py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                >
                  {editingEntry === entry.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={entry.description}
                        onChange={(e) =>
                          setTimeEntries((entries) =>
                            entries.map((item) =>
                              item.id === entry.id
                                ? { ...item, description: e.target.value }
                                : item
                            )
                          )
                        }
                        className="w-full px-0 py-1 border-0 border-b border-gray-200 dark:border-gray-700 bg-transparent text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
                        placeholder="Add a description..."
                      />

                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setEditingEntry(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() =>
                            updateTimeEntry(entry.id, {
                              description: entry.description,
                            })
                          }
                          className="text-xs text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                              {(entry.User?.name || "You")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {entry.User?.name || "You"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(entry.startTime)}
                          </span>
                        </div>

                        {entry.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 ml-9">
                            {entry.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-3">
                        {entry.endTime && (
                          <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                            {formatDuration(
                              Math.floor(
                                (new Date(entry.endTime) -
                                  new Date(entry.startTime)) /
                                  1000
                              )
                            )}
                          </span>
                        )}

                        {/* Only show edit/delete buttons if user is the entry owner or administrator */}
                        {(entry.User?.id === currentUser?.id ||
                          isUserAdministrator) && (
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingEntry(entry.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteTimeEntry(entry.id)}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <Trash className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CardTimeTracking;
