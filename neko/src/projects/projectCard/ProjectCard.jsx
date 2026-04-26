import { CheckCircle, Star, Calendar } from 'lucide-react';

const soraFontBase = "font-sora";

const ProjectCard = ({
  project,
  isSelected,
  onOpenDetail,
}) => {
  if (!project) {
    return (
      <div className={`bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 border rounded-2xl p-6
        border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 flex items-center justify-center ${soraFontBase}`}>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-slate-400">Project data unavailable</p>
      </div>
    );
  }

  const {
    name,
    description,
    due_date,
    starred,
    created_at,
    updated_at,
    emoji = '📁'
  } = project;

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div
      className={`relative bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 border rounded-2xl p-6
        transition-all duration-200 hover:shadow-sm cursor-pointer
        border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-500 ${soraFontBase}`}
      onClick={() => onOpenDetail(project)}
    >
      <div className="space-y-4">
        <div className="flex items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              {isSelected && (
                <CheckCircle className="w-4 h-4 text-gray-900 dark:text-white midnight:text-slate-100" />
              )}
              {starred && (
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              )}
              <span className="text-lg mr-2 flex-shrink-0" role="img" aria-label="Project icon">
                {emoji}
              </span>
              <h3 className="font-medium text-lg text-gray-900 dark:text-white midnight:text-slate-100">{name || 'Untitled Project'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 mt-1.5 line-clamp-2">
              {description || 'No description provided'}
            </p>
          </div>
        </div>

        {due_date && (
          <div className="flex items-center space-x-1.5 text-sm text-gray-600 dark:text-gray-400 midnight:text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(due_date)}</span>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30">
          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
            {updated_at && updated_at !== created_at
              ? `Updated ${formatDate(updated_at)}`
              : created_at ? `Created ${formatDate(created_at)}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
