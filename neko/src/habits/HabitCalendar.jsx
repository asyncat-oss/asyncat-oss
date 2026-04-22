import { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Flame,
  TrendingUp,
  Award,
  MessageSquare
} from 'lucide-react';

const HabitCalendar = ({ habit, onClose }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Get the first day of the current month
  const firstDayOfMonth = useMemo(() => {
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  }, [currentDate]);

  // Get the last day of the current month
  const lastDayOfMonth = useMemo(() => {
    return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  }, [currentDate]);

  // Get the number of days in the month
  const daysInMonth = lastDayOfMonth.getDate();

  // Get the day of week the month starts on (0 = Sunday)
  const startingDayOfWeek = firstDayOfMonth.getDay();

  // Month name
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Create a map of completed dates from habit completions
  const completionMap = useMemo(() => {
    const map = {};
    if (habit.recent_completions) {
      habit.recent_completions.forEach(completion => {
        map[completion.completed_date] = completion;
      });
    }
    return map;
  }, [habit.recent_completions]);

  // Calculate calendar statistics
  const calendarStats = useMemo(() => {
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    let completedDays = 0;
    let totalValue = 0;
    let commentsCount = 0;
    
    Object.entries(completionMap).forEach(([dateStr, completion]) => {
      const date = new Date(dateStr);
      if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        completedDays++;
        totalValue += completion.value || 0;
        if (completion.notes) {
          commentsCount++;
        }
      }
    });

    const completionRate = daysInMonth > 0 ? Math.round((completedDays / daysInMonth) * 100) : 0;

    return {
      completedDays,
      totalValue,
      commentsCount,
      completionRate,
      daysInMonth
    };
  }, [completionMap, currentDate, daysInMonth]);

  // Get completion for a specific date
  const getCompletionForDate = (day) => {
    const dateStr = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    ).toISOString().split('T')[0];
    return completionMap[dateStr];
  };

  // Check if a date is today
  const isToday = (day) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  // Check if a date is in the future
  const isFuture = (day) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return date > new Date();
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  // Go to today
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
  };

  // Handle day click
  const handleDayClick = (day) => {
    const dateStr = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    ).toISOString().split('T')[0];
    
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  };

  // Get selected date completion
  const selectedCompletion = selectedDate ? completionMap[selectedDate] : null;

  // Format date for display
  const formatSelectedDate = () => {
    if (!selectedDate) return '';
    return new Date(selectedDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Generate calendar days
  const calendarDays = [];
  
  // Add empty cells for days before the month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(
      <div key={`empty-${i}`} className="aspect-square" />
    );
  }

  // Add all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const completion = getCompletionForDate(day);
    const isCompleted = !!completion;
    const isTodayDate = isToday(day);
    const isFutureDate = isFuture(day);
    const dateStr = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    ).toISOString().split('T')[0];
    const isSelected = selectedDate === dateStr;

    calendarDays.push(
      <button
        key={day}
        onClick={() => !isFutureDate && handleDayClick(day)}
        disabled={isFutureDate}
        className={`
          aspect-square rounded-lg transition-all duration-200 relative group
          ${isFutureDate 
            ? 'cursor-not-allowed opacity-30' 
            : 'cursor-pointer hover:scale-105'
          }
          ${isSelected 
            ? 'ring-2 ring-offset-2 dark:ring-offset-gray-900 midnight:ring-offset-black shadow-lg' 
            : ''
          }
          ${isCompleted && !isFutureDate
            ? 'bg-gradient-to-br shadow-md'
            : 'bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800'
          }
          ${isTodayDate && !isSelected
            ? 'ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-2 dark:ring-offset-gray-900 midnight:ring-offset-black'
            : ''
          }
        `}
        style={isCompleted && !isFutureDate ? {
          background: `linear-gradient(135deg, ${habit.color}20, ${habit.color}40)`,
          borderColor: `${habit.color}60`,
          ...(isSelected && { 
            ringColor: habit.color,
            boxShadow: `0 0 0 2px ${habit.color}`
          })
        } : {}}
      >
        <div className="flex flex-col items-center justify-center h-full p-1">
          <span className={`
            text-sm font-semibold mb-0.5
            ${isCompleted && !isFutureDate
              ? 'text-gray-900 dark:text-white midnight:text-white'
              : isFutureDate
                ? 'text-gray-300 dark:text-gray-600 midnight:text-gray-700'
                : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300'
            }
          `}>
            {day}
          </span>
          
          {isCompleted && !isFutureDate && (
            <div className="flex items-center gap-0.5">
              <CheckCircle2 
                className="w-3.5 h-3.5" 
                style={{ color: habit.color }}
              />
              {completion.notes && (
                <MessageSquare 
                  className="w-3 h-3 text-gray-600 dark:text-gray-400" 
                />
              )}
            </div>
          )}

          {isTodayDate && !isCompleted && !isFutureDate && (
            <Circle className="w-3.5 h-3.5 text-blue-500" />
          )}
        </div>

        {/* Hover tooltip */}
        {!isFutureDate && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
            {isCompleted ? `✓ Completed` : 'Not completed'}
            {isCompleted && completion.value > 0 && habit.tracking_type !== 'boolean' && (
              <span className="ml-1">({completion.value} {habit.unit})</span>
            )}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md"
                style={{ 
                  backgroundColor: `${habit.color}20`,
                  border: `2px solid ${habit.color}40`
                }}
              >
                {habit.icon || '📅'}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white midnight:text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Habit Calendar
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  {habit.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Month Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 midnight:from-blue-900/10 midnight:to-blue-800/10 rounded-lg p-3 border border-blue-200 dark:border-blue-800 midnight:border-blue-900">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300 midnight:text-blue-300">Completed</span>
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 midnight:text-blue-100">
                {calendarStats.completedDays}
                <span className="text-sm font-normal text-blue-600 dark:text-blue-400 ml-1">/ {calendarStats.daysInMonth}</span>
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 midnight:from-green-900/10 midnight:to-green-800/10 rounded-lg p-3 border border-green-200 dark:border-green-800 midnight:border-green-900">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-green-700 dark:text-green-300 midnight:text-green-300">Rate</span>
                <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100 midnight:text-green-100">
                {calendarStats.completionRate}%
              </p>
            </div>

            {habit.tracking_type !== 'boolean' && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 midnight:from-purple-900/10 midnight:to-purple-800/10 rounded-lg p-3 border border-purple-200 dark:border-purple-800 midnight:border-purple-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300 midnight:text-purple-300">Total</span>
                  <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 midnight:text-purple-100">
                  {calendarStats.totalValue}
                  <span className="text-sm font-normal text-purple-600 dark:text-purple-400 ml-1">{habit.unit}</span>
                </p>
              </div>
            )}

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 midnight:from-orange-900/10 midnight:to-orange-800/10 rounded-lg p-3 border border-orange-200 dark:border-orange-800 midnight:border-orange-900">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-orange-700 dark:text-orange-300 midnight:text-orange-300">Comments</span>
                <MessageSquare className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 midnight:text-orange-100">
                {calendarStats.commentsCount}
              </p>
            </div>
          </div>
        </div>

        {/* Calendar Navigation */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-white dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white midnight:text-white">
                {monthName}
              </h3>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-sm font-medium rounded-lg transition-colors"
                style={{ 
                  backgroundColor: `${habit.color}20`,
                  color: habit.color
                }}
              >
                Today
              </button>
            </div>

            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-white dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 midnight:text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-blue-400 dark:border-blue-500"></div>
                <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">Today</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: `${habit.color}40` }}></div>
                <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">Has Comment</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Date Details */}
        {selectedDate && (
          <div className="border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-6 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-1">
                  {formatSelectedDate()}
                </h4>
                {selectedCompletion ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" style={{ color: habit.color }} />
                    <span className="text-sm font-medium" style={{ color: habit.color }}>
                      Completed
                    </span>
                    {habit.tracking_type !== 'boolean' && selectedCompletion.value > 0 && (
                      <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                        • {selectedCompletion.value} {habit.unit}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Circle className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                      Not completed
                    </span>
                  </div>
                )}
              </div>
            </div>

            {selectedCompletion?.notes && (
              <div className="bg-white dark:bg-gray-700 midnight:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600 midnight:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300 uppercase tracking-wider">
                    Comment
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {selectedCompletion.notes}
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default HabitCalendar;
