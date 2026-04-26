// SuggestedQuestions.jsx - Spacious, flat, web search style
import { useState, useMemo } from 'react';
import { ChevronRight, Lightbulb, MessageCircle, Zap, BarChart3, Wrench, Calendar, Users, Target } from 'lucide-react';

// Add keyframe animations via style tag
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  if (!document.head.querySelector('style[data-suggestions-animations]')) {
    style.setAttribute('data-suggestions-animations', 'true');
    document.head.appendChild(style);
  }
}

const SuggestedQuestions = ({
  onQuestionClick,
  suggestions = [],
  className = ''
}) => {
  const [selectedIndex, setSelectedIndex] = useState(null);

  // Normalize suggestion shape: accept { text, title, question, query, label }
  const displaySuggestions = useMemo(() => {
    if (suggestions && suggestions.length > 0) {
      const normalized = suggestions.slice(0, 6).map(suggestion => {
        const text = suggestion.text || suggestion.title || suggestion.question || suggestion.query || suggestion.label || '';
        return {
          ...suggestion,
          text,
          icon: getCategoryIcon(suggestion.category)
        };
      }).filter(s => s.text && s.text.trim());

      return normalized;
    }
    return [];
  }, [suggestions]);

  function getCategoryIcon(category) {
    const iconMap = {
      planning: Calendar,
      analytics: BarChart3,
      automation: Zap,
      team: Users,
      productivity: Target,
      insights: Lightbulb,
      create: Wrench,
      tasks: Target,
      reporting: BarChart3,
      habits: Target,
      build: Wrench,
      enhance: Wrench
    };
    return iconMap[category] || MessageCircle;
  }

  const handleQuestionClick = (suggestion, index) => {
    setSelectedIndex(index);
    setTimeout(() => setSelectedIndex(null), 200);
    onQuestionClick(suggestion.text);
  };

  if (displaySuggestions.length === 0) return null;

  return (
    <div className={`mt-3 w-full ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-blue-500 dark:text-blue-400 midnight:text-blue-400" />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-slate-200">
          Suggestions
        </span>
      </div>

      {/* Suggestions List */}
      <ul className="w-full rounded-md divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-slate-600">
        {displaySuggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          const isSelected = selectedIndex === index;

          return (
            <li
              key={index}
              style={{
                animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`
              }}
            >
              <button
                onClick={() => handleQuestionClick(suggestion, index)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-all duration-200 ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/20 scale-[0.98]'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-700/50 hover:scale-[1.01] active:scale-[0.98]'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
                <span className="flex-1 text-gray-800 dark:text-gray-200 midnight:text-slate-100">
                  {suggestion.text}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-slate-400" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SuggestedQuestions;
