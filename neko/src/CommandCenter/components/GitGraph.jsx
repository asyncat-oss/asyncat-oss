/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { gitApi } from '../api';

const COL_WIDTH = 14;
const ROW_HEIGHT = 32;
const COLORS = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#d946ef', // fuchsia
  '#06b6d4', // cyan
];

function Path({ x1, y1, x2, y2, color }) {
  if (x1 === x2) {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" />;
  }
  const cy1 = y1 + (y2 - y1) / 2;
  const cy2 = y2 - (y2 - y1) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke={color} strokeWidth="2" />;
}

export default function GitGraph({ workingDir = null }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

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

  if (loading && commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading history...
      </div>
    );
  }

  if (error && commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-red-500">
        <AlertCircle className="mr-2 h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 px-1 py-1 text-sm text-slate-300">
        <div className="relative pb-2">
          {graphRows.map((row) => {
            const maxW = Math.max(row.incoming.length, row.outgoing.length);
            const svgWidth = (maxW + 1) * COL_WIDTH;
            return (
              <div key={row.commit.hash} className="group relative flex h-8 items-center hover:bg-gray-100/80 dark:hover:bg-slate-800/70 rounded-md transition-colors px-2 cursor-default overflow-hidden">
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
                    <circle cx={row.col * COL_WIDTH + COL_WIDTH / 2} cy={ROW_HEIGHT / 2} r="3.5" fill={row.color} stroke="currentColor" className="text-white dark:text-[#0b1220]" strokeWidth="2" />
                  </svg>
                </div>
                
                <div className="ml-3 flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 font-mono text-[10px] font-medium text-gray-400 dark:text-slate-500">{row.commit.hash.slice(0, 7)}</span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-gray-800 dark:text-slate-200" title={row.commit.subject}>
                      {row.commit.subject}
                    </span>
                    {row.commit.refs.map(ref => {
                      const isTag = ref.startsWith('tag: ');
                      const displayRef = ref.replace('HEAD -> ', '').replace('origin/', '').replace('tag: ', '');
                      return (
                        <span key={ref} className={`shrink-0 rounded-sm border px-1 py-[1px] text-[9px] font-medium leading-none tracking-wide ${isTag ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}>
                          {displayRef}
                        </span>
                      );
                    })}
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-[10px] text-gray-500 dark:text-slate-500">
                    <span className="truncate max-w-[80px]" title={row.commit.author}>{row.commit.author}</span>
                    <span className="w-16 text-right tabular-nums">{row.commit.date}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {hasMore && (
          <div className="mt-1 text-center pb-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {loading ? 'Loading...' : 'Load older commits'}
            </button>
          </div>
        )}
        {!hasMore && commits.length > 0 && (
           <div className="text-center pb-2 text-xs text-gray-400 dark:text-slate-600">
             End of history
           </div>
        )}
      </div>
    </div>
  );
}
