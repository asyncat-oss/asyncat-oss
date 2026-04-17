// ModelsPage.jsx — Standalone page wrapper for LocalModelsSection
// Rendered at /models route directly in the main content area

import React from 'react';
import { HardDrive } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection';

const ModelsPage = () => {
  return (
    <div className="flex h-full w-full bg-white dark:bg-gray-900 midnight:bg-gray-950 font-sans">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/60 midnight:border-gray-800/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                Models
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
                Download and manage local GGUF models
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto w-full flex justify-center">
          <div className="max-w-3xl w-full px-8 py-8">
            <LocalModelsSection />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
