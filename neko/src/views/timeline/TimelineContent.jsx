
import { Calendar } from "lucide-react";
import TimelineCard from "./TimelineCard";
import { calculateTaskPosition, formatDate } from "./timelineUtils";

const TimelineContent = ({
  timelineRef,
  timelineDates,
  groupedCards,
  activeTimer,
  handleStartTimer,
  handleStopTimer,
  visibleDateRange,
  groupBy,
  session,
  setSelectedCard,
  hasCards,
  containerWidth,
  totalTimelineWidth,
  viewMode,
  isTaskHighlighted,
}) => {
  if (!hasCards) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 midnight:text-gray-700 mb-4" />
        <h3 className="text-xl font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-2">
          No tasks with due dates found
        </h3>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-6 max-w-md">
          Add due dates to your tasks to see them on the timeline view.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
      {/* Timeline headers - dates across the top */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-gray-950">
        {/* Quarter view: Two-row header like Gantt */}
        {viewMode === "quarter" && (
          <div className="flex border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
            <div className="w-80 flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 p-3">
              <div className="font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                {groupBy === "status"
                  ? "Status"
                  : groupBy === "priority"
                  ? "Priority"
                  : groupBy === "dueStatus"
                  ? "Due Status"
                  : groupBy === "completion"
                  ? "Completion"
                  : groupBy === "timeTracking"
                  ? "Time Tracking"
                  : "Groups"}
              </div>
            </div>
            <div
              className="flex-1 flex"
              style={{
                width: totalTimelineWidth
                  ? `${totalTimelineWidth}px`
                  : undefined,
                minWidth: totalTimelineWidth
                  ? `${totalTimelineWidth}px`
                  : undefined,
              }}
            >
              {/* Quarter header - show quarter spans */}
              {(() => {
                const quarters = [];
                const startQuarter =
                  Math.floor(visibleDateRange.start.getMonth() / 3) + 1;
                const startYear = visibleDateRange.start.getFullYear();
                const endQuarter =
                  Math.floor(visibleDateRange.end.getMonth() / 3) + 1;
                const endYear = visibleDateRange.end.getFullYear();

                let currentYear = startYear;
                let currentQuarter = startQuarter;
                let monthCount = 0;

                // Count months in each quarter
                timelineDates.forEach((date) => {
                  const quarter = Math.floor(date.getMonth() / 3) + 1;
                  const year = date.getFullYear();
                  const quarterKey = `${year}-Q${quarter}`;

                  const existing = quarters.find((q) => q.key === quarterKey);
                  if (existing) {
                    existing.monthCount++;
                  } else {
                    quarters.push({
                      key: quarterKey,
                      label: `Q${quarter} ${year}`,
                      monthCount: 1,
                    });
                  }
                });

                return quarters.map((quarter, index) => {
                  const columnWidth = containerWidth
                    ? `${
                        (quarter.monthCount / timelineDates.length) *
                        containerWidth
                      }px`
                    : `${quarter.monthCount * 120}px`;

                  return (
                    <div
                      key={quarter.key}
                      className="h-8 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 midnight:text-gray-400 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 bg-white dark:bg-gray-900 midnight:bg-gray-950 uppercase tracking-wider"
                      style={{
                        width: columnWidth,
                        minWidth: columnWidth,
                        maxWidth: columnWidth,
                      }}
                    >
                      {quarter.label}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Main header row */}
        <div className="flex border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
          {/* Don't repeat the group label for quarter view since it's in the top row */}
          {viewMode !== "quarter" && (
            <div className="w-80 flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 p-3">
              <div className="font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                {groupBy === "status"
                  ? "Status"
                  : groupBy === "priority"
                  ? "Priority"
                  : groupBy === "dueStatus"
                  ? "Due Status"
                  : groupBy === "completion"
                  ? "Completion"
                  : groupBy === "timeTracking"
                  ? "Time Tracking"
                  : "Groups"}
              </div>
            </div>
          )}

          {/* Empty spacer for quarter view to align with quarters header */}
          {viewMode === "quarter" && (
            <div className="w-80 flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60"></div>
          )}

          <div
            className="flex-1 flex"
            style={{
              width: totalTimelineWidth ? `${totalTimelineWidth}px` : undefined,
              minWidth: totalTimelineWidth
                ? `${totalTimelineWidth}px`
                : undefined,
            }}
          >
            {timelineDates.map((date, index) => {
              const isToday =
                viewMode === "quarter"
                  ? date.getMonth() === new Date().getMonth() &&
                    date.getFullYear() === new Date().getFullYear()
                  : date.getDate() === new Date().getDate() &&
                    date.getMonth() === new Date().getMonth() &&
                    date.getFullYear() === new Date().getFullYear();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isQuarterView = viewMode === "quarter";

              let columnWidth;
              if (containerWidth && timelineDates.length > 0) {
                columnWidth = `${containerWidth / timelineDates.length}px`;
              } else {
                columnWidth = "120px"; // fallback width
              }

              return (
                <div
                  key={index}
                  className={`flex-shrink-0 text-center py-3 text-sm font-medium border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 ${
                    isToday
                      ? "bg-blue-500/8 dark:bg-blue-500/8 midnight:bg-blue-500/5 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-400 font-bold"
                      : isWeekend && !isQuarterView
                      ? "bg-gray-100/20 dark:bg-gray-800/20 midnight:bg-gray-900/20 text-gray-500 dark:text-gray-400 midnight:text-gray-500"
                      : "text-gray-700 dark:text-gray-300 midnight:text-gray-400"
                  }`}
                  style={{
                    width: columnWidth,
                    minWidth: columnWidth,
                    maxWidth: columnWidth,
                  }}
                >
                  {isQuarterView ? (
                    // Quarter view: show month info like Gantt
                    <>
                      <div className="uppercase text-[10px] tracking-wider text-gray-500 dark:text-gray-500 midnight:text-gray-600">
                        {date.toLocaleDateString(undefined, { month: "short" })}
                      </div>
                      <div
                        className={`${
                          isToday
                            ? "text-indigo-700 dark:text-indigo-300 midnight:text-indigo-400 text-base"
                            : ""
                        }`}
                      >
                        {date.getFullYear()}
                      </div>
                    </>
                  ) : (
                    // Week/Month view: show day info
                    <>
                      <div className="uppercase text-[10px] tracking-wider text-gray-500 dark:text-gray-500 midnight:text-gray-600">
                        {formatDate(date, "day")}
                      </div>
                      <div
                        className={`${
                          isToday
                            ? "text-indigo-700 dark:text-indigo-300 midnight:text-indigo-400 text-base"
                            : ""
                        }`}
                      >
                        {date.getDate()}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline Main Content - Enhanced Gantt Style */}
      <div className="flex-1 overflow-auto" ref={timelineRef}>
        <div className="flex">
          {/* Group Labels Column */}
          <div className="w-80 flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-gray-900/50">
            {groupedCards.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 p-4 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50"
                style={{
                  minHeight: `${Math.max(80, group.cards.length * 60)}px`,
                }}
              >
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-3 ${group.color}`}
                  ></div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 text-sm">
                      {group.title}
                    </span>
                    <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 bg-white/50 dark:bg-gray-700/50 midnight:bg-gray-800/50 px-2 py-0.5 rounded-full">
                      {group.cards.length}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Content Area */}
          <div
            className="flex-1 relative"
            style={{
              width: totalTimelineWidth ? `${totalTimelineWidth}px` : undefined,
              minWidth: totalTimelineWidth
                ? `${totalTimelineWidth}px`
                : undefined,
            }}
          >
            {groupedCards.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 relative"
                style={{
                  minHeight: `${Math.max(80, group.cards.length * 60)}px`,
                  width: totalTimelineWidth
                    ? `${totalTimelineWidth}px`
                    : undefined,
                  minWidth: totalTimelineWidth
                    ? `${totalTimelineWidth}px`
                    : undefined,
                }}
              >
                {/* Background Grid */}
                <div className="absolute inset-0">
                  <div className="flex h-full">
                    {timelineDates.map((date, index) => {
                      const isToday =
                        date.getDate() === new Date().getDate() &&
                        date.getMonth() === new Date().getMonth() &&
                        date.getFullYear() === new Date().getFullYear();
                      const isWeekend =
                        date.getDay() === 0 || date.getDay() === 6;

                      let columnWidth;
                      if (containerWidth && timelineDates.length > 0) {
                        columnWidth = `${
                          containerWidth / timelineDates.length
                        }px`;
                      } else {
                        columnWidth = "120px";
                      }

                      return (
                        <div
                          key={index}
                          className={`flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 relative ${
                            isToday
                              ? "bg-blue-500/8 dark:bg-blue-500/8 midnight:bg-blue-500/5"
                              : isWeekend
                              ? "bg-gray-100/20 dark:bg-gray-800/20 midnight:bg-gray-900/20"
                              : "bg-white dark:bg-gray-900 midnight:bg-gray-950"
                          }`}
                          style={{
                            width: columnWidth,
                            minWidth: columnWidth,
                            maxWidth: columnWidth,
                          }}
                        >
                          {isToday && (
                            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-blue-500 dark:bg-blue-400 midnight:bg-blue-300 opacity-80 z-10"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Task Bars */}
                <div className="relative z-10">
                  {group.cards.map((card, cardIndex) => {
                    const position = calculateTaskPosition(
                      card.startDate,
                      card.endDate,
                      visibleDateRange,
                      containerWidth,
                      timelineDates.length,
                      viewMode
                    );

                    if (!position) return null;

                    // NEW: Check if this task should be highlighted
                    const isHighlighted = isTaskHighlighted
                      ? isTaskHighlighted(card)
                      : false;

                    return (
                      <TimelineCard
                        key={card.id}
                        card={card}
                        position={position}
                        index={cardIndex}
                        activeTimer={activeTimer}
                        handleStartTimer={handleStartTimer}
                        handleStopTimer={handleStopTimer}
                        onCardSelect={setSelectedCard}
                        totalTimelineWidth={totalTimelineWidth}
                        isHighlighted={isHighlighted}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Empty state overlay */}
            {groupedCards.every((group) => group.cards.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="text-center bg-white/90 dark:bg-gray-900/90 midnight:bg-gray-950/90 backdrop-blur-sm rounded-xl p-8 shadow-lg border border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 midnight:bg-slate-900 flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-5 h-5 text-slate-400 dark:text-slate-500 midnight:text-slate-600" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 midnight:text-slate-500 mb-1">
                    No tasks found
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-500 midnight:text-slate-600">
                    {viewMode === "week"
                      ? "No tasks with start dates scheduled for this week."
                      : viewMode === "quarter"
                      ? "No tasks with start dates scheduled for this quarter."
                      : "No tasks with start dates scheduled for this month."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineContent;
