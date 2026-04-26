import {
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
    color: 'text-indigo-500 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
  },
  conversation: {
    icon: MessageSquare,
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
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
        className={`group flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg cursor-pointer transition-all duration-75 ${
          isSelected
            ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 midnight:hover:bg-gray-800/60'
        }`}
        onClick={() => onSelect(item)}
      >
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${cfg.bg}`}
        >
          {item._type === 'project' && item.emoji ? (
            <span className="text-sm leading-none">{item.emoji}</span>
          ) : (
            <Icon className={`w-3 h-3 ${cfg.color}`} />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 dark:text-gray-100 midnight:text-gray-100 truncate font-medium">
            {label}
          </div>
          {item.description && (
            <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 leading-snug">
              {item.description}
            </div>
          )}
        </div>

        <ArrowRight
          className={`w-3.5 h-3.5 flex-shrink-0 transition-all ${
            isSelected ? 'opacity-40 translate-x-0' : 'opacity-0 -translate-x-1 group-hover:opacity-30 group-hover:translate-x-0'
          } text-gray-400`}
        />
      </div>
    );
  })
);

SearchResultItem.displayName = 'SearchResultItem';

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ label, count }) => (
  <div className="flex items-center justify-between px-5 pt-3 pb-1">
    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 midnight:text-gray-500 uppercase tracking-widest">
      {label}
    </span>
    <span className="text-[10px] text-gray-300 dark:text-gray-700">{count}</span>
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

    const PROJECT_TABS = [
      { id: 'notes',    label: 'Notes' },
      { id: 'habits',   label: 'Habits' },
      { id: 'kanban',   label: 'Board' },
      { id: 'list',     label: 'List' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'storage',  label: 'Files' },
    ];

    const expandedProjects = [];
    projects.forEach((p) => {
      expandedProjects.push({ ...p, _type: 'project', _tab: null });
      if (term) {
        PROJECT_TABS.forEach(tab => {
          expandedProjects.push({
            ...p,
            _type: 'project',
            _tab: tab.id,
            name: `${p.name} — ${tab.label}`,
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
        return termTerms.every(t => name.includes(t) || desc.includes(t));
      })
      .slice(0, 20);
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
          // non-fatal
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

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // ── Select handler ────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (item) => {
      if (item._type === 'project') {
        navigate(item._tab ? `/projects/${item.id}/${item._tab}` : `/projects/${item.id}`);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-[2px]">
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl overflow-hidden border border-gray-200/80 dark:border-gray-700/60 midnight:border-gray-800"
      >
        {/* ── Search input ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects and conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 text-sm"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="w-5 h-5 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 flex-shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="h-px bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 mx-0" />

        {/* ── Results list ───────────────────────────────────────────────── */}
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : isEmpty ? (
            <div className="py-10 text-center">
              <Search className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {searchTerm ? (
                  <>No results for <span className="text-gray-600 dark:text-gray-300">"{searchTerm}"</span></>
                ) : (
                  'Start typing to search…'
                )}
              </p>
            </div>
          ) : (
            <div className="pb-1">
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

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {!isEmpty && !loading && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            <div className="flex items-center gap-2.5 text-[10px] text-gray-400 dark:text-gray-600">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60">↵</kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60">Esc</kbd>
                close
              </span>
            </div>
            <span className="text-[10px] text-gray-300 dark:text-gray-700">
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UniversalSearch);
