import { useState, useEffect } from 'react';
import { X, CheckCircle2, Calendar, Award, TrendingUp, Info, Sparkles, Target, ArrowLeft } from 'lucide-react';
import { habitApi } from './habitApi';

const PerformerDetailsModal = ({ isOpen, onClose, performer, projectId }) => {
  const [loading, setLoading] = useState(false);
  const [performerDetails, setPerformerDetails] = useState(null);
  const [error, setError] = useState(null);
  const [showAllCompletions, setShowAllCompletions] = useState(false);
  const [showXPInfo, setShowXPInfo] = useState(false);

  // Fetch performer details when modal opens
  useEffect(() => {
    if (isOpen && performer && projectId) {
      fetchPerformerDetails();
    }
  }, [isOpen, performer, projectId]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setPerformerDetails(null);
      setError(null);
      setShowAllCompletions(false);
      setShowXPInfo(false);
    }
  }, [isOpen]);

  const fetchPerformerDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await habitApi.getPerformerDetails(projectId, performer.user_id);
      if (data.success) {
        setPerformerDetails(data.data);
      }
    } catch (err) {
      console.error('Error fetching performer details:', err);
      setError(err.message || 'Failed to load performer details');
    } finally {
      setLoading(false);
    }
  };

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

  if (!isOpen || !performer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="absolute inset-0" 
        onClick={onClose}
      />
      
      <div 
        className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="performer-details-title"
        aria-describedby="performer-details-description"
      >
        {/* Header - Fixed */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {showXPInfo ? (
                <button
                  onClick={() => setShowXPInfo(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 midnight:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
                  title="Back to profile"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 flex items-center justify-center text-lg font-semibold text-indigo-600 dark:text-indigo-400 midnight:text-indigo-300">
                  {performer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 
                  id="performer-details-title"
                  className="text-xl font-bold text-gray-900 dark:text-gray-100 midnight:text-white"
                >
                  {showXPInfo ? 'XP & Level Calculation' : performer.name}
                </h2>
                <p 
                  id="performer-details-description"
                  className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400"
                >
                  {showXPInfo ? 'How points are calculated' : `${performer.completions} total completion${performer.completions !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              {!showXPInfo && (
                <button
                  onClick={() => setShowXPInfo(true)}
                  className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 midnight:hover:bg-indigo-900/20 transition-colors"
                  title="How XP is calculated"
                >
                  <Info className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* XP Info View */}
          {showXPInfo ? (
            <XPInfoContent 
              performerDetails={performerDetails} 
              performer={performer}
            />
          ) : (
            <>
              {loading && (
            <div className="space-y-4">
              {/* Stats Skeleton */}
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-20 mb-2 animate-pulse" />
                    <div className="h-6 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-12 animate-pulse" />
                  </div>
                ))}
              </div>
              
              {/* Habits Skeleton */}
              <div className="space-y-2 mt-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-32 mb-2 animate-pulse" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-24 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg p-4 text-center">
              <p className="text-red-600 dark:text-red-400 midnight:text-red-400">{error}</p>
              <button
                onClick={fetchPerformerDetails}
                className="mt-2 text-sm text-red-700 dark:text-red-300 midnight:text-red-300 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && performerDetails && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  icon={<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 midnight:text-green-400" />}
                  label="This Week"
                  value={performerDetails.completionsThisWeek}
                  bgColor="bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10"
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />}
                  label="Streak"
                  value={`${performerDetails.currentStreak} days`}
                  bgColor="bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10"
                />
                <StatCard
                  icon={<Award className="w-5 h-5 text-yellow-600 dark:text-yellow-400 midnight:text-yellow-400" />}
                  label="Level"
                  value={performerDetails.level}
                  bgColor="bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10"
                />
                <StatCard
                  icon={<Award className="w-5 h-5 text-purple-600 dark:text-purple-400 midnight:text-purple-400" />}
                  label="XP"
                  value={(performerDetails.xp || 0).toLocaleString()}
                  bgColor="bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/10"
                />
              </div>

              {/* Recently Completed Habits */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-300 midnight:text-gray-300" />
                  Recent Completions
                </h3>
                <div className="space-y-2.5">
                  {performerDetails.recentCompletions && performerDetails.recentCompletions.length > 0 ? (
                    <>
                      {(showAllCompletions 
                        ? performerDetails.recentCompletions 
                        : performerDetails.recentCompletions.slice(0, 3)
                      ).map((completion, index) => (
                        <div 
                          key={index}
                          className="bg-white/80 dark:bg-gray-700/50 midnight:bg-gray-800/50 rounded-lg px-3.5 py-2.5 border border-gray-200/70 dark:border-gray-600/35 midnight:border-gray-700/35 hover:border-gray-300 dark:hover:border-gray-600/50 midnight:hover:border-gray-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
                              style={{ 
                                backgroundColor: `${completion.color}15`,
                                border: `2px solid ${completion.color}40`
                              }}
                            >
                              {completion.icon}
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900 dark:text-white midnight:text-white text-sm truncate">
                                {completion.habit_name}
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-200 midnight:text-gray-200 whitespace-nowrap">
                                  {new Date(completion.completed_date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500" strokeWidth={2.5} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* View More/Less button */}
                      {performerDetails.recentCompletions.length > 3 && (
                        <button
                          onClick={() => setShowAllCompletions(!showAllCompletions)}
                          className="w-full mt-2 px-4 py-2.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 
                                   hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors
                                   border border-gray-200 dark:border-gray-700/40 midnight:border-gray-800/40 hover:border-indigo-300 dark:hover:border-indigo-700/60"
                        >
                          {showAllCompletions 
                            ? 'Show Less' 
                            : `View ${performerDetails.recentCompletions.length - 3} More`
                          }
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 text-center py-6 bg-gray-50/60 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
                      No recent completions
                    </p>
                  )}
                </div>
              </div>

              {/* Most Completed Habits */}
              {performerDetails.topHabits && performerDetails.topHabits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-3 flex items-center">
                    <Award className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-300 midnight:text-gray-300" />
                    Most Completed Habits
                  </h3>
                  <div className="space-y-2">
                    {performerDetails.topHabits.map((habit, index) => (
                      <div 
                        key={index}
                        className="bg-gray-50/50 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-600/30 midnight:border-gray-700/30 hover:border-gray-300/70 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                              style={{ 
                                backgroundColor: `${habit.color}15`,
                                border: `2px solid ${habit.color}40`
                              }}
                            >
                              {habit.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white midnight:text-white text-sm truncate">
                                {habit.habit_name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-300">
                                {habit.category}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white">
                              {habit.completions}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-300">
                              times
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// XP Info Content Component - Shows detailed XP calculation breakdown
const XPInfoContent = ({ performerDetails, performer }) => {
  // Calculate example values based on performer data
  const completions = performer?.completions || 0;
  const xp = performerDetails?.xp || performer?.xp || 0;
  const level = performerDetails?.level || performer?.level || 1;

  return (
    <div className="space-y-5">
      {/* Main Formula Card */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 midnight:from-indigo-900/10 midnight:to-purple-900/10 rounded-xl p-5 border border-indigo-200 dark:border-indigo-800/40 midnight:border-indigo-800/30">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-gray-900 dark:text-white midnight:text-white">XP Calculation Formula</h3>
        </div>
        
        <div className="bg-white/80 dark:bg-gray-800/60 midnight:bg-gray-900/60 rounded-lg p-4 border border-indigo-200/50 dark:border-indigo-700/30 midnight:border-indigo-800/30">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-2">For each completion:</p>
            <div className="font-mono text-lg font-bold text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 px-4 py-3 rounded-lg inline-block">
              XP = (Base + Target) × Multiplier
            </div>
          </div>
        </div>
      </div>

      {/* Component Breakdown */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 dark:text-white midnight:text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          XP Components Breakdown
        </h4>

        {/* Base XP */}
        <div className="bg-green-50/80 dark:bg-green-900/20 midnight:bg-green-900/10 rounded-lg p-4 border border-green-200 dark:border-green-800/40 midnight:border-green-800/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-800/40 midnight:bg-green-800/30 flex items-center justify-center">
                <span className="text-lg">✅</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white midnight:text-white">Base Completion</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Every successful habit completion</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-green-600 dark:text-green-400 midnight:text-green-400">+10</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">XP</p>
            </div>
          </div>
        </div>

        {/* Target Bonus */}
        <div className="bg-blue-50/80 dark:bg-blue-900/20 midnight:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800/40 midnight:border-blue-800/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-800/40 midnight:bg-blue-800/30 flex items-center justify-center">
                <span className="text-lg">🎯</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white midnight:text-white">Target Reached</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Numeric/Duration habits when target is met</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400 midnight:text-blue-400">+5</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">XP bonus</p>
            </div>
          </div>
        </div>

        {/* Frequency Multipliers */}
        <div className="bg-purple-50/80 dark:bg-purple-900/20 midnight:bg-purple-900/10 rounded-lg p-4 border border-purple-200 dark:border-purple-800/40 midnight:border-purple-800/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-800/40 midnight:bg-purple-800/30 flex items-center justify-center">
              <span className="text-lg">📅</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white midnight:text-white">Frequency Multipliers</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Harder habits reward more</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-white/60 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-2 text-center border border-purple-200/50 dark:border-purple-700/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Daily</p>
              <p className="font-bold text-purple-700 dark:text-purple-300 midnight:text-purple-300">×1.0</p>
            </div>
            <div className="bg-white/60 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-2 text-center border border-purple-200/50 dark:border-purple-700/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Weekly</p>
              <p className="font-bold text-purple-700 dark:text-purple-300 midnight:text-purple-300">×1.5</p>
            </div>
            <div className="bg-white/60 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-2 text-center border border-purple-200/50 dark:border-purple-700/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Monthly</p>
              <p className="font-bold text-purple-700 dark:text-purple-300 midnight:text-purple-300">×2.0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Calculation Examples */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 dark:text-white midnight:text-white flex items-center gap-2">
          <Award className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          Calculation Examples
        </h4>

        <div className="bg-gray-50/80 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700/40 midnight:border-gray-800/40 divide-y divide-gray-200 dark:divide-gray-700/40 midnight:divide-gray-800/40">
          {/* Example 1 */}
          <div className="p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-2">
              Daily boolean habit:
            </p>
            <div className="font-mono text-sm bg-white dark:bg-gray-700/50 midnight:bg-gray-800/50 rounded-lg p-3 border border-gray-200/70 dark:border-gray-600/30 midnight:border-gray-700/30">
              <span className="text-green-600 dark:text-green-400">10</span>
              <span className="text-gray-500 dark:text-gray-400"> × </span>
              <span className="text-purple-600 dark:text-purple-400">1.0</span>
              <span className="text-gray-500 dark:text-gray-400"> = </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">10 XP</span>
            </div>
          </div>

          {/* Example 2 */}
          <div className="p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-2">
              Weekly habit + target reached:
            </p>
            <div className="font-mono text-sm bg-white dark:bg-gray-700/50 midnight:bg-gray-800/50 rounded-lg p-3 border border-gray-200/70 dark:border-gray-600/30 midnight:border-gray-700/30">
              <span className="text-gray-500 dark:text-gray-400">(</span>
              <span className="text-green-600 dark:text-green-400">10</span>
              <span className="text-gray-500 dark:text-gray-400"> + </span>
              <span className="text-blue-600 dark:text-blue-400">5</span>
              <span className="text-gray-500 dark:text-gray-400">) × </span>
              <span className="text-purple-600 dark:text-purple-400">1.5</span>
              <span className="text-gray-500 dark:text-gray-400"> = </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">22 XP</span>
            </div>
          </div>

          {/* Example 3 */}
          <div className="p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-2">
              Monthly habit + target reached:
            </p>
            <div className="font-mono text-sm bg-white dark:bg-gray-700/50 midnight:bg-gray-800/50 rounded-lg p-3 border border-gray-200/70 dark:border-gray-600/30 midnight:border-gray-700/30">
              <span className="text-gray-500 dark:text-gray-400">(</span>
              <span className="text-green-600 dark:text-green-400">10</span>
              <span className="text-gray-500 dark:text-gray-400"> + </span>
              <span className="text-blue-600 dark:text-blue-400">5</span>
              <span className="text-gray-500 dark:text-gray-400">) × </span>
              <span className="text-purple-600 dark:text-purple-400">2.0</span>
              <span className="text-gray-500 dark:text-gray-400"> = </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">30 XP</span>
            </div>
          </div>
        </div>

        {/* Consistency Note */}
        <div className="bg-indigo-50/50 dark:bg-indigo-900/10 midnight:bg-indigo-900/5 rounded-lg p-3 border border-indigo-200/50 dark:border-indigo-800/30 midnight:border-indigo-800/20">
          <p className="text-xs text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 flex items-center gap-2">
            <span>ℹ️</span>
            <span>Same XP calculation is used everywhere (leaderboard, stats, performer details) for consistency.</span>
          </p>
        </div>
      </div>

      {/* Level Progression */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 dark:text-white midnight:text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          Level Progression
        </h4>

        <div className="bg-yellow-50/80 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800/40 midnight:border-yellow-800/30">
          <p className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-3">
            Each level requires progressively more XP:
          </p>
          <div className="font-mono text-sm text-center bg-white/80 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-3 border border-yellow-200/50 dark:border-yellow-700/30 midnight:border-yellow-800/30 mb-3">
            <span className="text-yellow-700 dark:text-yellow-300">XP for Level N</span>
            <span className="text-gray-500 dark:text-gray-400"> = </span>
            <span className="font-bold text-yellow-600 dark:text-yellow-400">25 × (N-1) × N</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { level: 1, xp: '0', range: '0-49' },
              { level: 2, xp: '50', range: '50-149' },
              { level: 3, xp: '150', range: '150-299' },
              { level: 4, xp: '300', range: '300-499' },
            ].map((item) => (
              <div 
                key={item.level}
                className={`p-2 rounded-lg text-center border ${
                  level === item.level 
                    ? 'bg-yellow-100 dark:bg-yellow-800/40 midnight:bg-yellow-800/30 border-yellow-400 dark:border-yellow-600' 
                    : 'bg-white/60 dark:bg-gray-800/40 midnight:bg-gray-900/40 border-yellow-200/50 dark:border-yellow-700/30'
                }`}
              >
                <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Level {item.level}</p>
                <p className={`font-bold ${level === item.level ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300'}`}>
                  {item.range} XP
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* This User's Stats */}
      {performer && (
        <div className="bg-indigo-50/80 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800/40 midnight:border-indigo-800/30">
          <h4 className="font-semibold text-gray-900 dark:text-white midnight:text-white mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            {performer.name}'s Current Stats
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/70 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-3 text-center border border-indigo-200/50 dark:border-indigo-700/30">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400">{xp}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Total XP</p>
            </div>
            <div className="bg-white/70 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-3 text-center border border-indigo-200/50 dark:border-indigo-700/30">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400">{level}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Level</p>
            </div>
            <div className="bg-white/70 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-3 text-center border border-indigo-200/50 dark:border-indigo-700/30">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400">{completions}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">Completions</p>
            </div>
          </div>
        </div>
      )}

      {/* Fairness Note */}
      <div className="bg-gray-100/80 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/70 dark:border-gray-700/30 midnight:border-gray-800/30">
        <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 text-center">
          ⚖️ All team members receive the same XP bonuses equally. Rankings are based on total XP earned.
        </p>
      </div>
    </div>
  );
};

// Stat Card Component - Enhanced for better dark mode visibility with subtle styling
const StatCard = ({ icon, label, value, bgColor }) => (
  <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-xl p-4 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 shadow-sm dark:shadow-none hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
    <div className="flex items-center space-x-2 mb-2">
      {icon}
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 midnight:text-gray-300 uppercase tracking-wide">
        {label}
      </span>
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white midnight:text-white">
      {value}
    </div>
  </div>
);

export default PerformerDetailsModal;
