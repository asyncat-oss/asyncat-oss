// CreateProjectFlow.jsx - Clean project creation flow without templates
import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Plus
} from "lucide-react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import eventBus from "../../utils/eventBus.js";

import { projectApi } from "../projectApi";

const today = new Date().toISOString().split("T")[0];

const CreateProjectFlow = ({ isOpen, onClose, onProjectCreate, session }) => {
  const [projectData, setProjectData] = useState({
    name: "",
    description: "",
    due_date: ""
  });
  const [enableDueDate, setEnableDueDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { currentWorkspace } = useWorkspace();

  const resetState = () => {
    setEnableDueDate(false);
    setProjectData({ name: "", description: "", due_date: "" });
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) resetState();
  }, [isOpen]);

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!currentWorkspace?.id) {
        setError("No workspace selected. Please select a workspace first.");
        return;
      }

      const formattedData = {
        name: projectData.name,
        description: projectData.description,
        due_date: projectData.due_date ? new Date(projectData.due_date).toISOString() : null,
        team_id: currentWorkspace.id
      };

      const result = await projectApi.createProject(formattedData);

      if (result && result.data) {
        const projectWithRole = {
          ...result.data,
          user_role: 'owner',
          owner_id: session?.user?.id || result.data.owner_id
        };

        eventBus.emit('projectsUpdated');
        onProjectCreate(projectWithRole);
        onClose();
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getWorkspaceName = () => {
    if (!currentWorkspace) return "No workspace";
    return currentWorkspace.is_personal ? "Personal Workspace" : currentWorkspace.name;
  };

  const canCreate = () => projectData.name.trim() && projectData.description.trim();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 z-[100] overflow-auto">
      <div className="sticky top-0 bg-white/80 dark:bg-gray-900/80 midnight:bg-gray-950/80 backdrop-blur-sm z-10">
        <div className="flex items-center justify-end p-6">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">Create Project</h2>
            <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
              Creating in {getWorkspaceName()}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-900 rounded-xl">
              <p className="text-red-600 dark:text-red-400 midnight:text-red-400 text-center">{error}</p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-8 shadow-sm space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">
                Project Name
              </label>
              <input
                type="text"
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                placeholder="Give your project a name"
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none text-lg font-medium"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">
                Description
              </label>
              <textarea
                value={projectData.description}
                onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                placeholder="What do you want to accomplish?"
                rows={4}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none resize-none"
              />
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100">Set a deadline</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mt-1">
                    {enableDueDate ? "Great! Your future self will thank you" : "Live dangerously without a deadline"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEnableDueDate(!enableDueDate);
                    if (!enableDueDate) setProjectData({ ...projectData, due_date: "" });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    enableDueDate ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      enableDueDate ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {enableDueDate && (
                <input
                  type="date"
                  min={today}
                  value={projectData.due_date}
                  onChange={(e) => setProjectData({ ...projectData, due_date: e.target.value })}
                  className="w-full mt-4 px-4 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white/80 dark:bg-gray-900/80 midnight:bg-gray-950/80 backdrop-blur-sm">
        <div className="flex justify-end p-6">
          <button
            onClick={handleCreate}
            disabled={!canCreate() || loading}
            className="px-8 py-3 bg-gray-900 dark:bg-white midnight:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-800 rounded-xl hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Create Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectFlow;