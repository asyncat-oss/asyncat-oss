import { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  Award,
  Flame,
} from 'lucide-react';
import StatDetailsModal from './StatDetailsModal';

const GamificationStats = ({ analytics, session, loading = false }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStatType, setSelectedStatType] = useState(null);

  const handleStatClick = (statType) => {
    setSelectedStatType(statType);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedStatType(null);
  };

  const StatsSkeleton = () => (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10', iconColor: 'bg-yellow-200 dark:bg-yellow-700 midnight:bg-yellow-800' },
          { bgColor: 'bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10', iconColor: 'bg-orange-200 dark:bg-orange-700 midnight:bg-orange-800' },
          { bgColor: 'bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10', iconColor: 'bg-green-200 dark:bg-green-700 midnight:bg-green-800' },
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
    </div>
  );

  if (loading) return <StatsSkeleton />;
  if (!analytics) return null;

  const personal = analytics.personal || {};

  const userLevel = personal.level || 1;
  const userXP = personal.xp || 0;
  const levelProgress = personal.levelProgress || 0;
  const xpInCurrentLevel = personal.xpInCurrentLevel || 0;
  const xpToNextLevel = personal.xpToNextLevel || 50;

  const formatStreakDisplay = (streak, bestHabitStreak) => {
    if (!streak || streak === 0) return '0 days';
    if (!bestHabitStreak) return `${streak} day${streak !== 1 ? 's' : ''}`;

    const frequency = bestHabitStreak.frequency || 'daily';

    if (streak === 1) {
      if (frequency === 'weekly') return '1 week';
      if (frequency === 'monthly') return 'Starting streak';
      return '1 day';
    }

    if (frequency === 'weekly') return `${streak} week${streak !== 1 ? 's' : ''}`;
    if (frequency === 'monthly') return `${streak} month${streak !== 1 ? 's' : ''}`;
    return `${streak} day${streak !== 1 ? 's' : ''}`;
  };

  const stats = [
    {
      title: 'Your Level',
      value: `Level ${userLevel}`,
      subtitle: `${userXP.toLocaleString()} XP`,
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
  ];

  return (
    <>
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {stat.progress !== undefined && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          stat.color.includes('yellow') ? 'bg-yellow-500 dark:bg-yellow-400 midnight:bg-yellow-300' :
                          stat.color.includes('orange') ? 'bg-orange-500 dark:bg-orange-400 midnight:bg-orange-300' :
                          'bg-green-500 dark:bg-green-400 midnight:bg-green-300'
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
      </div>

      <StatDetailsModal
        isOpen={modalOpen}
        onClose={closeModal}
        statType={selectedStatType}
        analytics={analytics}
        session={session}
      />
    </>
  );
};

export default GamificationStats;
