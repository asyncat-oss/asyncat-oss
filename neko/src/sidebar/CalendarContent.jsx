import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

const CalendarContent = ({ onNavigateToCalendar }) => {
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

  return (
    <div 
      onClick={onNavigateToCalendar}
      className="cursor-pointer group bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {monthNames[month]} {year}
        </h4>
        <CalendarIcon className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
      </div>
      
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
      
      <div className="mt-2 h-4 flex items-center justify-center">
        <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1 group-hover:translate-y-0 duration-200">
          Open Full Calendar
        </span>
      </div>
    </div>
  );
};

export default CalendarContent;
