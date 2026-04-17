import React, { useState } from 'react';
import { 
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Award,
  Flame,
  Star
} from 'lucide-react';
import StatDetailsModal from './StatDetailsModal';
import PerformerDetailsModal from './PerformerDetailsModal';

const GamificationStats = ({ analytics, teamMembers, session, loading = false, selectedProject }) => {
  // State for stat details modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStatType, setSelectedStatType] = useState(null);
  
  // State for performer details modal
  const [performerModalOpen, setPerformerModalOpen] = useState(false);
  const [selectedPerformer, setSelectedPerformer] = useState(null);

  // Open stat details modal
  const handleStatClick = (statType) => {
    setSelectedStatType(statType);
    setModalOpen(true);
  };

  // Close stat modal
  const closeModal = () => {
    setModalOpen(false);
    setSelectedStatType(null);
  };

  // Open performer details modal
  const handlePerformerClick = (performer) => {
    setSelectedPerformer(performer);
    setPerformerModalOpen(true);
  };

  // Close performer modal
  const closePerformerModal = () => {
    setPerformerModalOpen(false);
    setSelectedPerformer(null);
  };

  // Skeleton loading component
  const StatsSkeleton = () => (
    <div className="mb-8">
      {/* Main Stats Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10', iconColor: 'bg-yellow-200 dark:bg-yellow-700 midnight:bg-yellow-800' },
          { bgColor: 'bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10', iconColor: 'bg-orange-200 dark:bg-orange-700 midnight:bg-orange-800' },
          { bgColor: 'bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10', iconColor: 'bg-green-200 dark:bg-green-700 midnight:bg-green-800' },
          { bgColor: 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10', iconColor: 'bg-blue-200 dark:bg-blue-700 midnight:bg-blue-800' }
        ].map((style, index) => (
          <div key={index} className={`${style.bgColor} border border-gray-100 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-20 animate-pulse"></div>
              <div className={`w-4 h-4 ${style.iconColor} rounded animate-pulse`}></div>
            </div>
            <div className="space-y-2">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-16 animate-pulse"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-24 animate-pulse"></div>
              {index < 2 && (
                <div className="mt-3">
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full w-full animate-pulse"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-20 mt-1 animate-pulse"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Top Performers Skeleton */}
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-100 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-yellow-200 dark:bg-yellow-700 midnight:bg-yellow-800 rounded animate-pulse"></div>
            <div className="h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-48 animate-pulse"></div>
          </div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-16 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['🥇', '🥈', '🥉'].map((medal, index) => (
            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <span className="text-2xl opacity-30">{medal}</span>
                </div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-20 mb-1 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded w-24 animate-pulse"></div>
                </div>
                <div className="w-6 h-6 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) return <StatsSkeleton />;
  if (!analytics) return null;

  const currentUser = session?.user;
  
  const personal = analytics.personal || {};
  const team = analytics.team || {};
  
  const userLevel = personal.level || 1;
  const userXP = personal.xp || 0;
  const userRank = personal.rank || 0;
  
  // Use the new level progress from backend (properly calculated progressive levels)
  const levelProgress = personal.levelProgress || 0;
  const xpInCurrentLevel = personal.xpInCurrentLevel || 0;
  const xpToNextLevel = personal.xpToNextLevel || 50;

  // Format streak display with frequency context
  // A streak value represents consecutive completions in that frequency period
  // For clarity: streak of 1 = completed once (not "1 month of consistency")
  const formatStreakDisplay = (streak, bestHabitStreak) => {
    if (!streak || streak === 0) return '0 days';
    if (!bestHabitStreak) return `${streak} day${streak !== 1 ? 's' : ''}`;
    
    const frequency = bestHabitStreak.frequency || 'daily';
    
    // For streak = 1, it's just "starting" - don't say "1 month" which is misleading
    if (streak === 1) {
      if (frequency === 'weekly') {
        return '1 week';
      } else if (frequency === 'monthly') {
        return 'Starting streak'; // More accurate than "1 month"
      }
      return '1 day';
    }
    
    // For streak > 1, show the proper duration
    if (frequency === 'weekly') {
      return `${streak} week${streak !== 1 ? 's' : ''}`;
    } else if (frequency === 'monthly') {
      return `${streak} month${streak !== 1 ? 's' : ''}`;
    }
    return `${streak} day${streak !== 1 ? 's' : ''}`;
  };

  const stats = [
    {
      title: 'Your Level',
      value: `Level ${userLevel}`,
      subtitle: `${userXP.toLocaleString()} XP${userRank > 0 ? ` • Rank #${userRank}` : ''}`,
      icon: Sparkles,
      color: 'text-yellow-500 dark:text-yellow-400 midnight:text-yellow-300',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800 midnight:border-yellow-800/50',
      progress: levelProgress,
      progressLabel: `${xpInCurrentLevel}/${xpToNextLevel} XP to level ${userLevel + 1}`,
      statType: 'level'
    },
    {
      title: 'Best Streak',
      value: personal.currentStreak || 0,
      valueDisplay: formatStreakDisplay(personal.currentStreak || 0, personal.bestHabitStreak),
      subtitle: personal.bestHabitStreak 
        ? `${personal.bestHabitStreak.icon} ${personal.bestHabitStreak.habitName}` 
        : `Best ever: ${personal.longestStreak || 0}`,
      secondarySubtitle: personal.bestHabitStreak 
        ? `Personal best: ${personal.longestStreak || 0}` 
        : null,
      icon: Flame,
      color: 'text-orange-500 dark:text-orange-400 midnight:text-orange-300',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10 border border-orange-100 dark:border-orange-800 midnight:border-orange-800/50',
      showFlame: true,
      statType: 'streak'
    },
    {
      title: 'Weekly Progress',
      value: `${personal.completionRate || 0}%`,
      subtitle: `${personal.completionsToday || 0} today • ${personal.completionsThisWeek || 0} this week`,
      secondarySubtitle: `${personal.successfulCompletions || personal.totalCompletions || 0} total completions`,
      icon: TrendingUp,
      color: 'text-green-500 dark:text-green-400 midnight:text-green-300',
      bgColor: 'bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-100 dark:border-green-800 midnight:border-green-800/50',
      progress: personal.completionRate || 0,
      statType: 'progress'
    },
    {
      title: 'Team Stats',
      value: `${team.completionRate || 0}%`,
      subtitle: `${team.teamHabits || team.totalHabits || 0} team habits • ${team.memberCount || 0} members`,
      secondarySubtitle: `${team.totalTeamCompletions || 0} team completions this week`,
      icon: Users,
      color: 'text-blue-500 dark:text-blue-400 midnight:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 border border-blue-100 dark:border-blue-800 midnight:border-blue-800/50',
      progress: team.completionRate || 0,
      statType: 'team'
    }
  ];

  return (
    <>
      <div className="mb-8">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index}
              onClick={() => handleStatClick(stat.statType)}
              className={`${stat.bgColor} rounded-lg p-4 transition-all duration-200 hover:shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleStatClick(stat.statType);
                }
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  {stat.title}
                </h3>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              
              <div className="space-y-1">
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                  {stat.valueDisplay || stat.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  {stat.subtitle}
                </p>
                {stat.secondarySubtitle && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-gray-500">
                    {stat.secondarySubtitle}
                  </p>
                )}
              </div>

              {/* Progress bar for applicable stats */}
              {stat.progress !== undefined && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        stat.color.includes('yellow') ? 'bg-yellow-500 dark:bg-yellow-400 midnight:bg-yellow-300' :
                        stat.color.includes('orange') ? 'bg-orange-500 dark:bg-orange-400 midnight:bg-orange-300' :
                        stat.color.includes('green') ? 'bg-green-500 dark:bg-green-400 midnight:bg-green-300' :
                        stat.color.includes('indigo') ? 'bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-300' :
                        'bg-blue-500 dark:bg-blue-400 midnight:bg-blue-300'
                      }`}
                      style={{ width: `${Math.min(100, stat.progress)}%` }}
                    />
                  </div>
                  {stat.progressLabel && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1">
                      {stat.progressLabel}
                    </p>
                  )}
                </div>
              )}
              
              {/* Flame animation for streak */}
              {stat.showFlame && stat.value > 0 && (
                <div className="mt-3 flex items-center space-x-1">
                  <Flame className="w-3 h-3 text-orange-500 dark:text-orange-400 midnight:text-orange-300 animate-pulse" />
                  <span className="text-xs text-orange-600 dark:text-orange-400 midnight:text-orange-300 font-medium">
                    On fire!
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Top Performers Section */}
      {analytics.topPerformers && analytics.topPerformers.length > 0 && (
        <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-100 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-white flex items-center">
              <Trophy className="w-5 h-5 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-300 mr-2" />
              Top Performers
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">
              By XP
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analytics.topPerformers.slice(0, 3).map((performer, index) => {
              const isCurrentUser = performer.user_id === currentUser?.id;
              const medals = ['🥇', '🥈', '🥉'];
              
              return (
                <div 
                  key={performer.user_id}
                  onClick={() => handlePerformerClick(performer)}
                  className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                    isCurrentUser 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 border-indigo-200 dark:border-indigo-700 midnight:border-indigo-800' 
                      : 'bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePerformerClick(performer);
                    }
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">{medals[index]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${
                        isCurrentUser 
                          ? 'text-indigo-900 dark:text-indigo-300 midnight:text-indigo-200' 
                          : 'text-gray-900 dark:text-gray-100 midnight:text-white'
                      }`}>
                        {performer.name}
                        {isCurrentUser && ' (You)'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                        Level {performer.level || 1} • {(performer.xp || 0).toLocaleString()} XP
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500">
                        {performer.completions || 0} completion{(performer.completions || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="flex items-center space-x-1">
                        <Sparkles className="w-4 h-4 text-yellow-500 dark:text-yellow-400 midnight:text-yellow-300" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                          {performer.level || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Show remaining performers if any */}
          {analytics.topPerformers.length > 3 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {analytics.topPerformers.slice(3).map((performer, index) => {
                  const isCurrentUser = performer.user_id === currentUser?.id;
                  
                  return (
                    <div key={performer.user_id} className="flex items-center justify-between text-sm">
                      <span className={`truncate ${
                        isCurrentUser 
                          ? 'font-medium text-indigo-600 dark:text-indigo-400 midnight:text-indigo-300' 
                          : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400'
                      }`}>
                        #{index + 4} {performer.name}
                        {isCurrentUser && ' (You)'}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 ml-2 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Lv{performer.level || 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Stat Details Modal */}
      <StatDetailsModal
        isOpen={modalOpen}
        onClose={closeModal}
        statType={selectedStatType}
        analytics={analytics}
        teamMembers={teamMembers}
        session={session}
      />

      {/* Performer Details Modal */}
      <PerformerDetailsModal
        isOpen={performerModalOpen}
        onClose={closePerformerModal}
        performer={selectedPerformer}
        projectId={selectedProject?.id}
      />
    </>
  );
};

const Trophy = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);

export default GamificationStats;