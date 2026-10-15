// Git → History: the commit graph with a filter, and a commit's details.

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Loader2, Copy, Check, FileCode, Eye } from 'lucide-react';
import { gitApi } from '../../api';
import Dialog from '../../../components/ui/Dialog.jsx';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import SearchField from '../../../components/ui/SearchField.jsx';
import DiffModal from './DiffModal';
import { rowRefs } from './gitLabels.js';

const COL_WIDTH = 14;
const ROW_HEIGHT = 32;
// One colour per lane, so branches can be told apart, like series in a
// chart. The first lane, usually the main branch, takes the accent.
const COLORS = [
  'var(--as-accent)',
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#d946ef', // fuchsia
  '#06b6d4', // cyan
];

// The checked-out branch is "in use", so it takes the accent; the rest stay neutral.
const REF_LOOK = {
  current: 'bg-accent-soft text-accent',
  tag: 'border border-line-strong text-fg-muted',
  branch: 'bg-hover text-fg-muted',
};

function Path({ x1, y1, x2, y2, color }) {
  if (x1 === x2) {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color }} strokeWidth="2" />;
  }
  const cy1 = y1 + (y2 - y1) / 2;
  const cy2 = y2 - (y2 - y1) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
  return <path d={d} fill="none" style={{ stroke: color }} strokeWidth="2" />;
}

function MetaRow({ label, children }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <span className="w-16 shrink-0 text-[12px] text-fg-subtle">{label}</span>
      <div className="min-w-0 flex-1 text-[13px] text-fg">{children}</div>
    </div>
  );
}

