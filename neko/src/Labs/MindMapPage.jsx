import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Network, Plus, Trash2, Loader2, AlertCircle, ArrowLeft, Pencil, Check, X, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { labsApi } from '../CommandCenter/commandCenterApi';

// ─── Visual Mind Map ──────────────────────────────────────────────────────────

const MindMapCanvas = ({ nodes, editMode, onEditLabel, onDeleteBranch, onAddChild, onDeleteChild }) => {
  const containerRef = useRef(null);
  const centralRef = useRef(null);
  const branchRefs = useRef({});
  const [lines, setLines] = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const branches = nodes.branches || [];

  const recalcLines = useCallback(() => {
    if (!containerRef.current || !centralRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const central = centralRef.current.getBoundingClientRect();

    const cx = central.right - container.left;
    const cy = central.top - container.top + central.height / 2;

    const newLines = [];
    branches.forEach(branch => {
      const ref = branchRefs.current[branch.id];
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const bx = rect.left - container.left;
      const by = rect.top - container.top + rect.height / 2;
      newLines.push({ id: branch.id, x1: cx, y1: cy, x2: bx, y2: by, color: branch.color || '#6366f1' });
    });

    // Only update state when values actually changed — prevents infinite loop
    setLines(prev => {
      if (
        prev.length === newLines.length &&
        prev.every((l, i) => l.x2 === newLines[i]?.x2 && l.y2 === newLines[i]?.y2 && l.x1 === newLines[i]?.x1)
      ) return prev;
      return newLines;
    });
    setContainerSize(prev => {
      if (prev.width === container.width && prev.height === container.height) return prev;
      return { width: container.width, height: container.height };
    });
  }, [branches]);

  // Run after each paint — safe because setLines/setContainerSize bail out when unchanged
  useLayoutEffect(() => {
    recalcLines();
  });

  useEffect(() => {
    const observer = new ResizeObserver(recalcLines);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [recalcLines]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: 200 }}>
      {/* SVG connector lines */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={containerSize.width}
        height={containerSize.height}
        style={{ overflow: 'visible' }}
      >
        {lines.map(line => {
          const midX = (line.x1 + line.x2) / 2;
          return (
            <path
              key={line.id}
              d={`M ${line.x1},${line.y1} C ${midX},${line.y1} ${midX},${line.y2} ${line.x2},${line.y2}`}
              stroke={line.color}
              strokeWidth="2"
              strokeOpacity="0.5"
              fill="none"
            />
          );
        })}
      </svg>

      {/* Layout: central on left, branches on right */}
      <div className="flex items-start gap-12">

        {/* Central node */}
        <div className="flex-shrink-0 self-center" style={{ minWidth: 120 }}>
          <div
            ref={centralRef}
            className="px-4 py-3 rounded-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md text-center"
          >
            <p className="text-xs font-bold leading-tight">{nodes.central || 'Topic'}</p>
          </div>
        </div>

        {/* Branches */}
        <div className="flex-1 flex flex-col gap-3">
          {branches.map((branch, bi) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              branchRef={el => { branchRefs.current[branch.id] = el; }}
              editMode={editMode}
              onEditLabel={onEditLabel}
              onDeleteBranch={onDeleteBranch}
              onAddChild={onAddChild}
              onDeleteChild={onDeleteChild}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Branch card ──────────────────────────────────────────────────────────────

const InlineEdit = ({ value, onSave, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onSave(t);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 flex-1">
        <input
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="flex-1 px-1.5 py-0.5 text-sm rounded border border-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-0"
        />
        <button onClick={commit} className="text-emerald-500 flex-shrink-0"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={cancel} className="text-gray-400 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
      </span>
    );
  }

  return (
    <span className={`${className} cursor-pointer hover:underline hover:decoration-dotted`} onClick={() => { setDraft(value); setEditing(true); }}>
      {value}
    </span>
  );
};

// Needs editMode in scope — pass via prop
const BranchCard = ({ branch, branchRef, editMode, onEditLabel, onDeleteBranch, onAddChild, onDeleteChild }) => {
  const [open, setOpen] = useState(true);
  const [addingChild, setAddingChild] = useState(false);
  const [newChild, setNewChild] = useState('');
  const color = branch.color || '#6366f1';
  const children = branch.children || [];

  const submitChild = () => {
    const t = newChild.trim();
    if (!t) return;
    onAddChild(branch.id, t);
    setNewChild('');
    setAddingChild(false);
  };

  return (
    <div
      ref={branchRef}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {/* Branch header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => !editMode && setOpen(v => !v)}
          className="flex-shrink-0 text-gray-400"
        >
          {open
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </button>

        {editMode ? (
          <InlineEdit
            value={branch.label}
            onSave={val => onEditLabel(branch.id, val)}
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1"
          />
        ) : (
          <span
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1 cursor-pointer"
            onClick={() => setOpen(v => !v)}
          >
            {branch.label}
          </span>
        )}

        {/* Color dot */}
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />

        {editMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setAddingChild(true)}
              className="p-0.5 rounded text-gray-400 hover:text-blue-500 transition-colors"
              title="Add child"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDeleteBranch(branch.id)}
              className="p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {open && (children.length > 0 || addingChild) && (
        <div className="pb-2 px-3 space-y-0.5">
          {children.map((child, ci) => {
            const childLabel = typeof child === 'string' ? child : child.label;
            const childId = typeof child === 'string' ? null : child.id;
            return (
              <div key={childId || ci} className="flex items-center gap-2 py-0.5 group">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.4 }} />
                {editMode ? (
                  <InlineEdit
                    value={childLabel}
                    onSave={val => onEditLabel(childId, val, branch.id, ci)}
                    className="text-xs text-gray-600 dark:text-gray-400 flex-1"
                  />
                ) : (
                  <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{childLabel}</span>
                )}
                {editMode && (
                  <button
                    onClick={() => onDeleteChild(childId, branch.id, ci)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add child inline */}
          {addingChild && (
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.4 }} />
              <input
                autoFocus
                value={newChild}
                onChange={e => setNewChild(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') { setAddingChild(false); setNewChild(''); } }}
                placeholder="Add child…"
                className="flex-1 px-2 py-0.5 text-xs rounded border border-blue-300 dark:border-blue-700 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button onClick={submitChild} className="text-emerald-500"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setAddingChild(false); setNewChild(''); }} className="text-gray-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Patch: make InlineEdit aware of editMode via closure
// (re-declare here so it has access)
function EditableLabelInline({ value, onSave, onlyWhenEdit, editMode, className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onSave(t);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editMode) return <span className={className}>{value}</span>;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 flex-1 min-w-0">
        <input
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-sm rounded border border-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <button onClick={commit} className="text-emerald-500 flex-shrink-0"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={cancel} className="text-gray-400 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
      </span>
    );
  }

  return (
    <span
      className={`${className} cursor-pointer hover:underline hover:decoration-dotted`}
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value}
    </span>
  );
}

// ─── Map Detail View ──────────────────────────────────────────────────────────

const MapDetail = ({ map: initialMap, onBack, onDelete }) => {
  const [nodes, setNodes] = useState(() => initialMap.nodes || {});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [newBranchLabel, setNewBranchLabel] = useState('');

  const branches = nodes.branches || [];

  const BRANCH_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4'];

  const updateBranchLabel = (branchId, newLabel) => {
    setNodes(prev => ({
      ...prev,
      branches: prev.branches.map(b => b.id === branchId ? { ...b, label: newLabel } : b),
    }));
  };

  const deleteBranch = (branchId) => {
    setNodes(prev => ({ ...prev, branches: prev.branches.filter(b => b.id !== branchId) }));
  };

  const addChild = (branchId, label) => {
    setNodes(prev => ({
      ...prev,
      branches: prev.branches.map(b =>
        b.id === branchId
          ? { ...b, children: [...(b.children || []), { id: `c-${Date.now()}`, label }] }
          : b
      ),
    }));
  };

  const deleteChild = (childId, parentBranchId, childIndex) => {
    setNodes(prev => ({
      ...prev,
      branches: prev.branches.map(b => {
        if (b.id !== parentBranchId) return b;
        return {
          ...b,
          children: b.children.filter((c, i) => childId ? (typeof c === 'string' ? i !== childIndex : c.id !== childId) : i !== childIndex),
        };
      }),
    }));
  };

  const editLabel = (id, newLabel, parentBranchId, childIndex) => {
    if (parentBranchId !== undefined) {
      // string-type child: update by index
      setNodes(prev => ({
        ...prev,
        branches: prev.branches.map(b => {
          if (b.id !== parentBranchId) return b;
          return { ...b, children: b.children.map((c, i) => (typeof c === 'string' && i === childIndex) ? newLabel : (c.id === id ? { ...c, label: newLabel } : c)) };
        }),
      }));
    } else {
      updateBranchLabel(id, newLabel);
    }
  };

  const addBranch = () => {
    const label = newBranchLabel.trim();
    if (!label) return;
    const colorIndex = branches.length % BRANCH_COLORS.length;
    setNodes(prev => ({
      ...prev,
      branches: [...(prev.branches || []), { id: `b-${Date.now()}`, label, color: BRANCH_COLORS[colorIndex], children: [] }],
    }));
    setNewBranchLabel('');
    setAddingBranch(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await labsApi.updateMindMap(initialMap.id, { nodes });
      setEditMode(false);
    } catch {
      // stay in edit mode
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setNodes(initialMap.nodes || {});
    setEditMode(false);
    setAddingBranch(false);
    setNewBranchLabel('');
  };

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> All maps
        </button>
        <div className="flex items-center gap-1.5">
          {editMode ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => onDelete(initialMap.id)}
                className="p-1.5 rounded-lg text-gray-300 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{initialMap.topic}</h2>
        {nodes.central && nodes.central.toLowerCase() !== initialMap.topic.toLowerCase() && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{nodes.central}</p>
        )}
      </div>

      {editMode && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 text-xs text-blue-600 dark:text-blue-400">
          Click any label to rename it. Use + to add children, × to delete.
        </div>
      )}

      {/* Mind map */}
      {branches.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-xs text-gray-400 dark:text-gray-600">
          No branches yet. {editMode ? 'Add one below.' : 'Click Edit to add branches.'}
        </div>
      ) : (
        <MindMapCanvas
          nodes={nodes}
          editMode={editMode}
          onEditLabel={editLabel}
          onDeleteBranch={deleteBranch}
          onAddChild={addChild}
          onDeleteChild={deleteChild}
        />
      )}

      {/* Add branch (edit mode) */}
      {editMode && (
        <div className="mt-4">
          {addingBranch ? (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-700">
              <input
                autoFocus
                value={newBranchLabel}
                onChange={e => setNewBranchLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addBranch(); if (e.key === 'Escape') { setAddingBranch(false); setNewBranchLabel(''); } }}
                placeholder="New branch label…"
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button onClick={addBranch} className="text-emerald-500"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setAddingBranch(false); setNewBranchLabel(''); }} className="text-gray-400"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingBranch(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add branch
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const MindMapPage = () => {
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMap, setActiveMap] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { loadMaps(); }, []);

  const loadMaps = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labsApi.listMindMaps();
      setMaps(res.maps || []);
    } catch (err) {
      setError(err.message || 'Failed to load maps.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await labsApi.generateMindMap(topic.trim());
      setMaps(prev => [res.map, ...prev]);
      setTopic('');
      setShowCreate(false);
      setActiveMap(res.map);
    } catch (err) {
      setCreateError(err.message || 'Failed to generate mind map.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (mapId) => {
    setDeletingId(mapId);
    try {
      await labsApi.deleteMindMap(mapId);
      setMaps(prev => prev.filter(m => m.id !== mapId));
      if (activeMap?.id === mapId) setActiveMap(null);
    } catch { } finally {
      setDeletingId(null);
    }
  };

  const handleOpenMap = async (mapSummary) => {
    try {
      const res = await labsApi.getMindMap(mapSummary.id);
      setActiveMap(res.map);
    } catch {
      setActiveMap(mapSummary);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Network className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Mind Maps</h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">AI-built topic maps saved for later.</p>
          </div>
          {!activeMap && (
            <button
              onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New map
            </button>
          )}
        </div>

        {activeMap ? (
          <MapDetail map={activeMap} onBack={() => setActiveMap(null)} onDelete={handleDelete} />
        ) : (
          <>
            {showCreate && (
              <form onSubmit={handleCreate} className="mb-5 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">What topic should the map cover?</p>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. The digestive system, causes of WW1, machine learning…"
                  autoFocus
                  maxLength={200}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-400 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/30 mb-2"
                />
                {createError && (
                  <div className="flex items-start gap-1.5 mb-2 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{createError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!topic.trim() || creating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</> : 'Generate map'}
                  </button>
                  <button type="button" onClick={() => { setShowCreate(false); setTopic(''); setCreateError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : maps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Network className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No maps yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-600">Generate your first mind map to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {maps.map(map => (
                  <div
                    key={map.id}
                    onClick={() => handleOpenMap(map)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group cursor-pointer"
                  >
                    <Network className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{map.topic}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(map.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(map.id); }}
                        disabled={deletingId === map.id}
                        className="p-1.5 rounded-lg text-gray-300 dark:text-gray-700 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {deletingId === map.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MindMapPage;
