// CitationSettings.jsx - Optional user controls for citation display
import { useState } from 'react';
import { Settings, Eye, EyeOff, List, Grid } from 'lucide-react';

const CitationSettings = ({ settings, onSettingsChange }) => {
  const toggleSources = () => {
    onSettingsChange({
      ...settings,
      showSources: !settings.showSources
    });
  };

  return (
    <button
      onClick={toggleSources}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        settings.showSources
          ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
      }`}
      title={settings.showSources ? 'Hide sources' : 'Show sources'}
    >
      {settings.showSources ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      Sources
    </button>
  );
};

// Default citation settings
// eslint-disable-next-line react-refresh/only-export-components
export const defaultCitationSettings = {
  showSources: false,          // Show sources section
  inlineCitations: false,      // Show inline badges
  sourceCategories: ['all']    // Filter which source types to show
};

export default CitationSettings;