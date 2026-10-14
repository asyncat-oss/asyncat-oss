// The search palette (Ctrl+K): jump to a page, or find a project, a note, a
// memory or a chat. Chats are found by title and by what was said in them;
// a message hit opens the chat at that message.
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useMemo,
  forwardRef,
} from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  FolderOpen,
  MessageSquare,
  FileText,
  SquareCheck,
  Brain,
  Cpu,
  Wrench,
  Settings,
  BrainCircuit,
  CalendarPlus,
  GraduationCap,
  Folder,
  Loader2,
  Pin,
  Cat as CatIcon,
} from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { chatApi, agentApi } from '../CommandCenter/api';
import { searchApi } from '../CommandCenter/api/searchApi.js';
import SearchSnippet from '../components/SearchSnippet.jsx';
import { chatLink, isPinned, markTitle } from './chatSearch.js';
import { latestSearch } from '../utils/latestSearch.js';

// ─── Kinds of result ──────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  command: { icon: MessageSquare, label: 'Jump to' },
  project: { icon: FolderOpen, label: 'Projects' },
  note: { icon: FileText, label: 'Notes' },
  conversation: { icon: MessageSquare, label: 'Chats' },
  memory: { icon: Brain, label: 'Memory' },
};

const SECTION_ORDER = ['command', 'project', 'note', 'conversation', 'memory'];

// Navigation commands surfaced in the palette (always available, filtered by query).
const COMMANDS = [
  { id: 'cmd-home',      label: 'Go to Chat',           to: '/home',         icon: MessageSquare },
  { id: 'cmd-cats', label: 'Go to Cats',               to: '/cats',         icon: CatIcon },
  { id: 'cmd-cats-new', label: 'New Cat',               to: '/cats?new=1',   icon: CalendarPlus },
  { id: 'cmd-agents',    label: 'Go to Agents',         to: '/agents', icon: BrainCircuit },
  { id: 'cmd-models',    label: 'Go to Models',         to: '/models',       icon: Cpu },
  { id: 'cmd-training',  label: 'Go to Training',       to: '/models?tab=training', icon: GraduationCap },
  { id: 'cmd-tools',     label: 'Go to Tools & Skills', to: '/tools',        icon: Wrench },
  { id: 'cmd-files',     label: 'Go to Files',          to: '/files',        icon: Folder },
  { id: 'cmd-projects',  label: 'Go to Projects',       to: '/projects',     icon: SquareCheck },
  { id: 'cmd-settings',  label: 'Go to Settings',       to: '/settings',     icon: Settings },
];

const LISTBOX_ID = 'universal-search-results';
const optionId = (index) => `universal-search-option-${index}`;

// ─── Result row ───────────────────────────────────────────────────────────────

