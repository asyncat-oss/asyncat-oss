// Helper functions for the timeline view

// Format date for display
export const formatDate = (date, format = "short") => {
  if (!date) return "";

  if (format === "day") {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  } else if (format === "month") {
    return date.toLocaleDateString(undefined, { month: "short" });
  } else if (format === "full") {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } else {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
};

// Format duration in human-readable format
export const formatDuration = (seconds) => {
  if (!seconds) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Helper function to get week start (Monday)
export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get month start
export const getMonthStart = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get quarter start
export const getQuarterStart = (date) => {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3);
  const quarterStartMonth = quarter * 3;
  d.setMonth(quarterStartMonth);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get quarter info
export const getQuarterInfo = (date) => {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const year = date.getFullYear();
  return { quarter, year };
};

// Add days to a date
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Calculate days between two dates
export const daysBetween = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  const diffTime = endDate - startDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Generate timeline date divisions based on view mode - matches Gantt chart behavior
export const generateTimelineDates = (visibleDateRange, viewMode) => {
  if (!visibleDateRange.start || !visibleDateRange.end) return [];

  const dates = [];

  switch (viewMode) {
    case "week": {
      // Show each day of the week
      const current = new Date(visibleDateRange.start);
      while (current <= visibleDateRange.end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case "month": {
      // Show each day of the month
      const monthCurrent = new Date(visibleDateRange.start);
      while (monthCurrent <= visibleDateRange.end) {
        dates.push(new Date(monthCurrent));
        monthCurrent.setDate(monthCurrent.getDate() + 1);
      }
      break;
    }

    case "quarter": {
      // Show months like in Gantt chart - each column represents a month
      const quarterStart = new Date(visibleDateRange.start);
      quarterStart.setDate(1); // Start from first day of the month

      let monthStart = new Date(quarterStart);
      while (monthStart <= visibleDateRange.end) {
        dates.push(new Date(monthStart));
        monthStart.setMonth(monthStart.getMonth() + 1); // Move to next month
      }
      break;
    }

    default: {
      // Default to daily
      const defaultCurrent = new Date(visibleDateRange.start);
      while (defaultCurrent <= visibleDateRange.end) {
        dates.push(new Date(defaultCurrent));
        defaultCurrent.setDate(defaultCurrent.getDate() + 1);
      }
    }
  }

  return dates;
};

// Get view mode display title
export const getViewModeTitle = (
  viewMode,
  currentPeriodStart,
  visibleDateRange
) => {
  if (!currentPeriodStart) return "";

  switch (viewMode) {
    case "week": {
      const weekStart = new Date(visibleDateRange.start);
      const weekEnd = new Date(visibleDateRange.end);
      return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
    }
    case "month":
      return currentPeriodStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    case "quarter": {
      const quarterInfo = getQuarterInfo(currentPeriodStart);
      return `Q${quarterInfo.quarter} ${quarterInfo.year}`;
    }
    default:
      return currentPeriodStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
  }
};

// Enhanced calculate position for a bar on the timeline - supports full block filling from start to end date
export const calculateTaskPosition = (
  startDate,
  endDate,
  visibleDateRange,
  containerWidth,
  totalColumns,
  viewMode = "week"
) => {
  if (!visibleDateRange.start || !visibleDateRange.end) return null;

  // Use startDate if available, otherwise fall back to dueDate
  const taskStart = startDate ? new Date(startDate) : null;
  const taskEnd = endDate
    ? new Date(endDate)
    : startDate
    ? new Date(startDate)
    : null;

  if (!taskStart) return null;

  const rangeStart = new Date(visibleDateRange.start);
  const rangeEnd = new Date(visibleDateRange.end);

  // Set all dates to start of day for consistent comparison
  taskStart.setHours(0, 0, 0, 0);
  taskEnd.setHours(23, 59, 59, 999);
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(23, 59, 59, 999);

  // Check if task is visible in current range
  const isCompletelyOutside = taskEnd < rangeStart || taskStart > rangeEnd;
  if (isCompletelyOutside) return null;

  // Calculate the visible portion of the task
  const visibleStart = taskStart < rangeStart ? rangeStart : taskStart;
  const visibleEnd = taskEnd > rangeEnd ? rangeEnd : taskEnd;

  let leftOffset, width;
  let isClippedStart = false;
  let isClippedEnd = false;

  // Check if task extends beyond visible range
  if (taskStart < rangeStart) isClippedStart = true;
  if (taskEnd > rangeEnd) isClippedEnd = true;

  if (viewMode === "quarter") {
    // Quarter view: Position based on months
    const rangeStartMonth = new Date(
      rangeStart.getFullYear(),
      rangeStart.getMonth(),
      1
    );
    const visibleStartMonth = new Date(
      visibleStart.getFullYear(),
      visibleStart.getMonth(),
      1
    );
    const visibleEndMonth = new Date(
      visibleEnd.getFullYear(),
      visibleEnd.getMonth(),
      1
    );

    // Calculate months from range start to visible start
    const offsetMonths =
      (visibleStartMonth.getFullYear() - rangeStartMonth.getFullYear()) * 12 +
      (visibleStartMonth.getMonth() - rangeStartMonth.getMonth());

    // Calculate visible duration in months (minimum 1 month)
    const visibleDurationMonths = Math.max(
      1,
      (visibleEndMonth.getFullYear() - visibleStartMonth.getFullYear()) * 12 +
        (visibleEndMonth.getMonth() - visibleStartMonth.getMonth()) +
        1
    );

    if (containerWidth && totalColumns > 0) {
      const leftPercentage = (offsetMonths / totalColumns) * 100;
      const widthPercentage = (visibleDurationMonths / totalColumns) * 100;

      leftOffset = `${leftPercentage}%`;
      width = `${widthPercentage}%`;
    } else {
      const cellWidth = 120;
      leftOffset = `${offsetMonths * cellWidth}px`;
      width = `${visibleDurationMonths * cellWidth}px`;
    }
  } else {
    // Week/Month view: Position based on days
    const offsetDays = daysBetween(rangeStart, visibleStart);
    const visibleDuration = Math.max(
      1,
      daysBetween(visibleStart, visibleEnd) + 1
    );

    if (containerWidth && totalColumns > 0) {
      const leftPercentage = (offsetDays / totalColumns) * 100;
      const widthPercentage = (visibleDuration / totalColumns) * 100;

      leftOffset = `${leftPercentage}%`;
      width = `${widthPercentage}%`;
    } else {
      const cellWidth = 120;
      leftOffset = `${offsetDays * cellWidth}px`;
      width = `${visibleDuration * cellWidth}px`;
    }
  }

  return {
    left: leftOffset,
    width: width,
    isClippedStart,
    isClippedEnd,
    visibleDuration:
      viewMode === "quarter"
        ? Math.max(
            1,
            (new Date(
              visibleEnd.getFullYear(),
              visibleEnd.getMonth(),
              1
            ).getFullYear() -
              new Date(
                visibleStart.getFullYear(),
                visibleStart.getMonth(),
                1
              ).getFullYear()) *
              12 +
              (new Date(
                visibleEnd.getFullYear(),
                visibleEnd.getMonth(),
                1
              ).getMonth() -
                new Date(
                  visibleStart.getFullYear(),
                  visibleStart.getMonth(),
                  1
                ).getMonth()) +
              1
          )
        : Math.max(1, daysBetween(visibleStart, visibleEnd) + 1),
    totalDuration:
      viewMode === "quarter"
        ? Math.max(
            1,
            (taskEnd.getFullYear() - taskStart.getFullYear()) * 12 +
              (taskEnd.getMonth() - taskStart.getMonth()) +
              1
          )
        : daysBetween(taskStart, taskEnd) + 1,
  };
};

// Get status color
export const getStatusColor = (status) => {
  switch (status) {
    case "To Do":
      return "bg-gray-500";
    case "In Progress":
      return "bg-blue-500";
    case "Review":
      return "bg-purple-500";
    case "Done":
      return "bg-green-500";
    default:
      return "bg-gray-500";
  }
};

// Calculate due status
export const getDueStatus = (dueDate) => {
  if (!dueDate)
    return {
      label: "No Date",
      color:
        "text-gray-500 bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-900/40",
    };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) {
    return {
      label: "Overdue",
      color: "text-red-500 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10",
    };
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (due >= today && due < tomorrow) {
    return {
      label: "Today",
      color:
        "text-orange-500 bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10",
    };
  }

  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (7 - today.getDay()));

  if (due <= weekEnd) {
    return {
      label: "This Week",
      color:
        "text-blue-500 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
    };
  }

  return {
    label: "Upcoming",
    color:
      "text-gray-500 bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-900/40",
  };
};

// Enhanced get color for a card based on priority and completion
export const getCardColor = (card) => {
  // If completed, use green styling
  if (card.progress === 100 || card.isCompletionColumn) {
    return "bg-green-500 dark:bg-green-600 midnight:bg-green-700 hover:bg-green-600 dark:hover:bg-green-500";
  }

  // Check if overdue
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cardEnd = new Date(card.endDate || card.dueDate);
  cardEnd.setHours(0, 0, 0, 0);
  const isOverdue = cardEnd < today;

  if (isOverdue) {
    return "bg-red-600 dark:bg-red-700 midnight:bg-red-800 hover:bg-red-700 dark:hover:bg-red-600";
  }

  // Otherwise, use priority colors
  switch (card.priority) {
    case "High":
      return "bg-red-500 dark:bg-red-600 midnight:bg-red-700 hover:bg-red-600 dark:hover:bg-red-500";
    case "Medium":
      return "bg-yellow-500 dark:bg-yellow-600 midnight:bg-yellow-700 hover:bg-yellow-600 dark:hover:bg-yellow-500";
    case "Low":
      return "bg-green-400 dark:bg-green-500 midnight:bg-green-600 hover:bg-green-500 dark:hover:bg-green-400";
    default:
      return "bg-indigo-500 dark:bg-indigo-600 midnight:bg-indigo-700 hover:bg-indigo-600 dark:hover:bg-indigo-500";
  }
};

// Enhanced progress bar colors
export const getProgressColor = (progress) => {
  if (progress === 100) {
    return "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 midnight:from-emerald-600 midnight:to-emerald-700";
  }
  if (progress < 25) {
    return "bg-gradient-to-r from-red-400 to-red-500 dark:from-red-500 dark:to-red-600 midnight:from-red-600 midnight:to-red-700";
  }
  if (progress < 50) {
    return "bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 midnight:from-amber-600 midnight:to-amber-700";
  }
  if (progress < 75) {
    return "bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 midnight:from-blue-600 midnight:to-blue-700";
  }
  return "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 midnight:from-emerald-600 midnight:to-emerald-700";
};

// Enhanced priority styling
export const getPriorityStyle = (priority) => {
  switch (priority) {
    case "High":
      return {
        bg: "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10",
        text: "text-red-700 dark:text-red-400 midnight:text-red-300 font-semibold",
        border:
          "border border-red-200/60 dark:border-red-700/60 midnight:border-red-800/60",
        icon: "text-red-500 drop-shadow-sm",
      };
    case "Medium":
      return {
        bg: "bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10",
        text: "text-amber-700 dark:text-amber-400 midnight:text-amber-300 font-semibold",
        border:
          "border border-amber-200/60 dark:border-amber-700/60 midnight:border-amber-800/60",
        icon: "text-amber-500 drop-shadow-sm",
      };
    case "Low":
      return {
        bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
        text: "text-blue-700 dark:text-blue-400 midnight:text-blue-300 font-semibold",
        border:
          "border border-blue-200/60 dark:border-blue-700/60 midnight:border-blue-800/60",
        icon: "text-blue-500 drop-shadow-sm",
      };
    default:
      return {
        bg: "bg-slate-50 dark:bg-slate-900/20 midnight:bg-slate-900/10",
        text: "text-slate-700 dark:text-slate-400 midnight:text-slate-500 font-medium",
        border:
          "border border-slate-200/60 dark:border-slate-700/60 midnight:border-slate-800/60",
        icon: "text-slate-500",
      };
  }
};

// Enhanced status styling
export const getStatusStyle = (isCompletionColumn) => {
  if (isCompletionColumn) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/10",
      text: "text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 font-semibold",
      border:
        "border border-emerald-200/60 dark:border-emerald-700/60 midnight:border-emerald-800/60",
    };
  }
  return {
    bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
    text: "text-blue-700 dark:text-blue-400 midnight:text-blue-300 font-semibold",
    border:
      "border border-blue-200/60 dark:border-blue-700/60 midnight:border-blue-800/60",
  };
};
