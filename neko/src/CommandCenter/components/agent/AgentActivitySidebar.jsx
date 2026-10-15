// The Steps panel beside a chat: one quiet line per thing the agent did.
import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { activityDot } from './activityDot.js';
import { activityDetail } from './activityDetail.js';

export default function AgentActivitySidebar({ items = [], isLoading = false, isRunning = false }) {
  const feedEndRef = useRef(null);

  useEffect(() => {
    if (isRunning) feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length, isRunning]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="flex-1 text-[12px] font-medium text-fg-subtle">
          Steps
        </span>
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-fg-subtle" />
        ) : isRunning ? (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" aria-label="Running" />
        ) : (
          <span className="text-[12px] tabular-nums text-fg-subtle">{items.length}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !isLoading && (
          <p className="px-4 py-5 text-[12px] text-fg-subtle">
            Nothing yet.
          </p>
        )}
        <div className="py-1.5 px-1.5 space-y-px">
          {items.map((item, i) => {
            const detail = activityDetail(item.detail);
            const isLast = i === items.length - 1;
            const dot = activityDot(item.dot);

            return (
              <div
                key={item.id}
                title={detail || item.label}
                className={`rounded-lg px-2.5 py-2 transition-colors ${
                  isLast && isRunning
                    ? 'bg-selected'
                    : 'hover:bg-hover'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[12px] font-medium text-fg truncate leading-none">
                        {item.label}
                      </span>
                      {item.duration && (
                        <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
                          · {item.duration}
                        </span>
                      )}
                    </div>
                    {detail && (
                      <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle line-clamp-2 [overflow-wrap:anywhere]">
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
