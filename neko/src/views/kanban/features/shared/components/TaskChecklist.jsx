import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import {
  Trash2,
  Check,
  X,
  Edit,
  ChevronDown,
  ChevronUp,
  Clock,
  SquareX,
  CircleX,
  CirclePlus,
  SquareCheck,
} from "lucide-react";

const durationToParts = (duration) => {
  const totalMinutes = parseInt(duration || 0, 10) || 0;
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
};

const formatDurationParts = ({ hours, minutes }) => {
  if (hours === 0 && minutes === 0) return "";

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ");
};

const DurationFields = ({ duration, onChange, compact = false }) => {
  const quickOptions = [
    { label: "30m", hours: 0, minutes: 30 },
    { label: "1h", hours: 1, minutes: 0 },
    { label: "2h", hours: 2, minutes: 0 },
    { label: "4h", hours: 4, minutes: 0 },
  ];

  const setPart = (part, value) => {
    const max = part === "hours" ? 23 : 59;
    onChange((prev) => ({
      ...prev,
      [part]: Math.min(max, Math.max(0, parseInt(value, 10) || 0)),
    }));
  };

  const stepPart = (part, delta) => {
    const max = part === "hours" ? 23 : 59;
    onChange((prev) => ({
      ...prev,
      [part]: Math.min(max, Math.max(0, prev[part] + delta)),
    }));
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Clock className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-gray-500`} />
          <h4
            className={`${
              compact ? "text-xs" : "text-sm"
            } font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200`}
          >
            Estimated Duration
          </h4>
        </div>
        {formatDurationParts(duration) && (
          <div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300">
            Total: {formatDurationParts(duration)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "hours", label: "Hours", max: 23 },
          { key: "minutes", label: "Minutes", max: 59 },
        ].map(({ key, label, max }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
              {label}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max={max}
                value={duration[key]}
                onChange={(e) => setPart(key, e.target.value)}
                className="w-full px-2 py-1.5 pr-6 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                <button
                  type="button"
                  onClick={() => stepPart(key, 1)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => stepPart(key, -1)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
          Quick Options
        </div>
        <div className={`grid ${compact ? "grid-cols-4" : "grid-cols-2"} gap-1`}>
          {quickOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() =>
                onChange({ hours: option.hours, minutes: option.minutes })
              }
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 midnight:text-gray-400"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

DurationFields.propTypes = {
  duration: PropTypes.shape({
    hours: PropTypes.number,
    minutes: PropTypes.number,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool,
};

const EnhancedTaskCreationForm = ({
  onAddTask,
  disabled = false,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
}) => {
  const [taskText, setTaskText] = useState("");
  const [duration, setDuration] = useState({ hours: 0, minutes: 0 });
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const textInputRef = useRef(null);
  const modalRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    onUnsavedTextChange?.(taskText.trim().length > 0);
  }, [taskText, onUnsavedTextChange]);

  const calculateModalPosition = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const modalWidth = Math.max(320, rect.width);
    const top = rect.bottom + 8;
    let left = rect.left;

    if (left + modalWidth > viewportWidth - 20) {
      left = viewportWidth - modalWidth - 20;
    }
    if (left < 20) left = 20;

    setModalPosition({ top, left, width: modalWidth });
  };

  const handleInputFocus = () => {
    setShowModal(true);
    calculateModalPosition();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target) &&
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setShowModal(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const updatePosition = () => {
      if (showModal) calculateModalPosition();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showModal]);

  const handleAddTask = () => {
    if (!taskText.trim() || disabled) return;

    const totalMinutes = duration.hours * 60 + duration.minutes;
    onAddTask({
      id: Date.now(),
      text: taskText.trim(),
      completed: false,
      duration: totalMinutes > 0 ? totalMinutes : null,
    });

    setShowModal(false);
    textInputRef.current?.blur();
    setTaskText("");
    setDuration({ hours: 0, minutes: 0 });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
    if (e.key === "Escape") {
      setShowModal(false);
    }
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex items-center space-x-2 p-3 border rounded-lg transition-all duration-200 border-gray-200 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600"
      >
        <input
          ref={textInputRef}
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder="Add a subtask..."
          disabled={disabled}
          className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-indigo-100 placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-500"
        />

        {formatDurationParts(duration) && (
          <div className="flex items-center space-x-1 text-sm text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500">
            <Clock className="w-4 h-4" />
            <span>{formatDurationParts(duration)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleAddTask}
          disabled={!taskText.trim() || disabled}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors ${
            !taskText.trim() || disabled
              ? "text-gray-300 dark:text-gray-600 midnight:text-gray-700 cursor-not-allowed"
              : shouldBounceSaveAll
              ? "text-red-500 dark:text-red-400 midnight:text-red-400 animate-bounce"
              : "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 midnight:hover:text-indigo-300"
          }`}
        >
          <CirclePlus className="w-5 h-5" />
          <span className="text-sm font-medium">Add Subtask</span>
        </button>
      </div>

      {showModal &&
        createPortal(
          <div
            ref={modalRef}
            className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg shadow-lg flex flex-col"
            style={{
              top: modalPosition.top,
              left: modalPosition.left,
              width: modalPosition.width,
              minWidth: "320px",
              maxHeight: `${Math.max(
                200,
                window.innerHeight - modalPosition.top - 20
              )}px`,
            }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
                Subtask Details
              </h3>
              <button
                type="button"
                onClick={() => setDuration({ hours: 0, minutes: 0 })}
                className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-red-900 text-black dark:text-red-400 midnight:text-red-300 text-xs font-medium flex items-center gap-1.5"
              >
                <SquareX className="w-3 h-3" />
                Clear
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto min-h-0 overscroll-contain">
              <DurationFields duration={duration} onChange={setDuration} />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

EnhancedTaskCreationForm.propTypes = {
  onAddTask: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  onUnsavedTextChange: PropTypes.func,
  shouldBounceSaveAll: PropTypes.bool,
};

const CollapsibleTaskText = ({ text, maxLength = 100, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const needsCollapsing = text?.length > maxLength;
  const truncatedText = needsCollapsing
    ? `${text.substring(0, maxLength)}...`
    : text;

  const toggleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative">
      <div
        className={`text-sm break-words ${className} ${
          !isExpanded && needsCollapsing ? "line-clamp-2" : ""
        }`}
        style={{
          wordWrap: "break-word",
          overflowWrap: "break-word",
          wordBreak: "normal",
          whiteSpace: "normal",
          ...(isExpanded ? { maxWidth: "100%" } : {}),
        }}
      >
        {isExpanded ? text : truncatedText}
      </div>

      {needsCollapsing && (
        <button
          type="button"
          onClick={toggleExpand}
          className="mt-1 text-xs flex items-center text-indigo-600 dark:text-indigo-400 midnight:text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 midnight:hover:text-indigo-300 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              <span>Show more</span>
            </>
          )}
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

const DurationDisplay = ({ duration, className = "" }) => {
  const durationNum = parseInt(duration || 0, 10);
  if (!durationNum || durationNum <= 0 || isNaN(durationNum)) return null;

  const displayText = formatDurationParts(durationToParts(durationNum));

  return (
    <div
      className={`flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300 ${className}`}
    >
      <Clock className="w-3 h-3" />
      <span>{displayText}</span>
    </div>
  );
};

DurationDisplay.propTypes = {
  duration: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
};

const UnifiedSubtaskEditModal = ({ task, onUpdate, onClose, coordinates }) => {
  const [duration, setDuration] = useState({ hours: 0, minutes: 0 });
  const modalRef = useRef(null);

  useEffect(() => {
    setDuration(durationToParts(task.duration));
  }, [task.duration]);

  const handleConfirm = () => {
    const totalMinutes = duration.hours * 60 + duration.minutes;
    const localTask = { ...task };
    delete localTask.assignees;
    delete localTask.assigneeDetails;

    onUpdate({
      ...localTask,
      duration: totalMinutes > 0 ? totalMinutes : null,
    });
    onClose();
  };

  return (
    <div
      ref={modalRef}
      data-unified-subtask-modal="true"
      className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg shadow-lg flex flex-col"
      style={{
        top: coordinates.top,
        left: coordinates.left,
        width: "340px",
        maxHeight: `${Math.max(
          200,
          window.innerHeight - coordinates.top - 20
        )}px`,
      }}
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
          Subtask Details
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
        <DurationFields
          duration={duration}
          onChange={setDuration}
          compact={true}
        />
      </div>

      <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
        <button
          type="button"
          onClick={() => setDuration({ hours: 0, minutes: 0 })}
          className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-blue-900 text-black dark:text-blue-400 midnight:text-blue-300 text-xs font-medium flex items-center gap-1.5"
        >
          <SquareX className="w-3 h-3" />
          Clear
        </button>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-red-900 text-black dark:text-red-400 midnight:text-red-300 text-xs font-medium flex items-center gap-1.5"
          >
            <CircleX className="w-3 h-3" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-indigo-300 text-xs font-medium flex items-center gap-1.5"
          >
            <SquareCheck className="w-3 h-3" />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

UnifiedSubtaskEditModal.propTypes = {
  task: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    duration: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }).isRequired,
  onUpdate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  coordinates: PropTypes.shape({
    top: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
  }).isRequired,
};

const TaskChecklist = ({
  tasks = [],
  onUpdate,
  readOnly = false,
  showAddInput = true,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
  disableCompletion = false,
  positioningConfig = {
    preferredPosition: "auto",
    modalSelector: null,
    forcePosition: false,
    offsetAdjustment: { top: 2, right: 0 },
    avoidElements: [],
  },
}) => {
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskText, setEditTaskText] = useState("");
  const editInputRef = useRef(null);
  const taskListRef = useRef(null);
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);
  const [currentEditTask, setCurrentEditTask] = useState(null);
  const [unifiedModalCoordinates, setUnifiedModalCoordinates] = useState({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (editingTaskId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTaskId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showUnifiedModal &&
        !event.target.closest("[data-unified-subtask-modal]")
      ) {
        setShowUnifiedModal(false);
        setCurrentEditTask(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUnifiedModal]);

  const stripAssigneeFields = (task) => {
    const nextTask = { ...task };
    delete nextTask.assignees;
    delete nextTask.assigneeDetails;
    return nextTask;
  };

  const handleEnhancedAddTask = (newTaskObj) => {
    if (readOnly) return;
    onUpdate([...tasks, newTaskObj]);
  };

  const handleToggleTask = (taskId) => {
    if (readOnly || disableCompletion) return;

    const updatedTasks = tasks.map((task) =>
      task.id === taskId
        ? stripAssigneeFields({ ...task, completed: !task.completed })
        : stripAssigneeFields(task)
    );

    onUpdate(updatedTasks);
  };

  const handleDeleteTask = (taskId) => {
    if (readOnly) return;
    onUpdate(tasks.filter((task) => task.id !== taskId).map(stripAssigneeFields));
  };

  const handleEditKeyDown = (e, task) => {
    if (e.key === "Enter") {
      handleSaveEdit(task.id);
    } else if (e.key === "Escape") {
      setEditingTaskId(null);
      setEditTaskText("");
    }
  };

  const handleSaveEdit = (taskId) => {
    if (!editTaskText.trim() || readOnly) return;

    const updatedTasks = tasks.map((task) =>
      task.id === taskId
        ? stripAssigneeFields({ ...task, text: editTaskText.trim() })
        : stripAssigneeFields(task)
    );

    onUpdate(updatedTasks);
    setEditingTaskId(null);
  };

  const handleOpenUnifiedModal = (task, event) => {
    if (readOnly || task.completed) return;

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const modalWidth = 340;
    const isInAddCardModal =
      event.currentTarget.closest('[class*="max-w-3xl"]') !== null ||
      event.currentTarget.closest(".fixed") !== null ||
      event.currentTarget.closest('[role="dialog"]') !== null;

    const { top: topOffset, right: rightOffset } =
      positioningConfig.offsetAdjustment;

    let top;
    let left;

    if (isInAddCardModal) {
      top = buttonRect.bottom + 2 + topOffset;
      left = buttonRect.left - rightOffset;

      if (buttonRect.right + modalWidth + 20 < viewportWidth) {
        left = buttonRect.right + 12;
        top = buttonRect.top - 20;
      }
    } else {
      top = buttonRect.bottom + 8;
      left = buttonRect.right - modalWidth + rightOffset;
    }

    if (left + modalWidth > viewportWidth - 20) {
      left = viewportWidth - modalWidth - 20;
    }
    if (left < 20) left = 20;

    setUnifiedModalCoordinates({ top, left });
    setCurrentEditTask(stripAssigneeFields(task));
    setShowUnifiedModal(true);
  };

  const handleUnifiedTaskUpdate = async (updatedTask) => {
    if (readOnly) return;

    const updatedTasks = tasks.map((task) =>
      task.id === updatedTask.id
        ? stripAssigneeFields(updatedTask)
        : stripAssigneeFields(task)
    );

    onUpdate(updatedTasks, false);
  };

  return (
    <div className="space-y-2">
      {showAddInput && (
        <EnhancedTaskCreationForm
          onAddTask={handleEnhancedAddTask}
          disabled={readOnly}
          onUnsavedTextChange={onUnsavedTextChange}
          shouldBounceSaveAll={shouldBounceSaveAll}
        />
      )}

      <ul className="space-y-2" ref={taskListRef}>
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`flex items-start justify-between p-2 rounded-lg group ${
              task.completed
                ? "bg-gray-50 dark:bg-gray-700/40 midnight:bg-indigo-700/20 text-gray-500 dark:text-red-700 midnight:text-gray-800"
                : "bg-gray-50 dark:bg-gray-700 midnight:bg-indigo-800/60"
            }`}
          >
            <div className="flex items-start flex-1 text-gray-900 dark:text-gray-300 midnight:text-indigo-400">
              <button
                type="button"
                onClick={() => handleToggleTask(task.id)}
                disabled={readOnly || disableCompletion || editingTaskId === task.id}
                className={`flex-shrink-0 w-5 h-5 rounded-sm border mr-2 mt-0.5 ${
                  task.completed
                    ? "bg-gray-600 dark:bg-gray-900 midnight:bg-indigo-600 border-gray-500 dark:border-gray-800 midnight:border-indigo-700 text-white dark:text-gray-200 midnight:text-indigo-100"
                    : disableCompletion
                    ? "border-gray-300 dark:border-gray-500 midnight:border-gray-600 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 cursor-not-allowed opacity-50"
                    : "border-gray-300 dark:border-gray-500 midnight:border-gray-600 bg-white dark:bg-gray-800 midnight:bg-gray-900"
                } transition-colors flex items-center justify-center`}
                title={
                  disableCompletion
                    ? "Subtasks cannot be completed during card creation"
                    : ""
                }
              >
                {task.completed && (
                  <Check className="w-4 h-4 text-green-500 dark:text-green-400 midnight:text-green-400" />
                )}
                {!task.completed && disableCompletion && (
                  <div className="w-3 h-1 bg-blue-500 dark:bg-blue-400 midnight:bg-blue-400 rounded-sm"></div>
                )}
              </button>

              <div className="flex-1 min-w-0">
                {editingTaskId === task.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTaskText}
                    onChange={(e) => setEditTaskText(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, task)}
                    onBlur={() => handleSaveEdit(task.id)}
                    className="w-full bg-transparent border-none focus:outline-none text-sm text-gray-800 dark:text-white midnight:text-indigo-100"
                    autoFocus
                  />
                ) : (
                  <div
                    onClick={() => {
                      if (!readOnly && !task.completed) {
                        setEditingTaskId(task.id);
                        setEditTaskText(task.text);
                      }
                    }}
                    className={`w-full text-left ${
                      !readOnly && !task.completed ? "cursor-pointer" : ""
                    }`}
                    title={
                      task.completed ? "Cannot edit completed subtasks" : ""
                    }
                  >
                    <CollapsibleTaskText
                      text={task.text}
                      maxLength={100}
                      className={task.completed ? "line-through" : ""}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {!readOnly && editingTaskId !== task.id && (
                <>
                  <button
                    type="button"
                    onClick={(e) =>
                      !task.completed && handleOpenUnifiedModal(task, e)
                    }
                    disabled={task.completed}
                    className={`p-1 rounded-full transition-colors ${
                      task.completed
                        ? "text-gray-300 dark:text-gray-600 midnight:text-gray-600 cursor-not-allowed"
                        : "text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
                    }`}
                    title={
                      task.completed
                        ? "Cannot edit completed subtasks"
                        : "Edit subtask"
                    }
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-1 rounded-full transition-colors text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-red-600 dark:hover:text-red-400 midnight:hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
                    title="Delete subtask"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {task.duration && task.duration > 0 && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={(e) =>
                    !task.completed && handleOpenUnifiedModal(task, e)
                  }
                  disabled={readOnly || task.completed}
                  className={`text-xs rounded px-1 py-0.5 transition-colors ${
                    task.completed
                      ? "text-gray-400 dark:text-gray-600 midnight:text-gray-600 cursor-not-allowed"
                      : "text-blue-600 dark:text-blue-400 midnight:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/10"
                  } disabled:cursor-not-allowed`}
                  title={
                    task.completed
                      ? "Cannot edit duration of completed subtasks"
                      : ""
                  }
                >
                  <DurationDisplay duration={task.duration} />
                </button>
              </div>
            )}

            {showUnifiedModal &&
              currentEditTask &&
              currentEditTask.id === task.id &&
              createPortal(
                <UnifiedSubtaskEditModal
                  task={currentEditTask}
                  onUpdate={handleUnifiedTaskUpdate}
                  onClose={() => {
                    setShowUnifiedModal(false);
                    setCurrentEditTask(null);
                  }}
                  coordinates={unifiedModalCoordinates}
                />,
                document.body
              )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TaskChecklist;

TaskChecklist.propTypes = {
  tasks: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      text: PropTypes.string,
      completed: PropTypes.bool,
      duration: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    })
  ),
  onUpdate: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
  showAddInput: PropTypes.bool,
  onUnsavedTextChange: PropTypes.func,
  shouldBounceSaveAll: PropTypes.bool,
  disableCompletion: PropTypes.bool,
  positioningConfig: PropTypes.shape({
    preferredPosition: PropTypes.string,
    modalSelector: PropTypes.string,
    forcePosition: PropTypes.bool,
    offsetAdjustment: PropTypes.shape({
      top: PropTypes.number,
      right: PropTypes.number,
    }),
    avoidElements: PropTypes.array,
  }),
};
