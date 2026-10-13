// Settings/GeneralSection.jsx — profile settings: display name and picture
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { profileApi, apiUtils } from './settingApi';
import eventBus from '../utils/eventBus.js';
import { AVATARS, isCustomImageUrl } from '../assets/dp/avatars.js';

const MAX_NAME = 50;

const inputCls =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 ' +
  'bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 dark:focus:border-indigo-500 ' +
  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500';


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

const GeneralSection = () => {
  const [userData,         setUserData]         = useState(null);
  const [profileLoading,   setProfileLoading]   = useState(true);
  const [profileSaving,    setProfileSaving]    = useState(false);
  const [profileMsg,       setProfileMsg]       = useState(null);
  const [name,             setName]             = useState('');
  const [avatar,           setAvatar]           = useState('CAT');
  const [showPicker,       setShowPicker]       = useState(false);
  const [customImageUrl,   setCustomImageUrl]   = useState(null);
  const [imageUploading,   setImageUploading]   = useState(false);
  const [imageRemoving,    setImageRemoving]    = useState(false);
  const [isDragOver,       setIsDragOver]       = useState(false);
  const fileInputRef = useRef(null);

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_BYTES = 5 * 1024 * 1024;

  const validateImageFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Only JPEG, PNG, WebP, or GIF images are allowed.';
    }
    if (file.size > MAX_BYTES) {
      return `Image must be under 5 MB (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
    }
    return null;
  };

  useEffect(() => {
    profileApi.fetchProfile()
      .then(data => {
        if (data.success && data.data) {
          const d = data.data;
          setUserData(d);
          setName(d.name || '');
          if (isCustomImageUrl(d.profile_picture)) {
            setCustomImageUrl(d.profile_picture);
            setAvatar(null);
          } else {
            setCustomImageUrl(null);
            setAvatar(AVATARS.some(a => a.id === d.profile_picture) ? d.profile_picture : 'CAT');
          }
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  const flash = useCallback((setter, msg, ms = 2500) => {
    setter(msg);
    setTimeout(() => setter(null), ms);
  }, []);

  const uploadFile = async (file) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      flash(setProfileMsg, { type: 'error', text: validationError });
      return;
    }
    setImageUploading(true);
    try {
      const res = await profileApi.uploadProfilePicture(file);
      if (!res.success) throw new Error(res.error);
      setCustomImageUrl(res.url);
      setAvatar(null);
      setUserData(res.data);
      setShowPicker(false);
      eventBus.emit('profile-updated', { profilePicture: res.url, name });
      flash(setProfileMsg, { type: 'success', text: 'Profile picture updated.' });
    } catch (err) {
      flash(setProfileMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to upload image') });
    } finally {
      setImageUploading(false);
    }
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (file) uploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!imageUploading) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (imageUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleRemoveCustomImage = async () => {
    setImageRemoving(true);
    try {
      const res = await profileApi.deleteCustomImage();
      if (!res.success) throw new Error(res.error);
      setCustomImageUrl(null);
      setAvatar('CAT');
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: 'CAT', name });
      flash(setProfileMsg, { type: 'success', text: 'Profile picture removed.' });
    } catch (err) {
      flash(setProfileMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to remove image') });
    } finally {
      setImageRemoving(false);
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const updates = {};
      if (name.trim() !== (userData?.name || '')) updates.name = name.trim();

      // Only push avatar update when using a named avatar (not custom image — those are saved instantly)
      if (!customImageUrl && avatar && avatar !== userData?.profile_picture) {
        updates.profile_picture = avatar;
      }

      if (!Object.keys(updates).length) {
        flash(setProfileMsg, { type: 'success', text: 'Profile is already up to date.' });
        return;
      }

      const res = await profileApi.updateProfile(updates);
      if (!res.success) throw new Error(res.error);
      setUserData(res.data);
      const picForEvent = customImageUrl || avatar;
      eventBus.emit('profile-updated', { profilePicture: picForEvent, name: name.trim() });
      flash(setProfileMsg, { type: 'success', text: 'Profile saved.' });
    } catch (err) {
      flash(setProfileMsg, { type: 'error', text: apiUtils.handleError(err, 'Failed to save profile') });
    } finally {
      setProfileSaving(false);
    }
  };

  const currentAvatar = AVATARS.find(a => a.id === avatar) || AVATARS[0];
  const displayImageSrc = customImageUrl || currentAvatar.src;
  const displayImageAlt = customImageUrl ? 'Custom profile picture' : currentAvatar.name;

  if (profileLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionPanel
          title="Profile"
          description="Your display name and avatar are shown across the local workspace. Images are saved instantly; name changes require saving."
          message={profileMsg}
          action={<PrimaryButton loading={profileSaving} onClick={saveProfile}>Save profile</PrimaryButton>}
        >
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageFileChange}
            />

            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <div className="relative h-20 w-20 flex-shrink-0">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !imageUploading && fileInputRef.current?.click()}
                  title="Click or drag an image here"
                  className={`
                    h-20 w-20 rounded-full p-1 ring-1 cursor-pointer transition-all duration-150
                    ${isDragOver
                      ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/30 scale-105'
                      : 'ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 hover:ring-gray-300 dark:hover:ring-gray-600'}
                  `}
                >
                  {imageUploading ? (
                    <div className="h-full w-full rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  ) : isDragOver ? (
                    <div className="h-full w-full rounded-full flex items-center justify-center bg-indigo-100/60 dark:bg-indigo-900/40">
                      <Upload size={18} className="text-indigo-500" />
                    </div>
                  ) : (
                    <img
                      src={displayImageSrc}
                      alt={displayImageAlt}
                      className="h-full w-full rounded-full object-cover"
                    />
                  )}
                </div>
                {customImageUrl && !imageUploading && (
                  <button
                    type="button"
                    onClick={handleRemoveCustomImage}
                    disabled={imageRemoving}
                    title="Remove custom image"
                    className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-700 text-white ring-2 ring-white dark:ring-gray-900 hover:bg-red-600 transition-colors"
                  >
                    {imageRemoving ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 lg:w-full">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 disabled:opacity-50 transition-colors"
                >
                  <Upload size={12} />
                  Upload image
                </button>
                {!customImageUrl && (
                  <button
                    type="button"
                    onClick={() => setShowPicker(v => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
                  >
                    Choose avatar
                    {showPicker ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
              </div>
            </div>

            {showPicker && !customImageUrl && (
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

          </div>
        </div>
        </SectionPanel>

    </div>
  );
};

export default GeneralSection;
