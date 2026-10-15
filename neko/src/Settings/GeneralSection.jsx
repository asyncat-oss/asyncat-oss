// Settings → General → Profile: your name and picture. A picture (one of
// ours, or an image you upload or drop on it) is saved at once; the name is
// saved with its Save button.

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Loader2, Upload, UserRound } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import Popover from '../components/ui/Popover.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { profileApi } from './settingApi';
import eventBus from '../utils/eventBus.js';
import { AVATARS, isCustomImageUrl } from '../assets/dp/avatars.js';

const MAX_NAME = 50;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

function imageProblem(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP or GIF images work.';
  if (file.size > MAX_BYTES) return `Pick an image under 5 MB (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

function AvatarChooser({ value, onPick }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Pictures">
      {AVATARS.map((avatar) => {
        const selected = value === avatar.id;
        return (
          <button
            key={avatar.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={avatar.name}
            title={avatar.name}
            onClick={() => onPick(avatar.id)}
            className={`relative h-11 w-11 overflow-hidden rounded-full outline-none ring-offset-2 ring-offset-elevated transition-shadow focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected ? 'ring-2 ring-fg' : 'hover:ring-1 hover:ring-line-strong'
            }`}
          >
            <img src={avatar.src} alt="" className="h-full w-full object-cover" />
            {selected ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

AvatarChooser.propTypes = { value: PropTypes.string, onPick: PropTypes.func.isRequired };

const GeneralSection = () => {
  const toast = useToast();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('CAT');
  const [customImageUrl, setCustomImageUrl] = useState(null);
  const [busy, setBusy] = useState(null); // 'name' | 'upload' | 'remove' | 'avatar'
  const [chooserOpen, setChooserOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const chooseRef = useRef(null);

  useEffect(() => {
    profileApi.fetchProfile()
      .then((data) => {
        if (!data.success || !data.data) return;
        const profile = data.data;
        setUserData(profile);
        setName(profile.name || '');
        if (isCustomImageUrl(profile.profile_picture)) {
          setCustomImageUrl(profile.profile_picture);
          setAvatar(null);
        } else {
          setCustomImageUrl(null);
          setAvatar(AVATARS.some((item) => item.id === profile.profile_picture) ? profile.profile_picture : 'CAT');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const uploadFile = async (file) => {
    const problem = imageProblem(file);
    if (problem) {
      toast.error("Couldn't use that image", { detail: problem });
      return;
    }
    setBusy('upload');
    try {
      const res = await profileApi.uploadProfilePicture(file);
      if (!res.success) throw new Error(res.error);
      setCustomImageUrl(res.url);
      setAvatar(null);
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: res.url, name });
      toast.success('Picture updated');
    } catch (err) {
      toast.error("Couldn't upload the image", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const pickAvatar = async (id) => {
    setChooserOpen(false);
    if (id === avatar && !customImageUrl) return;
    setBusy('avatar');
    try {
      const res = await profileApi.updateProfile({ profile_picture: id });
      if (!res.success) throw new Error(res.error);
      setAvatar(id);
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: id, name: userData?.name || name });
    } catch (err) {
      toast.error("Couldn't change the picture", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const removeCustomImage = async () => {
    setBusy('remove');
    try {
      const res = await profileApi.deleteCustomImage();
      if (!res.success) throw new Error(res.error);
      setCustomImageUrl(null);
      setAvatar('CAT');
      setUserData(res.data);
      eventBus.emit('profile-updated', { profilePicture: 'CAT', name });
      toast.success('Picture removed');
    } catch (err) {
      toast.error("Couldn't remove the picture", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (event) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (trimmed === (userData?.name || '')) return;
    setBusy('name');
    try {
      const res = await profileApi.updateProfile({ name: trimmed });
      if (!res.success) throw new Error(res.error);
      setUserData(res.data);
      setName(trimmed);
      eventBus.emit('profile-updated', { profilePicture: customImageUrl || avatar, name: trimmed });
      toast.success('Name saved');
    } catch (err) {
      toast.error("Couldn't save the name", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    if (busy === 'upload') return;
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const current = AVATARS.find((item) => item.id === avatar) || AVATARS[0];
  const imageSrc = customImageUrl || current.src;
  const nameChanged = name.trim() !== (userData?.name || '');

  return (
    <SettingsSection icon={UserRound} title="Profile" hint="How you appear in Asyncat. Everything stays on this computer.">
      {loading ? <Skeleton className="h-[132px] rounded-xl" /> : (
        <RowGroup>
          <SettingsRow label="Picture" hint="Upload an image or drop one on the picture: JPEG, PNG, WebP or GIF, up to 5 MB.">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => busy !== 'upload' && fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); if (busy !== 'upload') setDragOver(true); }}
                onDragLeave={(event) => { event.preventDefault(); setDragOver(false); }}
                onDrop={onDrop}
                aria-label="Upload a picture"
                title="Click or drop an image here"
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-hover outline-none ring-1 transition-shadow focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  dragOver ? 'ring-2 ring-accent' : 'ring-line'
                }`}
              >
                {busy === 'upload' || busy === 'avatar' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
                ) : dragOver ? (
                  <Upload className="h-4 w-4 text-fg-muted" />
                ) : (
                  <img src={imageSrc} alt={customImageUrl ? 'Your picture' : current.name} className="h-full w-full object-cover" />
                )}
              </button>
              <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) uploadFile(file);
              }} />
              <Button size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()} disabled={busy === 'upload'}>Upload</Button>
              {customImageUrl ? (
                <Button size="sm" variant="ghost" loading={busy === 'remove'} onClick={removeCustomImage}>Remove</Button>
              ) : (
                <>
                  <Button ref={chooseRef} size="sm" variant="ghost" onClick={() => setChooserOpen((open) => !open)} aria-expanded={chooserOpen}>Choose…</Button>
                  <Popover anchorRef={chooseRef} open={chooserOpen} onClose={() => setChooserOpen(false)} placement="bottom-end" width={272} label="Choose a picture">
                    <AvatarChooser value={avatar} onPick={pickAvatar} />
                  </Popover>
                </>
              )}
            </div>
          </SettingsRow>
          <SettingsRow label="Name" hint="Shown in the sidebar.">
            <form onSubmit={saveName} className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, MAX_NAME))}
                maxLength={MAX_NAME}
                placeholder="Your name"
                aria-label="Your name"
                className="w-full sm:w-56"
              />
              <Button type="submit" variant={nameChanged ? 'primary' : 'secondary'} disabled={!nameChanged} loading={busy === 'name'}>Save</Button>
            </form>
          </SettingsRow>
        </RowGroup>
      )}
    </SettingsSection>
  );
};

export default GeneralSection;
