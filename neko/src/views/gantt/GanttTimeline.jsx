import React, { forwardRef } from "react";

const GanttTimeline = forwardRef(
  ({ timelineHeaders, cellWidth, containerWidth, viewType = "week" }, ref) => {
    return (
      <div
        className="sticky top-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 z-20"
        ref={ref}
        style={{ width: containerWidth ? `${containerWidth}px` : undefined }}
      >
        {/* ENHANCED: Top Row - Quarters for Quarter View, Months for Week/Month View */}
        <div
          className="flex h-8 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800"
          style={{ width: containerWidth ? `${containerWidth}px` : undefined }}
        >
          {viewType === "quarter"
            ? // NEW: Quarter view - show quarters in top row
              timelineHeaders.quarters?.map((quarter, index) => {
                let quarterWidth;
                if (containerWidth) {
                  quarterWidth = `${quarter.width * cellWidth}px`;
                } else {
                  quarterWidth = `${quarter.width * cellWidth}px`;
                }

                return (
                  <div
                    key={`quarter-${index}-${quarter.quarter}-${quarter.year}`}
                    className="h-full flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 midnight:text-gray-400 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 uppercase tracking-wider"
                    style={{
                      width: quarterWidth,
                      minWidth: quarterWidth,
                      maxWidth: quarterWidth,
                    }}
                  >
                    <span className="drop-shadow-sm font-bold text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                      {quarter.label}
                    </span>
                  </div>
                );
              })
            : // Existing: Week/Month view - show months in top row
              timelineHeaders.months?.map((month, index) => {
                let monthWidth;
                if (viewType === "month" && containerWidth) {
                  // Month view: single month should span full container width
                  monthWidth = `${containerWidth}px`;
                } else if (containerWidth) {
                  // Week view: use calculated width based on days
                  monthWidth = `${month.width * cellWidth}px`;
                } else {
                  // Fallback: calculated width
                  monthWidth = `${month.width * cellWidth}px`;
                }

                return (
                  <div
                    key={`month-${index}-${month.month}`}
                    className="h-full flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 midnight:text-gray-400 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 uppercase tracking-wider"
                    style={{
                      width: monthWidth,
                      minWidth: monthWidth,
                      maxWidth: monthWidth,
                    }}
                  >
                    <span className="drop-shadow-sm">{month.month}</span>
                  </div>
                );
              })}
        </div>

        {/* ENHANCED: Bottom Row - Months for Quarter View, Days for Week/Month View */}
        <div
          className="flex h-12"
          style={{ width: containerWidth ? `${containerWidth}px` : undefined }}
        >
          {viewType === "quarter"
            ? // NEW: Quarter view - show months in bottom row
              timelineHeaders.months?.map((month, index) => {
                const totalColumns = timelineHeaders.months?.length || 1;
                let columnWidth;

                if (containerWidth) {
                  // Flexible width that proportionally fills container based on month duration
                  columnWidth = `${month.width * cellWidth}px`;
                } else {
                  // Fallback: fixed pixel width
                  columnWidth = `${month.width * cellWidth}px`;
                }

                return (
                  <div
                    key={`quarter-month-${index}-${month.month}`}
                    className="h-full flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 relative group bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 text-gray-600 dark:text-gray-400 midnight:text-gray-500"
                    style={{
                      width: columnWidth,
                      minWidth: columnWidth,
                      maxWidth: columnWidth,
                    }}
                  >
                    {/* Month name with enhanced styling for quarter view */}
                    <div className="relative z-10 font-bold text-sm mb-0.5 transition-all duration-200 text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                      {month.month}
                    </div>

                    {/* Show month number range for context */}
                    <div className="relative z-10 text-xs font-medium text-gray-500 dark:text-gray-500 midnight:text-gray-600">
                      {/* Calculate rough date range for the month */}
                      {month.monthIndex !== undefined && (
                        <span>
                          {new Date(
                            month.year,
                            month.monthIndex,
                            1
                          ).toLocaleDateString(undefined, {
                            day: "numeric",
                          })}
                          -
                          {new Date(
                            month.year,
                            month.monthIndex + 1,
                            0
                          ).toLocaleDateString(undefined, {
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            : // Existing: Week/Month view - show days in bottom row
              timelineHeaders.days?.map((day, index) => {
                const isToday = day.isToday;
                const isWeekend = day.isWeekend;
                const dayNumber = day.date.getDate();
                const dayName = day.date.toLocaleDateString(undefined, {
                  weekday: "short",
                });

                // Unified width calculation for both week and month view
                const totalColumns = timelineHeaders.days?.length || 1;
                let columnWidth;

                if (containerWidth) {
                  // Both week and month view: flexible width that fills container
                  columnWidth = `${containerWidth / totalColumns}px`;
                } else {
                  // Fallback: fixed pixel width
                  columnWidth = `${cellWidth}px`;
                }

                return (
                  <div
                    key={`day-${index}-${day.date.toISOString()}`}
                    className={`h-full flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 relative group ${
                      isToday
                        ? "bg-blue-500/8 dark:bg-blue-500/8 midnight:bg-blue-500/5 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-400 font-bold"
                        : isWeekend
                        ? "bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 text-gray-500 dark:text-gray-400 midnight:text-gray-500"
                        : "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500"
                    }`}
                    style={{
                      width: columnWidth,
                      minWidth: columnWidth,
                      maxWidth: columnWidth,
                    }}
                  >
                    {/* Day number with enhanced styling */}
                    <div
                      className={`relative z-10 font-bold text-sm mb-0.5 transition-all duration-200 ${
                        isToday
                          ? "text-indigo-700 dark:text-indigo-300 midnight:text-indigo-400 text-base"
                          : isWeekend
                          ? "text-gray-500 dark:text-gray-400 midnight:text-gray-500"
                          : "text-gray-700 dark:text-gray-300 midnight:text-gray-400"
                      }`}
                    >
                      {dayNumber}
                    </div>

                    {/* Day of week abbreviation - show based on cell width */}
                    {cellWidth >= 80 && (
                      <div
                        className={`relative z-10 text-xs font-medium uppercase tracking-wide transition-all duration-200 ${
                          isToday
                            ? "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500"
                            : "text-gray-400 dark:text-gray-500 midnight:text-gray-600"
                        }`}
                      >
                        {dayName}
                      </div>
                    )}
                  </div>
                );
              })}
        </div>

        {/* Subtle shadow overlay for depth */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-300/50 dark:bg-gray-600/50 midnight:bg-gray-700/50" />
      </div>
    );
  }
);

GanttTimeline.displayName = "GanttTimeline";

export default GanttTimeline;
