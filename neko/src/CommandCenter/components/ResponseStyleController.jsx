// ResponseStyleController.jsx - Response Style Controller Component
import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Check, Target, MessageCircle, BookOpen, GraduationCap } from 'lucide-react';

const RESPONSE_STYLES = [
  {
    id: 'normal',
    name: 'Chillax',
    icon: MessageCircle,
    isDefault: true
  },
  {
    id: 'concise',
    name: 'Speedrun',
    icon: Target,
    isDefault: false
  },
  {
    id: 'explanatory',
    name: 'Storyteller',
    icon: BookOpen,
    isDefault: false
  },
  {
    id: 'learning',
    name: 'Professor',
    icon: GraduationCap,
    isDefault: false
  }
];

export const ResponseStyleController = ({
  currentStyle = 'normal',
  onStyleChange,
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const currentStyleConfig = RESPONSE_STYLES.find(style => style.id === currentStyle) || RESPONSE_STYLES[0];

  const handleStyleSelect = (styleId) => {
    onStyleChange(styleId);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`p-2 rounded-lg transition-colors ${
          isOpen
            ? 'bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 text-gray-700 dark:text-gray-200 midnight:text-slate-200'
            : currentStyle !== 'normal'
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={`Response Style: ${currentStyleConfig.name}`}
      >
        <Sliders className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg shadow-lg p-2 min-w-48 z-50">
          <div className="space-y-1">
            {RESPONSE_STYLES.map((style) => {
              const isSelected = currentStyle === style.id;
              const Icon = style.icon;
              
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleStyleSelect(style.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30 text-blue-900 dark:text-blue-100 midnight:text-blue-50'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 text-gray-900 dark:text-gray-100 midnight:text-slate-100'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="flex-1">{style.name}</span>
                  {isSelected && (
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 midnight:text-blue-300" />
                  )}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
};

export default ResponseStyleController;