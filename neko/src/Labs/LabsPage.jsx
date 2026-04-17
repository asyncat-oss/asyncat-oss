import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, CreditCard, BrainCircuit, Network, ArrowRight } from 'lucide-react';

const TOOLS = [
  {
    id: 'flashcards',
    icon: CreditCard,
    colorClasses: {
      icon: 'text-violet-600 dark:text-violet-400',
      badge: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-700/40',
      arrow: 'group-hover:text-violet-600 dark:group-hover:text-violet-400',
    },
    title: 'Flashcards',
    description: 'AI-generated decks with SM-2 spaced repetition. Cards resurface right when memory fades — not before, not after.',
    badge: 'Spaced Repetition',
    path: '/lab/flashcards',
  },
  {
    id: 'recall',
    icon: BrainCircuit,
    colorClasses: {
      icon: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/40',
      arrow: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
    },
    title: 'Active Recall',
    description: 'Generate quiz questions from any topic. Answer from memory, rate yourself, and track your scores over time.',
    badge: 'Quiz Engine',
    path: '/lab/recall',
  },
  {
    id: 'mindmap',
    icon: Network,
    colorClasses: {
      icon: 'text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/40',
      arrow: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
    },
    title: 'Mind Maps',
    description: 'AI builds a connected topic map with expandable branches. Save it, revisit it, and use it as a reference.',
    badge: 'Saved Maps',
    path: '/lab/mindmap',
  },
];

const ToolCard = ({ tool }) => {
  const navigate = useNavigate();
  const Icon = tool.icon;

  return (
    <button
      onClick={() => !tool.disabled && navigate(tool.path)}
      disabled={tool.disabled}
      className={`group text-left w-full flex flex-col p-5 rounded-xl border transition-all duration-150 ${
        tool.disabled
          ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 opacity-60 cursor-not-allowed'
          : 'border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 flex-shrink-0 ${tool.colorClasses.icon}`} />
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${tool.colorClasses.badge}`}>
          {tool.badge}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
        {tool.title}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
        {tool.description}
      </p>

      {!tool.disabled && (
        <div className={`flex items-center gap-1 mt-4 text-xs text-gray-400 dark:text-gray-500 transition-colors ${tool.colorClasses.arrow}`}>
          Open <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </button>
  );
};

const LabsPage = () => {
  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-2xl mx-auto px-6 py-8">

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <FlaskConical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Labs</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Real learning tools — not just prompts. Each one saves your work, tracks your progress, and gets smarter over time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOOLS.map(tool => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default LabsPage;
