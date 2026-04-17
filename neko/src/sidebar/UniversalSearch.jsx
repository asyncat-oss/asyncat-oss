import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useMemo,
  forwardRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FolderOpen, MessageSquare, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { chatApi } from '../CommandCenter/commandCenterApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  project: {
    icon: FolderOpen,
    label: 'Projects',
    color: 'text-indigo-500 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/30',
  },
  conversation: {
    icon: MessageSquare,
    label: 'Conversations',
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
  },
};

// ─── Result Item ──────────────────────────────────────────────────────────────

const SearchResultItem = memo(
  forwardRef(({ item, isSelected, onSelect }, ref) => {
    const cfg = TYPE_CONFIG[item._type] || TYPE_CONFIG.project;
    const Icon = cfg.icon;
    const label = item.name || item.title || 'Untitled';

    return (
      <div
        ref={ref}
        className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50'
        }`}
        onClick={() => onSelect(item)}
      >
        {/* Type icon */}
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg}`}
        >
          {item._type === 'project' && item.emoji ? (
            <span className="text-base leading-none">{item.emoji}</span>
          ) : (
            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
          )}
        </span>

        {/* Label + optional description */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
            {label}
          </div>
          {item.description && (
            <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
              {item.description}
            </div>
          )}
        </div>

        {/* Arrow hint */}
        <ArrowRight
          className={`w-4 h-4 flex-shrink-0 transition-opacity ${
            isSelected ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'
          } text-gray-400`}
        />
      </div>
    );
  })
);

SearchResultItem.displayName = 'SearchResultItem';

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ label, count }) => (
  <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 midnight:text-gray-500 uppercase tracking-widest">
      {label}
    </span>
    <span className="text-[10px] text-gray-300 dark:text-gray-600">{count}</span>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const UniversalSearch = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const itemRefs = useRef([]);

  const { currentWorkspace, getWorkspaceProjects, hasWorkspaceAccess } = useWorkspace();

  // ── Filtered results ─────────────────────────────────────────────────────

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    
    // Expand projects into specific sub-modules/tabs for quick navigation
    const PROJECT_TABS = [
      { id: 'notes', label: 'Notes' },
      { id: 'habits', label: 'Habits' },
      { id: 'kanban', label: 'Board' },
      { id: 'list', label: 'List' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'storage', label: 'Files' },
    ];

    const expandedProjects = [];
    projects.forEach((p) => {
      // Main project overview
      expandedProjects.push({ ...p, _type: 'project', _tab: null });
      
      // Only inject sub-tabs if there's an actual search term to avoid cluttering defaults
      if (term) {
        PROJECT_TABS.forEach(tab => {
          expandedProjects.push({
            ...p,
            _type: 'project',
            _tab: tab.id,
            name: `${p.name} - ${tab.label}`,
            description: `Go to ${tab.label} in ${p.name}`,
          });
        });
      }
    });

    const allItems = [
      ...expandedProjects,
      ...conversations.map((c) => ({ ...c, _type: 'conversation' })),
    ];

    if (!term) return allItems.slice(0, 12);

    const termTerms = term.split(' ').filter(Boolean);

    return allItems
      .filter((item) => {
        const name = (item.name || item.title || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        // Match if ALL words in the search term are found (fuzzy search)
        return termTerms.every(t => name.includes(t) || desc.includes(t));
      })
      .slice(0, 20); // allow slightly more results since we expand tabs
  }, [projects, conversations, searchTerm]);

  const projectResults = useMemo(
    () => filteredResults.filter((r) => r._type === 'project'),
    [filteredResults]
  );
  const conversationResults = useMemo(
    () => filteredResults.filter((r) => r._type === 'conversation'),
    [filteredResults]
  );

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    try {
      const projectsData = await getWorkspaceProjects();
      if (projectsData) setProjects(projectsData);

      if (hasWorkspaceAccess()) {
        try {
          const data = await chatApi.getConversationHistory({ limit: 30 });
          const chats =
            data?.chats ?? data?.conversations ?? (Array.isArray(data) ? data : []);
          setConversations(chats);
        } catch {
          // non-fatal – conversations just won't show
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id, getWorkspaceProjects, hasWorkspaceAccess]);

  // ── Open/reset ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, loadData]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((p) => Math.min(p + 1, filteredResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((p) => Math.max(p - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredResults[selectedIndex]) handleSelect(filteredResults[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // handleSelect is stable via useCallback; including it would cause re-register on every result change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filteredResults, selectedIndex, onClose]);

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // ── Reset index when results change ──────────────────────────────────────

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // ── Auto-scroll selected item into view ──────────────────────────────────

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // ── Select handler ────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (item) => {
      if (item._type === 'project') {
        if (item._tab) {
          navigate(`/projects/${item.id}/${item._tab}`);
        } else {
          navigate(`/projects/${item.id}`);
        }
      } else {
        navigate(`/conversations/${item.id}`);
      }
      onClose();
    },
    [navigate, onClose]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const isEmpty = filteredResults.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.35)' }}
      >
        {/* ── Search input ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects and conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 text-base font-medium"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 midnight:via-gray-800 to-transparent mx-4" />

        {/* ── Results list ───────────────────────────────────────────────── */}
        <div className="max-h-[52vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : isEmpty ? (
            <div className="py-12 text-center">
              <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {searchTerm ? (
                  <>
                    No results for{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      "{searchTerm}"
                    </span>
                  </>
                ) : (
                  'Start typing to search…'
                )}
              </p>
            </div>
          ) : (
            <div className="pb-2">
              {/* Projects section */}
              {projectResults.length > 0 && (
                <div>
                  <SectionHeader label="Projects" count={projectResults.length} />
                  {projectResults.map((item) => {
                    const gi = filteredResults.indexOf(item);
                    return (
                      <SearchResultItem
                        key={`project-${item.id}-${item._tab || 'main'}`}
                        ref={(el) => (itemRefs.current[gi] = el)}
                        item={item}
                        isSelected={selectedIndex === gi}
                        onSelect={handleSelect}
                      />
                    );
                  })}
                </div>
              )}

              {/* Conversations section */}
              {conversationResults.length > 0 && (
                <div className={projectResults.length > 0 ? 'mt-1' : ''}>
                  <SectionHeader label="Conversations" count={conversationResults.length} />
                  {conversationResults.map((item) => {
                    const gi = filteredResults.indexOf(item);
                    return (
                      <SearchResultItem
                        key={`conversation-${item.id}`}
                        ref={(el) => (itemRefs.current[gi] = el)}
                        item={item}
                        isSelected={selectedIndex === gi}
                        onSelect={handleSelect}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer: keyboard hints + result count ──────────────────────── */}
        {!isEmpty && !loading && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px]">
                  ↵
                </kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px]">
                  Esc
                </kbd>
                close
              </span>
            </div>
            <span className="text-[11px] text-gray-300 dark:text-gray-600">
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UniversalSearch);
