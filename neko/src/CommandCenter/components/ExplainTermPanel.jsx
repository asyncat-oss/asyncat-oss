// ExplainTermPanel.jsx — Right-side panel for an AI-annotated term explanation
import React from 'react';
import { X, BookOpen, Library } from 'lucide-react';

const ExplainTermPanel = ({ term, definition, onClose, onOpenGlossary }) => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <span
          className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate"
          title={term}
        >
          {term}
        </span>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-6">

        {/* Term heading */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-slate-100 mb-1 leading-tight">
            {term}
          </h2>
          <div className="h-0.5 w-10 bg-indigo-400 dark:bg-indigo-500 rounded-full" />
        </div>

        {/* Definition */}
        <div className="bg-indigo-50/60 dark:bg-indigo-900/20 midnight:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 midnight:border-indigo-800/50 rounded-xl px-5 py-4">
          <p className="text-[15px] text-gray-800 dark:text-gray-200 midnight:text-slate-200 leading-[1.75] font-normal">
            {definition}
          </p>
        </div>

      </div>

      {/* Footer — link to full glossary */}
      {onOpenGlossary && (
        <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-3">
          <button
            onClick={onOpenGlossary}
            className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 midnight:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 transition-colors"
          >
            <Library className="w-3.5 h-3.5" />
            View all glossary terms
          </button>
        </div>
      )}
    </div>
  );
};

export default ExplainTermPanel;
