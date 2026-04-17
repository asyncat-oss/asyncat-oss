import React, { useState, useEffect } from 'react';
import { 
  X, 
  Eye, 
  CheckCircle, 
  AlertTriangle,
  Save,
  User
} from 'lucide-react';
import { projectGuestsApi } from '../projectApi';

// Compact view configurations
const VIEW_CONFIGS = {
  'kanban': { label: 'Kanban' },
  'list': { label: 'Tasks' },
  'timeline': { label: 'Timeline' },
  'gantt': { label: 'Gantt' },
  'network': { label: 'Network' },
  'notes': { label: 'Notes' },
  'habits': { label: 'Habits' },
  'storage': { label: 'Files' },
  'gallery': { label: 'Gallery' }
};

const GUEST_PERMISSION = 'view';

const GuestViewAccessModal = ({ 
  isOpen, 
  onClose, 
  guest, 
  projectId, 
  projectEnabledViews = [],
  onAccessUpdated 
}) => {
  const [selectedViews, setSelectedViews] = useState([]);
  const [viewPermissions, setViewPermissions] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  const availableViews = projectEnabledViews.filter(view => VIEW_CONFIGS[view]);

  useEffect(() => {
    if (isOpen && guest) {
      const currentViews = guest.accessible_views || ['kanban'];
      const currentPermissions = guest.view_permissions || { 'kanban': 'view' };

      const cleanedViews = currentViews.filter(view => VIEW_CONFIGS[view]);

      const cleanedPermissions = {};
      cleanedViews.forEach(view => {
        cleanedPermissions[view] = GUEST_PERMISSION;
      });

      setSelectedViews(cleanedViews);
      setViewPermissions(cleanedPermissions);
      setError('');
    }
  }, [isOpen, guest]);

  const handleViewToggle = (viewKey) => {

    if (selectedViews.includes(viewKey)) {
      setSelectedViews(prev => prev.filter(v => v !== viewKey));
      setViewPermissions(prev => {
        const newPerms = { ...prev };
        delete newPerms[viewKey];
        return newPerms;
      });
    } else {
      setSelectedViews(prev => [...prev, viewKey]);
      setViewPermissions(prev => ({ ...prev, [viewKey]: GUEST_PERMISSION }));
    }
  };

  const handleSave = async () => {
    try {
      setIsUpdating(true);
      setError('');

      const result = await projectGuestsApi.updateGuestViewPermissions(
        projectId,
        guest.user_id,
        selectedViews,
        viewPermissions
      );

      if (result.success) {
        if (onAccessUpdated) {
          onAccessUpdated({
            ...guest,
            accessible_views: selectedViews,
            view_permissions: viewPermissions
          });
        }
        onClose();
      } else {
        throw new Error(result.error || 'Failed to update permissions');
      }
    } catch (err) {
      setError(err.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen || !guest) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-lg shadow-xl w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white midnight:text-gray-100">Guest Access</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 truncate">{guest.name || guest.email}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400 midnight:text-gray-400" />
          </button>
        </div>

        <div className="p-3">
          {/* Access Grid */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
                Areas ({selectedViews.length})
              </label>
              <Eye className="w-3 h-3 text-gray-400 dark:text-gray-500 midnight:text-gray-500" />
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-xs max-h-40 overflow-y-auto">
              {availableViews.map(viewKey => {
                const view = VIEW_CONFIGS[viewKey];
                const isSelected = selectedViews.includes(viewKey);
                
                return (
                  <label key={viewKey} className="flex items-center gap-1.5 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleViewToggle(viewKey)}
                      disabled={view.required}
                      className="w-3 h-3 text-blue-500 rounded border-gray-300 dark:border-gray-600 midnight:border-gray-700 focus:ring-blue-500"
                    />
                    <span className={`${isSelected ? 'text-gray-900 dark:text-white midnight:text-gray-200' : 'text-gray-600 dark:text-gray-400 midnight:text-gray-500'} truncate`}>
                      {view.label}
                      {view.required && <span className="text-blue-500 dark:text-blue-400 midnight:text-blue-300">*</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2 mb-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 rounded text-red-700 dark:text-red-300 midnight:text-red-300 text-sm">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 midnight:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="flex-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {isUpdating ? (
                <>
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" />
                  💾 Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestViewAccessModal;