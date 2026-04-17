import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Hash, Timer, Check } from 'lucide-react';
import Portal from '../components/Portal';

const AddProgressModal = ({ habit, onClose, onSubmit, isSubmitting = false }) => {
  const [value, setValue] = useState(1);
  const [comment, setComment] = useState('');

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Set initial value based on current progress or unit step
  useEffect(() => {
    if (habit.tracking_type === 'duration') {
      setValue(15); // Default 15 minutes
    } else {
      setValue(1); // Default 1 for numeric
    }
  }, [habit.tracking_type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow going below total 0
    const currentProgress = habit.today_value || 0;
    if (currentProgress + value < 0) {
      return; // Would result in negative total
    }
    
    await onSubmit(value, comment.trim());
  };

  const incrementValue = () => {
    const step = habit.tracking_type === 'duration' ? 5 : 1;
    const currentProgress = habit.today_value || 0;
    const targetValue = habit.target_value || 1;
    
    // Don't allow new total to exceed target
    setValue(prev => {
      const newTotal = currentProgress + prev + step;
      if (newTotal > targetValue) {
        // Only add up to target
        return targetValue - currentProgress;
      }
      return prev + step;
    });
  };

  const decrementValue = () => {
    const step = habit.tracking_type === 'duration' ? 5 : 1;
    const currentProgress = habit.today_value || 0;
    
    // Don't allow new total to go below 0
    setValue(prev => {
      const newTotal = currentProgress + prev - step;
      if (newTotal < 0) {
        // Only reduce to 0
        return -currentProgress;
      }
      return prev - step;
    });
  };

  const getIcon = () => {
    return habit.tracking_type === 'duration' ? <Timer className="w-5 h-5" /> : <Hash className="w-5 h-5" />;
  };

  const getValueLabel = () => {
    if (habit.tracking_type === 'duration') {
      return `${value} ${habit.unit || 'minutes'}`;
    }
    return `${value} ${habit.unit || ''}`.trim();
  };

  const currentProgress = habit.today_value || 0;
  const targetValue = habit.target_value || 1;
  const newTotal = currentProgress + value;
  const progressPercentage = Math.min(100, Math.max(0, Math.round((newTotal / targetValue) * 100)));
  
  // Check if buttons should be disabled
  const canIncrement = newTotal < targetValue;
  const canDecrement = newTotal > 0;

  return (
    <Portal>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
        onClick={(e) => {
          // Close modal when clicking backdrop
          if (e.target === e.currentTarget && !isSubmitting) {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {/* Modal Content */}
        <div 
          className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-xl max-w-md w-full animate-in fade-in zoom-in duration-200 border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-progress-title"
          aria-describedby="add-progress-description"
        >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ 
                backgroundColor: `${habit.color}15`,
                border: `2px solid ${habit.color}40`
              }}
            >
              {getIcon()}
            </div>
            <div>
              <h2 
                id="add-progress-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-white"
              >
                Update Progress
              </h2>
              <p 
                id="add-progress-description"
                className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400"
              >
                {habit.name}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Combined Progress Bar - Current + Adjustment */}
          <div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                {value === 0 ? 'Current Progress' : 'Updated Progress'}
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-white">
                {value === 0 ? (
                  `${currentProgress}/${targetValue} ${habit.unit || ''}`
                ) : (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">{currentProgress}</span>
                    <span className={value >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}>
                      {value >= 0 ? ' +' : ' '}{value}
                    </span>
                    <span> = {newTotal}/{targetValue} {habit.unit || ''}</span>
                  </>
                )}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 rounded-full h-3 overflow-hidden relative">
              {value === 0 ? (
                // Show only current progress when no adjustment
                <div 
                  className="h-3 transition-all duration-500 ease-out absolute left-0"
                  style={{ 
                    width: `${Math.min(100, Math.round((currentProgress / targetValue) * 100))}%`,
                    backgroundColor: habit.color
                  }}
                />
              ) : value > 0 ? (
                // Adding progress - show current + new portion
                <>
                  {/* Current progress (solid) */}
                  <div 
                    className="h-3 transition-all duration-500 ease-out absolute left-0"
                    style={{ 
                      width: `${Math.min(100, Math.round((currentProgress / targetValue) * 100))}%`,
                      backgroundColor: habit.color
                    }}
                  />
                  {/* New addition (lighter shade) */}
                  <div 
                    className="h-3 transition-all duration-500 ease-out absolute"
                    style={{ 
                      left: `${Math.min(100, Math.round((currentProgress / targetValue) * 100))}%`,
                      width: `${Math.min(100 - Math.round((currentProgress / targetValue) * 100), Math.round((value / targetValue) * 100))}%`,
                      backgroundColor: habit.color,
                      opacity: 0.5
                    }}
                  />
                </>
              ) : (
                // Reducing progress - show reduced amount with visual indicator
                <>
                  {/* New total after reduction */}
                  <div 
                    className="h-3 transition-all duration-500 ease-out absolute left-0"
                    style={{ 
                      width: `${Math.max(0, Math.min(100, Math.round((newTotal / targetValue) * 100)))}%`,
                      backgroundColor: habit.color
                    }}
                  />
                  {/* Amount being removed (orange) */}
                  <div 
                    className="h-3 transition-all duration-500 ease-out absolute"
                    style={{ 
                      left: `${Math.max(0, Math.min(100, Math.round((newTotal / targetValue) * 100)))}%`,
                      width: `${Math.min(100, Math.round((Math.abs(value) / targetValue) * 100))}%`,
                      backgroundColor: '#f97316',
                      opacity: 0.7
                    }}
                  />
                </>
              )}
            </div>
            {/* Show completion status */}
            {value !== 0 && newTotal >= targetValue && (
              <div className="flex items-center space-x-2 mt-2 text-green-600 dark:text-green-400 midnight:text-green-400">
                <Check className="w-4 h-4" />
                <span className="text-xs font-medium">
                  {newTotal === targetValue ? 'Goal will be reached! 🎉' : 'Goal already reached!'}
                </span>
              </div>
            )}
            {value !== 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-2">
                Progress: {progressPercentage}%
              </p>
            )}
          </div>

          {/* Value Stepper */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
              Adjust Amount
            </label>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={decrementValue}
                className="w-10 h-10 rounded-lg border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || !canDecrement}
                title={!canDecrement ? "Cannot reduce below 0" : "Reduce"}
              >
                <Minus className="w-5 h-5" />
              </button>
              
              <div className="flex-1">
                <input
                  type="number"
                  value={value}
                  onChange={(e) => {
                    const inputValue = parseInt(e.target.value) || 0;
                    const currentProgress = habit.today_value || 0;
                    const targetValue = habit.target_value || 1;
                    const newTotal = currentProgress + inputValue;
                    
                    // Constrain to valid range: don't exceed target, don't go below 0
                    if (newTotal > targetValue) {
                      setValue(targetValue - currentProgress);
                    } else if (newTotal < 0) {
                      setValue(-currentProgress);
                    } else {
                      setValue(inputValue);
                    }
                  }}
                  className="w-full px-4 py-3 text-center text-lg font-semibold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 bg-white dark:bg-gray-700 midnight:bg-gray-800 border-gray-300 dark:border-gray-600 midnight:border-gray-700 text-gray-900 dark:text-gray-100 midnight:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ 
                    borderColor: `${habit.color}40`,
                    focusRingColor: habit.color
                  }}
                  disabled={isSubmitting}
                  autoFocus
                />
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 mt-2">
                  {getValueLabel()}
                </p>
              </div>

              <button
                type="button"
                onClick={incrementValue}
                className="w-10 h-10 rounded-lg border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || !canIncrement}
                title={!canIncrement ? "Cannot exceed target" : "Add"}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            {/* Warning Messages */}
            {newTotal < 0 && (
              <div className="flex items-center space-x-2 mt-3 text-red-600 dark:text-red-400 midnight:text-red-400">
                <X className="w-4 h-4" />
                <span className="text-sm font-medium">Cannot reduce below 0</span>
              </div>
            )}
            {newTotal > targetValue && (
              <div className="flex items-center space-x-2 mt-3 text-orange-600 dark:text-orange-400 midnight:text-orange-400">
                <X className="w-4 h-4" />
                <span className="text-sm font-medium">Cannot exceed target ({targetValue} {habit.unit || ''})</span>
              </div>
            )}
          </div>

          {/* Optional Comment */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                // Prevent event propagation for space key
                if (e.key === ' ' || e.code === 'Space') {
                  e.stopPropagation();
                }
              }}
              placeholder="Add any comment about this progress..."
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 resize-none bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-500"
              rows="3"
              disabled={isSubmitting}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex-1 px-4 py-2 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors font-medium"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: habit.color }}
              disabled={isSubmitting || newTotal < 0 || newTotal > targetValue}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Updating...</span>
                </span>
              ) : (
                value < 0 ? 'Reduce Progress' : 'Add Progress'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};

export default AddProgressModal;
