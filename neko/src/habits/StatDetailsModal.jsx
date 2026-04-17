import React, { useEffect } from 'react';
import { X, Sparkles, Flame, TrendingUp, Users, Award, Target, Trophy, Star } from 'lucide-react';

/**
 * Compact Stat Details Modal - Shows detailed analytics for each stat card
 * Similar design to HabitDetailsModal with cleaner layout
 */
const StatDetailsModal = ({ isOpen, onClose, statType, analytics, session }) => {
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

  if (!isOpen || !analytics) return null;

  const personal = analytics.personal || {};
  const team = analytics.team || {};
  const topPerformers = analytics.topPerformers || [];

  // Get modal configuration based on stat type
  const getModalConfig = () => {
    switch (statType) {
      case 'level':
        return {
          title: 'Level & XP',
          icon: Sparkles,
          color: '#eab308', // yellow-500
          bgGradient: 'from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20'
        };
      case 'streak':
        return {
          title: 'Streak Analytics',
          icon: Flame,
          color: '#f97316', // orange-500
          bgGradient: 'from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20'
        };
      case 'progress':
        return {
          title: 'Your Progress',
          icon: TrendingUp,
          color: '#22c55e', // green-500
          bgGradient: 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
        };
      case 'team':
        return {
          title: 'Team Statistics',
          icon: Users,
          color: '#3b82f6', // blue-500
          bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20'
        };
      default:
        return {
          title: 'Statistics',
          icon: Target,
          color: '#6366f1',
          bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700'
        };
    }
  };

  const config = getModalConfig();
  const Icon = config.icon;

  // Render Level Content
  const renderLevelContent = () => {
    // Use the new progressive level data from backend
    const xpInCurrentLevel = personal.xpInCurrentLevel || 0;
    const xpToNextLevel = personal.xpToNextLevel || 50;
    const progressPercent = personal.levelProgress || 0;
    const xpAway = xpToNextLevel - xpInCurrentLevel;

    return (
      <div className="space-y-4">
        {/* Main Level Display */}
        <div className={`bg-gradient-to-br ${config.bgGradient} midnight:from-yellow-900/10 midnight:to-orange-900/5 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800/40 midnight:border-yellow-900/30`}>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-800 midnight:bg-gray-850 flex items-center justify-center shadow-lg border-4 border-yellow-400 dark:border-yellow-500 midnight:border-yellow-600">
                <Sparkles className="w-12 h-12 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-400" />
              </div>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-yellow-500 dark:bg-yellow-600 midnight:bg-yellow-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                Level {personal.level || 1}
              </div>
            </div>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-1 font-medium">Total Experience</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-white">{(personal.xp || 0).toLocaleString()} XP</p>
            {personal.rank > 0 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 midnight:text-yellow-300 mt-1 font-semibold">
                🏆 Rank #{personal.rank}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">
              <span>Progress to Level {(personal.level || 1) + 1}</span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700/70 midnight:bg-gray-800/70 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 transition-all duration-500 relative overflow-hidden"
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-300 midnight:text-gray-300 text-center">
              {xpInCurrentLevel} / {xpToNextLevel} XP • {xpAway} XP to next level
            </p>
          </div>
        </div>

        {/* XP Breakdown Info */}
        <div className="bg-white/50 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-gray-800/30">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-3 flex items-center">
            <Sparkles className="w-4 h-4 mr-2 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-400" />
            How XP Works
          </h4>
          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
            <div className="flex justify-between p-2 bg-gray-50/80 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
              <span>Base completion</span>
              <span className="font-medium text-yellow-600 dark:text-yellow-400">+10 XP</span>
            </div>
            <div className="flex justify-between p-2 bg-gray-50/80 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
              <span>Target reached (numeric/duration)</span>
              <span className="font-medium text-green-600 dark:text-green-400">+5 XP</span>
            </div>
            <div className="flex justify-between p-2 bg-gray-50/80 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
              <span>Weekly habit multiplier</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">×1.5</span>
            </div>
            <div className="flex justify-between p-2 bg-gray-50/80 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg">
              <span>Monthly habit multiplier</span>
              <span className="font-medium text-purple-600 dark:text-purple-400">×2.0</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-3 italic">
            Same XP calculation is used everywhere for consistency.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">📅</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">This Week</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.completionsThisWeek || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">completions</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">✨</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">All Time</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.successfulCompletions || personal.totalCompletions || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">completions</p>
          </div>
        </div>
      </div>
    );
  };

  // Render Streak Content
  const renderStreakContent = () => {
    const frequency = personal.bestHabitStreak?.frequency || 'daily';
    const unitSingular = frequency === 'weekly' ? 'week' : frequency === 'monthly' ? 'month' : 'day';
    const unitPlural = frequency === 'weekly' ? 'weeks' : frequency === 'monthly' ? 'months' : 'days';
    
    // Scale achievement thresholds based on frequency
    // Daily: 7, 30, 100, 365 (days)
    // Weekly: 4, 12, 24, 52 (weeks)
    // Monthly: 3, 6, 12, 24 (months)
    const achievementThresholds = frequency === 'weekly'
      ? [
          { days: 4, icon: '🔥', label: 'Month Warrior', color: 'orange' },
          { days: 12, icon: '🌟', label: 'Quarter Master', color: 'yellow' },
          { days: 24, icon: '💎', label: 'Half-Year Champion', color: 'blue' },
          { days: 52, icon: '👑', label: 'Year Legend', color: 'purple' }
        ]
      : frequency === 'monthly'
      ? [
          { days: 3, icon: '🔥', label: 'Quarter Warrior', color: 'orange' },
          { days: 6, icon: '🌟', label: 'Half-Year Master', color: 'yellow' },
          { days: 12, icon: '💎', label: 'Year Champion', color: 'blue' },
          { days: 24, icon: '👑', label: 'Two-Year Legend', color: 'purple' }
        ]
      : [
          { days: 7, icon: '🔥', label: 'Week Warrior', color: 'orange' },
          { days: 30, icon: '🌟', label: 'Month Master', color: 'yellow' },
          { days: 100, icon: '💎', label: 'Century Champion', color: 'blue' },
          { days: 365, icon: '👑', label: 'Year Legend', color: 'purple' }
        ];

    const achievements = achievementThresholds;

    return (
      <div className="space-y-4">
        {/* Main Streak Display */}
        <div className={`bg-gradient-to-br ${config.bgGradient} midnight:from-orange-900/10 midnight:to-red-900/5 rounded-lg p-6 border border-orange-200 dark:border-orange-800/40 midnight:border-orange-900/30`}>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-800 midnight:bg-gray-850 flex items-center justify-center shadow-lg border-4 border-orange-400 dark:border-orange-500 midnight:border-orange-600">
                <Flame className="w-12 h-12 text-orange-500 dark:text-orange-400 midnight:text-orange-400 animate-pulse" />
              </div>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-orange-500 dark:bg-orange-600 midnight:bg-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                {personal.currentStreak || 0} {personal.bestHabitStreak?.frequency === 'weekly' ? 'Weeks' : personal.bestHabitStreak?.frequency === 'monthly' ? 'Months' : 'Days'}
              </div>
            </div>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-1 font-medium">Current Streak</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-white">
              {personal.currentStreak || 0} {personal.bestHabitStreak?.frequency === 'weekly' ? 'week' : personal.bestHabitStreak?.frequency === 'monthly' ? 'month' : 'day'}{(personal.currentStreak || 0) !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-orange-600 dark:text-orange-400 midnight:text-orange-300 mt-1 font-semibold">
              🏆 Best: {personal.longestStreak || 0} {personal.bestHabitStreak?.frequency === 'weekly' ? 'week' : personal.bestHabitStreak?.frequency === 'monthly' ? 'month' : 'day'}{(personal.longestStreak || 0) !== 1 ? 's' : ''}
            </p>
          </div>

          {personal.currentStreak > 0 && (
            <div className="flex items-center justify-center space-x-2 text-sm text-orange-700 dark:text-orange-300 midnight:text-orange-300 bg-orange-100 dark:bg-orange-900/40 midnight:bg-orange-900/30 rounded-lg p-2 font-medium">
              <Flame className="w-4 h-4 animate-pulse" />
              <span className="font-semibold">Don't break the chain!</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">📅</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">This Week</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.completionsThisWeek || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Completions</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">✨</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Today</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.completionsToday || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Completions</p>
          </div>
        </div>

        {/* Streak Achievements */}
        <div className="bg-white/50 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-gray-800/30">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-3 flex items-center">
            <Award className="w-4 h-4 mr-2 text-orange-500 dark:text-orange-400 midnight:text-orange-400" />
            Streak Achievements
          </h4>
          <div className="space-y-2">
            {achievements.map(achievement => {
              const unlocked = personal.longestStreak >= achievement.days;
              return (
                <div
                  key={achievement.days}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                    unlocked
                      ? achievement.color === 'orange' 
                        ? 'bg-orange-50/40 dark:bg-orange-900/15 midnight:bg-orange-900/10 border border-orange-200/50 dark:border-orange-700/30 midnight:border-orange-800/25'
                        : achievement.color === 'yellow'
                        ? 'bg-yellow-50/40 dark:bg-yellow-900/15 midnight:bg-yellow-900/10 border border-yellow-200/50 dark:border-yellow-700/30 midnight:border-yellow-800/25'
                        : achievement.color === 'blue'
                        ? 'bg-blue-50/40 dark:bg-blue-900/15 midnight:bg-blue-900/10 border border-blue-200/50 dark:border-blue-700/30 midnight:border-blue-800/25'
                        : 'bg-purple-50/40 dark:bg-purple-900/15 midnight:bg-purple-900/10 border border-purple-200/50 dark:border-purple-700/30 midnight:border-purple-800/25'
                      : 'bg-gray-50/50 dark:bg-gray-800/25 midnight:bg-gray-900/20 opacity-60 border border-gray-100/60 dark:border-gray-700/20 midnight:border-gray-800/20'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`text-2xl ${unlocked ? 'scale-110' : 'grayscale'}`}>{achievement.icon}</span>
                    <div>
                      <p className={`text-sm font-medium ${
                        unlocked 
                          ? achievement.color === 'orange'
                            ? 'text-orange-900 dark:text-orange-100 midnight:text-orange-100'
                            : achievement.color === 'yellow'
                            ? 'text-yellow-900 dark:text-yellow-100 midnight:text-yellow-100'
                            : achievement.color === 'blue'
                            ? 'text-blue-900 dark:text-blue-100 midnight:text-blue-100'
                            : 'text-purple-900 dark:text-purple-100 midnight:text-purple-100'
                          : 'text-gray-500 dark:text-gray-400 midnight:text-gray-400'
                      }`}>
                        {achievement.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                        {achievement.days} {unitSingular} streak
                      </p>
                    </div>
                  </div>
                  {unlocked && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      achievement.color === 'orange' ? 'bg-orange-500 dark:bg-orange-600 midnight:bg-orange-600' :
                      achievement.color === 'yellow' ? 'bg-yellow-500 dark:bg-yellow-600 midnight:bg-yellow-600' :
                      achievement.color === 'blue' ? 'bg-blue-500 dark:bg-blue-600 midnight:bg-blue-600' :
                      'bg-purple-500 dark:bg-purple-600 midnight:bg-purple-600'
                    }`}>
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render Progress Content
  const renderProgressContent = () => {
    return (
      <div className="space-y-4">
        {/* Main Progress Display */}
        <div className={`bg-gradient-to-br ${config.bgGradient} midnight:from-green-900/10 midnight:to-emerald-900/5 rounded-lg p-6 border border-green-200 dark:border-green-800/40 midnight:border-green-900/30`}>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-800 midnight:bg-gray-850 flex items-center justify-center shadow-lg border-4 border-green-400 dark:border-green-500 midnight:border-green-600">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-500 dark:text-green-400 midnight:text-green-400">{personal.completionRate || 0}%</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-1 font-medium">7-Day Completion Rate</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-white">
              {personal.completionsThisWeek || 0} completions this week
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700/70 midnight:bg-gray-800/70 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-green-400 via-green-500 to-emerald-500 transition-all duration-500 relative overflow-hidden"
              style={{ width: `${Math.min(100, personal.completionRate || 0)}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">✅</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Today</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.completionsToday || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Done</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">📅</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">This Week</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.completionsThisWeek || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Done</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">🎯</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">All Time</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{personal.totalCompletions || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Total</p>
          </div>
        </div>

        {/* Progress Insights */}
        <div className="bg-white/50 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-gray-800/30">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-3 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2 text-green-500 dark:text-green-400 midnight:text-green-400" />
            Insights
          </h4>
          <div className="space-y-2">
            {personal.completionRate >= 80 && (
              <InsightCard
                emoji="🎯"
                title="High Performer"
                message={`Your ${personal.completionRate}% completion rate is excellent!`}
                color="blue"
              />
            )}
            
            {personal.completionsThisWeek > 0 && (
              <InsightCard
                emoji="✨"
                title="Great Progress"
                message={`You've completed ${personal.completionsThisWeek} habit${personal.completionsThisWeek !== 1 ? 's' : ''} this week.`}
                color="green"
              />
            )}
            
            {personal.completionRate < 50 && personal.completionRate > 0 && (
              <InsightCard
                emoji="💪"
                title="Room to Grow"
                message="Try completing more habits to boost your rate. You've got this!"
                color="yellow"
              />
            )}

            {personal.completionsToday === 0 && (
              <InsightCard
                emoji="🚀"
                title="Start Today"
                message="Complete your first habit today to build momentum!"
                color="orange"
              />
            )}

            {personal.completionRate === 0 && personal.totalCompletions === 0 && (
              <InsightCard
                emoji="🎉"
                title="Welcome"
                message="Start your habit journey today and watch your progress grow!"
                color="purple"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render Team Content
  const renderTeamContent = () => {
    return (
      <div className="space-y-4">
        {/* Team Overview */}
        <div className={`bg-gradient-to-br ${config.bgGradient} midnight:from-blue-900/10 midnight:to-indigo-900/5 rounded-lg p-6 border border-blue-200 dark:border-blue-800/40 midnight:border-blue-900/30`}>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-800 midnight:bg-gray-850 flex items-center justify-center shadow-lg border-4 border-blue-400 dark:border-blue-500 midnight:border-blue-600">
                <Users className="w-12 h-12 text-blue-500 dark:text-blue-400 midnight:text-blue-400" />
              </div>
            </div>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-1 font-medium">Team Performance</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-white">{team.completionRate || 0}%</p>
            <p className="text-sm text-blue-600 dark:text-blue-400 midnight:text-blue-300 mt-1 font-semibold">
              {team.memberCount || 0} member{team.memberCount !== 1 ? 's' : ''} • {team.totalHabits || 0} habit{team.totalHabits !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Team Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">👥</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Members</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{team.memberCount || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Active</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">🎯</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Habits</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{team.totalHabits || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">Total</p>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-gray-900/40 rounded-lg p-3 border border-gray-200/60 dark:border-gray-700/30 midnight:border-gray-800/30 hover:shadow-md hover:border-gray-300/60 dark:hover:border-gray-600/40 midnight:hover:border-gray-700/40 transition-all">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">📊</span>
              <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Team Rate</p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white">{team.completionRate || 0}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">7 days</p>
          </div>
        </div>

        {/* Top Performers */}
        {topPerformers.length > 0 && (
          <div className="bg-white/50 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-gray-800/30">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-200 mb-3 flex items-center">
              <Award className="w-4 h-4 mr-2 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-400" />
              Top Performers
            </h4>
            <div className="space-y-2">
              {topPerformers.slice(0, 5).map((performer, index) => {
                const isCurrentUser = performer.user_id === session?.user?.id;
                const medals = ['🥇', '🥈', '🥉'];
                
                return (
                  <div
                    key={performer.user_id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                      isCurrentUser
                        ? 'bg-indigo-50/60 dark:bg-indigo-900/20 midnight:bg-indigo-900/15 border-2 border-indigo-300/60 dark:border-indigo-700/40 midnight:border-indigo-800/35'
                        : 'bg-gray-50/60 dark:bg-gray-700/40 midnight:bg-gray-800/40 border border-gray-200/60 dark:border-gray-600/30 midnight:border-gray-700/30'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                        index === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/20' :
                        index === 1 ? 'bg-gray-100 dark:bg-gray-700/40 midnight:bg-gray-800/40' :
                        index === 2 ? 'bg-orange-100 dark:bg-orange-900/30 midnight:bg-orange-900/20' :
                        'bg-gray-100 dark:bg-gray-700/40 midnight:bg-gray-800/40'
                      }`}>
                        {medals[index] || `#${index + 1}`}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${
                          isCurrentUser ? 'text-indigo-900 dark:text-indigo-200 midnight:text-indigo-200' : 'text-gray-900 dark:text-gray-100 midnight:text-white'
                        }`}>
                          {performer.name}{isCurrentUser && ' (You)'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                          {performer.completions} completion{performer.completions !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {isCurrentUser && (
                      <div className="text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400">
                        <Trophy className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (statType) {
      case 'level':
        return renderLevelContent();
      case 'streak':
        return renderStreakContent();
      case 'progress':
        return renderProgressContent();
      case 'team':
        return renderTeamContent();
      default:
        return <p className="text-center text-gray-500 dark:text-gray-400 midnight:text-gray-400 py-8">No data available</p>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="absolute inset-0" 
        onClick={onClose}
      />
      
      <div 
        className="relative w-full max-w-lg max-h-[85vh] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200"
        style={{ 
          borderTop: `4px solid ${config.color}` 
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ 
                  backgroundColor: `${config.color}20`,
                  border: `2px solid ${config.color}40`
                }}
              >
                <Icon className="w-5 h-5" style={{ color: config.color }} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 midnight:text-white">
                {config.title}
              </h2>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Reusable Insight Card Component
const InsightCard = ({ emoji, title, message, color }) => {
  const colorMap = {
    blue: 'bg-blue-50/50 dark:bg-blue-900/20 midnight:bg-blue-900/15 border-blue-200/60 dark:border-blue-700/35 midnight:border-blue-800/30 text-blue-900 dark:text-blue-100 midnight:text-blue-100',
    green: 'bg-green-50/50 dark:bg-green-900/20 midnight:bg-green-900/15 border-green-200/60 dark:border-green-700/35 midnight:border-green-800/30 text-green-900 dark:text-green-100 midnight:text-green-100',
    yellow: 'bg-yellow-50/50 dark:bg-yellow-900/20 midnight:bg-yellow-900/15 border-yellow-200/60 dark:border-yellow-700/35 midnight:border-yellow-800/30 text-yellow-900 dark:text-yellow-100 midnight:text-yellow-100',
    orange: 'bg-orange-50/50 dark:bg-orange-900/20 midnight:bg-orange-900/15 border-orange-200/60 dark:border-orange-700/35 midnight:border-orange-800/30 text-orange-900 dark:text-orange-100 midnight:text-orange-100',
    purple: 'bg-purple-50/50 dark:bg-purple-900/20 midnight:bg-purple-900/15 border-purple-200/60 dark:border-purple-700/35 midnight:border-purple-800/30 text-purple-900 dark:text-purple-100 midnight:text-purple-100'
  };

  return (
    <div className={`flex items-start space-x-2 p-3 rounded-lg border ${colorMap[color]}`}>
      <span className="text-lg flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold mb-0.5">{title}</p>
        <p className="text-xs opacity-90">{message}</p>
      </div>
    </div>
  );
};

export default StatDetailsModal;
