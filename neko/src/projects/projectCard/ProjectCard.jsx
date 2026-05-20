import { useState } from "react";
import { CheckCircle, Pencil } from "lucide-react";
import ProjectEditModal from "../components/ProjectEditModal";

const ProjectCard = ({ project, isSelected, onOpenDetail }) => {
  const [showEditModal, setShowEditModal] = useState(false);

  if (!project) return null;

  const { name, description, created_at, updated_at, emoji = "📁" } = project;

  const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const dateLabel = updated_at && updated_at !== created_at
    ? `Updated ${formatDate(updated_at)}`
    : created_at
    ? `Created ${formatDate(created_at)}`
    : null;

  return (
    <>
      {showEditModal && (
        <ProjectEditModal project={project} onClose={() => setShowEditModal(false)} />
      )}

      <div
        className={`relative group bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 border rounded-2xl p-6
          transition-all duration-200 hover:shadow-sm cursor-pointer
          ${isSelected
            ? "border-gray-400 dark:border-gray-500 midnight:border-slate-500 ring-1 ring-gray-300 dark:ring-gray-600"
            : "border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-500"
          }`}
        onClick={() => onOpenDetail(project)}
      >
        {/* Edit button */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setShowEditModal(true); }}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Title row */}
          <div className="flex items-center gap-2 pr-6">
            <span className="text-xl flex-shrink-0" role="img" aria-label="Project icon">{emoji}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {isSelected && <CheckCircle className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" />}
              <h3 className="font-semibold text-gray-900 dark:text-white midnight:text-slate-100 truncate">
                {name || "Untitled Project"}
              </h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 line-clamp-2 leading-relaxed">
            {description || "No description"}
          </p>

          {/* Footer */}
          {dateLabel && (
            <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {dateLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProjectCard;
