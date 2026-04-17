import React from "react";
import { Loader2 } from "lucide-react";

export const LoadingCard = ({ style = {} }) => {
  return (
    <div
      className="p-3 bg-white dark:bg-gray-700 midnight:bg-gray-900 rounded-lg mb-3 cursor-wait touch-none border border-gray-400 dark:border-gray-600 midnight:border-gray-800 shadow-sm dark:shadow-gray-900/10 midnight:shadow-black/10"
      style={style}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
        <div className="p-1 h-6 w-6 bg-transparent rounded"></div>
      </div>

      {/* Fake description */}
      <div className="mb-3 space-y-1.5">
        <div className="h-3 w-full bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
        <div className="h-3 w-4/5 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 dark:bg-blue-600 midnight:bg-indigo-600 animate-pulse"
            style={{ width: "45%" }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
          <div className="h-3 w-8 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
      </div>

      {/* Fake tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 animate-pulse w-12 h-4"></span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 animate-pulse w-16 h-4"></span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="h-3 w-10 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
          <div className="h-3 w-10 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingCard;
