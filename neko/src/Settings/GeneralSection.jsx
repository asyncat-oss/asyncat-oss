// Settings/GeneralSection.jsx — unified profile + workspace settings
import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { profileApi, workspaceApi, apiUtils } from './settingApi';
import eventBus from '../utils/eventBus.js';
import Portal from '../components/Portal';

import catDP      from '../assets/dp/CAT.webp';
import dogDP      from '../assets/dp/DOG.webp';
import dolphinDP  from '../assets/dp/DOLPHIN.webp';
import dragonDP   from '../assets/dp/DRAGON.webp';
import elephantDP from '../assets/dp/ELEPHANT.webp';
import foxDP      from '../assets/dp/FOX.webp';
import lionDP     from '../assets/dp/LION.webp';
import owlDP      from '../assets/dp/OWL.webp';
import penguinDP  from '../assets/dp/PENGUIN.webp';
import wolfDP     from '../assets/dp/WOLF.webp';

const AVATARS = [
  { id: 'CAT',      src: catDP,      name: 'Cat'      },
  { id: 'DOG',      src: dogDP,      name: 'Dog'      },
  { id: 'DOLPHIN',  src: dolphinDP,  name: 'Dolphin'  },
  { id: 'DRAGON',   src: dragonDP,   name: 'Dragon'   },
  { id: 'ELEPHANT', src: elephantDP, name: 'Elephant' },
  { id: 'FOX',      src: foxDP,      name: 'Fox'      },
  { id: 'LION',     src: lionDP,     name: 'Lion'     },
  { id: 'OWL',      src: owlDP,      name: 'Owl'      },
  { id: 'PENGUIN',  src: penguinDP,  name: 'Penguin'  },
  { id: 'WOLF',     src: wolfDP,     name: 'Wolf'     },
];

const WORKSPACE_EMOJIS = [
  '👥','🚀','💼','⚡','🎯','🔥','💡','🏆','🌟','🎨',
  '🔧','📈','💻','🎮','🏢','🌊','📝','🎵','🏃','🌿',
];

const MAX_NAME = 50;

const inputCls =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 ' +
  'bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 dark:focus:border-indigo-500 ' +
  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500';

const readCls =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200/70 dark:border-gray-700/50 midnight:border-gray-700/50 ' +
  'bg-gray-50/80 dark:bg-gray-800/50 midnight:bg-gray-900/60 text-gray-500 dark:text-gray-400 midnight:text-gray-500 ' +
  'text-sm cursor-default select-none';

const fieldLabelCls =
  'block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1.5';

