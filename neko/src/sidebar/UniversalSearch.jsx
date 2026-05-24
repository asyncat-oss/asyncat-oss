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
import { Search, X, FolderOpen, MessageSquare, FileText, SquareCheck } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { chatApi } from '../CommandCenter/api';
import { searchApi } from '../CommandCenter/api/searchApi.js';

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  project: {
    icon: FolderOpen,
    color: 'text-gray-400 dark:text-gray-500',
    bg: 'bg-gray-100 dark:bg-white/[0.05]',
    label: 'Projects',
  },
  conversation: {
    icon: MessageSquare,
    color: 'text-gray-400 dark:text-gray-500',
    bg: 'bg-gray-100 dark:bg-white/[0.05]',
    label: 'Conversations',
  },
  note: {
    icon: FileText,
    color: 'text-gray-400 dark:text-gray-500',
    bg: 'bg-gray-100 dark:bg-white/[0.05]',
    label: 'Notes',
  },
  card: {
    icon: SquareCheck,
    color: 'text-gray-400 dark:text-gray-500',
    bg: 'bg-gray-100 dark:bg-white/[0.05]',
    label: 'Tasks',
  },
};

const SECTION_ORDER = ['project', 'note', 'conversation', 'card'];

// ─── Result Item ──────────────────────────────────────────────────────────────

