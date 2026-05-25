import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Loader2, Bot } from 'lucide-react';
import { profilesApi, agentTaskRunsApi } from '../../../../CommandCenter/api';
import { cardAPI } from '../../../viewsApi';

const PROFILE_COLOR_MAP = {
  indigo:  'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  blue:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  violet:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  amber:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  rose:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  cyan:    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  gray:    'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

function profileColorClass(color) {
  return PROFILE_COLOR_MAP[color] || PROFILE_COLOR_MAP.gray;
}

const NewTaskModal = ({ column, onClose, onSuccess }) => {
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    profilesApi.listProfiles()
      .then(result => {
        const list = result.profiles || [];
        setProfiles(list);
        if (list.length > 0) setSelectedProfileId(list[0].id);
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoadingProfiles(false));
  }, []);

  const handleSubmit = async () => {
    if (!goal.trim() || !selectedProfileId || !column?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const title = goal.split('\n')[0].slice(0, 200) || 'Untitled task';
      const card = await cardAPI.create({
        title,
        description: goal,
        columnId: column.id,
        priority: 'Medium',
        checklist: [],
        progress: 0,
        tasks: { completed: 0, total: 0 },
      });
      await agentTaskRunsApi.create({
        cardId: card.id,
        profileId: selectedProfileId,
        goal,
      });
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to dispatch task');
      setSubmitting(false);
    }
  };

  const canSubmit = goal.trim() && selectedProfileId && !submitting;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
        onClick={e => e.target === e.currentTarget && onClose()}
      />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">New Agent Task</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Profile picker */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Choose Agent</p>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading agents…
              </div>
            ) : profiles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Bot className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No agent profiles found.</p>
                <p className="text-xs text-gray-400">Create a profile in the Agents section first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {profiles.map(profile => {
                  const colorCls = profileColorClass(profile.color);
                  const selected = selectedProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedProfileId(profile.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-indigo-400/50 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm'
                          : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/80'
                      }`}
                    >
                      <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm flex-shrink-0 ${colorCls}`}>
                        {profile.icon || '🤖'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{profile.name}</p>
                        {profile.soul && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">{profile.soul}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goal */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Task Goal</p>
            <textarea
              autoFocus
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => e.key === ' ' && e.stopPropagation()}
              rows={4}
              placeholder="Describe what the agent should do…"
              disabled={submitting}
              className="w-full px-3.5 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-800/40 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-white/10">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Backed by <span className="font-medium">{column?.title || 'Queue'}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {submitting ? 'Dispatching…' : 'Dispatch'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NewTaskModal;