const PrimaryButton = ({ loading, onClick, disabled, children = 'Save changes' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
      bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white
      midnight:bg-gray-100 midnight:hover:bg-white text-white dark:text-gray-900 midnight:text-gray-900
      disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
  >
    {loading ? <Loader2 size={14} className="animate-spin" /> : null}
    {children}
  </button>
);

const Message = ({ msg }) => {
  if (!msg) return null;

  const tone = msg.type === 'success'
    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40 midnight:bg-green-900/20 midnight:text-green-300 midnight:border-green-800/40'
    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40 midnight:bg-red-900/20 midnight:text-red-300 midnight:border-red-800/40';

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${tone}`}>
      {msg.text}
    </div>
  );
};

const SectionPanel = ({ title, description, action, message, children }) => (
  <section className="rounded-xl border border-gray-200/80 dark:border-gray-800 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-3">
        <Message msg={message} />
      </div>
    </div>
    <div className="p-5">
      {children}
    </div>
  </section>
);

const DeleteWorkspaceDialog = ({
  workspaceName,
  dangerLoading,
  dangerMsg,
  forceDelete,
  hasProjects,
  onCancel,
  onConfirm,
  onForceChange,
}) => (
  <Portal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close delete workspace confirmation"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={dangerLoading ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-red-100 dark:border-red-900/30 midnight:border-red-900/30 bg-red-50/70 dark:bg-red-900/10 midnight:bg-red-950/20">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 midnight:bg-red-900/40">
            <AlertTriangle size={19} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
              Delete workspace?
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400">
              This permanently deletes <span className="font-semibold text-gray-900 dark:text-gray-200 midnight:text-slate-200">{workspaceName}</span> and cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={dangerLoading}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-100/70 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {(dangerMsg || hasProjects) && (
          <div className="px-6 py-5 space-y-4">
            <Message msg={dangerMsg} />
            {hasProjects && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 midnight:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200 midnight:text-amber-200">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={e => onForceChange(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-red-600"
                />
                <span>I understand this will delete all associated projects.</span>
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={dangerLoading}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={dangerLoading || (hasProjects && !forceDelete)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {dangerLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete workspace
          </button>
        </div>
      </div>
    </div>
  </Portal>
);

const messageShape = PropTypes.shape({
  type: PropTypes.oneOf(['success', 'error']),
  text: PropTypes.string,
});

const workspaceShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  description: PropTypes.string,
  emoji: PropTypes.string,
  owner_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  is_personal: PropTypes.bool,
});

const sessionShape = PropTypes.shape({
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
});

PrimaryButton.propTypes = {
  loading: PropTypes.bool,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  children: PropTypes.node,
};

Message.propTypes = {
  msg: messageShape,
};

SectionPanel.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  action: PropTypes.node,
  message: messageShape,
  children: PropTypes.node,
};

DeleteWorkspaceDialog.propTypes = {
  workspaceName: PropTypes.string,
  dangerLoading: PropTypes.bool,
  dangerMsg: messageShape,
  forceDelete: PropTypes.bool,
  hasProjects: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
  onForceChange: PropTypes.func,
};

const GeneralSection = ({
  session,
  workspace,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
}) => {
  const [userData,       setUserData]       = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileMsg,     setProfileMsg]     = useState(null);
  const [name,           setName]           = useState('');
  const [email,          setEmail]          = useState('');
  const [avatar,         setAvatar]         = useState('CAT');
  const [showPicker,     setShowPicker]     = useState(false);

  const [wsName,    setWsName]    = useState('');
  const [wsDesc,    setWsDesc]    = useState('');
  const [wsEmoji,   setWsEmoji]   = useState('👥');
  const [wsSaving,  setWsSaving]  = useState(false);
  const [wsMsg,     setWsMsg]     = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [forceDelete,     setForceDelete]     = useState(false);
  const [hasProjects,     setHasProjects]     = useState(false);
  const [dangerLoading,   setDangerLoading]   = useState(false);
  const [dangerMsg,       setDangerMsg]       = useState(null);

  useEffect(() => {
    profileApi.fetchProfile()
      .then(data => {
        if (data.success && data.data) {
          const d = data.data;
          setUserData(d);
          setName(d.name || '');
          setEmail(d.email || '');
          setAvatar(AVATARS.some(a => a.id === d.profile_picture) ? d.profile_picture : 'CAT');
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    if (workspace) {
      setWsName(workspace.name || '');
      setWsDesc(workspace.description || '');
      setWsEmoji(workspace.emoji || '👥');
    }
  }, [workspace]);

  const flash = useCallback((setter, msg, ms = 2500) => {
    setter(msg);
    setTimeout(() => setter(null), ms);
  }, []);

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const updates = {};
      if (name.trim() !== (userData?.name || '')) updates.name = name.trim();
      if (avatar !== userData?.profile_picture) updates.profile_picture = avatar;
      if (!Object.keys(updates).length) {
        flash(setProfileMsg, { type: 'success', text: 'Profile is already up to date.' });
        return;
      }

      const res = await profileApi.updateProfile(updates);
      if (!res.success) throw new Error(res.error);
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: avatar, name: name.trim() });
      flash(setProfileMsg, { type: 'success', text: 'Profile saved.' });
    } catch (err) {
      flash(setProfileMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to save profile') });
    } finally {
      setProfileSaving(false);
    }
  };

  const saveWorkspace = async () => {
    if (!workspace?.id) return;
    setWsSaving(true);
    try {
      await workspaceApi.updateWorkspace(workspace.id, {
        name: workspace.is_personal ? workspace.name : wsName,
        description: wsDesc,
        emoji: wsEmoji,
      });
      await onWorkspaceUpdated?.();
      flash(setWsMsg, { type: 'success', text: 'Workspace saved.' });
    } catch (err) {
      flash(setWsMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to save workspace') });
    } finally {
      setWsSaving(false);
    }
  };

  const resetDeleteState = () => {
    setShowDeleteModal(false);
    setForceDelete(false);
    setHasProjects(false);
    setDangerMsg(null);
  };

  const handleDelete = async () => {
    setDangerLoading(true);
    try {
      await workspaceApi.deleteWorkspace(workspace.id, forceDelete);
      onWorkspaceDeleted?.(workspace);
    } catch (err) {
      const msg = apiUtils.handleError(err, 'Failed to delete workspace');
      if (err.message?.includes('hasAssociatedResources') || msg.includes('associated projects')) {
        setHasProjects(true);
        setDangerMsg({ type: 'error', text: 'This workspace still has projects. Confirm that they should be deleted too.' });
      } else {
        setDangerMsg({ type: 'error', text: msg });
      }
    } finally {
      setDangerLoading(false);
    }
  };

  const currentAvatar = AVATARS.find(a => a.id === avatar) || AVATARS[0];
  const isOwner = session?.user && workspace &&
    String(session.user.id) === String(workspace?.owner_id);
  const hasWorkspace = !!workspace;
  const canEditWorkspace = hasWorkspace && isOwner;

  if (profileLoading) {
    return (
      <div className="font-sora space-y-4 animate-pulse">
        <div className="h-40 rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900" />
        <div className="h-48 rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900" />
      </div>
    );
  }

  return (
    <div className="font-sora space-y-5">
      <SectionPanel
        title="Profile"
        description="Your display name and avatar are shown across the local workspace."
        message={profileMsg}
        action={<PrimaryButton loading={profileSaving} onClick={saveProfile}>Save profile</PrimaryButton>}
      >
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <div className="h-20 w-20 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 p-1 ring-1 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700">
                <img
                  src={currentAvatar.src}
                  alt={currentAvatar.name}
                  className="h-full w-full rounded-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPicker(v => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
              >
                Change avatar
                {showPicker ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {showPicker && (
              <div className="mt-4 grid grid-cols-5 gap-2 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 midnight:bg-gray-900/60 p-3">
                {AVATARS.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAvatar(a.id); setShowPicker(false); }}
                    title={a.name}
                    className={`relative h-9 w-9 overflow-hidden rounded-lg border-2 transition-all
                      ${avatar === a.id
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                    {avatar === a.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Check size={12} className="text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div>
              <label className={fieldLabelCls}>
                Full name
                <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">
                  {name.length}/{MAX_NAME}
                </span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => e.target.value.length <= MAX_NAME && setName(e.target.value)}
                placeholder="Your name"
                className={inputCls}
              />
            </div>

            <div>
              <label className={fieldLabelCls}>Email</label>
              <div className={readCls}>{email}</div>
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500">
                Email cannot be changed in the local build.
              </p>
            </div>
          </div>
        </div>
      </SectionPanel>

      {hasWorkspace && (
        <SectionPanel
          title="Workspace"
          description={canEditWorkspace ? 'Keep the workspace identity recognizable for everyone using it.' : 'Workspace details are managed by the owner.'}
          message={wsMsg}
          action={canEditWorkspace ? <PrimaryButton loading={wsSaving} onClick={saveWorkspace}>Save workspace</PrimaryButton> : null}
        >
          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-4 lg:flex-col lg:items-start">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 text-4xl ring-1 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700">
                  {wsEmoji}
                </div>
                {canEditWorkspace && (
                  <button
                    type="button"
                    onClick={() => setShowEmoji(v => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
                  >
                    Change icon
                    {showEmoji ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
              </div>

              {showEmoji && canEditWorkspace && (
                <div className="mt-4 grid grid-cols-5 gap-2 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 midnight:bg-gray-900/60 p-3">
                  {WORKSPACE_EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { setWsEmoji(e); setShowEmoji(false); }}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors
                        ${wsEmoji === e
                          ? 'bg-white dark:bg-gray-700 midnight:bg-gray-800 ring-2 ring-indigo-500/30'
                          : 'hover:bg-white dark:hover:bg-gray-700 midnight:hover:bg-gray-800'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div>
                <label className={fieldLabelCls}>Name</label>
                {workspace.is_personal ? (
                  <div className={readCls}>Personal Workspace</div>
                ) : (
                  <input
                    type="text"
                    value={wsName}
                    onChange={e => canEditWorkspace && setWsName(e.target.value)}
                    placeholder="Workspace name"
                    disabled={!canEditWorkspace}
                    className={canEditWorkspace ? inputCls : readCls}
                  />
                )}
              </div>

              <div>
                <label className={fieldLabelCls}>Description</label>
                <textarea
                  value={wsDesc}
                  onChange={e => canEditWorkspace && setWsDesc(e.target.value)}
                  placeholder={canEditWorkspace ? 'What is this workspace for?' : ''}
                  disabled={!canEditWorkspace}
                  rows={4}
                  className={`${canEditWorkspace ? inputCls : readCls} resize-none`}
                />
              </div>
            </div>
          </div>

          {!workspace.is_personal && isOwner && (
            <div className="mt-6 rounded-xl border border-red-200/80 dark:border-red-900/40 midnight:border-red-900/40 bg-red-50/50 dark:bg-red-950/10 midnight:bg-red-950/20 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 midnight:text-red-300">
                    Delete workspace
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-red-600/80 dark:text-red-300/80 midnight:text-red-300/80">
                    Remove this workspace and its data permanently.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-800 midnight:border-red-800 bg-white dark:bg-red-950/30 midnight:bg-red-950/30 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-300 midnight:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 midnight:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 size={15} />
                  Delete workspace
                </button>
              </div>
            </div>
          )}
        </SectionPanel>
      )}

      {showDeleteModal && (
        <DeleteWorkspaceDialog
          workspaceName={workspace?.name || 'this workspace'}
          dangerLoading={dangerLoading}
          dangerMsg={dangerMsg}
          forceDelete={forceDelete}
          hasProjects={hasProjects}
          onCancel={resetDeleteState}
          onConfirm={handleDelete}
          onForceChange={setForceDelete}
        />
      )}
    </div>
  );
};

GeneralSection.propTypes = {
  session: sessionShape,
  workspace: workspaceShape,
  onWorkspaceUpdated: PropTypes.func,
  onWorkspaceDeleted: PropTypes.func,
};

export default GeneralSection;
