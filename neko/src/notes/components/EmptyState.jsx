import React from "react";
import { Plus } from "lucide-react";

const EmptyState = ({ onCreateNew }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-slate-100 mb-2">
          Start writing
        </h3>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-8 text-sm">
          Capture thoughts, ideas, and important information. Create your first note to get started.
        </p>
        
        <button
          onClick={onCreateNew}
          className="px-4 py-2 bg-black dark:bg-white midnight:bg-indigo-600 text-white dark:text-black midnight:text-white rounded-md flex items-center justify-center gap-2 mx-auto hover:bg-gray-800 dark:hover:bg-gray-100 midnight:hover:bg-indigo-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New note</span>
        </button>
      </div>
    </div>
  );
};

export default EmptyState;
