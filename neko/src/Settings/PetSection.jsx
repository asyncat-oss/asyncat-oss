// Settings → Desktop → Pet: the cat that sits on top of your windows and
// shows what agents are doing (electron/pet.html), and its picture.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Cat, Check, Trash2, Upload } from 'lucide-react';
import CatMascot from '../components/ui/Cat.jsx';
import Button from '../components/ui/Button.jsx';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';

const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
const isSupported = Boolean(api?.setPet);

function Choice({ name, selected, disabled, onClick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex w-24 flex-col items-center gap-1.5 rounded-xl border px-2 pb-2 pt-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 ${
        selected ? 'border-line-strong bg-selected' : 'border-line hover:bg-hover'
      }`}
    >
      <span className="flex h-12 w-12 items-end justify-center">{children}</span>
      <span className="text-[12px] text-fg-muted">{name}</span>
      {selected ? <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-fg" strokeWidth={2.5} /> : null}
    </button>
  );
}

Choice.propTypes = {
  name: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node,
};

export default function PetSection() {
  const toast = useToast();
  const [pet, setPetState] = useState({ enabled: false, sprite: 'default', dataUrl: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    api.getPet().then((value) => value && setPetState(value)).catch(() => {});
  }, []);

  if (!isSupported) return null;

  const apply = async (run) => {
    setBusy(true);
    try {
      const res = await run();
      if (res && res.success === false) throw new Error(res.error || "Couldn't change the pet");
      if (res && typeof res.enabled === 'boolean') setPetState(res);
    } catch (err) {
      toast.error("Couldn't change the pet", { detail: errorDetail(err) });
    } finally {
      setBusy(false);
    }
  };

  const uploadCustom = async () => {
    const result = await api.openFilesDialog({
      title: 'Choose a picture for the pet',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (!result || result.canceled || !result.filePaths?.length) return;
    await apply(() => api.setPet({ sprite: 'custom', path: result.filePaths[0] }));
  };

  const isCustom = pet.sprite === 'custom';

  return (
    <SettingsSection icon={Cat} title="Pet" hint="A cat that sits on top of your windows. Drag it anywhere.">
      <RowGroup>
        <SettingsRow label="Show the pet" hint="It shows a bubble while agents are working, and a check when a run finishes." stack={false}>
          <Switch checked={Boolean(pet.enabled)} onChange={(enabled) => apply(() => api.setPet({ enabled }))} disabled={busy} label="Show the pet" />
        </SettingsRow>
        {pet.enabled ? (
          <div className="px-4 py-3">
            <p className="text-[13px] font-medium text-fg">Picture</p>
            <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">PNG, JPG, WebP or an animated GIF.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2" role="radiogroup" aria-label="Pet picture">
              <Choice name="Asyncat cat" selected={!isCustom} disabled={busy} onClick={() => apply(() => api.setPet({ sprite: 'default' }))}>
                <CatMascot pose="sit" className="h-12 w-auto" outline={6} />
              </Choice>
              {pet.dataUrl ? (
                <Choice name="Yours" selected={isCustom} disabled={busy} onClick={() => apply(() => api.setPet({ sprite: 'custom' }))}>
                  <img src={pet.dataUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
                </Choice>
              ) : null}
              <div className="flex flex-wrap gap-2 pb-0.5 sm:ml-2">
                <Button size="sm" icon={Upload} loading={busy} onClick={uploadCustom}>Upload a picture</Button>
                {pet.dataUrl ? <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => apply(() => api.resetPet())}>Remove your picture</Button> : null}
              </div>
            </div>
          </div>
        ) : null}
      </RowGroup>
    </SettingsSection>
  );
}
