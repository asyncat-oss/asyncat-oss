import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { projectApi } from "../projectApi";
import eventBus from "../../utils/eventBus.js";

const popularEmojis = ["📁", "🚀", "💡", "⚡", "🎯", "📊", "🔧", "🎨", "📱", "💻", "🌟", "🔥", "⭐", "🎉", "🏆", "💎", "📈", "🎮", "🎵", "📚", "🔬", "🏠", "🌱", "⚽", "🍕", "☕", "🎪", "🎭", "🔮", "🎲"];

const initialProjectState = {
  name: "",
  description: "",
  due_date: "",
  emoji: "📁",
};

const ProjectEditModal = ({ project, onClose, onDeleted }) => {
  const [editedProject, setEditedProject] = useState(initialProjectState);
  const [hasDueDate, setHasDueDate] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!project) return;

    setEditedProject({
      name: project.name || "",
      description: project.description || "",
      due_date: project.due_date ? project.due_date.split("T")[0] : "",
      emoji: project.emoji || "📁",
    });
    setHasDueDate(Boolean(project.due_date));
    setPendingDelete(false);
  }, [project]);

  if (!project) return null;

  const updateField = (field, value) => {
    setEditedProject(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await projectApi.updateProject(project.id, {
        name: editedProject.name,
        description: editedProject.description,
        emoji: editedProject.emoji,
        due_date: hasDueDate && editedProject.due_date ? editedProject.due_date : null,
      });
      eventBus.emit("projectsUpdated");
      onClose();
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }

    try {
      await projectApi.deleteProject(project.id);
      eventBus.emit("projectsUpdated");
      onDeleted?.(project);
      onClose();
    } catch (err) {
      console.error("Failed to delete project:", err);
      setPendingDelete(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Project</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  className="w-12 h-12 flex items-center justify-center text-2xl border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {editedProject.emoji}
                </button>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                    <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 w-64">
                      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                        {popularEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              updateField("emoji", emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-9 h-9 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <input
                type="text"
                value={editedProject.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Project name"
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl py-3 px-4 text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
            <textarea
              value={editedProject.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              placeholder="Describe your project..."
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl py-3 px-4 text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDueDate}
                  onChange={(e) => {
                    setHasDueDate(e.target.checked);
                    if (!e.target.checked) updateField("due_date", "");
                  }}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Enable</span>
              </label>
            </div>
            {hasDueDate && (
              <input
                type="date"
                value={editedProject.due_date}
                onChange={(e) => updateField("due_date", e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl py-3 px-4 text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {pendingDelete && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">Are you sure you want to delete this project?</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg">Yes, Delete</button>
                <button onClick={() => setPendingDelete(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-950">
          {!pendingDelete && (
            <button onClick={() => setPendingDelete(true)} className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-5 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {isSaving ? "Saving..." : <><Check className="w-4 h-4" /> Save</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditModal;
