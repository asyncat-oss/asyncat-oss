import { Inbox, Zap, MessageCircle, CheckCircle2, XCircle } from 'lucide-react';
import AgentCard from '../../cards/Card';

const ICON_MAP = {
  backlog: Inbox,
  active: Zap,
  needs_input: MessageCircle,
  done: CheckCircle2,
  failed: XCircle,
};

const AgentColumn = ({ column, tasks, onTaskClick, onRefresh }) => {
  const Icon = ICON_MAP[column.id] || Inbox;

  return (
    <div className="flex-shrink-0 w-72 flex flex-col max-h-full">
      {/* Column header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 mb-3 rounded-xl ${column.bgClass}`}>
        <span
          className={`h-2 w-2 rounded-full flex-shrink-0 ${column.dotClass}${column.pulsing ? ' animate-pulse' : ''}`}
        />
        <Icon className={`w-4 h-4 flex-shrink-0 ${column.headerClass}`} />
        <span className={`text-sm font-semibold flex-1 ${column.headerClass}`}>
          {column.label}
        </span>
        {tasks.length > 0 && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-gray-900/50 midnight:bg-slate-950/50 ${column.headerClass}`}>
            {tasks.length}
          </span>
        )}
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pb-2 pr-0.5">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400 dark:text-gray-500 text-center px-3 leading-relaxed">
            {column.emptyText}
          </div>
        ) : (
          tasks.map(task => (
            <AgentCard
              key={task.id}
              task={task}
              columnId={column.id}
              onClick={() => onTaskClick(task)}
              onRefresh={onRefresh}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AgentColumn;
