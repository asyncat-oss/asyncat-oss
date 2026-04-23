
import { Loader2, Plus, Settings } from "lucide-react";

export const LoadingColumn = ({ style = {} }) => {
  return (
    <div className="flex-shrink-0 w-80 transition-all duration-300" style={style}>
      <div className="rounded-lg min-h-[97vh] flex flex-col bg-white dark:bg-gray-800 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 shadow-sm hover:shadow-md dark:shadow-gray-900/10 dark:hover:shadow-gray-900/20 midnight:shadow-black/10 midnight:hover:shadow-black/20 transition-shadow duration-200">
        {/* Column Header */}
        <div className="p-3 rounded-t-lg flex items-center justify-between cursor-wait bg-gray-50 dark:bg-gray-700 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-600 midnight:border-gray-800">
          <div className="h-5 w-36 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded animate-pulse"></div>
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md">
              <Settings className="w-4.5 h-5 text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
            </div>
            <span className="text-xs text-gray-300 dark:text-gray-600 midnight:text-gray-700">
              -
            </span>
          </div>
        </div>

        {/* Loading Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-400 dark:text-blue-500 midnight:text-indigo-500 mb-3 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              Loading column...
            </p>
          </div>
          
          {/* Add Card Button (disabled state) */}
          <button
            disabled
            className="w-full mt-4 py-2 border-2 border-dashed rounded-lg flex items-center justify-center opacity-50 text-gray-400 dark:text-gray-600 midnight:text-gray-700 border-gray-200 dark:border-gray-700 midnight:border-gray-800 transition-colors duration-200"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Card
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadingColumn;
