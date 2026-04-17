// ComponentDataSection.jsx - Component Data Management
import React, { useState, useEffect } from 'react';
import {
  Database,
  Trash2,
  AlertTriangle,
  Shield,
  Info,
  Loader2,
  CheckCircle,
  X,
  KanbanSquare,
  List,
  Clock,
  GanttChartSquare,
  FileText,
  Link2,
  LayoutGrid,
  Target
} from 'lucide-react';
import { componentDataApi } from '../projectApi.js';

// Component icons mapping - Using Lucide icons instead of emojis
const COMPONENT_ICONS = {
  'kanban': KanbanSquare,
  'list': List,
  'timeline': Clock,
  'gantt': GanttChartSquare,
  'network': Link2,
  'notes': FileText,
  'habits': Target,
  'gallery': LayoutGrid,
  // Legacy mapping for backward compatibility
  'tasks': List
};


// Component card showing data summary
const ComponentCard = ({ component, projectId, onWipeClick, disabled }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true); // Start with loading=true
  const [error, setError] = useState(null);

  // Auto-load summary when component mounts
  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await componentDataApi.getComponentSummary(projectId, component.name);
        setSummary(result.data);
      } catch (error) {
        console.error('Error loading component summary:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    if (projectId && component.name) {
      loadSummary();
    }
  }, [projectId, component.name]);

  const IconComponent = COMPONENT_ICONS[component.name] || Database;

  return (
    <div className="bg-white dark:bg-gray-800 midnight:bg-gray-800 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50 rounded-lg p-4 transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          {/* Icon with background - consistent with Display Preferences */}
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white midnight:text-gray-100 capitalize">
                {component.name.replace('-', ' ')}
              </h4>
              {component.requiresOwner && (
                <Shield className="w-4 h-4 text-amber-500 dark:text-amber-400" title="Requires owner permission" />
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
              {component.description}
            </p>

            {loading && (
              <div className="mt-2 flex items-center space-x-2">
                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Loading data...</span>
              </div>
            )}

            {error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400 midnight:text-red-400">
                Error loading data: {error}
              </div>
            )}

            {summary && !loading && (
              <div className="mt-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  summary.totalRecords > 0
                    ? 'bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-400'
                }`}>
                  {summary.totalRecords} record{summary.totalRecords !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="ml-4">
          {component.canWipe && (
            <button
              onClick={() => onWipeClick(component, summary)}
              disabled={disabled || loading || !summary || summary.totalRecords === 0}
              className="p-2 text-red-500 dark:text-red-400 hover:text-white hover:bg-red-500 dark:hover:bg-red-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              title={
                loading ? "Loading data..." :
                !summary ? "No data loaded" :
                summary.totalRecords === 0 ? "No data to wipe" : "Wipe component data"
              }
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Confirmation dialog for wiping data
const WipeConfirmationDialog = ({ isOpen, onClose, component, summary, projectId, onSuccess }) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [error, setError] = useState(null);

  const expectedConfirmation = `DELETE ${(component?.name || '').toUpperCase()} DATA`;

  const handleWipe = async () => {
    if (!component || confirmationText !== expectedConfirmation || !acknowledged) return;

    setWiping(true);
    setError(null);
    
    try {
      const result = await componentDataApi.wipeComponentData(projectId, component.name, {
        confirmationText,
        userAcknowledgment: acknowledged
      });

      if (result.success) {
        onSuccess(component.name, result.data);
        onClose();
      } else {
        setError(result.error || 'Failed to wipe component data');
      }
    } catch (err) {
      setError(err.message || 'Failed to wipe component data');
    } finally {
      setWiping(false);
    }
  };

  const resetForm = () => {
    setConfirmationText('');
    setAcknowledged(false);
    setError(null);
  };

  const handleClose = () => {
    if (!wiping) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen || !component) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
                  Wipe Component Data
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400">
                  This action cannot be undone!
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={wiping}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Component Info */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-3 mb-2">
              {(() => {
                const IconComponent = COMPONENT_ICONS[component.name] || Database;
                return (
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-600 midnight:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-300 midnight:text-gray-300" />
                  </div>
                );
              })()}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white midnight:text-gray-100 capitalize">
                  {component.name.replace('-', ' ')}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  {component.description}
                </p>
              </div>
            </div>

            {summary && (
              <div className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                <strong>{summary.totalRecords}</strong> records will be permanently deleted
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg">
            <div className="flex">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800 dark:text-red-200 midnight:text-red-300">
                <p className="font-medium mb-2">⚠️ Permanent Data Loss Warning</p>
                <ul className="space-y-1 text-xs">
                  <li>• All {component.name} data will be permanently deleted</li>
                  <li>• This includes all related records and history</li>
                  <li>• This action cannot be undone or recovered</li>
                  <li>• Consider exporting important data first</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200 midnight:text-red-300">{error}</p>
            </div>
          )}

          {/* Confirmation Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
              Type <code className="bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 px-1 rounded text-xs">{expectedConfirmation}</code> to confirm:
            </label>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              disabled={wiping}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-white midnight:text-gray-100 disabled:opacity-50"
              placeholder={expectedConfirmation}
            />
          </div>

          {/* Acknowledgment Checkbox */}
          <div className="mb-6">
            <label className="flex items-start space-x-3">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={wiping}
                className="mt-1 w-4 h-4 text-red-600 border-gray-300 dark:border-gray-600 rounded focus:ring-red-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                I understand that this action is permanent and cannot be undone. All {component.name} data will be completely deleted.
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              disabled={wiping}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-600 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleWipe}
              disabled={wiping || confirmationText !== expectedConfirmation || !acknowledged}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {wiping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wiping...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Wipe Data</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main component data management section - now embedded within unified Components tab
const ComponentDataSection = ({
  project,
  permissions,
  onSuccess,
  onError
}) => {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wipeDialog, setWipeDialog] = useState({ isOpen: false, component: null, summary: null });
  const [isWiping, setIsWiping] = useState(false);

  // Load wipeable components
  useEffect(() => {
    if (project?.id) {
      loadComponents();
    }
  }, [project?.id]);

  const loadComponents = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await componentDataApi.getWipeableComponents(project.id);
      setComponents(result.data.components);
    } catch (err) {
      setError(err.message || 'Failed to load components');
    } finally {
      setLoading(false);
    }
  };

  const handleWipeClick = (component, summary) => {
    setWipeDialog({
      isOpen: true,
      component,
      summary
    });
  };

  const handleWipeSuccess = (componentName, result) => {
    setIsWiping(false);
    onSuccess(`Successfully wiped ${componentName} data. ${result.totalRecordsDeleted} records deleted.`);
    // Refresh components to update counts
    loadComponents();
  };

  const handleWipeClose = () => {
    if (!isWiping) {
      setWipeDialog({ isOpen: false, component: null, summary: null });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200 midnight:text-red-300">{error}</p>
        <button
          onClick={loadComponents}
          className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Warning info box - Consistent styling */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10 border border-amber-200 dark:border-amber-800 midnight:border-amber-800 rounded-lg">
        <div className="flex">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 midnight:text-amber-400 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200 midnight:text-amber-300">
            <p className="font-semibold mb-1">⚠️ Warning: Permanent Data Loss</p>
            <p className="text-xs">Wiping component data is irreversible. Always export important data before proceeding.</p>
          </div>
        </div>
      </div>

      {/* Components list - CONSISTENT WITH DISPLAY PREFERENCES */}
      <div className="space-y-2">
        {components.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg">
            <Database className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-600 midnight:text-gray-600" />
            <p className="text-sm text-gray-900 dark:text-white midnight:text-white font-medium mb-1">No components available</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">No data management options for this project</p>
          </div>
        ) : (
          components.map((component) => (
            <ComponentCard
              key={component.name}
              component={component}
              projectId={project.id}
              onWipeClick={handleWipeClick}
              disabled={isWiping}
            />
          ))
        )}
      </div>

      {/* Wipe confirmation dialog */}
      <WipeConfirmationDialog
        isOpen={wipeDialog.isOpen}
        onClose={handleWipeClose}
        component={wipeDialog.component}
        summary={wipeDialog.summary}
        projectId={project.id}
        onSuccess={handleWipeSuccess}
      />
    </div>
  );
};

export default ComponentDataSection;