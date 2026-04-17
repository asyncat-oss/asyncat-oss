// Enhanced format date for display with better typography
export const formatDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Enhanced format full date for display
export const formatFullDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Format time duration in human-readable format
export const formatDuration = (seconds) => {
  if (!seconds) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Calculate days between two dates (inclusive)
export const daysBetween = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  const diffTime = endDate - startDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Add days to a date
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Get week number for a date
export const getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

// NEW: Get quarter information for a date
export const getQuarterInfo = (date) => {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  const year = d.getFullYear();
  const quarterStart = new Date(year, (quarter - 1) * 3, 1);
  const quarterEnd = new Date(year, quarter * 3, 0); // Last day of quarter
  return { quarter, year, quarterStart, quarterEnd };
};

// NEW: Get quarter start date
export const getQuarterStart = (date) => {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3);
  const quarterStartMonth = quarter * 3;
  d.setMonth(quarterStartMonth);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ENHANCED: Generate timeline headers with quarter support
export const generateTimelineHeaders = (visibleRange, viewType = "week") => {
  if (!visibleRange.startDate || !visibleRange.endDate) {
    return { days: [], weeks: [], months: [], quarters: [] };
  }

  const days = [];
  const weeks = [];
  const months = [];
  const quarters = [];

  let currentDate = new Date(visibleRange.startDate);
  let lastWeek = null;
  let lastMonth = null;
  let lastQuarter = null;
  let lastYear = null;
  let weekStart = 0;
  let monthStart = 0;
  let quarterStart = 0;
  let dayIndex = 0;

  // Generate days for the entire visible range
  while (currentDate <= visibleRange.endDate) {
    const isToday = new Date().toDateString() === currentDate.toDateString();
    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

    days.push({
      date: new Date(currentDate),
      isToday,
      isWeekend,
      dayIndex,
    });

    // Track week changes
    const currentWeek = getWeekNumber(currentDate);
    if (currentWeek !== lastWeek) {
      if (lastWeek !== null) {
        weeks.push({
          week: lastWeek,
          start: weekStart,
          width: dayIndex - weekStart,
        });
      }
      lastWeek = currentWeek;
      weekStart = dayIndex;
    }

    // Track month changes
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    if (
      currentMonth !== lastMonth ||
      currentYear !== lastYear ||
      lastMonth === null
    ) {
      if (lastMonth !== null) {
        const monthDate = new Date(lastYear || currentYear, lastMonth, 1);
        let monthLabel;

        // Adjust month label based on view type
        if (viewType === "quarter") {
          // For quarter view, show abbreviated month names
          monthLabel = monthDate.toLocaleDateString(undefined, {
            month: "short",
          });
        } else {
          // For week and month view, show full format
          monthLabel = monthDate.toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          });
        }

        months.push({
          month: monthLabel,
          start: monthStart,
          width: dayIndex - monthStart,
          year: lastYear,
          monthIndex: lastMonth,
        });
      }
      lastMonth = currentMonth;
      lastYear = currentYear;
      monthStart = dayIndex;
    }

    // NEW: Track quarter changes
    const currentQuarterInfo = getQuarterInfo(currentDate);
    const currentQuarter = currentQuarterInfo.quarter;

    if (
      currentQuarter !== lastQuarter ||
      currentYear !== lastYear ||
      lastQuarter === null
    ) {
      if (lastQuarter !== null) {
        quarters.push({
          quarter: lastQuarter,
          year: lastYear,
          start: quarterStart,
          width: dayIndex - quarterStart,
          label: `Q${lastQuarter} ${lastYear}`,
        });
      }
      lastQuarter = currentQuarter;
      quarterStart = dayIndex;
    }

    currentDate = addDays(currentDate, 1);
    dayIndex++;
  }

  // Add final week
  if (lastWeek !== null) {
    weeks.push({
      week: lastWeek,
      start: weekStart,
      width: dayIndex - weekStart,
    });
  }

  // Add final month
  if (lastMonth !== null) {
    const monthDate = new Date(lastYear, lastMonth, 1);
    let monthLabel;

    if (viewType === "quarter") {
      monthLabel = monthDate.toLocaleDateString(undefined, {
        month: "short",
      });
    } else {
      monthLabel = monthDate.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }

    months.push({
      month: monthLabel,
      start: monthStart,
      width: dayIndex - monthStart,
      year: lastYear,
      monthIndex: lastMonth,
    });
  }

  // NEW: Add final quarter
  if (lastQuarter !== null) {
    quarters.push({
      quarter: lastQuarter,
      year: lastYear,
      start: quarterStart,
      width: dayIndex - quarterStart,
      label: `Q${lastQuarter} ${lastYear}`,
    });
  }

  return { days, weeks, months, quarters, viewType };
};