const SearchResultItem = memo(
  forwardRef(({ item, isSelected, onSelect }, ref) => {
    const cfg = TYPE_CONFIG[item._type] || TYPE_CONFIG.project;
    const Icon = cfg.icon;
    const label = item.title || item.name || 'Untitled';

    return (
      <div
        ref={ref}
        className={`flex items-center gap-3 px-3 py-[7px] mx-1.5 rounded-lg cursor-default transition-colors duration-75 ${
          isSelected
            ? 'bg-gray-200/80 dark:bg-white/[0.07] midnight:bg-white/[0.07]'
            : 'hover:bg-gray-100 dark:hover:bg-white/[0.05] midnight:hover:bg-white/[0.05]'
        }`}
        onClick={() => onSelect(item)}
      >
        <span className={`flex-shrink-0 w-[26px] h-[26px] rounded-[7px] flex items-center justify-center ${
          isSelected ? 'bg-white/[0.12] dark:bg-white/[0.10]' : cfg.bg
        }`}>
          {item._type === 'project' && item.emoji ? (
            <span className="text-sm leading-none">{item.emoji}</span>
          ) : (
            <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-gray-600 dark:text-white/90' : cfg.color}`} />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-medium truncate leading-tight ${
            isSelected
              ? 'text-gray-700 dark:text-gray-200 midnight:text-gray-200'
              : 'text-gray-800 dark:text-gray-100 midnight:text-gray-100'
          }`}>
            {label}
          </div>

          {/* Snippet or description */}
          {(item.snippet || item.description) && (
            <div className={`text-[11px] truncate leading-snug mt-px ${
              isSelected
                ? 'text-gray-400 dark:text-gray-400 midnight:text-gray-400'
                : 'text-gray-400 dark:text-gray-500 midnight:text-gray-500'
            }`}>
              {item.snippet || item.description}
            </div>
          )}
        </div>

        {/* Priority badge for cards */}
        {item._type === 'card' && item.priority && (
          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            item.priority.toLowerCase() === 'high'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
              : item.priority.toLowerCase() === 'medium'
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
          }`}>
            {item.priority}
          </span>
        )}
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
  const [localProjects, setLocalProjects] = useState([]);
  const [localConversations, setLocalConversations] = useState([]);
  const [serverResults, setServerResults] = useState(null); // null = not searched yet
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const itemRefs = useRef([]);
  const debounceRef = useRef(null);

  const { currentWorkspace, getWorkspaceProjects, hasWorkspaceAccess } = useWorkspace();

  // ── Flat results list (drives keyboard nav + rendering) ───────────────────

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    // With active server search — show server results only
    if (serverResults !== null && term.length >= 2) {
      return serverResults;
    }

    // Local filter (instant, no debounce)
    const PROJECT_TABS = [
      { id: 'kanban', label: 'Board' },
      { id: 'list',   label: 'List' },
    ];

    const expandedProjects = [];
    localProjects.forEach((p) => {
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

    const all = [
      ...expandedProjects,
      ...localConversations.map((c) => ({ ...c, _type: 'conversation' })),
    ];

    if (!term) return all.slice(0, 12);

    const terms = term.split(' ').filter(Boolean);
    return all
      .filter((item) => {
        const name = (item.name || item.title || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        return terms.every(t => name.includes(t) || desc.includes(t));
      })
      .slice(0, 20);
  }, [localProjects, localConversations, searchTerm, serverResults]);

  // Group by type for rendering
  const groupedResults = useMemo(() => {
    const groups = {};
    filteredResults.forEach(item => {
      const t = item._type || 'project';
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    });
    return groups;
  }, [filteredResults]);

  // ── Server search (debounced 220ms) ──────────────────────────────────────

  const doServerSearch = useCallback(async (term) => {
    if (!term || term.trim().length < 2) {
      setServerResults(null);
      return;
    }
    setSearching(true);
    try {
      const data = await searchApi.search(term, { limit: 6 });
      setServerResults(data?.results || []);
    } catch {
      setServerResults(null); // fall back to local
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!searchTerm || searchTerm.trim().length < 2) {
      setServerResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => doServerSearch(searchTerm), 220);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm, doServerSearch]);

  // ── Initial data load ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    try {
      const projectsData = await getWorkspaceProjects();
      if (projectsData) setLocalProjects(projectsData);

      if (hasWorkspaceAccess()) {
        try {
          const data = await chatApi.getConversationHistory({ limit: 30 });
          const chats =
            data?.chats ?? data?.conversations ?? (Array.isArray(data) ? data : []);
          setLocalConversations(chats);
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [currentWorkspace?.id, getWorkspaceProjects, hasWorkspaceAccess]);

  // ── Open / reset ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSearchTerm('');
      setServerResults(null);
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

  useEffect(() => { setSelectedIndex(0); }, [searchTerm]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // ── Select handler ────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (item) => {
      if (item._type === 'project') {
        navigate(item._tab ? `/projects/${item.id}/${item._tab}` : `/projects/${item.id}`);
      } else if (item._type === 'conversation') {
        navigate(`/conversations/${item.id}`);
      } else if (item._type === 'note') {
        navigate(item.projectId ? `/projects/${item.projectId}/notes/${item.id}` : `/notes/${item.id}`);
      } else if (item._type === 'card') {
        navigate(item.projectId ? `/projects/${item.projectId}` : '/');
      }
      onClose();
    },
    [navigate, onClose]
  );

  if (!isOpen) return null;

  const isSpinning = loading || searching;
  const isEmpty = filteredResults.length === 0;
  const showServerBadge = serverResults !== null && searchTerm.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] px-4 bg-black/25 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-[620px] rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.07] midnight:border-white/[0.04] bg-white/[0.9] dark:bg-gray-900/[0.97] midnight:bg-gray-950/[0.97] backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] midnight:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
      >
        {/* ── Search input ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 h-[52px]">
          {isSpinning
            ? <div className="w-4 h-4 border-[1.5px] border-gray-300 dark:border-gray-600 midnight:border-gray-600 border-t-gray-600 dark:border-t-gray-300 midnight:border-t-gray-300 rounded-full animate-spin flex-shrink-0" />
            : <Search className="w-[17px] h-[17px] text-gray-400 dark:text-gray-500 midnight:text-gray-500 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects, notes, tasks, conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 midnight:placeholder-gray-600"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); setServerResults(null); }}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200/80 dark:bg-gray-700/80 midnight:bg-gray-700/80 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-600/80 flex-shrink-0 transition-colors"
            >
              <X className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400 midnight:text-gray-400" />
            </button>
          )}
        </div>

        {/* ── Results area ────────────────────────────────────────────────── */}
        {(!isEmpty || (isEmpty && searchTerm && !isSpinning)) && (
          <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            {isEmpty && searchTerm && !searching ? (
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
                {SECTION_ORDER.map((type) => {
                  const items = groupedResults[type];
                  if (!items?.length) return null;
                  const cfg = TYPE_CONFIG[type];
                  return (
                    <div key={type} className="mb-1">
                      <SectionHeader label={cfg.label} />
                      {items.map((item) => {
                        const gi = filteredResults.indexOf(item);
                        return (
                          <SearchResultItem
                            key={`${type}-${item.id}-${item._tab || ''}`}
                            ref={(el) => (itemRefs.current[gi] = el)}
                            item={item}
                            isSelected={selectedIndex === gi}
                            onSelect={handleSelect}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {!isEmpty && !isSpinning && (
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
            <div className="flex items-center gap-2">
              {showServerBadge && (
                <span className="text-[10px] text-gray-300 dark:text-gray-700 midnight:text-gray-700">
                  full search
                </span>
              )}
              <span className="text-[10px] text-gray-300 dark:text-gray-700 midnight:text-gray-700">
                {filteredResults.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(UniversalSearch);
