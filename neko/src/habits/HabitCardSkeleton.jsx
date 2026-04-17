import React from 'react';

const HabitCardSkeleton = ({ showTeamMembers = true }) => {
  return (
    <div className="bg-white dark:bg-gray-800/90 midnight:bg-gray-900/90 rounded-xl border border-gray-200/80 dark:border-gray-700/50 midnight:border-gray-700/40 relative">
      {/* Thin left accent */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />

      <div className="px-5 py-4 pl-6">
        {/* Row 1: Icon + Title + Badges */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-36 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full w-10 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-14 animate-pulse" />
          </div>
        </div>

        {/* Row 2: Tags */}
        <div className="flex items-center gap-1.5 mb-3 pl-12">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md w-16 animate-pulse" />
          <div className="h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md w-14 animate-pulse" />
        </div>

        {/* Team Stats */}
        {showTeamMembers && (
          <div className="mb-3 pl-12">
            <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-750/40 midnight:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30">
              <div className="flex items-center justify-between mb-1.5">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-8 animate-pulse" />
              </div>
              <div className="h-1.5 bg-gray-200/60 dark:bg-gray-700/40 rounded-full animate-pulse" />
            </div>
          </div>
        )}

        {/* Progress + Action */}
        <div className="flex items-center gap-3 pl-12">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
            </div>
            <div className="h-1.5 bg-gray-200/60 dark:bg-gray-700/40 rounded-full animate-pulse" />
          </div>
          <div className="w-20 h-7 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse flex-shrink-0" />
        </div>
      </div>
    </div>
  );
};

export default HabitCardSkeleton;
