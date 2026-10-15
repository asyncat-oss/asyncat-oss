// The chat's outline: a dot per message at the left edge, and on hover the
// list of what was asked, to jump to.
import { useState, useEffect, useCallback, useRef } from 'react';

export default function ChatFloatingNav({ items = [], scrollContainerRef }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  // ── Track active section ────────────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container || !items.length) return;
    const update = () => {
      const top = container.getBoundingClientRect().top;
      let found = 0;
      for (let i = 0; i < items.length; i++) {
        const el = document.getElementById(items[i].domId);
        if (el && el.getBoundingClientRect().top - top < 120) found = i;
        else if (el) break;
      }
      setActiveIdx(found);
    };
    container.addEventListener('scroll', update, { passive: true });
    update();
    return () => container.removeEventListener('scroll', update);
  }, [items, scrollContainerRef]);

  // ── Scroll to section ──────────────────────────────────────────────────────
  const goTo = useCallback((domId) => {
    const el = document.getElementById(domId);
    const container = scrollContainerRef?.current;
    if (!el || !container) return;
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollBy({ top: offset - 24, behavior: 'smooth' });
  }, [scrollContainerRef]);

  // ── Hover with leave-delay so mouse can travel to panel ────────────────────
  const handleEnter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  if (items.length < 2) return null;

  return (
    <div className="absolute left-0 top-0 bottom-0 z-20 hidden xl:flex items-center pointer-events-none">
      {/* Only the dots and the open panel take the pointer: the closed panel
          still takes room, and would block clicks on the chat beside it. */}
      <div
        className="flex items-center"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {/* ── Thin line + dots trigger ── */}
        <div className="pointer-events-auto flex flex-col items-center gap-[5px] px-2.5 py-3 cursor-default">
          {items.map((_, i) => (
            <span
              key={i}
              className={`block rounded-full transition-all duration-200 ${
                i === activeIdx
                  ? 'h-4 w-[3px] bg-fg-muted'
                  : 'h-[5px] w-[3px] bg-line-strong'
              }`}
            />
          ))}
        </div>

        {/* ── Hover panel ── */}
        <div
          className={`transition-all duration-150 origin-left ${
            open ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-1 pointer-events-none'
          }`}
        >
          <div className="w-56 overflow-hidden rounded-xl border border-line bg-elevated shadow-xl shadow-black/10">
            <div className="max-h-80 overflow-y-auto py-1">
              {items.map((item, i) => (
                <button
                  key={item.domId}
                  type="button"
                  onClick={() => goTo(item.domId)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left outline-none transition-colors focus-visible:bg-hover ${
                    i === activeIdx
                      ? 'bg-selected'
                      : 'hover:bg-hover'
                  }`}
                >
                  <span className={`mt-px shrink-0 text-[11px] tabular-nums w-4 ${
                    i === activeIdx ? 'font-medium text-fg' : 'text-fg-subtle'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] leading-snug line-clamp-2 ${
                      i === activeIdx
                        ? 'font-medium text-fg'
                        : 'text-fg-muted'
                    }`}>
                      {item.goal || `Message ${i + 1}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