const SearchResultItem = memo(
  forwardRef(({ item, index, isSelected, onSelect, onHover, searched = '' }, ref) => {
    const cfg = TYPE_CONFIG[item._type] || TYPE_CONFIG.project;
    const Icon = item.icon || cfg.icon;
    const label = item.title || item.name || item.label || 'Untitled';
    const detail = item.snippet || item.description || '';
    const pinned = item._type === 'conversation' && (item.pinned || isPinned(item));
    // A chat found by its name shows the words that matched in it.
    const markedLabel = item._type === 'conversation' && item.titleMatch && searched
      ? markTitle(label, searched)
      : null;

    return (
      <div
        ref={ref}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        className={`mx-1.5 flex cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-75 ${
          isSelected ? 'bg-selected' : 'hover:bg-hover'
        }`}
        onClick={() => onSelect(item)}
        onMouseMove={() => { if (!isSelected) onHover(index); }}
      >
        <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center text-fg-subtle">
          {item._type === 'project' && item.emoji ? (
            <span className="text-sm leading-none">{item.emoji}</span>
          ) : (
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {markedLabel
              ? <SearchSnippet snippet={markedLabel} className="truncate text-[13px] leading-[18px] text-fg" />
              : <span className="truncate text-[13px] leading-[18px] text-fg">{label}</span>}
            {pinned ? <Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-fg-subtle" /> : null}
          </div>
          {detail ? (
            <SearchSnippet snippet={detail} className="mt-0.5 line-clamp-2 text-xs leading-[17px] text-fg-muted" />
          ) : null}
        </div>
      </div>
    );
  })
);

SearchResultItem.displayName = 'SearchResultItem';
SearchResultItem.propTypes = {
  item: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  onHover: PropTypes.func.isRequired,
  searched: PropTypes.string,
};

const SectionHeader = ({ label }) => (
  <div className="px-4 pb-1 pt-2 text-xs font-medium text-fg-subtle">{label}</div>
);

SectionHeader.propTypes = { label: PropTypes.string.isRequired };

const Key = ({ children }) => (
  <kbd className="rounded border border-line bg-surface px-1 font-sans text-[10px] text-fg-muted">{children}</kbd>
);

Key.propTypes = { children: PropTypes.node };

// ─── Palette ──────────────────────────────────────────────────────────────────

const UniversalSearch = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [localProjects, setLocalProjects] = useState([]);
  const [localConversations, setLocalConversations] = useState([]);
  const [serverResults, setServerResults] = useState(null); // null = not searched yet
  const [memoryResults, setMemoryResults] = useState([]);
  const [searchedTerm, setSearchedTerm] = useState(''); // what the server last answered
  const [indexing, setIndexing] = useState(false); // older chats not searchable yet
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searches] = useState(latestSearch);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const query = searchTerm.trim();

  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const itemRefs = useRef([]);
  const debounceRef = useRef(null);

  const { currentWorkspace, getWorkspaceProjects, hasWorkspaceAccess } = useWorkspace();

  // ── Flat results list (drives keyboard nav + rendering) ───────────────────

  const baseResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    // With active server search — show server results only
    if (serverResults !== null && term.length >= 2) {
      return serverResults;
    }

    // Local filter (instant, no debounce)
    const all = [
      ...localProjects.map((p) => ({ ...p, _type: 'project' })),
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

  // Navigation/action commands, filtered by query (top few when empty).
  const commandResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const cmds = COMMANDS.map(c => ({ ...c, _type: 'command' }));
    if (!term) return cmds.slice(0, 5);
    return cmds.filter(c => c.label.toLowerCase().includes(term));
  }, [searchTerm]);

  // Grouped in section order; the flat list follows the same order, so the
  // arrow keys move down the screen.
  const sections = useMemo(() => {
    const groups = {};
    [...commandResults, ...baseResults, ...memoryResults].forEach((item) => {
      const type = TYPE_CONFIG[item._type] ? item._type : 'project';
      (groups[type] ||= []).push(item);
    });
    return SECTION_ORDER.filter((type) => groups[type]?.length).map((type) => ({ type, items: groups[type] }));
  }, [commandResults, baseResults, memoryResults]);

  const filteredResults = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // ── Server search (debounced 220ms) ──────────────────────────────────────

  // Each keystroke cancels the search before it, so only the answer for
  // what is in the box now is ever shown.
  const doServerSearch = useCallback(async (term) => {
    const signal = searches.start();
    setSearching(true);
    const [data, mem] = await Promise.all([
      searchApi.search(term, { limit: 6, signal }).catch(() => null),
      agentApi.semanticSearch(term, 5, { signal }).catch(() => null),
    ]);
    if (signal.aborted) return;
    // A note can only be opened from the chat it was written in. Without an
    // answer, the local list stays.
    setServerResults(data ? (data.results || []).filter(r => r._type !== 'note' || r.conversationId) : null);
    setMemoryResults((mem?.results || []).map(m => ({ _type: 'memory', id: m.key, title: m.key, snippet: m.content })));
    setSearchedTerm(term);
    setIndexing(Boolean(data?.indexing));
    setSearching(false);
  }, [searches]);

  useEffect(() => {
    if (query.length < 2) {
      setSearching(false);
      setServerResults(null);
      setMemoryResults([]);
      setSearchedTerm('');
      setIndexing(false);
      return;
    }
    debounceRef.current = setTimeout(() => doServerSearch(query), 220);
    return () => {
      clearTimeout(debounceRef.current);
      searches.cancel();
    };
  }, [query, doServerSearch, searches]);

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
      setMemoryResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, loadData]);

  // ── Select handler ────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (item) => {
      if (item._type === 'command') {
        if (item.to) navigate(item.to);
      } else if (item._type === 'memory') {
        navigate('/tools?tab=memory');
      } else if (item._type === 'project') {
        navigate(`/projects/${item.id}`);
      } else if (item._type === 'conversation') {
        // A hit inside a message opens the chat at that message.
        navigate(chatLink(item.id, item.messageId || null));
      } else if (item._type === 'note') {
        // Notes have no page of their own; they live as artifacts in the chat
        // that created them. Results without a chat are filtered out above.
        navigate(chatLink(item.conversationId));
      }
      onClose();
    },
    [navigate, onClose]
  );

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
  }, [isOpen, filteredResults, selectedIndex, onClose, handleSelect]);

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  useEffect(() => { setSelectedIndex(0); }, [searchTerm, serverResults]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  // Until the server has answered for this word, only titles were checked:
  // "Nothing found" would be premature.
  const pending = query.length >= 2 && (searching || searchedTerm !== query);
  const isSpinning = loading || pending;
  const isEmpty = filteredResults.length === 0;
  const activeId = filteredResults[selectedIndex] ? optionId(selectedIndex) : undefined;
  // Chats waiting to be indexed (after an update or a large import) can't
  // be found by what was said yet.
  const stillIndexing = indexing && !pending;
  const indexingNote = 'Still indexing older chats, so some may be missing.';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[14vh]">
      <div
        ref={modalRef}
        role="dialog"
        aria-label="Search"
        className="w-full max-w-[620px] overflow-hidden rounded-xl border border-line bg-elevated shadow-lg"
      >
        {/* ── Search input ────────────────────────────────────────────────── */}
        <div className="flex h-[52px] items-center gap-3 px-4">
          {isSpinning
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-subtle" />
            : <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
          }
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={!isEmpty}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search chats, projects and notes"
            placeholder="Search chats, projects and notes"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setSearchTerm(''); setServerResults(null); inputRef.current?.focus(); }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Results area ────────────────────────────────────────────────── */}
        {(!isEmpty || query) && (
          <div className="border-t border-line">
            {isEmpty ? (
              <p role="status" className="px-4 py-10 text-center text-sm text-fg-muted">
                {isSpinning ? 'Searching…' : (
                  <>Nothing found for &ldquo;<span className="text-fg">{query}</span>&rdquo;</>
                )}
                {stillIndexing ? <span className="mt-1 block text-xs text-fg-subtle">{indexingNote}</span> : null}
              </p>
            ) : (
              <div id={LISTBOX_ID} role="listbox" aria-label="Results" className="max-h-[min(440px,60vh)] overflow-y-auto py-1.5">
                {sections.map(({ type, items }) => (
                  <div key={type} role="group" aria-label={TYPE_CONFIG[type].label} className="mb-1">
                    <SectionHeader label={TYPE_CONFIG[type].label} />
                    {items.map((item) => {
                      const gi = filteredResults.indexOf(item);
                      return (
                        <SearchResultItem
                          key={`${type}-${item.id}`}
                          ref={(el) => (itemRefs.current[gi] = el)}
                          item={item}
                          index={gi}
                          isSelected={selectedIndex === gi}
                          onSelect={handleSelect}
                          onHover={setSelectedIndex}
                          searched={searchedTerm}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {stillIndexing && !isEmpty ? (
              <p role="status" className="border-t border-line px-4 py-2 text-xs text-fg-subtle">{indexingNote}</p>
            ) : null}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {!isEmpty && (
          <div className="hidden items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-fg-subtle sm:flex">
            <span className="flex items-center gap-1"><Key>↑</Key><Key>↓</Key> to move</span>
            <span className="flex items-center gap-1"><Key>↵</Key> to open</span>
            <span className="flex items-center gap-1"><Key>Esc</Key> to close</span>
          </div>
        )}
      </div>
    </div>
  );
};

UniversalSearch.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};

export default memo(UniversalSearch);
