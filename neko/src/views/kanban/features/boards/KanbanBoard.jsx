import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { agentTaskRunsApi } from '../../../../CommandCenter/api';
import { useColumnContext } from '../../../context/viewContexts';
import AgentCard from '../cards/Card';
import AgentColumn from '../columns/components/Column';
import NewTaskModal from '../cards/AddCardModal';
import AgentTaskDetail from '../../../tasks/carddetail/CardDetailModal';

const BOARD_COLUMNS = [
  {
    id: 'backlog',
    label: 'Queue',
    emptyText: 'No tasks queued',
    dotClass: 'bg-gray-400',
    headerClass: 'text-gray-600 dark:text-gray-400',
    bgClass: 'bg-gray-50 dark:bg-gray-800/20 midnight:bg-slate-900/30',
  },
  {
    id: 'active',
    label: 'Active',
    emptyText: 'No active tasks',
    pulsing: true,
    dotClass: 'bg-blue-500',
    headerClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50/50 dark:bg-blue-900/10 midnight:bg-blue-950/10',
  },
  {
    id: 'needs_input',
    label: 'Needs Input',
    emptyText: 'No tasks waiting for input',
    dotClass: 'bg-amber-500',
    headerClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50/50 dark:bg-amber-900/10 midnight:bg-amber-950/10',
  },
  {
    id: 'done',
    label: 'Done',
    emptyText: 'No completed tasks yet',
    dotClass: 'bg-emerald-500',
    headerClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-50/50 dark:bg-emerald-900/10 midnight:bg-emerald-950/10',
  },
  {
    id: 'failed',
    label: 'Failed',
    emptyText: 'No failed tasks',
    dotClass: 'bg-red-500',
    headerClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-950/10',
  },
];

function getTaskColumn(task) {
  const run = task.agentRun;
  if (!run || run.status === 'cancelled') return 'backlog';
  const status = run.displayStatus || run.status;
  if (status === 'queued' || status === 'running') return 'active';
  if (status === 'needs_input') return 'needs_input';
  if (status === 'completed') return 'done';
  return 'failed';
}

const AgentBoard = () => {
  const { columns: projectColumns } = useColumnContext();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const pollingRef = useRef(null);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await agentTaskRunsApi.list();
      setTasks(result.tasks || []);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load tasks');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const needsPoll = tasks.some(t => {
      const col = getTaskColumn(t);
      return col === 'active' || col === 'needs_input';
    });
    if (needsPoll) {
      pollingRef.current = setInterval(() => fetchTasks(true), 3000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [tasks, fetchTasks]);

  const buckets = BOARD_COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => getTaskColumn(t) === col.id);
    return acc;
  }, {});

  const firstColumn = Array.isArray(projectColumns) && projectColumns.length > 0 ? projectColumns[0] : null;
  const activeCount = buckets.active?.length || 0;
  const needsInputCount = buckets.needs_input?.length || 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading tasks…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
      {/* Board header */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
            Agent Tasks
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              {activeCount} running
            </span>
          )}
          {needsInputCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {needsInputCount} need{needsInputCount === 1 ? 's' : ''} input
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fetchTasks()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-900 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowNewTask(true)}
            disabled={!firstColumn}
            title={!firstColumn ? 'Select a project with at least one column first' : 'New Task'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 midnight:bg-slate-100 midnight:hover:bg-white midnight:text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full">
          {BOARD_COLUMNS.map(col => (
            <AgentColumn
              key={col.id}
              column={col}
              tasks={buckets[col.id] || []}
              onTaskClick={setSelectedTask}
              onRefresh={() => fetchTasks(true)}
            />
          ))}
        </div>
      </div>

      {showNewTask && (
        <NewTaskModal
          column={firstColumn}
          onClose={() => setShowNewTask(false)}
          onSuccess={() => { setShowNewTask(false); fetchTasks(); }}
        />
      )}

      {selectedTask && (
        <AgentTaskDetail
          task={selectedTask}
          onClose={() => { setSelectedTask(null); fetchTasks(true); }}
          onRefresh={() => fetchTasks(true)}
        />
      )}
    </div>
  );
};

export default AgentBoard;
