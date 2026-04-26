import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// eslint-disable-next-line react-refresh/only-export-components
export function parseThinkingContent(content) {
  if (!content) return { thinking: null, answer: '' };
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/i);
  if (!match) return { thinking: null, answer: content };
  return {
    thinking: match[1].trim(),
    answer:   content.slice(match[0].length).trim(),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function isInsideThinkBlock(content) {
  const openIdx  = content.indexOf('<think>');
  const closeIdx = content.indexOf('</think>');
  return openIdx !== -1 && closeIdx === -1;
}

// eslint-disable-next-line react-refresh/only-export-components
export function stripThinkForStreaming(content) {
  const afterClose = content.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
  if (afterClose !== content) return afterClose;
  if (content.startsWith('<think>')) return '';
  return content;
}

export default function ThinkingBlock({ content, isStreaming = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!content && !isStreaming) return null;

  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const isThinking = isStreaming && !content;

  return (
    <div className="mb-3">
      <button
        onClick={() => !isThinking && setExpanded(v => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-left ${
          isThinking
            ? 'cursor-default'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 midnight:hover:bg-slate-800/60'
        }`}
      >
        {isThinking ? (
          <span className="flex gap-0.5 items-center">
            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ) : expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        )}
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-500 tracking-wide select-none">
          {isThinking ? 'Thinking…' : `Reasoning · ${wordCount} words`}
        </span>
      </button>

      {expanded && content && (
        <div className="mt-1 ml-2 pl-3 border-l-2 border-gray-100 dark:border-gray-800 midnight:border-slate-800">
          <pre className="text-[11px] text-gray-400 dark:text-gray-500 midnight:text-gray-500 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto py-1 pr-1">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
