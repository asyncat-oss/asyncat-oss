import React from 'react';
import { DAYS_OF_WEEK } from '../data/CalendarConstants';

const CalendarSkeleton = ({ view = 'month' }) => {
  // Generate array of skeletons based on view
  const generateSkeletonItems = (count) => {
    return Array(count).fill(0).map((_, index) => index);
  };
  // Enhanced shimmer animation with better performance
  const shimmerClass = "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_4.5s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 dark:before:via-gray-400/20 midnight:before:via-indigo-400/10 before:to-transparent";
  
  // More realistic event patterns
  const getEventPattern = (dayIndex, slotIndex = 0) => {
    // Business hours have more events
    const isBusinessHour = slotIndex >= 8 && slotIndex <= 18;
    const isWeekend = dayIndex === 0 || dayIndex === 6;
    
    if (isWeekend) return Math.random() > 0.8; // Less events on weekends
    if (isBusinessHour) return Math.random() > 0.5; // More events during business hours
    return Math.random() > 0.85; // Fewer events outside business hours
  };

  // Enhanced event colors with better contrast
  const getEventColor = (index) => {
    const colors = [
      'bg-gradient-to-r from-blue-50 to-blue-100/80 dark:from-blue-950/40 dark:to-blue-900/30 midnight:from-blue-950/20 midnight:to-blue-900/15 border-l-4 border-blue-500 dark:border-blue-400 midnight:border-blue-300',
      'bg-gradient-to-r from-emerald-50 to-emerald-100/80 dark:from-emerald-950/40 dark:to-emerald-900/30 midnight:from-emerald-950/20 midnight:to-emerald-900/15 border-l-4 border-emerald-500 dark:border-emerald-400 midnight:border-emerald-300',
      'bg-gradient-to-r from-amber-50 to-amber-100/80 dark:from-amber-950/40 dark:to-amber-900/30 midnight:from-amber-950/20 midnight:to-amber-900/15 border-l-4 border-amber-500 dark:border-amber-400 midnight:border-amber-300',
      'bg-gradient-to-r from-purple-50 to-purple-100/80 dark:from-purple-950/40 dark:to-purple-900/30 midnight:from-purple-950/20 midnight:to-purple-900/15 border-l-4 border-purple-500 dark:border-purple-400 midnight:border-purple-300',
      'bg-gradient-to-r from-rose-50 to-rose-100/80 dark:from-rose-950/40 dark:to-rose-900/30 midnight:from-rose-950/20 midnight:to-rose-900/15 border-l-4 border-rose-500 dark:border-rose-400 midnight:border-rose-300',
      'bg-gradient-to-r from-indigo-50 to-indigo-100/80 dark:from-indigo-950/40 dark:to-indigo-900/30 midnight:from-indigo-950/20 midnight:to-indigo-900/15 border-l-4 border-indigo-500 dark:border-indigo-400 midnight:border-indigo-300'
    ];
    return colors[index % colors.length];
  };

  // Realistic event heights
  const getEventHeight = (type = 'normal') => {
    if (type === 'meeting') return 'h-16'; // Longer meetings
    if (type === 'task') return 'h-10'; // Quick tasks
    return 'h-12'; // Default events
  };

  // Enhanced skeleton text with realistic widths
  const getSkeletonText = (type) => {
    const patterns = {
      title: ['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2'],
      subtitle: ['w-1/2', 'w-2/5', 'w-3/5', 'w-1/3'],
      short: ['w-1/4', 'w-1/3', 'w-2/5']
    };
    const options = patterns[type] || patterns.title;
    return options[Math.floor(Math.random() * options.length)];
  };
  const renderMonthSkeleton = () => {
    const days = generateSkeletonItems(35);

    return (
      <div className="flex flex-col h-full">
        {/* Enhanced header with subtle animation */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 shadow-sm">
          <div className="grid grid-cols-7 gap-4 p-4">
            {DAYS_OF_WEEK.map((day, index) => (
              <div key={day} className="text-center">
                <div className={`text-base font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 ${shimmerClass}`}>
                  {day}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced days grid with realistic spacing */}
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800">
            {days.map((day) => {
              const eventCount = Math.floor(Math.random() * 4);
              const events = generateSkeletonItems(eventCount);
              const isToday = day === 15; // Simulate "today"
              const isOtherMonth = day < 5 || day > 30; // Simulate prev/next month days
              
              return (
                <div 
                  key={day} 
                  className={`
                    min-h-[8rem] p-2 bg-white dark:bg-gray-900 midnight:bg-gray-950 relative
                    ${isOtherMonth ? 'opacity-40' : ''}
                    hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors
                  `}
                >
                  {/* Enhanced day number with today indicator */}
                  <div className="flex justify-end mb-2">
                    <div className={`
                      flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full transition-all
                      ${isToday 
                        ? 'bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700 text-white shadow-md' 
                        : isOtherMonth 
                          ? 'text-gray-400 dark:text-gray-600 midnight:text-gray-700'
                          : 'text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
                      } 
                      ${shimmerClass}
                    `}>
                      <div className={`w-4 h-4 rounded ${isToday ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700'}`}></div>
                    </div>
                  </div>
                  
                  {/* Enhanced event placeholders */}
                  <div className="space-y-1">
                    {events.map((_, index) => {
                      const eventType = ['meeting', 'task', 'normal'][Math.floor(Math.random() * 3)];
                      const duration = getEventHeight(eventType);
                      
                      return (
                        <div 
                          key={index} 
                          className={`
                            ${duration} rounded-lg ${getEventColor(index)} ${shimmerClass}
                            shadow-sm hover:shadow-md transition-shadow cursor-pointer
                            transform hover:scale-[1.02] transition-transform
                          `}
                        >
                          <div className="flex h-full">
                            <div className="flex-1 px-2 py-1.5 flex flex-col justify-center min-w-0">
                              <div className={`h-3 bg-gray-400/60 dark:bg-gray-600/50 midnight:bg-gray-700/50 rounded mb-1 ${getSkeletonText('title')}`}></div>
                              {duration !== 'h-10' && (
                                <div className={`h-2 bg-gray-300/50 dark:bg-gray-500/40 midnight:bg-gray-600/40 rounded ${getSkeletonText('subtitle')}`}></div>
                              )}
                            </div>
                            
                            {/* Enhanced source indicator */}
                            <div className="w-8 flex items-center justify-center">
                              <div className={`
                                w-5 h-5 rounded-full 
                                ${index % 3 === 0 
                                  ? 'bg-green-400/70 dark:bg-green-500/60 midnight:bg-green-600/50' 
                                  : 'bg-blue-400/70 dark:bg-blue-500/60 midnight:bg-blue-600/50'
                                }
                                ${shimmerClass}
                              `}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Enhanced "more" indicator */}
                    {eventCount >= 3 && Math.random() > 0.4 && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300 pl-1 font-medium">
                        <div className={`h-2.5 bg-blue-300/60 dark:bg-blue-500/40 midnight:bg-blue-600/30 rounded w-16 ${shimmerClass}`}></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Today highlight bar */}
                  {isToday && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-t"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  const renderWeekSkeleton = () => {
    const timeSlots = generateSkeletonItems(24);

    return (
      <div className="flex flex-col h-full calendar-skeleton">
        {/* Enhanced header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 shadow-sm">
          <div className="grid grid-cols-8">
            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900"></div>
            {DAYS_OF_WEEK.map((day, idx) => (
              <div key={day} className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900">
                <div className={`text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2 ${shimmerClass}`}>
                  {day}
                </div>
                <div className={`
                  h-8 w-8 rounded-full mx-auto flex items-center justify-center
                  ${idx === 2 
                    ? 'bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700 text-white shadow-md' 
                    : 'bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800'
                  }
                  ${shimmerClass}
                `}>
                  <div className={`w-4 h-4 rounded ${idx === 2 ? 'bg-white/20' : 'bg-gray-400 dark:bg-gray-500 midnight:bg-gray-600'}`}></div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Enhanced all-day section */}
          <div className="grid grid-cols-8 border-t border-gray-200 dark:border-gray-800 midnight:border-gray-900">
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900 font-medium">
              All-day
            </div>
            
            {DAYS_OF_WEEK.map((day, idx) => (
              <div key={`all-day-${day}`} className="p-1 border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900 min-h-10">
                {getEventPattern(idx) && (
                  <div className={`h-8 ${getEventColor(idx)} rounded-md ${shimmerClass} shadow-sm`}>
                    <div className="h-full px-2 flex items-center">
                      <div className={`h-2.5 bg-gray-400/60 dark:bg-gray-600/50 midnight:bg-gray-700/50 rounded ${getSkeletonText('title')}`}></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Enhanced time slots */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-8">
            {/* Time label column */}
            <div className="border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900">
              {timeSlots.map((slot) => (
                <div key={slot} className="h-16 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 pl-3 pt-1 relative">
                  <div className={`h-3 w-12 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded ${shimmerClass}`}></div>
                  {/* Business hours indicator */}
                  {slot >= 8 && slot <= 18 && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20"></div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Enhanced day columns */}
            {DAYS_OF_WEEK.map((day, dayIndex) => (
              <div key={day} className="relative border-r border-gray-200 dark:border-gray-800 midnight:border-gray-900">
                {timeSlots.map((slot) => (
                  <div key={slot} className="h-16 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 relative">
                    {getEventPattern(dayIndex, slot) && (
                      <div 
                        className={`
                          w-[90%] mx-auto mt-1 rounded-lg ${getEventColor(dayIndex + slot)} ${shimmerClass}
                          shadow-sm hover:shadow-md transition-shadow cursor-pointer
                        `}
                        style={{height: Math.random() > 0.6 ? '3.5rem' : '2.5rem'}}
                      >
                        <div className="flex h-full">
                          <div className="flex-1 px-2 py-1.5 flex flex-col justify-center min-w-0">
                            <div className={`h-3 bg-gray-400/60 dark:bg-gray-600/50 midnight:bg-gray-700/50 rounded mb-1 ${getSkeletonText('title')}`}></div>
                            <div className={`h-2 bg-gray-300/50 dark:bg-gray-500/40 midnight:bg-gray-600/40 rounded ${getSkeletonText('subtitle')}`}></div>
                          </div>
                          <div className="w-6 flex items-center justify-center">
                            <div className="w-4 h-4 rounded-full bg-gray-300/70 dark:bg-gray-600/50 midnight:bg-gray-700/50"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Current time indicator */}
                    {slot === 10 && dayIndex === 2 && (
                      <div className="absolute left-0 right-0 top-6 border-t-2 border-red-400 dark:border-red-500 midnight:border-red-400 z-10">
                        <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-400 dark:bg-red-500 midnight:bg-red-400 shadow-sm"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  const renderDaySkeleton = () => {
    const timeSlots = generateSkeletonItems(24);

    return (
      <div className="flex flex-col h-full calendar-skeleton">
        {/* Enhanced header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 shadow-sm">
          <div className="px-4 py-4 text-center">
            <div className={`h-9 w-48 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-600 dark:to-blue-700 midnight:from-blue-700 midnight:to-blue-800 mx-auto ${shimmerClass} shadow-md`}></div>
          </div>
          
          {/* Enhanced all-day section */}
          <div className="border-t border-gray-200 dark:border-gray-800 midnight:border-gray-900 px-4 py-3 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-gray-900/20">
            <div className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 font-semibold mb-2 uppercase tracking-wide">
              All-day Events
            </div>
            <div className="space-y-2">
              {[0, 1].map((index) => (
                <div key={index} className={`h-12 ${getEventColor(index)} rounded-lg ${shimmerClass} shadow-sm hover:shadow-md transition-shadow`}>
                  <div className="flex h-full">
                    <div className="flex-1 px-3 py-2 flex flex-col justify-center min-w-0">
                      <div className={`h-3.5 bg-gray-400/60 dark:bg-gray-600/50 midnight:bg-gray-700/50 rounded mb-1 ${getSkeletonText('title')}`}></div>
                      <div className={`h-2.5 bg-gray-300/50 dark:bg-gray-500/40 midnight:bg-gray-600/40 rounded ${getSkeletonText('subtitle')}`}></div>
                    </div>
                    <div className="w-12 flex items-center justify-center">
                      <div className={`
                        w-6 h-6 rounded-full 
                        ${index === 0 
                          ? 'bg-green-400/70 dark:bg-green-500/60 midnight:bg-green-600/50' 
                          : 'bg-blue-400/70 dark:bg-blue-500/60 midnight:bg-blue-600/50'
                        }
                        ${shimmerClass}
                      `}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Enhanced time slots */}
        <div className="flex-1 overflow-auto relative">
          <div className="grid grid-cols-1">
            {timeSlots.map((slot) => (
              <div key={slot} className="h-16 relative border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 hover:bg-gray-50/30 dark:hover:bg-gray-800/20 midnight:hover:bg-gray-900/10 transition-colors">
                {/* Enhanced time label */}
                <div className="absolute left-0 top-0 p-3 z-10">
                  <div className={`h-3.5 w-12 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded ${shimmerClass}`}></div>
                </div>
                
                {/* Business hours background */}
                {slot >= 8 && slot <= 18 && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-200 dark:bg-blue-800/40 midnight:bg-blue-900/30"></div>
                )}
                
                {/* Enhanced event placeholders */}
                {getEventPattern(0, slot) && (
                  <div className="absolute left-16 top-1 right-4">
                    <div 
                      className={`h-12 ${getEventColor(slot)} rounded-lg ${shimmerClass} shadow-sm hover:shadow-md transition-all cursor-pointer transform hover:scale-[1.01]`}
                      style={{width: `${Math.random() * 40 + 50}%`}}
                    >
                      <div className="flex h-full">
                        <div className="flex-1 px-3 py-2 flex flex-col justify-center min-w-0">
                          <div className={`h-3.5 bg-gray-400/60 dark:bg-gray-600/50 midnight:bg-gray-700/50 rounded mb-1 ${getSkeletonText('title')}`}></div>
                          <div className={`h-2.5 bg-gray-300/50 dark:bg-gray-500/40 midnight:bg-gray-600/40 rounded ${getSkeletonText('subtitle')}`}></div>
                        </div>
                        <div className="w-12 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-gray-300/70 dark:bg-gray-600/50 midnight:bg-gray-700/50"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Enhanced current time indicator */}
                {slot === 10 && (
                  <div className="absolute left-0 right-0 top-6 border-t-2 border-red-400 dark:border-red-500 midnight:border-red-400 z-20 shadow-sm">
                    <div className="absolute -left-1.5 -top-2 w-4 h-4 rounded-full bg-red-400 dark:bg-red-500 midnight:bg-red-400 shadow-md border-2 border-white dark:border-gray-900 midnight:border-gray-950"></div>
                    <div className="absolute left-2 -top-1 px-2 py-0.5 bg-red-400 dark:bg-red-500 midnight:bg-red-400 text-white text-xs rounded shadow-md font-medium">
                      <div className="w-8 h-2 bg-white/30 rounded"></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  // Add enhanced CSS for animations
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(0%); }
        100% { transform: translateX(100%); }
      }
        @keyframes pulse-subtle {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      
      .calendar-skeleton {
        animation: pulse-subtle 4s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  if (view === 'day') return renderDaySkeleton();
  if (view === 'week') return renderWeekSkeleton();
  return renderMonthSkeleton();
};

export default CalendarSkeleton;