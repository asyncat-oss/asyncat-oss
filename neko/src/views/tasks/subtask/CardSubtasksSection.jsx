import { useMemo } from "react";
import { CheckSquare, Plus } from "lucide-react";
import TaskChecklist from "../../kanban/features/shared/components/TaskChecklist";

const CardSubtasksSection = ({
  checklist = [],
  tasks = { completed: 0, total: 0 },
  onChecklistUpdate,
  onUnsavedTextChange,
  shouldBounceSaveAll = false,
}) => {
  // Organize tasks by completion status
  const organizedTasks = useMemo(() => {
    const incomplete = checklist.filter((task) => !task.completed);
    const completed = checklist.filter((task) => task.completed);

    return { incomplete, completed };
  }, [checklist]);

  return (
    <div className="space-y-6 w-full">

      {checklist.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center">
            <CheckSquare className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            No subtasks yet. Break this down into smaller steps.
          </p>

          <div className="max-w-md mx-auto">
            <TaskChecklist
              tasks={[]}
              onUpdate={(newTasks, shouldImmediateSave = false) => {
                const allTasks = [...checklist, ...newTasks];
                onChecklistUpdate(allTasks, shouldImmediateSave);
              }}
              isCreating={true}
              enableEditing={true}
              showAddInput={true}
              onUnsavedTextChange={onUnsavedTextChange}
              shouldBounceSaveAll={shouldBounceSaveAll}
              positioningConfig={{
                preferredPosition: "bottom",
                forcePosition: false,
                offsetAdjustment: { top: 2, right: 0 },
              }}
            />
          </div>
        </div>
      ) : (
        <div className="w-full space-y-6">
          {/* Progress Overview */}
          {tasks.total > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-300">
                  {tasks.completed} of {tasks.total} completed
                </span>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-300">
                  {Math.round(
                    ((tasks.completed || 0) / (tasks.total || 1)) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 dark:bg-gray-500 midnight:bg-gray-400 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      ((tasks.completed || 0) / (tasks.total || 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Incomplete Tasks */}
          {organizedTasks.incomplete.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <h5 className="text-sm font-medium text-gray-900 dark:text-gray-400 midnight:text-gray-300">
                  To Do ({organizedTasks.incomplete.length})
                </h5>
              </div>
              <div className="space-y-2">
                <TaskChecklist
                  tasks={organizedTasks.incomplete}
                  onUpdate={(updatedTasks, shouldImmediateSave = false) => {
                    const allTasks = [
                      ...updatedTasks,
                      ...organizedTasks.completed,
                    ];
                    onChecklistUpdate(allTasks, shouldImmediateSave);
                  }}
                  enableEditing={true}
                  isCreating={false}
                  showAddInput={false}
                  enhancedCreation={false}
                  positioningConfig={{
                    preferredPosition: "bottom",
                    forcePosition: false,
                    offsetAdjustment: { top: 2, right: 0 },
                  }}
                />
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {organizedTasks.completed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <h5 className="text-sm font-medium text-gray-900 dark:text-gray-400 midnight:text-gray-300">
                  Completed ({organizedTasks.completed.length})
                </h5>
              </div>
              <div className="space-y-2">
                <TaskChecklist
                  tasks={organizedTasks.completed}
                  onUpdate={(updatedTasks, shouldImmediateSave = false) => {
                    const allTasks = [
                      ...organizedTasks.incomplete,
                      ...updatedTasks,
                    ];
                    onChecklistUpdate(allTasks, shouldImmediateSave);
                  }}
                  enableEditing={true}
                  isCreating={false}
                  showAddInput={false}
                  enhancedCreation={false}
                  positioningConfig={{
                    preferredPosition: "bottom",
                    forcePosition: false,
                    offsetAdjustment: { top: 2, right: 0 },
                  }}
                />
              </div>
            </div>
          )}

          {/* Add New Task */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-700">
            <div className="flex items-center space-x-2 mb-3">
              <Plus className="w-4 h-4 text-gray-400" />
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-400 midnight:text-gray-300">
                Add New Subtask
              </h5>
            </div>
            <TaskChecklist
              tasks={[]}
              onUpdate={(newTasks, shouldImmediateSave = false) => {
                const allTasks = [...checklist, ...newTasks];
                onChecklistUpdate(allTasks, shouldImmediateSave);
              }}
              isCreating={true}
              enableEditing={true}
              showAddInput={true}
              onUnsavedTextChange={onUnsavedTextChange}
              shouldBounceSaveAll={shouldBounceSaveAll}
              positioningConfig={{
                preferredPosition: "bottom",
                forcePosition: false,
                offsetAdjustment: { top: 2, right: 0 },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CardSubtasksSection;
