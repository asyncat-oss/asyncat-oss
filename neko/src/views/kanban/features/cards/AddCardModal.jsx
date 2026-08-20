import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X, Play, Loader2, Bot, Check } from 'lucide-react';
import { profilesApi, agentTaskRunsApi } from '../../../../CommandCenter/api';
import { cardAPI } from '../../../viewsApi';
import Portal from '../../../../components/Portal';

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

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

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

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/35 dark:bg-black/60"
        onClick={e => e.target === e.currentTarget && !submitting && onClose()}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-950" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div>
            <h2 id="new-task-title" className="text-base font-semibold text-gray-900 dark:text-white">Create task</h2>
            <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">Choose an agent and describe one clear outcome.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {/* Profile picker */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Agent</p>
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
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
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
                      {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-gray-300" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goal */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Task goal</p>
            <textarea
              autoFocus
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => e.key === ' ' && e.stopPropagation()}
              rows={4}
              placeholder="Describe what the agent should do…"
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-gray-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5 dark:border-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Added to <span className="font-medium">{column?.title || 'Queue'}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {submitting ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </Portal>
  );
};

NewTaskModal.propTypes = {
  column: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};

export default NewTaskModal;
