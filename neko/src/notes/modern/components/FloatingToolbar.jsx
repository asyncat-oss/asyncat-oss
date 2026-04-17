import React from 'react';
import { Bold, Italic, Underline, Strikethrough, Highlighter } from 'lucide-react';

const FloatingToolbar = ({ position, onFormat, selection }) => {

  // EARLY RETURN AFTER ALL HOOKS
  if (!position) return null;

  const isDisabled = Boolean(selection?.disabled);

  const buttons = [
    { icon: Bold, action: 'bold', active: selection?.bold },
    { icon: Italic, action: 'italic', active: selection?.italic },
    { icon: Underline, action: 'underline', active: selection?.underline },
    { icon: Strikethrough, action: 'strikethrough', active: selection?.strikethrough },
    { icon: Highlighter, action: 'highlight', active: selection?.highlight }
  ];



  const topOffset = Math.max(position.top - 12, 12);

  return (
    <div
      className="fixed z-50 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-600 p-1 flex items-center gap-0.5"
      style={{
        top: `${topOffset}px`,
        left: `${position.left}px`,
        transform: "translate(-50%, -100%)",
        animation: "fadeIn 0.1s ease-out",
        willChange: "transform, top, left",
      }}
    >
      {/* Format buttons */}
      {buttons.map((button, index) => {
        const Icon = button.icon;
        return (
          <button
            key={button.action}
            className={`p-1.5 rounded transition-colors ${
              isDisabled
                ? 'cursor-not-allowed opacity-50 text-gray-400 dark:text-gray-500 midnight:text-gray-500'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300'
            } ${
              button.active && !isDisabled
                ? 'bg-blue-100 dark:bg-blue-900 midnight:bg-blue-900 text-blue-700 dark:text-blue-300 midnight:text-blue-300'
                : ''
            }`}
            onClick={() => {
              if (!isDisabled) {
                onFormat(button.action);
              }
            }}
            title={
              isDisabled
                ? 'Formatting disabled for completed tasks'
                : button.action.charAt(0).toUpperCase() + button.action.slice(1)
            }
            disabled={isDisabled}
            aria-disabled={isDisabled}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}

    </div>
  );
};

export default FloatingToolbar;
