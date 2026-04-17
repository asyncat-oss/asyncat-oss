// ThinkingBlock.jsx — renders <think>...</think> content as a collapsible reasoning panel
import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Parse <think>...</think> block out of a message.
 * Returns { thinking: string|null, answer: string }
 */
export function parseThinkingContent(content) {
  if (!content) return { thinking: null, answer: '' };
  // Match optional leading <think> block (case-insensitive, across newlines)
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/i);
  if (!match) return { thinking: null, answer: content };
  return {
    thinking: match[1].trim(),
    answer:   content.slice(match[0].length).trim(),
  };
}

/**
 * Detect if we're currently mid-think (open tag but no close tag yet).
 * Used during streaming to show the thinking indicator without showing raw tags.
 */
export function isInsideThinkBlock(content) {
  const openIdx  = content.indexOf('<think>');
  const closeIdx = content.indexOf('</think>');
  return openIdx !== -1 && closeIdx === -1;
}

/**
 * Strip partial/complete <think> block for display during streaming
 * so raw tags don't bleed into the visible answer.
 */
export function stripThinkForStreaming(content) {
  // Complete think block present — show only what comes after
  const afterClose = content.replace(/^<think>[\s\S]*?<\/think>\s*/i, '');
  if (afterClose !== content) return afterClose;
  // Partial think block — hide everything inside it
  if (content.startsWith('<think>')) return '';
  return content;
}

// ── UI component ──────────────────────────────────────────────────────────────

export default function ThinkingBlock({ content, isStreaming = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!content && !isStreaming) return null;

  return (
    <div className="mb-3 rounded-lg border border-purple-200 dark:border-purple-800 midnight:border-purple-800 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left"
      >
        <Brain className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        <span className="text-xs font-medium text-purple-700 dark:text-purple-300 midnight:text-purple-300 flex-1">
          Reasoning
        </span>
        {isStreaming && !content ? (
          <span className="text-xs text-purple-400 dark:text-purple-500 italic animate-pulse">thinking…</span>
        ) : content ? (
          <>
            <span className="text-xs text-purple-400 dark:text-purple-500 mr-1">
              {content.split(' ').length} words
            </span>
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            }
          </>
        ) : null}
      </button>

      {/* Content — expanded or streaming */}
      {(expanded || (isStreaming && !content)) && (
        <div className="px-3 py-3 bg-purple-50/40 dark:bg-purple-950/20 midnight:bg-purple-950/30 border-t border-purple-100 dark:border-purple-800/50 midnight:border-purple-800/50">
          {content ? (
            <pre className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
              {content}
            </pre>
          ) : (
            <div className="flex items-center gap-2 text-xs text-purple-500 dark:text-purple-400 italic">
              <span className="animate-pulse">Model is reasoning…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
