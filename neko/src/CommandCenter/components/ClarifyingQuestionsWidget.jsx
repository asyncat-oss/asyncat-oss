// ClarifyingQuestionsWidget.jsx
// Floating panel shown when the AI needs structured input from the user.
// Questions come from <clarify> JSON blocks in the AI response.
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, PenLine } from 'lucide-react';

export default function ClarifyingQuestionsWidget({ questions, onSubmit, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // answers: { [questionIndex]: string }
  const [answers, setAnswers] = useState({});
  const [freeText, setFreeText] = useState('');
  const freeTextRef = useRef(null);

  // Safety check
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const total = questions.length;
  const current = questions[currentIndex];

  // Sync freeText field when navigating between questions
  useEffect(() => {
    if (!current) return;
    const existing = answers[currentIndex];
    // If the stored answer doesn't match any option, it's a free-text answer
    const isCustom = existing && !current.options?.includes(existing);
    setFreeText(isCustom ? existing : '');
  }, [currentIndex, current, answers]);

  const selectOption = (option) => {
    setAnswers(prev => ({ ...prev, [currentIndex]: option }));
    setFreeText('');
  };

  const handleFreeTextChange = (e) => {
    const val = e.target.value;
    setFreeText(val);
    setAnswers(prev => ({ ...prev, [currentIndex]: val || undefined }));
  };

  const canGoNext = !!answers[currentIndex];
  const isLast = currentIndex === total - 1;

  const handleNext = () => {
    if (!canGoNext) return;
    if (isLast) {
      handleSubmit();
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const handleSubmit = () => {
    const formatted = questions
      .map((q, i) => answers[i] ? `Q: ${q.text}\nA: ${answers[i]}` : null)
      .filter(Boolean)
      .join('\n\n');
    onSubmit(formatted);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="w-full bg-white dark:bg-gray-900 midnight:bg-slate-900 overflow-hidden">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 midnight:text-slate-100 leading-snug flex-1 pr-4">
            {current.text}
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            {total > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleBack}
                  disabled={currentIndex === 0}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                  {currentIndex + 1} of {total}
                </span>
                <button
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            )}
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors"
              title="Skip"
            >
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
          {current?.options?.map((option, i) => {
            const isSelected = answers[currentIndex] === option;
            return (
              <button
                key={i}
                onClick={() => selectOption(option)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors duration-100
                  ${isSelected
                    ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-900 dark:text-white midnight:text-slate-100'
                    : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/40 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-slate-200'
                  }`}
              >
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-medium flex-shrink-0 border
                  ${isSelected
                    ? 'border-gray-500 dark:border-gray-400 bg-gray-800 dark:bg-gray-200 midnight:bg-slate-200 text-white dark:text-gray-900 midnight:text-slate-900'
                    : 'border-gray-300 dark:border-gray-600 midnight:border-slate-600 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {i + 1}
                </span>
                {option}
                {isSelected && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto text-gray-400 dark:text-gray-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Free text input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800">
          <PenLine className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            ref={freeTextRef}
            type="text"
            value={freeText}
            onChange={handleFreeTextChange}
            placeholder="Or type your own..."
            className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 midnight:text-slate-300 placeholder-gray-400 dark:placeholder-gray-600 outline-none"
          />
          <button
            onClick={handleClose}
            className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={!canGoNext}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 midnight:bg-slate-100 text-white dark:text-gray-900 midnight:text-slate-900 disabled:opacity-40 transition-opacity"
          >
            {isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
