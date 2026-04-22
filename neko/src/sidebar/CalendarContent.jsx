import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock as ClockIcon, CalendarDays, ChevronDown } from 'lucide-react';

const CalendarContent = ({ onNavigateToCalendar, initialMode = 'both' }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mode, setMode] = useState(initialMode);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const cycleMode = (e) => {
    e.stopPropagation();
    setShowPicker(false);
    setMode(prev => {
      if (prev === 'both') return 'clock';
      if (prev === 'clock') return 'calendar';
      return 'both';
    });
  };

  const handlePickerClick = (e) => {
    e.stopPropagation();
    setShowPicker(v => !v);
  };

  const selectMode = (e, m) => {
    e.stopPropagation();
    setMode(m);
    setShowPicker(false);
  };

  const today = new Date();

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const year = today.getFullYear();
  const month = today.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const formatTime = (date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    const displaySeconds = seconds.toString().padStart(2, '0');
    return { hours: displayHours, minutes: displayMinutes, seconds: displaySeconds, ampm };
  };

  const formatDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[date.getDay()]}, ${monthNames[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
  };

  const time = formatTime(currentTime);

  const showCalendar = mode === 'calendar' || mode === 'both';
  const showClock = mode === 'clock' || mode === 'both';

  return (
    <div
      onClick={onNavigateToCalendar}
      className="cursor-pointer group bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {mode === 'clock' ? 'Digital Clock' : mode === 'calendar' ? monthNames[month] + ' ' + year : monthNames[month] + ' ' + year}
        </h4>
        <div className="flex items-center gap-1 relative">
          {mode === 'calendar' && <CalendarDays className="w-4 h-4 text-gray-400" />}
          {mode === 'clock' && <ClockIcon className="w-4 h-4 text-gray-400" />}
          {(mode === 'both' || !mode) && <CalendarIcon className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />}
          <button
            onClick={handlePickerClick}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Switch view"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          {showPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg py-1 text-sm">
              <button
                onClick={(e) => selectMode(e, 'both')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  mode === 'both' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Both
              </button>
              <button
                onClick={(e) => selectMode(e, 'calendar')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  mode === 'calendar' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                onClick={(e) => selectMode(e, 'clock')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  mode === 'clock' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                Clock
              </button>
            </div>
          )}
        </div>
      </div>

      {showCalendar && (
        <>
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
              <div key={day} className="text-[10px] font-bold text-gray-400 dark:text-gray-500">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((day, index) => {
              const isToday = day === today.getDate();
              return (
                <div
                  key={index}
                  className={`text-xs py-1 rounded-md transition-colors ${
                    isToday
                      ? 'bg-indigo-600 dark:bg-indigo-500 text-white font-bold shadow-sm'
                      : day
                        ? 'text-gray-700 dark:text-gray-300 group-hover:bg-white dark:group-hover:bg-gray-800'
                        : ''
                  }`}
                >
                  {day || ''}
                </div>
              );
            })}
          </div>
        </>
      )}

      {showClock && (
        <div className={`mt-3 ${showCalendar ? 'pt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                {time.hours}
              </span>
              <span className="text-lg font-bold text-gray-500 dark:text-gray-400 animate-pulse">:</span>
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                {time.minutes}
              </span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 ml-0.5">
                {time.ampm}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {formatDate(currentTime)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-end">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {time.seconds}s
            </span>
          </div>
        </div>
      )}

      {mode === 'both' || !mode ? (
        <div className="mt-2 h-4 flex items-center justify-center">
          <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1 group-hover:translate-y-0 duration-200">
            Open Full Calendar
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default CalendarContent;
