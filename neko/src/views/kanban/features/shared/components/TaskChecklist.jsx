import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Trash2, Check, CirclePlus } from "lucide-react";

const CollapsibleTaskText = ({ text, maxLength = 100, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const needsCollapsing = (text?.length || 0) > maxLength;
  return (
    <div>
      <div className={`text-sm break-words ${className} ${!isExpanded && needsCollapsing ? "line-clamp-2" : ""}`}>
        {isExpanded ? text : needsCollapsing ? `${text.substring(0, maxLength)}...` : text}
      </div>
      {needsCollapsing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v); }}
          className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:underline"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};

CollapsibleTaskText.propTypes = {
  text: PropTypes.string,
  maxLength: PropTypes.number,
  className: PropTypes.string,
};

const TaskChecklist = ({
  tasks = [],
  onUpdate,
  readOnly = false,
  showAddInput = true,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
  disableCompletion = false,
}) => {
  const [newTaskText, setNewTaskText] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskText, setEditTaskText] = useState("");
  const editInputRef = useRef(null);

  useEffect(() => {
    if (editingTaskId && editInputRef.current) editInputRef.current.focus();
  }, [editingTaskId]);

  useEffect(() => {
    onUnsavedTextChange?.(newTaskText.trim().length > 0);
  }, [newTaskText, onUnsavedTextChange]);

  const normalizeTask = (t) => ({ id: t.id, text: t.text || t.title || "", completed: Boolean(t.completed) });

  const handleAddTask = () => {
    if (!newTaskText.trim() || readOnly) return;
    onUpdate([...tasks, { id: Date.now(), text: newTaskText.trim(), completed: false }]);
    setNewTaskText("");
  };

  const handleToggleTask = (taskId) => {
    if (readOnly || disableCompletion) return;
    onUpdate(tasks.map((t) => t.id === taskId ? normalizeTask({ ...t, completed: !t.completed }) : normalizeTask(t)));
  };

  const handleDeleteTask = (taskId) => {
    if (readOnly) return;
    onUpdate(tasks.filter((t) => t.id !== taskId).map(normalizeTask));
  };

  const startEdit = (task) => {
    if (readOnly || task.completed) return;
    setEditingTaskId(task.id);
    setEditTaskText(task.text || "");
  };

  const saveEdit = (taskId) => {
    if (!editTaskText.trim() || readOnly) { setEditingTaskId(null); return; }
    onUpdate(tasks.map((t) => t.id === taskId ? normalizeTask({ ...t, text: editTaskText.trim() }) : normalizeTask(t)));
    setEditingTaskId(null);
  };

  return (
    <div className="space-y-2">
      {showAddInput && (
        <div className="flex items-center gap-2 p-3 border rounded-lg border-gray-200 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-900">
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAddTask(); }
            }}
            placeholder="Add a subtask…"
            disabled={readOnly}
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 midnight:text-indigo-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newTaskText.trim() || readOnly}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors ${
              !newTaskText.trim() || readOnly
                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : shouldBounceSaveAll
                  ? "text-red-500 dark:text-red-400 animate-bounce"
                  : "text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
            }`}
          >
            <CirclePlus className="w-4 h-4" />
            <span className="font-medium">Add</span>
          </button>
        </div>
      )}

      {tasks.length > 0 && (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`flex items-start justify-between p-2 rounded-lg group ${
                task.completed
                  ? "bg-gray-50 dark:bg-gray-700/40 midnight:bg-indigo-700/20"
                  : "bg-gray-50 dark:bg-gray-700 midnight:bg-indigo-800/60"
              }`}
            >
              <div className="flex items-start flex-1 gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => handleToggleTask(task.id)}
                  disabled={readOnly || disableCompletion}
                  className={`shrink-0 w-5 h-5 rounded-sm border mt-0.5 flex items-center justify-center transition-colors ${
                    task.completed
                      ? "bg-gray-600 dark:bg-gray-900 midnight:bg-indigo-600 border-gray-500 dark:border-gray-800 text-white"
                      : disableCompletion
                        ? "border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-50"
                        : "border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 midnight:bg-gray-900"
                  }`}
                >
                  {task.completed && <Check className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />}
                  {!task.completed && disableCompletion && (
                    <div className="w-2.5 h-0.5 bg-blue-500 dark:bg-blue-400 rounded-sm" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  {editingTaskId === task.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTaskText}
                      onChange={(e) => setEditTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(task.id);
                        if (e.key === "Escape") setEditingTaskId(null);
                      }}
                      onBlur={() => saveEdit(task.id)}
                      className="w-full bg-transparent border-none outline-none text-sm text-gray-800 dark:text-white midnight:text-indigo-100"
                    />
                  ) : (
                    <div
                      onClick={() => startEdit(task)}
                      className={!readOnly && !task.completed ? "cursor-pointer" : ""}
                    >
                      <CollapsibleTaskText
                        text={task.text}
                        className={`text-gray-900 dark:text-gray-300 midnight:text-indigo-400 ${task.completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDeleteTask(task.id)}
                  className="shrink-0 p-1 rounded-full text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

TaskChecklist.propTypes = {
  tasks: PropTypes.array,
  onUpdate: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
  showAddInput: PropTypes.bool,
  onUnsavedTextChange: PropTypes.func,
  shouldBounceSaveAll: PropTypes.bool,
  disableCompletion: PropTypes.bool,
};

export default TaskChecklist;
