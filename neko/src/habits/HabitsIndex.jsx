import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import CreateHabitModal from './CreateHabitModal';
import HabitCard from './HabitCard';
import HabitDetailsModal from './HabitDetailsModal';
import GamificationStats from './GamificationStats';
import HabitCardSkeleton from './HabitCardSkeleton';
import { habitApi, habitOperations } from './habitApi';
import {
  Target,
  Plus,
  X,
  RefreshCw
} from 'lucide-react';

const ERROR_DISPLAY_DURATION = 5000;

const HabitsIndex = ({ selectedProject, session, currentPage }) => {
  const [habits, setHabits] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState({ habits: true, analytics: true });
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [errorTimeout, setErrorTimeout] = useState(null);

  const { currentWorkspace } = useWorkspace();

  // Clear error with cleanup
  const clearError = useCallback(() => {
    if (errorTimeout) clearTimeout(errorTimeout);
    setError(null);
    setErrorTimeout(null);
  }, [errorTimeout]);

  // Set error with auto-clear
  const showError = useCallback((message) => {
    if (errorTimeout) clearTimeout(errorTimeout);
    setError(message);
    const timeout = setTimeout(() => {
      setError(null);
      setErrorTimeout(null);
    }, ERROR_DISPLAY_DURATION);
    setErrorTimeout(timeout);
  }, [errorTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (errorTimeout) clearTimeout(errorTimeout); };
  }, [errorTimeout]);

  // Fetch habits
  const fetchHabits = useCallback(async () => {
    if (!selectedProject?.id) {
      setHabits([]);
      setLoading(prev => ({ ...prev, habits: false }));
      return;
    }
    try {
      setLoading(prev => ({ ...prev, habits: true }));
      const data = await habitApi.getHabits(selectedProject.id);
      if (data.success) {
        setHabits(data.data || []);
      } else {
        throw new Error(data.error || 'Failed to fetch habits');
      }
    } catch (err) {
      console.error('Error fetching habits:', err);
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, habits: false }));
    }
  }, [selectedProject?.id]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    if (!selectedProject?.id) {
      setAnalytics(null);
      setLoading(prev => ({ ...prev, analytics: false }));
      return;
    }
    try {
      setLoading(prev => ({ ...prev, analytics: true }));
      const data = await habitApi.getHabitAnalytics(selectedProject.id);
      if (data.success) setAnalytics(data.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(prev => ({ ...prev, analytics: false }));
    }
  }, [selectedProject?.id]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    await Promise.all([fetchHabits(), fetchAnalytics()]);
  }, [fetchHabits, fetchAnalytics]);

  useEffect(() => {
    fetchHabits();
    fetchAnalytics();
  }, [fetchHabits, fetchAnalytics]);

  // Check for create trigger from Universal Search
  useEffect(() => {
    const shouldTriggerCreate = sessionStorage.getItem('triggerCreateHabit');
    if (shouldTriggerCreate === 'true' && selectedProject?.id) {
      sessionStorage.removeItem('triggerCreateHabit');
      setShowCreateModal(true);
    }
  }, [selectedProject?.id, currentPage]);

  // Complete/uncomplete habit
  const toggleHabitCompletion = async (habitId, isCompleted) => {
    try {
      await habitOperations.toggleHabitCompletion(habitId, isCompleted);
      await refreshData();
    } catch (err) {
      console.error('Error updating habit:', err);
      showError(`Failed to ${isCompleted ? 'uncomplete' : 'complete'} habit. Please try again.`);
      throw err;
    }
  };

  // Add progress for numeric/duration habits
  const addHabitProgress = async (habitId, value, comment) => {
    try {
      await habitApi.completeHabit(habitId, value, comment);
      await refreshData();
    } catch (err) {
      console.error('Error adding progress:', err);
      showError('Failed to add progress. Please try again.');
      throw err;
    }
  };

  // Update habit settings
  const updateHabit = async (habitId, habitData) => {
    try {
      await habitApi.updateHabit(habitId, habitData);
      await refreshData();
    } catch (err) {
      console.error('Error updating habit:', err);
      showError('Failed to update habit. Please try again.');
      throw err;
    }
  };

  // Delete habit
  const deleteHabit = async (habitId) => {
    try {
      await habitApi.deleteHabit(habitId);
      await refreshData();
    } catch (err) {
      console.error('Error deleting habit:', err);
      showError('Failed to delete habit. Please try again.');
    }
  };

  // Refresh all habit data
  const refreshHabits = async () => {
    try {
      await refreshData();
    } catch (err) {
      console.error('Error refreshing habits:', err);
    }
  };

  // Manual refresh with user feedback
  const handleManualRefresh = async () => {
    try {
      setIsManualRefreshing(true);
      await refreshData();
    } catch (err) {
      console.error('Error refreshing data:', err);
      showError('Failed to refresh data. Please try again.');
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const handleHabitCreated = () => {
    setShowCreateModal(false);
    refreshData();
  };

  const handleHabitClick = useCallback((habit) => {
    setSelectedHabit(habit);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedHabit(null);
    refreshData();
  }, [refreshData]);

  // Skeleton loading component
  const HabitsSkeleton = () => (
    <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-7 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg w-48 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg w-80 animate-pulse"></div>
          </div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg w-32 animate-pulse"></div>
        </div>
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-100 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-20"></div>
                  <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-16"></div>
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded w-24"></div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full w-full mt-3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          {[...Array(3)].map((_, index) => (
            <HabitCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );

  const isInitialLoading = loading.habits && habits.length === 0;

  if (isInitialLoading) {
    return <HabitsSkeleton />;
  }

  if (!selectedProject) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Target className="w-12 h-12 text-gray-400 dark:text-gray-600 midnight:text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-white mb-2">
            No project selected
          </h3>
          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
            Please select a project to view and manage habits.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                Project Habits
              </h1>
              {(loading.habits || loading.analytics) && (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin opacity-50" />
              )}
            </div>
            <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
              Build positive routines in <span className="font-medium">{selectedProject.emoji} {selectedProject.name}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isManualRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>New Habit</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800/50 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-red-500">⚠️</span>
              <p className="text-red-600 dark:text-red-400 midnight:text-red-400">{error}</p>
            </div>
            <button onClick={clearError} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 midnight:hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Gamification Stats */}
        <GamificationStats
          analytics={analytics}
          session={session}
          loading={loading.analytics}
        />

        {/* Habits list */}
        <div>
          {habits.length === 0 ? (
            <div className="text-center py-12">
              <Target className="w-12 h-12 text-gray-400 dark:text-gray-600 midnight:text-gray-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-white mb-2">
                No habits yet in {selectedProject.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-4">
                Create your first project habit to start building positive routines
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Habit</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {habits.map(habit => (
                <HabitCard
                  key={`${habit.id}-${habit.completed_today}-${habit.today_notes || ''}-${habit.updated_at || Date.now()}`}
                  habit={habit}
                  onToggleCompletion={toggleHabitCompletion}
                  onAddProgress={addHabitProgress}
                  onUpdateHabit={updateHabit}
                  onDelete={deleteHabit}
                  onClick={handleHabitClick}
                  isLoading={false}
                  selectedProject={selectedProject}
                  onRefresh={refreshHabits}
                />
              ))}
              {loading.habits && habits.length > 0 && (
                <>
                  {[...Array(2)].map((_, index) => (
                    <HabitCardSkeleton key={`loading-${index}`} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <CreateHabitModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onHabitCreated={handleHabitCreated}
        selectedProject={selectedProject}
      />

      {/* Habit Details Modal */}
      {selectedHabit && (
        <HabitDetailsModal
          habit={selectedHabit}
          isOpen={!!selectedHabit}
          onClose={handleCloseDetails}
          onToggleCompletion={toggleHabitCompletion}
          onAddProgress={addHabitProgress}
          onDelete={deleteHabit}
          session={session}
        />
      )}
    </div>
  );
};

export default HabitsIndex;
