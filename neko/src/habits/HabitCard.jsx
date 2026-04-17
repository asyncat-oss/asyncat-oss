import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  CheckCircle2, 
  Flame,
  Trash2,
  Circle,
  Hash,
  Timer,
  X,
  Edit2,
  MessageSquare,
  Lock,
  Users
} from 'lucide-react';
import AddProgressModal from './AddProgressModal';
import EditHabitModal from './EditHabitModal';
import HabitCommentsModal from './HabitCommentsModal';

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

const HabitCard = ({ 
  habit, 
  teamMembers, 
  teamCompletions, 
  currentUserId, 
  onToggleCompletion, 
  onAddProgress,
  onUpdateHabit,
  onDelete,
  onClick,
  isLoading = false,
  selectedProject,
  onRefresh
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddProgressModal, setShowAddProgressModal] = useState(false);
  const [showEditHabitModal, setShowEditHabitModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(null);
  const debounceTimer = useRef(null);
  
  // Reset optimistic state when habit prop changes
  useEffect(() => {
    setOptimisticCompleted(null);
  }, [habit.completed_today, habit.id]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);



  // Check if user completed today (with optimistic update) - memoized
  const userCompleted = useMemo(() => {
    return optimisticCompleted !== null ? optimisticCompleted : habit.completed_today;
  }, [optimisticCompleted, habit.completed_today]);

  // Get tracking icon
  const getTrackingIcon = () => {
    switch (habit.tracking_type) {
      case 'numeric': return <Hash className="w-4 h-4" />;
      case 'duration': return <Timer className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  // Get progress text
  const getProgressText = () => {
    if (habit.tracking_type === 'boolean') {
      return userCompleted ? 'Completed' : 'Mark Complete';
    }
    
    // For numeric and duration types, show actual progress
    const currentValue = habit.today_value || 0;
    const targetValue = habit.target_value || 1;
    const unit = habit.unit || '';
    
    return `${currentValue}/${targetValue} ${unit}`.trim();
  };

  // Calculate progress percentage for numeric/duration habits
  const getProgressPercentage = () => {
    if (habit.tracking_type === 'boolean') {
      return userCompleted ? 100 : 0;
    }
    
    const currentValue = habit.today_value || 0;
    const targetValue = habit.target_value || 1;
    
    return Math.min(100, Math.round((currentValue / targetValue) * 100));
  };

  // Handle habit completion with optimistic updates and debouncing
  const handleToggleCompletion = useCallback(async () => {
    if (isCompleting) return;
    
    // For numeric/duration habits, show the add progress modal instead
    if (habit.tracking_type !== 'boolean') {
      setShowAddProgressModal(true);
      return;
    }
    
    // Clear any pending debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    const newCompletedState = !userCompleted;
    
    try {
      setIsCompleting(true);
      // Optimistically update the UI immediately
      setOptimisticCompleted(newCompletedState);
      
      // Debounce the actual API call
      await new Promise((resolve, reject) => {
        debounceTimer.current = setTimeout(async () => {
          try {
            await onToggleCompletion(habit.id, habit.completed_today);
            resolve();
          } catch (error) {
            reject(error);
          }
        }, DEBOUNCE_DELAY);
      });
      
      // Clear optimistic state after successful update
      setOptimisticCompleted(null);
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticCompleted(null);
      console.error('Failed to toggle completion:', error);
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, userCompleted, habit.id, habit.completed_today, habit.tracking_type, onToggleCompletion]);

  // Handle adding progress for numeric/duration habits
  const handleAddProgress = useCallback(async (value, comments) => {
    if (isCompleting) return;
    
    try {
      setIsCompleting(true);
      await onAddProgress(habit.id, value, comments);
      setShowAddProgressModal(false);
    } catch (error) {
      console.error('Failed to add progress:', error);
      throw error;
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, habit.id, onAddProgress]);

  // Handle editing habit settings
  const handleEditHabit = useCallback(async (habitData) => {
    if (isCompleting) return;
    
    try {
      setIsCompleting(true);
      await onUpdateHabit(habit.id, habitData);
      setShowEditHabitModal(false);
    } catch (error) {
      console.error('Failed to update habit:', error);
      throw error;
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, habit.id, onUpdateHabit]);

  // Handle habit deletion with loading state
  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    
    try {
      setIsDeleting(true);
      await onDelete(habit.id);
    } catch (error) {
      console.error('Failed to delete habit:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [isDeleting, habit.id, onDelete]);

  // Get the habit color with fallback
  const habitColor = habit.color || '#6366f1';

  // Check if current user can complete this habit
  const canComplete = useMemo(() => {
    // If habit is private, only creator can complete
    if (habit.is_private) {
      return habit.created_by === currentUserId;
    }
    // Team habits can be completed by anyone
    return true;
  }, [habit.is_private, habit.created_by, currentUserId]);

  // Check if current user can edit/delete this habit
  const canEdit = useMemo(() => {
    return habit.created_by === currentUserId;
  }, [habit.created_by, currentUserId]);

  // Handle card click (open details modal)
  const handleCardClick = useCallback((e) => {
    if (onClick) {
      onClick(habit);
    }
  }, [habit, onClick]);

  // Get streak badge styling - Clean, minimal tiers
  const getStreakBadgeStyle = (streak) => {
    if (streak >= 20) return 'bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/15 text-amber-700 dark:text-amber-300 midnight:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-700/40 midnight:ring-amber-700/30';
    if (streak >= 10) return 'bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/15 text-orange-600 dark:text-orange-300 midnight:text-orange-300 ring-1 ring-orange-200/60 dark:ring-orange-700/40 midnight:ring-orange-700/30';
    if (streak >= 5) return 'bg-orange-50/70 dark:bg-orange-900/15 midnight:bg-orange-900/10 text-orange-500 dark:text-orange-400 midnight:text-orange-400 ring-1 ring-orange-200/40 dark:ring-orange-700/30 midnight:ring-orange-700/20';
    return 'bg-gray-50 dark:bg-gray-700/40 midnight:bg-gray-800/40 text-gray-500 dark:text-gray-400 midnight:text-gray-400 ring-1 ring-gray-200/50 dark:ring-gray-600/30 midnight:ring-gray-700/20';
  };

  return (
    <div 
      onClick={handleCardClick}
      className="bg-white dark:bg-gray-800/90 midnight:bg-gray-900/90 rounded-xl border border-gray-200/80 dark:border-gray-700/50 midnight:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600/60 midnight:hover:border-gray-600/50 transition-all duration-200 cursor-pointer group relative"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e);
        }
      }}
      aria-label={`View details for ${habit.name}`}
    >
      {/* Thin left accent */}
      <div 
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: habitColor }}
      />
      
      <div className="px-5 py-4 pl-6">
        {/* Row 1: Icon + Title + Badges + Actions */}
        <div className="flex items-center gap-3 mb-3">
          {/* Icon */}
          <div 
            className="text-xl w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ 
              backgroundColor: `${habitColor}10`,
              border: `1px solid ${habitColor}18`
            }}
          >
            {habit.icon}
          </div>

          {/* Title + inline metadata */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h3 className="font-semibold text-[15px] text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
              {habit.name}
            </h3>
            
            {/* Streak Badge — minimal pill */}
            {habit.current_streak > 0 && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${getStreakBadgeStyle(habit.current_streak)}`}>
                <Flame className="w-3 h-3" />
                <span>{habit.current_streak}</span>
              </div>
            )}

            {/* Privacy Badge — subtle */}
            {habit.is_private !== undefined && (
              <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                habit.is_private 
                  ? 'text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-700/50 midnight:bg-gray-800/50'
                  : 'text-blue-600 dark:text-blue-400 midnight:text-blue-400 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/15'
              }`}>
                {habit.is_private ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                <span>{habit.is_private ? 'Private' : 'Team'}</span>
              </div>
            )}
          </div>

          {/* Action buttons — visible on hover, compact */}
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {habit.recent_completions?.filter(c => c.notes).length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowCommentsModal(true); }}
                className="relative p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md transition-colors"
                aria-label="View comments"
                title="View comments"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="absolute -top-0.5 -right-0.5 bg-purple-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {habit.recent_completions.filter(c => c.notes).length}
                </span>
              </button>
            )}
            
            <button
              onClick={(e) => { e.stopPropagation(); setShowEditHabitModal(true); }}
              disabled={!canEdit}
              title={!canEdit ? 'Only the creator can edit this habit' : 'Edit habit'}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            
            {!showDeleteConfirm ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                disabled={!canEdit}
                title={!canEdit ? 'Only the creator can delete this habit' : 'Delete habit'}
                className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  disabled={isDeleting}
                  className="px-2 py-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                >
                  {isDeleting ? '...' : 'Delete?'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                  aria-label="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Tags */}
        <div className="flex items-center gap-1.5 mb-3 pl-12">
          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 bg-gray-100/80 dark:bg-gray-700/40 midnight:bg-gray-800/40">
            {habit.category}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-400 midnight:text-gray-400 bg-gray-100/80 dark:bg-gray-700/40 midnight:bg-gray-800/40">
            {habit.frequency}
          </span>
          {habit.description && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 midnight:text-gray-500 truncate ml-1">
              • {habit.description}
            </span>
          )}
        </div>

        {/* Team Stats — clean inline bar */}
        {habit.team_stats && !habit.is_private && (
          <div className="mb-3 pl-12">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-750/40 midnight:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 midnight:border-gray-700/20">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                    Team Progress
                    {habit.tracking_type !== 'boolean' && habit.team_stats.total_team_value > 0 && (
                      <span className="ml-1 text-gray-400 dark:text-gray-500">
                        • Total: {habit.team_stats.total_team_value} {habit.unit || ''}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300 tabular-nums">
                    {habit.team_stats.completed_members}/{habit.team_stats.total_members}
                  </span>
                </div>
                <div className="w-full bg-gray-200/60 dark:bg-gray-700/40 midnight:bg-gray-700/30 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${habit.team_stats.completion_percentage || 0}%`,
                      backgroundColor: habitColor 
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 midnight:text-gray-400 tabular-nums w-8 text-right">
                {habit.team_stats.completion_percentage || 0}%
              </span>
            </div>
          </div>
        )}

        {/* Private habit: Creator Status for non-creators */}
        {habit.is_private && habit.team_stats && habit.created_by !== currentUserId && (
          <div className="pl-12">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-750/40 midnight:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 midnight:border-gray-700/20">
              <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">Creator Status</span>
                  <span className={`text-[11px] font-semibold ${
                    habit.team_stats.creator_completed 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {habit.team_stats.creator_completed ? 'Done' : 'Pending'}
                  </span>
                </div>
                <div className="w-full bg-gray-200/60 dark:bg-gray-700/40 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 transition-all duration-500"
                    style={{ width: `${habit.team_stats.completion_percentage || 0}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-400 tabular-nums w-8 text-right">
                {habit.team_stats.completion_percentage || 0}%
              </span>
            </div>
          </div>
        )}
            
        {/* Progress + Action — clean bottom row */}
        {!(habit.is_private && habit.created_by !== currentUserId) && (
          <div className="flex items-center gap-3 pl-12">
            {habit.tracking_type !== 'boolean' ? (
              <>
                {/* Numeric/Duration Progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-500">Progress</span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: getProgressPercentage() >= 100 ? '#10B981' : habitColor }}>
                      {getProgressText()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200/60 dark:bg-gray-700/40 midnight:bg-gray-700/30 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${getProgressPercentage()}%`,
                        backgroundColor: getProgressPercentage() >= 100 ? '#10B981' : habitColor
                      }}
                    />
                  </div>
                </div>
                
                {/* Track button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleCompletion(); }}
                  disabled={isCompleting || isLoading || !canComplete}
                  title={!canComplete ? 'Only the creator can complete this private habit' : ''}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                    (habit.today_value || 0) >= (habit.target_value || 1)
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'text-white hover:opacity-90'
                  }`}
                  style={!((habit.today_value || 0) >= (habit.target_value || 1)) ? {
                    backgroundColor: habitColor
                  } : {}}
                >
                  {isCompleting ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (habit.today_value || 0) >= (habit.target_value || 1) ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </>
                  ) : (
                    <>
                      {React.cloneElement(getTrackingIcon(), { className: 'w-3.5 h-3.5' })}
                      <span>{habit.today_value > 0 ? 'Add More' : 'Track'}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* Boolean Progress */}
                {(!habit.is_private || habit.created_by === currentUserId) && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-500">Progress</span>
                        <span className={`text-[11px] font-semibold ${
                          userCompleted 
                            ? 'text-emerald-500 dark:text-emerald-400' 
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {userCompleted ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200/60 dark:bg-gray-700/40 midnight:bg-gray-700/30 rounded-full h-1.5 overflow-hidden">
                        {userCompleted && (
                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500 w-full" />
                        )}
                      </div>
                    </div>
                    
                    {/* Complete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleCompletion(); }}
                      disabled={isCompleting || isLoading || !canComplete}
                      title={!canComplete ? 'Only the creator can complete this private habit' : ''}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                        userCompleted
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'text-white hover:opacity-90'
                      }`}
                      style={!userCompleted ? { backgroundColor: habitColor } : {}}
                    >
                      {isCompleting ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : userCompleted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-3.5 h-3.5" />
                          <span>Mark Done</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddProgressModal && habit.tracking_type !== 'boolean' && (
        <AddProgressModal
          habit={habit}
          onClose={() => setShowAddProgressModal(false)}
          onSubmit={handleAddProgress}
          isSubmitting={isCompleting}
        />
      )}

      {showEditHabitModal && (
        <EditHabitModal
          habit={habit}
          onClose={() => setShowEditHabitModal(false)}
          onSubmit={handleEditHabit}
          isSubmitting={isCompleting}
          selectedProject={selectedProject}
        />
      )}

      {showCommentsModal && (
        <HabitCommentsModal
          habit={habit}
          onClose={() => setShowCommentsModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

export default HabitCard;