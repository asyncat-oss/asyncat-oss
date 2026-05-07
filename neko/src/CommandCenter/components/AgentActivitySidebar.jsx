import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

function cleanAgentActivityDetail(detail) {
  return String(detail || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s*<tool_call>[\s\S]*?<\/(?:\w+:)?tool_call>/gi, '')
    .replace(/\s*<tool_call[\s\S]*$/i, '')
    .trim();
}

export default function AgentActivitySidebar({ items = [], isLoading = false, isRunning = false }) {
  const feedEndRef = useRef(null);

  useEffect(() => {
    if (isRunning) feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length, isRunning]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          Steps
        </span>
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
        ) : isRunning ? (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        ) : (
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{items.length}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !isLoading && (
          <p className="px-4 py-5 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            Nothing yet.
          </p>
        )}
        <div className="py-1.5 px-1.5 space-y-px">
          {items.map((item, i) => {
            const detail = cleanAgentActivityDetail(item.detail);
            const isLast = i === items.length - 1;

            return (
              <div
                key={item.id}
                title={detail || item.label}
                className={`rounded-lg px-2.5 py-2 transition-colors ${
                  isLast && isRunning
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 midnight:bg-blue-950/20'
                    : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40 midnight:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 truncate leading-none">
                        {item.label}
                      </span>
                      {item.duration && (
                        <span className="shrink-0 text-[10px] tabular-nums text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                          · {item.duration}
                        </span>
                      )}
                    </div>
                    {detail && (
                      <p className="mt-0.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500 midnight:text-slate-500 line-clamp-2 break-all">
                        {detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      </div>
    </div>
  );
}