// ENHANCED: Task bar styling with quarter view support
export const getTaskBarStyle = (
  card,
  visibleRange,
  cellWidth,
  containerWidth = null,
  timelineScale = 1,
  viewType = "week",
  isSearchResult = false
) => {
  if (!card.startDate || !visibleRange.startDate) return null;

  // Normalize dates to avoid timezone issues
  const cardStart = new Date(card.startDate);
  const cardEnd = new Date(card.endDate || card.startDate);
  const rangeStart = new Date(visibleRange.startDate);
  const rangeEnd = new Date(visibleRange.endDate);

  // Set all dates to start of day for consistent comparison
  cardStart.setHours(0, 0, 0, 0);
  cardEnd.setHours(0, 0, 0, 0);
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(0, 0, 0, 0);

  // For search results, show tasks even if they're completely outside the visible range
  const isCompletelyOutsideRange = cardEnd < rangeStart || cardStart > rangeEnd;

  if (isCompletelyOutsideRange && !isSearchResult) {
    return null; // Task not visible in current range (normal behavior)
  }

  // For tasks completely outside the range (search results), create a special indicator
  if (isCompletelyOutsideRange && isSearchResult) {
    // Calculate position relative to visible range
    const totalRangeDays = daysBetween(rangeStart, rangeEnd) + 1;

    let indicatorPosition = "before"; // or "after"
    let leftOffset, width;

    if (cardEnd < rangeStart) {
      // Task is before visible range
      indicatorPosition = "before";
      leftOffset = "0px";
      width = "4px"; // Thin indicator bar
    } else if (cardStart > rangeEnd) {
      // Task is after visible range
      indicatorPosition = "after";
      leftOffset = containerWidth
        ? `${containerWidth - 4}px`
        : `${totalRangeDays * cellWidth - 4}px`;
      width = "4px"; // Thin indicator bar
    }

    // Return special styling for out-of-range indicators
    return {
      style: {
        left: leftOffset,
        width: width,
      },
      bgColor: "bg-gray-400 dark:bg-gray-500 midnight:bg-gray-600",
      borderColor:
        "border-gray-300 dark:border-gray-400 midnight:border-gray-500",
      isOutOfRange: true,
      indicatorPosition,
      isSearchResult: true,
      originalStart: new Date(card.startDate),
      originalEnd: new Date(card.endDate || card.startDate),
    };
  }

  // Calculate the visible portion of the task (existing logic)
  const visibleStart = cardStart < rangeStart ? rangeStart : cardStart;
  const visibleEnd = cardEnd > rangeEnd ? rangeEnd : cardEnd;

  // Calculate offset from start of visible range (days from range start to visible start)
  const offsetDays = Math.max(0, daysBetween(rangeStart, visibleStart));

  // Calculate duration in days (inclusive)
  const visibleDuration = daysBetween(visibleStart, visibleEnd) + 1;

  let leftOffset, width;

  // ENHANCED: Unified positioning strategy for week, month, and quarter views
  if (containerWidth && timelineScale === 1) {
    // All view types: use percentage-based positioning for flexible width
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    const leftPercentage = (offsetDays / totalDays) * 100;
    const widthPercentage = (visibleDuration / totalDays) * 100;

    leftOffset = `${leftPercentage}%`;
    width = `${widthPercentage}%`;
  } else {
    // Zoomed view: use pixel-based positioning for horizontal scrolling
    leftOffset = `${offsetDays * cellWidth}px`;
    width = `${visibleDuration * cellWidth}px`;
  }

  // Enhanced modern styling with solid colors
  let bgColor, borderColor;

  // Color based on priority and completion with solid colors
  if (card.progress === 100 || card.isCompletionColumn) {
    bgColor = "bg-emerald-500 dark:bg-emerald-600 midnight:bg-emerald-700";
    borderColor =
      "border-emerald-400 dark:border-emerald-500 midnight:border-emerald-600";
  } else if (card.priority === "High") {
    bgColor = "bg-red-500 dark:bg-red-600 midnight:bg-red-700";
    borderColor = "border-red-400 dark:border-red-500 midnight:border-red-600";
  } else if (card.priority === "Medium") {
    bgColor = "bg-amber-500 dark:bg-amber-600 midnight:bg-amber-700";
    borderColor =
      "border-amber-400 dark:border-amber-500 midnight:border-amber-600";
  } else if (card.priority === "Low") {
    bgColor = "bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700";
    borderColor =
      "border-blue-400 dark:border-blue-500 midnight:border-blue-600";
  } else {
    bgColor = "bg-slate-500 dark:bg-slate-600 midnight:bg-slate-700";
    borderColor =
      "border-slate-400 dark:border-slate-500 midnight:border-slate-600";
  }

  // Check if overdue
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue =
    cardEnd < today && !(card.progress === 100 || card.isCompletionColumn);

  if (isOverdue) {
    bgColor = "bg-red-600 dark:bg-red-700 midnight:bg-red-800";
    borderColor = "border-red-500 dark:border-red-600 midnight:border-red-700";
  }

  // Add indicators for clipped tasks - works for all view types
  const isClippedStart = cardStart < rangeStart;
  const isClippedEnd = cardEnd > rangeEnd;

  // Calculate total span information for tasks spanning multiple periods
  const totalTaskDays = daysBetween(cardStart, cardEnd) + 1;

  // NEW: Enhanced multi-period detection
  let isMultiPeriod = false;
  if (viewType === "week") {
    // Check if task spans multiple weeks
    const startWeek = getWeekNumber(cardStart);
    const endWeek = getWeekNumber(cardEnd);
    isMultiPeriod = startWeek !== endWeek;
  } else if (viewType === "quarter") {
    // Check if task spans multiple quarters
    const startQuarter = getQuarterInfo(cardStart);
    const endQuarter = getQuarterInfo(cardEnd);
    isMultiPeriod =
      startQuarter.quarter !== endQuarter.quarter ||
      startQuarter.year !== endQuarter.year;
  } else {
    // Check if task spans multiple months
    isMultiPeriod =
      cardStart.getMonth() !== cardEnd.getMonth() ||
      cardStart.getFullYear() !== cardEnd.getFullYear();
  }

  return {
    style: {
      left: leftOffset,
      width: width,
    },
    bgColor,
    borderColor,
    isOverdue,
    isClippedStart,
    isClippedEnd,
    isMultiPeriod, // indicates if task spans multiple periods (weeks/months/quarters)
    isSearchResult,
    isOutOfRange: false,
    originalStart: new Date(card.startDate),
    originalEnd: new Date(card.endDate || card.startDate),
    visibleStart,
    visibleEnd,
    durationDays: visibleDuration,
    totalDays: totalTaskDays, // total task duration including clipped portions
    viewType, // NEW: include view type in return object
  };
};

