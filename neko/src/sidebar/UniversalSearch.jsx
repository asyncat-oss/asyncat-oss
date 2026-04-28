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
import { Search, X, FolderOpen, MessageSquare } from 'lucide-react';
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
        className={`flex items-center gap-3 px-3 py-[7px] mx-1.5 rounded-lg cursor-default transition-colors duration-75 ${
          isSelected
            ? 'bg-indigo-500 dark:bg-indigo-600 midnight:bg-indigo-600'
            : 'hover:bg-gray-100 dark:hover:bg-white/[0.05] midnight:hover:bg-white/[0.05]'
        }`}
        onClick={() => onSelect(item)}
      >
        <span className={`flex-shrink-0 w-[26px] h-[26px] rounded-[7px] flex items-center justify-center ${
          isSelected ? 'bg-white/20' : cfg.bg
        }`}>
          {item._type === 'project' && item.emoji ? (
            <span className="text-sm leading-none">{item.emoji}</span>
          ) : (
            <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : cfg.color}`} />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-medium truncate leading-tight ${
            isSelected ? 'text-white' : 'text-gray-800 dark:text-gray-100 midnight:text-gray-100'
          }`}>
            {label}
          </div>
          {item.description && (
            <div className={`text-[11px] truncate leading-snug mt-px ${
              isSelected ? 'text-white/70' : 'text-gray-400 dark:text-gray-500 midnight:text-gray-500'
            }`}>
              {item.description}
            </div>
          )}
        </div>
      </div>
    );
  })
);

SearchResultItem.displayName = 'SearchResultItem';

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ label }) => (
  <div className="px-4 py-1.5">
    <span className="text-[10px] font-semibold tracking-[0.1em] text-gray-400 dark:text-gray-600 midnight:text-gray-600 uppercase">
      {label}
    </span>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] px-4 bg-black/25 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-[620px] rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.07] midnight:border-white/[0.04] bg-white/[0.9] dark:bg-gray-900/[0.97] midnight:bg-gray-950/[0.97] backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] midnight:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
      >
        {/* ── Search input ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 h-[52px]">
          {loading
            ? <div className="w-4 h-4 border-[1.5px] border-gray-300 dark:border-gray-600 midnight:border-gray-600 border-t-gray-600 dark:border-t-gray-300 midnight:border-t-gray-300 rounded-full animate-spin flex-shrink-0" />
            : <Search className="w-[17px] h-[17px] text-gray-400 dark:text-gray-500 midnight:text-gray-500 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 midnight:placeholder-gray-600"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200/80 dark:bg-gray-700/80 midnight:bg-gray-700/80 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-600/80 flex-shrink-0 transition-colors"
            >
              <X className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400 midnight:text-gray-400" />
            </button>
          )}
        </div>

        {/* ── Results area ───────────────────────────────────────────────── */}
        {(!isEmpty || (isEmpty && searchTerm && !loading)) && (
          <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            {isEmpty && searchTerm ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-500">
                  No results for{' '}
                  <span className="text-gray-600 dark:text-gray-300 midnight:text-gray-300">
                    "{searchTerm}"
                  </span>
                </p>
              </div>
            ) : (
              <div className="py-2 max-h-[420px] overflow-y-auto">
                {projectResults.length > 0 && (
                  <div className="mb-1">
                    <SectionHeader label="Projects" />
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
                  <div className={projectResults.length > 0 ? 'mt-2' : ''}>
                    <SectionHeader label="Conversations" />
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
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {!isEmpty && !loading && (
          <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-600 midnight:text-gray-600">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-px rounded text-[9px] bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 border border-gray-200 dark:border-gray-700/60 midnight:border-gray-700/60">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-px rounded text-[9px] bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 border border-gray-200 dark:border-gray-700/60 midnight:border-gray-700/60">↵</kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-px rounded text-[9px] bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 border border-gray-200 dark:border-gray-700/60 midnight:border-gray-700/60">Esc</kbd>
                dismiss
              </span>
            </div>
            <span className="text-[10px] text-gray-300 dark:text-gray-700 midnight:text-gray-700">
              {filteredResults.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UniversalSearch);