function CommitDetailModal({ hash, workingDir, onClose, onViewDiff }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    gitApi.commitDetail({ hash, path: workingDir })
      .then(res => {
        if (!cancelled) {
          if (res.success) setData(res.commit);
          else setError(res.error || 'Failed to load commit details');
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load commit details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hash, workingDir]);

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <Dialog open title={data?.subject || 'Commit'} onClose={onClose}>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <div className="space-y-4">
          {data.body && (
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-fg-muted">{data.body}</p>
          )}

          <div className="divide-y divide-line rounded-xl border border-line">
            <MetaRow label="Commit">
              <span className="inline-flex items-center gap-1">
                <code className="break-all font-mono text-[12px] text-fg-muted">{data.hash}</code>
                <IconButton size="sm" icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy the hash'} onClick={copyHash} />
              </span>
            </MetaRow>
            <MetaRow label="Author">
              {data.author}
              {data.authorEmail ? <span className="ml-1.5 text-[12px] text-fg-subtle">{data.authorEmail}</span> : null}
            </MetaRow>
            <MetaRow label="Date">{new Date(data.authorDate).toLocaleString()}</MetaRow>
            {data.parents.length > 0 && (
              <MetaRow label={data.parents.length > 1 ? 'Parents' : 'Parent'}>
                <span className="flex flex-wrap gap-1.5">
                  {data.parents.map(p => (
                    <code key={p} className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{p.slice(0, 7)}</code>
                  ))}
                </span>
              </MetaRow>
            )}
          </div>

          {data.changedFiles.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[13px] font-semibold text-fg">
                Changed files <span className="font-normal text-fg-subtle">{data.changedFiles.length}</span>
              </h3>
              <div className="space-y-px">
                {data.changedFiles.map(f => (
                  <div key={f.path} className="group flex items-center gap-2 rounded-lg py-1 pl-2.5 pr-1 hover:bg-hover">
                    <FileCode className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg" title={f.path}>{f.path}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{f.changes}</span>
                    <IconButton size="sm" icon={Eye} label="View diff" onClick={() => onViewDiff({ path: f.path }, hash)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function GitGraph({ workingDir = null }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedHash, setSelectedHash] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [diffFile, setDiffFile] = useState(null);
  const [diffCompare, setDiffCompare] = useState(null);

  const fetchCommits = useCallback(async (skip = 0) => {
    try {
      setLoading(true);
      const res = await gitApi.log({ limit: 50, skip, path: workingDir });
      if (res.success) {
        if (skip === 0) setCommits(res.commits);
        else setCommits(prev => [...prev, ...res.commits]);
        setHasMore(res.commits.length === 50);
      } else {
        setError(res.error || 'Failed to load git log');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workingDir]);

  useEffect(() => {
    setPage(0);
    setSearchQuery('');
    fetchCommits(0);
  }, [fetchCommits]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCommits(nextPage * 50);
  };

  const graphRows = useMemo(() => {
    let activeBranches = [];
    let colorIndex = 0;
    const rows = [];

    for (const commit of commits) {
      const incoming = [...activeBranches];
      let col = activeBranches.findIndex(b => b && b.hash === commit.hash);
      let color = '';
      
      if (col === -1) {
        col = activeBranches.findIndex(b => !b);
        if (col === -1) col = activeBranches.length;
        color = COLORS[colorIndex++ % COLORS.length];
      } else {
        color = activeBranches[col].color;
      }
      
      const merges = [];
      for (let i = 0; i < activeBranches.length; i++) {
        if (i !== col && activeBranches[i] && activeBranches[i].hash === commit.hash) {
          merges.push(i);
          activeBranches[i] = null;
        }
      }
      
      const outgoingLines = [];
      if (commit.parents && commit.parents.length > 0) {
        activeBranches[col] = { hash: commit.parents[0], color };
        outgoingLines.push({ from: col, to: col, color });
        
        for (let i = 1; i < commit.parents.length; i++) {
          let pCol = activeBranches.findIndex(b => !b);
          if (pCol === -1) pCol = activeBranches.length;
          const pColor = COLORS[colorIndex++ % COLORS.length];
          activeBranches[pCol] = { hash: commit.parents[i], color: pColor };
          outgoingLines.push({ from: col, to: pCol, color: pColor });
        }
      } else {
        activeBranches[col] = null;
      }
      
      while (activeBranches.length > 0 && !activeBranches[activeBranches.length - 1]) {
        activeBranches.pop();
      }
      
      rows.push({
        commit,
        col,
        color,
        incoming,
        outgoing: [...activeBranches],
        merges,
        outgoingLines
      });
    }
    return rows;
  }, [commits]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return graphRows;
    return graphRows.filter(row =>
      row.commit.subject.toLowerCase().includes(q) ||
      row.commit.author.toLowerCase().includes(q) ||
      row.commit.hash.toLowerCase().startsWith(q)
    );
  }, [graphRows, searchQuery]);

  const handleViewDiff = (file, hash) => {
    setDiffFile(file);
    setDiffCompare(hash);
  };

  if (loading && commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 text-[13px] text-fg-subtle">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (error && commits.length === 0) {
    return <Notice tone="error" className="mx-3 mt-2">{error}</Notice>;
  }

  return (
    <div className="@container flex flex-col">
      {/* Search */}
      <div className="px-3 pb-2 pt-1">
        <SearchField size="sm" value={searchQuery} onChange={setSearchQuery} placeholder="Filter commits" />
      </div>

      <div className="flex-1 px-1.5 py-1">
        <div className="relative pb-2">
          {filteredRows.map((row) => {
            const maxW = Math.max(row.incoming.length, row.outgoing.length);
            const svgWidth = (maxW + 1) * COL_WIDTH;
            const refs = rowRefs(row.commit.refs);
            return (
              <div
                key={row.commit.hash}
                onClick={() => setSelectedHash(row.commit.hash)}
                className="group relative flex h-8 cursor-pointer items-center overflow-hidden rounded-lg px-2 transition-colors hover:bg-hover"
                title={`${row.commit.hash.slice(0, 7)} ${row.commit.subject} — ${row.commit.author}`}
              >
                <div className="relative h-8 shrink-0" style={{ width: svgWidth }}>
                  <svg width={svgWidth} height={ROW_HEIGHT} className="absolute left-0 top-0">
                    {/* Pass-through lines */}
                    {row.incoming.map((b, incCol) => {
                      if (!b || incCol === row.col || row.merges.includes(incCol)) return null;
                      const x = incCol * COL_WIDTH + COL_WIDTH / 2;
                      return <Path key={`thru-${incCol}`} x1={x} y1={0} x2={x} y2={ROW_HEIGHT} color={b.color} />;
                    })}
                    {/* Incoming to node */}
                    {row.incoming[row.col] && (
                      <Path x1={row.col * COL_WIDTH + COL_WIDTH / 2} y1={0} x2={row.col * COL_WIDTH + COL_WIDTH / 2} y2={ROW_HEIGHT / 2} color={row.incoming[row.col].color} />
                    )}
                    {row.merges.map(mCol => (
                      <Path key={`merge-${mCol}`} x1={mCol * COL_WIDTH + COL_WIDTH / 2} y1={0} x2={row.col * COL_WIDTH + COL_WIDTH / 2} y2={ROW_HEIGHT / 2} color={row.incoming[mCol].color} />
                    ))}
                    {/* Outgoing from node */}
                    {row.outgoingLines.map((line, idx) => (
                      <Path key={`out-${idx}`} x1={line.from * COL_WIDTH + COL_WIDTH / 2} y1={ROW_HEIGHT / 2} x2={line.to * COL_WIDTH + COL_WIDTH / 2} y2={ROW_HEIGHT} color={line.color} />
                    ))}
                    {/* Node Dot */}
                    <circle
                      cx={row.col * COL_WIDTH + COL_WIDTH / 2}
                      cy={ROW_HEIGHT / 2}
                      r="3.5"
                      style={{ fill: row.color, stroke: 'var(--as-canvas)' }}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                
                {/* The subject keeps at least 6rem: the ref chip shrinks first, and
                    the hash and author only show when the panel is wide enough. */}
                <div className="ml-3 flex min-w-0 flex-1 items-center gap-2">
                  <span className="hidden shrink-0 font-mono text-[11px] text-fg-subtle @sm:block">{row.commit.hash.slice(0, 7)}</span>
                  <span className="min-w-[6rem] flex-1 truncate text-[12px] font-medium text-fg">
                    {row.commit.subject}
                  </span>
                  {refs.shown && (
                    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                      <span
                        title={refs.shown.kind === 'tag' ? `Tag ${refs.shown.label}` : `Branch ${refs.shown.label}`}
                        className={`min-w-0 max-w-[8rem] truncate rounded-md px-1.5 py-px text-[11px] font-medium leading-4 ${REF_LOOK[refs.shown.kind]}`}
                      >
                        {refs.shown.label}
                      </span>
                      {refs.rest.length > 0 && (
                        <span title={refs.rest.map(chip => chip.label).join(', ')} className="shrink-0 rounded-md bg-hover px-1 py-px text-[11px] font-medium leading-4 tabular-nums text-fg-subtle">
                          +{refs.rest.length}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="hidden max-w-[80px] shrink-0 truncate text-[11px] text-fg-subtle @md:block">{row.commit.author}</span>
                  <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-fg-subtle">{row.commit.date}</span>
                </div>
              </div>
            );
          })}
        </div>
        
        {hasMore && (
          <div className="mt-1 pb-2 text-center">
            <Button variant="secondary" size="xs" onClick={loadMore} loading={loading}>
              {loading ? 'Loading…' : 'Load older commits'}
            </Button>
          </div>
        )}
        {!hasMore && commits.length > 0 && (
          <p className="pb-2 text-center text-[12px] text-fg-subtle">
            End of history
          </p>
        )}
      </div>

      {selectedHash && (
        <CommitDetailModal
          hash={selectedHash}
          workingDir={workingDir}
          onClose={() => setSelectedHash(null)}
          onViewDiff={handleViewDiff}
        />
      )}

      {diffFile && (
        <DiffModal
          file={diffFile}
          compare={diffCompare}
          workingDir={workingDir}
          onClose={() => { setDiffFile(null); setDiffCompare(null); }}
        />
      )}
    </div>
  );
}
