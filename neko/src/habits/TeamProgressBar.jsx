const TeamProgressBar = ({ 
  percentage, 
  memberCount, 
  completedCount, 
  size = 'normal',
  showLabel = true,
  color = 'indigo' 
}) => {
  const getColorClasses = () => {
    switch (color) {
      case 'green':
        return 'bg-green-600';
      case 'yellow':
        return 'bg-yellow-500';
      case 'orange':
        return 'bg-orange-500';
      case 'red':
        return 'bg-red-500';
      case 'purple':
        return 'bg-purple-600';
      default:
        return 'bg-indigo-600';
    }
  };

  const getBarHeight = () => {
    switch (size) {
      case 'small':
        return 'h-1';
      case 'large':
        return 'h-3';
      default:
        return 'h-2';
    }
  };

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
            Team Progress
          </span>
          <span className="font-medium text-gray-900 dark:text-white midnight:text-white">
            {completedCount}/{memberCount} ({percentage}%)
          </span>
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full ${getBarHeight()}`}>
        <div 
          className={`${getBarHeight()} rounded-full transition-all duration-300 ${getColorClasses()}`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
    </div>
  );
};

export default TeamProgressBar;