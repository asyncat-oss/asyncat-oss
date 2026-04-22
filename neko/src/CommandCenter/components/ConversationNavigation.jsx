// ConversationNavigation.jsx - "On this page" sidebar panel
import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search } from 'lucide-react';

// Extract H2/H3 headings from assistant messages
function extractHeadings(messages) {
  const headings = [];
  if (!messages || !Array.isArray(messages)) return headings;

  messages.forEach((message, msgIdx) => {
    if (message.type !== 'assistant' || !message.content) return;

    const lines = message.content.split('\n');
    lines.forEach(line => {
      const h3 = line.match(/^###\s+(.+)$/);
      const h2 = !h3 && line.match(/^##\s+(.+)$/);
      const match = h3 || h2;
      if (!match) return;

      const text = match[1].trim().replace(/\*\*/g, ''); // strip bold markers
      const level = h3 ? 3 : 2;
      const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      headings.push({ id: `hn-${msgIdx}-${slug}`, text, level, messageIndex: msgIdx });
    });
  });

  return headings;
}

// Find the rendered heading element by message index + text content
function findHeadingEl(messageIndex, text) {
  const msgEl = document.getElementById(`message-${messageIndex}`);
  if (!msgEl) return null;
  for (const el of msgEl.querySelectorAll('h2, h3')) {
    if (el.textContent.trim() === text) return el;
  }
  return null;
}

const ConversationNavigation = ({ messages = [], onClose }) => {
  const [activeId, setActiveId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const headings = useMemo(() => extractHeadings(messages), [messages]);

  // Filter headings based on search query
  const filteredHeadings = useMemo(() => {
    if (!searchQuery.trim()) return headings;
    const query = searchQuery.toLowerCase();
    return headings.filter(h => h.text.toLowerCase().includes(query));
  }, [headings, searchQuery]);

  const handleClick = useCallback((heading) => {
    const el = findHeadingEl(heading.messageIndex, heading.text);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Fallback: scroll to message
      document.getElementById(`message-${heading.messageIndex}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveId(heading.id);
  }, []);

  // Track active heading with IntersectionObserver
  useEffect(() => {
    if (headings.length === 0) return;

    // Wait a tick so the DOM is ready after message content renders
    const timer = setTimeout(() => {
      const elements = headings
        .map(h => ({ h, el: findHeadingEl(h.messageIndex, h.text) }))
        .filter(({ el }) => el !== null);

      if (elements.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          // Pick the topmost visible heading
          const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            const el = visible[0].target;
            const found = elements.find(({ el: e }) => e === el);
            if (found) setActiveId(found.h.id);
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -70% 0px' }
      );

      elements.forEach(({ el }) => observer.observe(el));
      return () => observer.disconnect();
    }, 300);

    return () => clearTimeout(timer);
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          On this page
        </h2>
        <button
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300 transition-colors"
          title="Close navigation"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search input — only shown when 10+ headings */}
      {headings.length >= 10 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search headings..."
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded text-gray-700 dark:text-gray-300 midnight:text-slate-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
      )}

      {/* Scrollable nav list */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {filteredHeadings.length === 0 && searchQuery.trim() && (
          <div className="px-2 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
            No matching headings
          </div>
        )}
        {filteredHeadings.map(heading => (
          <button
            key={heading.id}
            onClick={() => handleClick(heading)}
            title={heading.text}
            className={`w-full text-left px-2 py-1.5 rounded text-xs leading-snug transition-colors truncate ${
              heading.level === 3 ? 'pl-4' : ''
            } ${
              activeId === heading.id
                ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30 text-blue-700 dark:text-blue-400 midnight:text-blue-400 font-medium'
                : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 midnight:hover:bg-slate-700/50'
            }`}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default ConversationNavigation;