// Calculate due status for filtering and display
export const getDueStatus = (dueDate) => {
  if (!dueDate) return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  if (due <= nextWeek) return "thisWeek";

  return "later";
};

// Enhanced style for due date with modern colors
export const getDueDateStyle = (dueDate) => {
  const status = getDueStatus(dueDate);

  switch (status) {
    case "overdue":
      return "text-red-600 dark:text-red-400 midnight:text-red-400 font-bold drop-shadow-sm";
    case "today":
      return "text-amber-600 dark:text-amber-400 midnight:text-amber-400 font-bold drop-shadow-sm";
    case "thisWeek":
      return "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 font-semibold";
    default:
      return "text-slate-600 dark:text-slate-400 midnight:text-slate-500";
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

// Enhanced priority styling with modern colors and effects
export const getPriorityStyle = (priority) => {
  switch (priority) {
    case "High":
      return {
        bg: "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10",
        text: "text-red-700 dark:text-red-400 midnight:text-red-300 font-semibold",
        border:
          "border border-red-200/60 dark:border-red-700/60 midnight:border-red-800/60",
        icon: "text-red-500 drop-shadow-sm",
        ring: "ring-1 ring-red-500/20",
      };
    case "Medium":
      return {
        bg: "bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10",
        text: "text-amber-700 dark:text-amber-400 midnight:text-amber-300 font-semibold",
        border:
          "border border-amber-200/60 dark:border-amber-700/60 midnight:border-amber-800/60",
        icon: "text-amber-500 drop-shadow-sm",
        ring: "ring-1 ring-amber-500/20",
      };
    case "Low":
      return {
        bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
        text: "text-blue-700 dark:text-blue-400 midnight:text-blue-300 font-semibold",
        border:
          "border border-blue-200/60 dark:border-blue-700/60 midnight:border-blue-800/60",
        icon: "text-blue-500 drop-shadow-sm",
        ring: "ring-1 ring-blue-500/20",
      };
    default:
      return {
        bg: "bg-slate-50 dark:bg-slate-900/20 midnight:bg-slate-900/10",
        text: "text-slate-700 dark:text-slate-400 midnight:text-slate-500 font-medium",
        border:
          "border border-slate-200/60 dark:border-slate-700/60 midnight:border-slate-800/60",
        icon: "text-slate-500",
        ring: "ring-1 ring-slate-500/10",
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
      ring: "ring-1 ring-emerald-500/20",
    };
  }
  return {
    bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
    text: "text-blue-700 dark:text-blue-400 midnight:text-blue-300 font-semibold",
    border:
      "border border-blue-200/60 dark:border-blue-700/60 midnight:border-blue-800/60",
    ring: "ring-1 ring-blue-500/20",
  };
};

// Enhanced priority color system
export const getPriorityColor = (priority) => {
  switch (priority?.toLowerCase()) {
    case "high":
      return {
        bg: "bg-red-500",
        text: "text-red-700 dark:text-red-400 font-bold",
        light: "bg-red-100",
        border: "border-red-200/60",
        ring: "ring-red-500/20",
      };
    case "medium":
      return {
        bg: "bg-amber-500",
        text: "text-amber-700 dark:text-amber-400 font-bold",
        light: "bg-amber-100",
        border: "border-amber-200/60",
        ring: "ring-amber-500/20",
      };
    case "low":
      return {
        bg: "bg-blue-500",
        text: "text-blue-700 dark:text-blue-400 font-bold",
        light: "bg-blue-100",
        border: "border-blue-200/60",
        ring: "ring-blue-500/20",
      };
    default:
      return {
        bg: "bg-slate-500",
        text: "text-slate-700 dark:text-slate-400",
        light: "bg-slate-100",
        border: "border-slate-200/60",
        ring: "ring-slate-500/10",
      };
  }
};

// Enhanced completion status color
export const getCompletionColor = (progress, isOverdue = false) => {
  if (isOverdue) {
    return {
      bg: "bg-red-500",
      light: "bg-red-100",
      text: "text-red-700 dark:text-red-400 font-bold",
      border: "border-red-200/60",
      ring: "ring-red-500/20",
    };
  }

  if (progress >= 100) {
    return {
      bg: "bg-emerald-500",
      light: "bg-emerald-100",
      text: "text-emerald-700 dark:text-emerald-400 font-bold",
      border: "border-emerald-200/60",
      ring: "ring-emerald-500/20",
    };
  }

  if (progress >= 75) {
    return {
      bg: "bg-blue-500",
      light: "bg-blue-100",
      text: "text-blue-700 dark:text-blue-400 font-semibold",
      border: "border-blue-200/60",
      ring: "ring-blue-500/20",
    };
  }

  if (progress >= 50) {
    return {
      bg: "bg-amber-500",
      light: "bg-amber-100",
      text: "text-amber-700 dark:text-amber-400 font-semibold",
      border: "border-amber-200/60",
      ring: "ring-amber-500/20",
    };
  }

  return {
    bg: "bg-slate-500",
    light: "bg-slate-100",
    text: "text-slate-700 dark:text-slate-400",
    border: "border-slate-200/60",
    ring: "ring-slate-500/10",
  };
};

// Get member display name
export const getMemberDisplayName = (member) => {
  if (!member) return "Member";
  return member.name || member.email || "Member";
};

// Get member initial
export const getMemberInitial = (member) => {
  if (!member) return "U";

  const name = member.name || "";
  if (name) return name.charAt(0).toUpperCase();

  const email = member.email || "";
  if (email) return email.charAt(0).toUpperCase();

  return "U";
};

// Enhanced hover state helper
export const getHoverStyle = (baseStyle) => {
  return `${baseStyle} transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 hover:scale-[1.02] hover:backdrop-blur-sm`;
};

// Enhanced button styles
export const getButtonStyle = (variant = "primary", size = "medium") => {
  const base =
    "inline-flex items-center font-semibold rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm";

  const variants = {
    primary:
      "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500/50 border border-indigo-500/20",
    secondary:
      "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 focus:ring-slate-500/50 border border-slate-200/60 dark:border-slate-600/60",
    success:
      "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500/50 border border-emerald-500/20",
    danger:
      "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500/50 border border-red-500/20",
    outline:
      "border border-slate-300/60 hover:border-slate-400/60 bg-white/70 hover:bg-slate-50/70 text-slate-700 focus:ring-indigo-500/50 backdrop-blur-sm",
  };

  const sizes = {
    small: "px-3 py-2 text-xs",
    medium: "px-4 py-2.5 text-sm",
    large: "px-6 py-3 text-base",
  };

  return `${base} ${variants[variant]} ${sizes[size]}`;
};

// Enhanced spacing helper
export const getSpacing = (size = "medium") => {
  const spacing = {
    tiny: "p-1.5",
    small: "p-3",
    medium: "p-4",
    large: "p-6",
    xlarge: "p-8",
  };

  return spacing[size] || spacing.medium;
};

// Enhanced card styling helper
export const getCardStyle = (variant = "default") => {
  const base =
    "bg-white/70 dark:bg-slate-800/70 midnight:bg-slate-900/70 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 midnight:border-slate-800/60 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300";

  const variants = {
    default: base,
    elevated: `${base} shadow-lg hover:shadow-xl hover:shadow-indigo-500/10`,
    interactive: `${base} hover:scale-[1.02] cursor-pointer`,
    glass:
      "bg-white/10 dark:bg-slate-900/10 midnight:bg-slate-950/10 backdrop-blur-xl border border-white/20 dark:border-slate-700/20 midnight:border-slate-800/20 rounded-xl shadow-2xl",
  };

  return variants[variant] || variants.default;
};

// Enhanced text styling helper
export const getTextStyle = (variant = "body") => {
  const variants = {
    heading:
      "font-bold text-slate-900 dark:text-slate-100 midnight:text-slate-200 tracking-tight",
    subheading:
      "font-semibold text-slate-700 dark:text-slate-300 midnight:text-slate-400",
    body: "font-medium text-slate-600 dark:text-slate-400 midnight:text-slate-500",
    caption:
      "font-medium text-slate-500 dark:text-slate-500 midnight:text-slate-600 text-sm",
    label:
      "font-semibold text-slate-600 dark:text-slate-400 midnight:text-slate-500 text-xs uppercase tracking-wide",
  };

  return variants[variant] || variants.body;
};
