import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Folder, FolderOpen,
  RefreshCw, HardDrive, AlertCircle, Loader2, Clock, Star, Network,
} from 'lucide-react';
import { filesApi } from '../CommandCenter/commandCenterApi';
import { fileIconMeta, rootIcon } from '../files/fileUtils';

// ── Single tree node ──────────────────────────────────────────────────────────

const FileNode = memo(({ node, depth, expanded, onToggleDir, lazyChildren, onFileClick }) => {
  const indentPx = 8 + depth * 14;

  if (node.type === 'dir') {
    const isOpen = !!expanded[node.path];
    const kids   = lazyChildren[node.path] ?? node.children ?? null;

    return (
      <div>
        <button
          style={{ paddingLeft: `${indentPx}px` }}
          onClick={() => onToggleDir(node)}
          className="w-full flex items-center gap-1.5 pr-3 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronRight
            className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
          />
          {isOpen
            ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            : <Folder     className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          }
          <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-300">{node.name}</span>
        </button>

        {isOpen && (
          <div>
            {kids === null ? (
              <div style={{ paddingLeft: `${indentPx + 26}px` }} className="py-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
              </div>
            ) : kids.length === 0 ? (
              <div style={{ paddingLeft: `${indentPx + 26}px` }} className="py-1 text-[10px] text-gray-400">
                Empty
              </div>
            ) : (
              kids.map(child => (
                <FileNode
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggleDir={onToggleDir}
                  lazyChildren={lazyChildren}
                  onFileClick={onFileClick}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // File node — click navigates to /files?path=
  const { Icon, color } = fileIconMeta(node.ext || '');
  return (
    <button
      style={{ paddingLeft: `${indentPx + 16}px` }}
      onClick={() => onFileClick(node.path)}
      className="w-full flex items-center gap-1.5 pr-3 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
    >
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
      <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
        {node.name}
      </span>
    </button>
  );
});

FileNode.displayName = 'FileNode';

// ── Root path input ────────────────────────────────────────────────────────────

function RootInput({ value, onSubmit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    const v = draft.trim();
    if (v) onSubmit(v);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={value}
        className="flex-1 min-w-0 text-left text-[10px] font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 truncate"
      >
        {value === '.' ? '~' : value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      }}
      className="flex-1 min-w-0 text-[10px] font-mono bg-transparent border-0 border-b border-gray-400 dark:border-gray-500 outline-none text-gray-800 dark:text-gray-200 py-0"
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LocalFileTree() {
  const navigate = useNavigate();

  const [rootId, setRootId]             = useState('workspace');
  const [roots, setRoots]               = useState([]);
  const [rootDir, setRootDir]           = useState('.');
  const [tree, setTree]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [expanded, setExpanded]         = useState({});
  const [lazyChildren, setLazyChildren] = useState({});

  const navigateRoot = useCallback((nextRootId) => {
    setRootId(nextRootId);
    setRootDir('.');
    navigate(`/files?rootId=${encodeURIComponent(nextRootId)}&path=.`);
  }, [navigate]);

  const loadRoot = useCallback(async (dir) => {
    setLoading(true);
    setError(null);
    setExpanded({});
    setLazyChildren({});
    try {
      const res = await filesApi.listDirectory(rootId, dir);
      if (res.success) {
        setTree(res.entries);
        setRootDir(dir);
      } else {
        setError(res.error || 'Could not load directory');
      }
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [rootId]);

  useEffect(() => {
    filesApi.getRoots()
      .then(res => { if (res.success) setRoots(res.roots || []); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadRoot('.'); }, [loadRoot]);

  useEffect(() => {
    const handler = (e) => {
      const dir = e?.detail?.workingDir;
      if (dir && dir !== rootDir) loadRoot(dir);
    };
    window.addEventListener('agent-run-complete', handler);
    return () => window.removeEventListener('agent-run-complete', handler);
  }, [rootDir, loadRoot]);

  const handleToggleDir = useCallback(async (node) => {
    const nowOpen = !expanded[node.path];
    setExpanded(prev => ({ ...prev, [node.path]: nowOpen }));

    if (nowOpen && node.children == null && lazyChildren[node.path] === undefined) {
      setLazyChildren(prev => ({ ...prev, [node.path]: null }));
      try {
        const res = await filesApi.listDirectory(rootId, node.path);
        setLazyChildren(prev => ({ ...prev, [node.path]: res.success ? res.entries : [] }));
      } catch {
        setLazyChildren(prev => ({ ...prev, [node.path]: [] }));
      }
    }
  }, [expanded, lazyChildren, rootId]);

  const handleFileClick = useCallback((filePath) => {
    navigate(`/files?rootId=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`);
  }, [navigate, rootId]);

  const activeRoot = roots.find(root => root.id === rootId);
  const primaryRoots = roots.filter(root => ['home', 'workspace', 'dev'].includes(root.id));
  const placeRoots = roots.filter(root => !['home', 'workspace', 'dev', 'trash'].includes(root.id));
  const trashRoot = roots.find(root => root.id === 'trash');

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
        <HardDrive className="w-3 h-3 flex-shrink-0 text-gray-400" />
        <span className="max-w-24 truncate text-[10px] text-gray-500 dark:text-gray-400" title={activeRoot?.path}>
          {activeRoot?.label || 'Files'}
        </span>
        <RootInput value={rootDir} onSubmit={loadRoot} />
        <button
          onClick={() => loadRoot(rootDir)}
          title="Refresh tree"
          className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="py-1 border-b border-gray-100 dark:border-gray-800">
        {primaryRoots.map(root => {
          const Icon = rootIcon(root.kind);
          const active = root.id === rootId && rootDir === '.';
          return (
            <button
              key={root.id}
              onClick={() => navigateRoot(root.id)}
              title={root.path}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                active
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{root.label}</span>
            </button>
          );
        })}
        <button
          disabled
          title="Recent files needs a local activity index"
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 dark:text-gray-600 cursor-not-allowed"
        >
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Recent</span>
        </button>
        <button
          disabled
          title="Starred files needs saved favorites"
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 dark:text-gray-600 cursor-not-allowed"
        >
          <Star className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Starred</span>
        </button>
        <button
          disabled
          title="Network locations need mounted share discovery"
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 dark:text-gray-600 cursor-not-allowed"
        >
          <Network className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Network</span>
        </button>
        {trashRoot && (
          <button
            onClick={() => navigateRoot(trashRoot.id)}
            title={trashRoot.path}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              trashRoot.id === rootId && rootDir === '.'
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {(() => {
              const Icon = rootIcon(trashRoot.kind);
              return <Icon className="w-3.5 h-3.5 flex-shrink-0" />;
            })()}
            <span className="truncate">{trashRoot.label}</span>
          </button>
        )}
      </div>

      {placeRoots.length > 0 && (
        <div className="py-1 border-b border-gray-100 dark:border-gray-800">
          {placeRoots.map(root => {
            const Icon = rootIcon(root.kind);
            const active = root.id === rootId && rootDir === '.';
            return (
              <button
                key={root.id}
                onClick={() => navigateRoot(root.id)}
                title={root.path}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  active
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{root.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      )}

      {!loading && error && (
        <div className="px-3 py-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-red-500 dark:text-red-400 mb-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadRoot(rootDir)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && tree.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-gray-400">Empty directory</div>
      )}

      {!loading && !error && tree.length > 0 && (
        <div className="py-1">
          {tree.map(node => (
            <FileNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggleDir={handleToggleDir}
              lazyChildren={lazyChildren}
              onFileClick={handleFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
