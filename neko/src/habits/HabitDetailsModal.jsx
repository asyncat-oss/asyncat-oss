import { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Flame, 
  TrendingUp, 
  Calendar, 
  Users, 
  Target,
  CheckCircle2,
  Circle,
  Clock,
  Hash,
  Timer,
  Award,
  BarChart3,
  Edit2,
  Trash2,
  FileText
} from 'lucide-react';
import AddProgressModal from './AddProgressModal';
import HabitCalendarView from './HabitCalendarView';

const HabitDetailsModal = ({ 
  habit, 
  isOpen, 
  onClose, 
  onToggleCompletion,
  onAddProgress,
  onDelete,
  teamMembers,
  teamCompletions,
  currentUserId,
  session
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [completionHistory, setCompletionHistory] = useState([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddProgressModal, setShowAddProgressModal] = useState(false);
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);
  
  // Optimistic state for immediate UI updates
  const [optimisticCompleted, setOptimisticCompleted] = useState(null);
  
  // Get the current completion state (optimistic or actual)
  const currentCompleted = optimisticCompleted !== null ? optimisticCompleted : habit.completed_today;
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('overview');
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      setIsCompleting(false);
      setOptimisticCompleted(null);
    }
  }, [isOpen, habit]);
  
  // Sync optimistic state with actual habit state
  useEffect(() => {
    setOptimisticCompleted(null);
  }, [habit.completed_today]);
  
  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Calculate completion rate for this habit (used in Overview tab)
  const completionRate = useMemo(() => {
    if (!habit.recent_completions?.length) return 0;
    const last30Days = Math.min(30, habit.recent_completions.length);
    const completed = habit.recent_completions.slice(0, last30Days).filter(c => c.completed_date).length;
    return Math.round((completed / 30) * 100);
  }, [habit.recent_completions]);

  // Get team completion stats for this habit
  const teamStats = useMemo(() => {
    const total = teamMembers.length;
    const completed = teamCompletions.length;
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [teamMembers, teamCompletions]);

  // Get tracking icon
  const getTrackingIcon = () => {
    switch (habit.tracking_type) {
      case 'numeric': return <Hash className="w-4 h-4" />;
      case 'duration': return <Timer className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  // Check if current user can complete this habit - NEW
  const canComplete = useMemo(() => {
    // If habit is private, only creator can complete
    if (habit.is_private) {
      return habit.created_by === currentUserId;
    }
    // Team habits can be completed by anyone
    return true;
  }, [habit.is_private, habit.created_by, currentUserId]);

  // Check if current user can edit/delete this habit - NEW
  const canEdit = useMemo(() => {
    return habit.created_by === currentUserId;
  }, [habit.created_by, currentUserId]);

  // Handle habit completion with optimistic update
  const handleToggle = async () => {
    if (isCompleting || !canComplete) return; // Add canComplete check
    
    // For boolean habits, toggle completion (complete/uncomplete)
    if (habit.tracking_type === 'boolean') {
      const newCompletedState = !currentCompleted;
      
      try {
        setIsCompleting(true);
        setOptimisticCompleted(newCompletedState);
        
        await onToggleCompletion(habit.id, habit.completed_today);
      } catch (error) {
        console.error('Failed to toggle completion:', error);
        setOptimisticCompleted(habit.completed_today);
      } finally {
        setIsCompleting(false);
      }
      return;
    }
    
    // For numeric/duration habits, instantly complete with target value or uncomplete
    const newCompletedState = !currentCompleted;
    
    try {
      setIsCompleting(true);
      setOptimisticCompleted(newCompletedState);
      
      if (newCompletedState) {
        // Mark as complete - calculate remaining to reach target
        const currentProgress = habit.today_value || 0;
        const targetValue = habit.target_value || 1;
        const remainingToTarget = Math.max(0, targetValue - currentProgress);
        
        // Add only what's needed to reach target (don't exceed it)
        await onAddProgress(habit.id, remainingToTarget, '');
      } else {
        // Uncomplete
        await onToggleCompletion(habit.id, habit.completed_today);
      }
    } catch (error) {
      console.error('Failed to toggle completion:', error);
      setOptimisticCompleted(habit.completed_today);
    } finally {
      setIsCompleting(false);
    }
  };

  // Handle adding progress for numeric/duration habits
  const handleAddProgress = async (value, comment) => {
    if (isCompleting) return;
    
    try {
      setIsCompleting(true);
      await onAddProgress(habit.id, value, comment);
      setShowAddProgressModal(false);
      // Modal will close and data will refresh
    } catch (error) {
      console.error('Failed to add progress:', error);
      throw error;
    } finally {
      setIsCompleting(false);
    }
  };

  // Handle habit deletion
  const handleDelete = async () => {
    if (isDeleting) return;
    
    try {
      setIsDeleting(true);
      await onDelete(habit.id);
      onClose(); // Close modal after successful deletion
    } catch (error) {
      console.error('Failed to delete habit:', error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const habitColor = habit.color || '#6366f1';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          borderTop: `4px solid ${habitColor}` 
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div className="flex items-start justify-between p-6">
            <div className="flex items-start space-x-4 flex-1">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                style={{ 
                  backgroundColor: `${habitColor}15`,
                  border: `2px solid ${habitColor}40`
                }}
              >
                {habit.icon}
              </div>
              
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white mb-1">
                  {habit.name}
                </h2>
                {habit.description && (
                  <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 text-sm">
                    {habit.description}
                  </p>
                )}
                <div className="flex items-center space-x-4 mt-2">
                  <span className="inline-flex items-center text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                    {getTrackingIcon()}
                    <span className="ml-1">{habit.tracking_type}</span>
                  </span>
                </div>
              </div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 px-6 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
            {['overview', 'progress', 'team'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize transition-colors relative ${
                  activeTab === tab
                    ? 'text-gray-900 dark:text-gray-100 midnight:text-white'
                    : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: habitColor }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={<Flame className="w-5 h-5 text-orange-500" />}
                  label="Current Streak"
                  value={`${habit.current_streak || 0} ${habit.frequency === 'weekly' ? 'week' : habit.frequency === 'monthly' ? 'month' : 'day'}${(habit.current_streak || 0) !== 1 ? 's' : ''}`}
                  bgColor="bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10"
                />
                <StatCard
                  icon={<Award className="w-5 h-5 text-yellow-500" />}
                  label="Longest Streak"
                  value={`${habit.longest_streak || 0} ${habit.frequency === 'weekly' ? 'week' : habit.frequency === 'monthly' ? 'month' : 'day'}${(habit.longest_streak || 0) !== 1 ? 's' : ''}`}
                  bgColor="bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10"
                />
                <StatCard
                  icon={<Target className="w-5 h-5 text-blue-500" />}
                  label="Completion Rate"
                  value={`${completionRate}%`}
                  bgColor="bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10"
                />
                <StatCard
                  icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
                  label="Total Completions"
                  value={habit.recent_completions?.length || 0}
                  bgColor="bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10"
                />
              </div>

              {/* Habit Details */}
              <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                  Habit Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <DetailItem label="Target" value={`${habit.target_value} ${habit.unit || ''}`} />
                  <DetailItem label="Tracking Type" value={habit.tracking_type} />
                  <DetailItem label="Frequency" value={habit.frequency?.charAt(0).toUpperCase() + habit.frequency?.slice(1) || 'Daily'} />
                  <DetailItem label="Privacy" value={habit.is_private ? 'Private 🔒' : 'Team 👥'} />
                  <DetailItem 
                    label="Created" 
                    value={new Date(habit.created_at).toLocaleDateString()} 
                  />
                  <DetailItem 
                    label="Created by" 
                    value={habit.created_by_user?.name || habit.created_by_user?.email || 'Unknown'} 
                  />
                </div>
              </div>

              {/* Today's Status - Only show if user can complete this habit */}
              {canComplete && (
                <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-3">
                    Today's Status
                  </h3>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {currentCompleted ? (
                        <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-6 h-6" />
                          <span className="font-medium">Completed</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                          <Circle className="w-6 h-6" />
                          <span className="font-medium">Not completed</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {habit.tracking_type !== 'boolean' && (
                        <button
                          onClick={() => setShowAddProgressModal(true)}
                          disabled={isCompleting || !canComplete}
                          title={!canComplete ? 'Only the creator can complete this private habit' : 'Adjust progress'}
                          className="px-3 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500 midnight:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 midnight:border-gray-600"
                        >
                          Adjust Progress
                        </button>
                      )}
                      <button
                        onClick={handleToggle}
                        disabled={isCompleting || !canComplete}
                        title={!canComplete ? 'Only the creator can complete this private habit' : ''}
                        className={`px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          currentCompleted
                            ? 'bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 midnight:hover:bg-gray-600'
                            : 'text-white hover:opacity-90'
                        }`}
                        style={!currentCompleted ? { backgroundColor: habitColor } : {}}
                      >
                        {isCompleting ? 'Loading...' : currentCompleted ? 'Mark Incomplete' : 'Mark Complete'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Display today's comments if they exist */}
                  {habit.today_comments && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 midnight:border-gray-700">
                      <div className="flex items-start space-x-2">
                        <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 midnight:text-indigo-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
                            Today's Comment:
                          </div>
                          <div className="text-sm text-gray-800 dark:text-gray-200 midnight:text-gray-200 bg-white dark:bg-gray-800 midnight:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-600 midnight:border-gray-700">
                            {habit.today_comments}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'progress' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left Side - Calendar (2 columns) */}
              <div className="order-2 lg:order-1 lg:col-span-2">
                <HabitCalendarView 
                  habit={habit} 
                  habitColor={habitColor}
                  onDaySelect={setSelectedDayInfo}
                />
              </div>

              {/* Right Side - Details (1 column) */}
              <div className="order-1 lg:order-2 lg:col-span-1 space-y-3">
                {/* Streak Information */}
                <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 midnight:from-orange-900/10 midnight:to-yellow-900/10 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Flame className="w-5 h-5 text-orange-500" />
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                          Streak Progress
                        </h3>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 text-xs">
                        Keep going! You're on a {habit.current_streak || 0} day streak
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-orange-500">
                        {habit.current_streak || 0}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                        Best: {habit.longest_streak || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selected Day Info */}
                {selectedDayInfo ? (
                  <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-4 border-2 shadow-sm" style={{ borderColor: `${habitColor}40` }}>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-2">
                      {selectedDayInfo.formattedDate}
                    </h4>
                    
                    {selectedDayInfo.isCompleted ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" style={{ color: habitColor }} />
                          <span className="text-sm font-medium" style={{ color: habitColor }}>
                            Completed
                          </span>
                          {habit.tracking_type !== 'boolean' && selectedDayInfo.completion?.value > 0 && (
                            <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                              • {selectedDayInfo.completion.value} {habit.unit}
                            </span>
                          )}
                        </div>

                        {selectedDayInfo.completion?.comments && (
                          <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 midnight:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300 uppercase tracking-wider">
                                Comment
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {selectedDayInfo.completion.comments}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Circle className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                          Not completed
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                    <div className="text-center text-gray-500 dark:text-gray-400 midnight:text-gray-400 text-sm">
                      📅 Click on a calendar day to see details
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-6">
              {/* Privacy Badge */}
              <div className={`p-4 rounded-lg border ${
                habit.is_private 
                  ? 'bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 border-gray-300 dark:border-gray-600 midnight:border-gray-700'
                  : 'bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 border-indigo-200 dark:border-indigo-700 midnight:border-indigo-700'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{habit.is_private ? '🔒' : '👥'}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                      {habit.is_private ? 'Private Habit' : 'Team Habit'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 mt-1">
                      {habit.is_private 
                        ? 'Only you can complete and edit this habit. Your progress is private.'
                        : 'All project members can complete this habit and contribute to shared progress.'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Show team progress only for non-private habits */}
              {!habit.is_private && (
                <>
                  {/* Team Progress */}
                  <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-4">
                      Team Progress Today
                    </h3>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                        {teamStats.completed} of {teamStats.total} members completed
                      </span>
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white">
                        {teamStats.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full h-3">
                      <div 
                        className="h-3 rounded-full transition-all"
                        style={{ 
                          width: `${teamStats.percentage}%`,
                          backgroundColor: habitColor
                        }}
                      />
                    </div>
                  </div>

                  {/* Team Members */}
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-4">
                      Team Members
                    </h3>
                    <div className="space-y-2">
                      {teamMembers.map((member) => {
                        const hasCompleted = teamCompletions.some(c => c.user_id === member.user_id || c.user_id === member.id);
                        const isCurrentUser = (member.user_id || member.id) === currentUserId;
                        
                        return (
                          <div
                            key={member.user_id || member.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                              isCurrentUser
                                ? 'bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 midnight:border-indigo-800'
                                : 'bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                                hasCompleted
                                  ? 'text-white'
                                  : 'bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 text-gray-600 dark:text-gray-300 midnight:text-gray-300'
                              }`}
                              style={hasCompleted ? { backgroundColor: habitColor } : {}}>
                                {(member.users?.name || member.user?.name || member.name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-white">
                                  {member.users?.name || member.user?.name || member.name || 'Unknown'}
                                  {isCurrentUser && ' (You)'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                                  {member.users?.email || member.user?.email || member.email || ''}
                                </div>
                              </div>
                            </div>
                            {hasCompleted && (
                              <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="w-5 h-5" />
                                <span className="text-sm font-medium">Completed</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Show creator info and completion status for private habits */}
              {habit.is_private && (
                <>
                  {/* Creator's Today Status - Only show to creator */}
                  {habit.team_stats && habit.created_by === currentUserId && (
                    <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-4">
                        Today's Status
                      </h3>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                          Your progress today
                        </span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white">
                          {habit.team_stats.completion_percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full h-3">
                        <div 
                          className="h-3 rounded-full transition-all bg-gradient-to-r from-gray-500 to-gray-600"
                          style={{ 
                            width: `${habit.team_stats.completion_percentage}%`
                          }}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {habit.team_stats.creator_completed ? (
                          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Completed today</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                            <Circle className="w-5 h-5" />
                            <span className="text-sm font-medium">Not completed yet</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Creator Status - Only show to non-creator team members */}
                  {habit.team_stats && habit.created_by !== currentUserId && (
                    <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-4">
                        Creator Status
                      </h3>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                          Creator's progress today
                        </span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white">
                          {habit.team_stats.completion_percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full h-3">
                        <div 
                          className="h-3 rounded-full transition-all bg-gradient-to-r from-gray-500 to-gray-600"
                          style={{ 
                            width: `${habit.team_stats.completion_percentage}%`
                          }}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {habit.team_stats.creator_completed ? (
                          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Creator completed today</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                            <Circle className="w-5 h-5" />
                            <span className="text-sm font-medium">Not completed yet</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Habit Owner Info */}
                  <div className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-white mb-4">
                      Habit Owner
                    </h3>
                    <div className="flex items-center gap-3">
                      <div 
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-lg ${
                          habit.team_stats?.creator_completed ? '' : 'opacity-60'
                        }`}
                        style={{ 
                          backgroundColor: habit.team_stats?.creator_completed ? habitColor : '#6b7280'
                        }}
                      >
                        {(habit.created_by_user?.name || habit.created_by_user?.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-white">
                          {habit.created_by_user?.name || 'Unknown User'}
                          {habit.created_by === currentUserId && ' (You)'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                          {habit.created_by_user?.email || ''}
                        </div>
                      </div>
                      {habit.team_stats?.creator_completed && (
                        <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions - Always visible at bottom */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!canEdit}
                title={!canEdit ? 'Only the creator can delete this habit' : 'Delete habit'}
                className="flex items-center space-x-2 px-4 py-2 text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Habit</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  Are you sure?
                </span>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>

      {/* Add Progress Modal for Numeric/Duration Habits */}
      {showAddProgressModal && habit.tracking_type !== 'boolean' && (
        <AddProgressModal
          habit={habit}
          onClose={() => setShowAddProgressModal(false)}
          onSubmit={handleAddProgress}
          isSubmitting={isCompleting}
        />
      )}
    </div>
  );
};

// Stat Card Component
const StatCard = ({ icon, label, value, bgColor }) => (
  <div className={`${bgColor} rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800`}>
    <div className="flex items-center space-x-2 mb-2">
      {icon}
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
        {label}
      </span>
    </div>
    <div className="text-xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white">
      {value}
    </div>
  </div>
);

// Detail Item Component
const DetailItem = ({ label, value }) => (
  <div>
    <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1">
      {label}
    </div>
    <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-white capitalize">
      {value}
    </div>
  </div>
);

export default HabitDetailsModal;
