import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Folder, FolderOpen,
  RefreshCw, HardDrive, AlertCircle, Loader2,
} from 'lucide-react';
import { filesApi } from '../CommandCenter/commandCenterApi';
import { fileIconMeta } from '../files/fileUtils';

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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
        <HardDrive className="w-3 h-3 flex-shrink-0 text-gray-400" />
        {roots.length > 1 && (
          <select
            value={rootId}
            onChange={(e) => setRootId(e.target.value)}
            className="max-w-20 text-[10px] bg-transparent text-gray-500 dark:text-gray-400 outline-none"
            title="File root"
          >
            {roots.map(root => <option key={root.id} value={root.id}>{root.label}</option>)}
          </select>
        )}
        <RootInput value={rootDir} onSubmit={loadRoot} />
        <button
          onClick={() => loadRoot(rootDir)}
          title="Refresh tree"
          className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

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
