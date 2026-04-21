// Settings/GeneralSection.jsx — unified profile + workspace settings
import React, { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { profileApi, workspaceApi, apiUtils } from './settingApi';
import eventBus from '../utils/eventBus.js';

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

// ── tiny helpers ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 ' +
  'bg-white dark:bg-gray-800 midnight:bg-gray-800 ' +
  'text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 ' +
  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500';

const readCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-700/40 ' +
  'bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 ' +
  'text-gray-400 dark:text-gray-500 midnight:text-gray-500 text-sm cursor-default select-none';

// Inline status badge
const StatusBadge = ({ msg }) => {
  if (!msg) return null;
  const colors =
    msg.type === 'success'
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';
  return <span className={`text-xs font-medium ${colors}`}>{msg.text}</span>;
};

// Section header row
const SectionHeader = ({ title, children }) => (
  <div className="flex items-center justify-between mb-5">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-gray-500">
      {title}
    </h3>
    {children}
  </div>
);

// Save button
const SaveBtn = ({ loading, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    className="px-3 py-1 rounded-md text-xs font-medium
      bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-white
      midnight:bg-gray-100 midnight:hover:bg-white
      text-white dark:text-gray-900 midnight:text-gray-900
      disabled:opacity-40 disabled:cursor-not-allowed
      transition-colors flex items-center gap-1.5"
  >
    {loading ? <Loader2 size={11} className="animate-spin" /> : null}
    Save
  </button>
);

// ── main component ───────────────────────────────────────────────────────────

const GeneralSection = ({
  session,
  workspace,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  onWorkspaceLeft,
}) => {
  // ── profile state ──
  const [userData,       setUserData]       = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileMsg,     setProfileMsg]     = useState(null);
  const [name,           setName]           = useState('');
  const [email,          setEmail]          = useState('');
  const [avatar,         setAvatar]         = useState('CAT');
  const [showPicker,     setShowPicker]     = useState(false);

  // ── workspace state ──
  const [wsName,    setWsName]    = useState('');
  const [wsDesc,    setWsDesc]    = useState('');
  const [wsEmoji,   setWsEmoji]   = useState('👥');
  const [wsSaving,  setWsSaving]  = useState(false);
  const [wsMsg,     setWsMsg]     = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);

  // ── danger zone state ──
  const [pendingDelete, setPendingDelete] = useState(false);
  const [forceDelete,   setForceDelete]   = useState(false);
  const [hasProjects,   setHasProjects]   = useState(false);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerMsg,     setDangerMsg]     = useState(null);

  // load profile
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

  // sync workspace props → local state
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

  // ── profile save ──
  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const updates = {};
      if (name.trim() !== (userData?.name || '')) updates.name = name.trim();
      if (avatar !== userData?.profile_picture)    updates.profile_picture = avatar;
      if (!Object.keys(updates).length) {
        flash(setProfileMsg, { type: 'success', text: 'Already up to date' });
        return;
      }
      const res = await profileApi.updateProfile(updates);
      if (!res.success) throw new Error(res.error);
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: avatar, name: name.trim() });
      flash(setProfileMsg, { type: 'success', text: 'Profile saved' });
    } catch (err) {
      flash(setProfileMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to save') });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── workspace save ──
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
      flash(setWsMsg, { type: 'success', text: 'Workspace saved' });
    } catch (err) {
      flash(setWsMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to save') });
    } finally {
      setWsSaving(false);
    }
  };

  // ── workspace delete ──
  const handleDelete = async () => {
    setDangerLoading(true);
    try {
      await workspaceApi.deleteWorkspace(workspace.id, forceDelete);
      onWorkspaceDeleted?.(workspace);
    } catch (err) {
      const msg = apiUtils.handleError(err, 'Failed to delete');
      if (err.message?.includes('hasAssociatedResources') || msg.includes('associated projects')) {
        setHasProjects(true);
        flash(setDangerMsg, { type: 'error', text: 'This workspace has projects. Check the box to delete anyway.' }, 5000);
      } else {
        flash(setDangerMsg, { type: 'error', text: msg }, 4000);
      }
    } finally {
      setDangerLoading(false);
    }
  };

  const currentAvatar = AVATARS.find(a => a.id === avatar) || AVATARS[0];
  const isOwner = session?.user && workspace &&
    String(session.user.id) === String(workspace?.owner_id);
  const hasWorkspace = !!workspace;

  // ── loading skeleton ──
  if (profileLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[28, 20, 20].map((w, i) => (
          <div key={i} className={`h-4 rounded bg-gray-100 dark:bg-gray-800 w-${w}/32`} />
        ))}
      </div>
    );
  }

  return (
    <div className="font-sora space-y-0 divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-gray-800">

      {/* ── Profile ─────────────────────────────────────────────── */}
      <section className="py-6 first:pt-0">
        <SectionHeader title="Profile">
          <div className="flex items-center gap-3">
            <StatusBadge msg={profileMsg} />
            <SaveBtn loading={profileSaving} onClick={saveProfile} />
          </div>
        </SectionHeader>

        <div className="flex flex-col sm:flex-row gap-8">
          {/* avatar col */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 p-0.5 ring-2 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700">
              <img
                src={currentAvatar.src}
                alt={currentAvatar.name}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Change
              {showPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showPicker && (
              <div className="grid grid-cols-5 gap-1.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-800 shadow-sm">
                {AVATARS.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAvatar(a.id); setShowPicker(false); }}
                    title={a.name}
                    className={`relative w-9 h-9 rounded-lg overflow-hidden border-2 transition-all
                      ${avatar === a.id
                        ? 'border-gray-900 dark:border-white midnight:border-gray-100 scale-105'
                        : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <img src={a.src} alt={a.name} className="w-full h-full object-cover" />
                    {avatar === a.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* fields col */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                Full Name
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
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                Email
              </label>
              <div className={readCls}>{email}</div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Email cannot be changed in the local build
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workspace ──────────────────────────────────────────── */}
      {hasWorkspace && (
        <section className="py-6">
          <SectionHeader title="Workspace">
            <div className="flex items-center gap-3">
              <StatusBadge msg={wsMsg} />
              {isOwner && <SaveBtn loading={wsSaving} onClick={saveWorkspace} />}
            </div>
          </SectionHeader>

          <div className="flex flex-col sm:flex-row gap-8">
            {/* emoji col */}
            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex items-center justify-center text-4xl ring-2 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700">
                {wsEmoji}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setShowEmoji(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Change
                  {showEmoji ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}

              {showEmoji && isOwner && (
                <div className="grid grid-cols-5 gap-1 p-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-800 shadow-sm">
                  {WORKSPACE_EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { setWsEmoji(e); setShowEmoji(false); }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition-colors
                        ${wsEmoji === e
                          ? 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 ring-1 ring-gray-400 dark:ring-gray-500'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* fields col */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                  Name
                </label>
                {workspace.is_personal ? (
                  <div className={readCls}>Personal Workspace</div>
                ) : (
                  <input
                    type="text"
                    value={wsName}
                    onChange={e => isOwner && setWsName(e.target.value)}
                    placeholder="Workspace name"
                    disabled={!isOwner}
                    className={isOwner ? inputCls : readCls}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={wsDesc}
                  onChange={e => isOwner && setWsDesc(e.target.value)}
                  placeholder={isOwner ? 'What is this workspace for?' : ''}
                  disabled={!isOwner}
                  rows={3}
                  className={`${isOwner ? inputCls : readCls} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* ── Danger zone ──────────────────────────────────── */}
          {!workspace.is_personal && (
            <div className="mt-8 pt-5 border-t border-red-100 dark:border-red-900/30 midnight:border-red-900/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 dark:text-red-500 mb-3">
                Danger Zone
              </p>

              {dangerMsg && (
                <p className={`text-xs mb-3 ${dangerMsg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                  {dangerMsg.text}
                </p>
              )}

              {isOwner ? (
                /* delete */
                <div className="space-y-3">
                  {hasProjects && (
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={forceDelete}
                        onChange={e => setForceDelete(e.target.checked)}
                        className="accent-red-500"
                      />
                      I understand this will delete all associated projects
                    </label>
                  )}
                  {!pendingDelete ? (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(true)}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                      Delete Workspace
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        This cannot be undone. Continue?
                      </span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={dangerLoading || (hasProjects && !forceDelete)}
                        className="px-3 py-1 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                      >
                        {dangerLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingDelete(false); setForceDelete(false); setHasProjects(false); }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default GeneralSection;
