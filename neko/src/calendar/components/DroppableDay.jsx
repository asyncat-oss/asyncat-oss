import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
 
const DroppableDay = ({ date, children, onClick, isToday, isSelectedDate }) => {
  // Generate droppable ID using consistent timezone handling
  const droppableId = date ? 
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12, // Set to noon to avoid timezone issues
      0,
      0
    ).toISOString().split('T')[0]
    : `empty-${Date.now()}`;

  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    disabled: !date
  });
  
  // Determine if this day should have a special highlight (today, selected, etc.)
  const isHighlighted = date && isToday(date);
  const isSelected = date && isSelectedDate && isSelectedDate(date);

  return (
    <motion.div 
      ref={setNodeRef}
      onClick={() => date && onClick(date)}
      className={`
        min-h-[10rem] p-2.5 
        rounded-md border
        transition-all duration-150 ease-in-out /* Faster transition */
        relative overflow-hidden
      
        ${date ? 'cursor-pointer' : 'cursor-default'}
        
        ${isHighlighted 
          ? 'border-blue-300 dark:border-blue-600 midnight:border-blue-800' 
          // Subtle border logic for isOver
          : isOver ? 'border-blue-400/60 dark:border-blue-500/50 midnight:border-blue-400/40' : 'border-gray-200 dark:border-gray-800 midnight:border-gray-800'}
        
        ${isSelected 
          ? 'border-blue-500 dark:border-blue-600 midnight:border-blue-700 border-2' 
          : ''}
        
        ${date 
          // Subtle background for isOver
          ? isOver ? 'bg-blue-50/40 dark:bg-blue-900/15 midnight:bg-blue-950/10' : 'bg-white dark:bg-gray-900 midnight:bg-gray-950 hover:shadow-sm' 
          : 'bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-950/50'}
        
        ${isOver 
          // Very subtle ring and shadow for isOver
          ? 'ring-1 ring-blue-400/50 dark:ring-blue-500/40 midnight:ring-blue-400/30 shadow-sm' 
          : ''}
      `}
      whileHover={date ? {
        scale: 1.002,
        boxShadow: "0 4px 12px rgba(0,0,0,0.07)",
        borderColor: "rgba(107, 114, 128, 0.5)"
      } : {}}
      animate={{
        boxShadow: isOver ? "0 4px 8px rgba(59, 130, 246, 0.08)" : "none",
        transition: { duration: 0.2 }
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Day highlight effect for today - more subtle */}
      {isHighlighted && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-300 dark:bg-blue-600 midnight:bg-blue-800"></div>
      )}
      
      {/* Selected day indicator */}
      {isSelected && (
        <div className="absolute top-0 right-0 w-0 h-0 
          border-t-[20px] border-r-[20px] 
          border-t-blue-500 dark:border-t-blue-600 midnight:border-t-blue-700
          border-r-transparent">
        </div>
      )}
      
      {/* Drop indicator overlay with animation - Very subtle */}
      {isOver && (
        <motion.div 
          className="absolute inset-0 bg-blue-400/3 dark:bg-blue-500/3 midnight:bg-blue-400/2 pointer-events-none rounded-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }} // Quick fade-in
        />
      )}
      
      {/* Drop preview border - More subtle */}
      {isOver && (
        <div className="absolute inset-0 border border-blue-400/40 dark:border-blue-500/30 midnight:border-blue-400/25 rounded-md pointer-events-none"></div>
      )}
      
      {/* Main day content */}
      <div className={`relative z-10 ${isOver ? 'opacity-95' : 'opacity-100'}`}>
        {children}
      </div>
      
      {/* Subtle modern gradient for empty dates */}
      {!date && (
        <div className="absolute inset-0 opacity-5 dark:opacity-10 midnight:opacity-5 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 midnight:from-gray-800 midnight:to-gray-900 pointer-events-none"></div>
      )}
      
      {/* Card backdrop blur for midnight mode */}
      <div className="absolute inset-0 backdrop-blur-[1px] rounded-md opacity-0 midnight:opacity-10 pointer-events-none"></div>
    </motion.div>
  );
};

export default DroppableDay;