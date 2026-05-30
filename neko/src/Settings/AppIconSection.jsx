// Settings/AppIconSection.jsx — customize the desktop app icon (dock / window / tray)
import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { ImageIcon, Upload, RotateCcw, Check, Loader2, Info } from 'lucide-react';

// Presets must mirror ICON_PRESETS in electron/icon.js. Files live in neko/public.
const PRESETS = [
  { key: 'default', name: 'Asyncat', src: '/app-icon-512.png' },
];

const cardClasses =
  'bg-white dark:bg-gray-900 midnight:bg-gray-950 p-6 rounded-xl shadow-sm border border-gray-200/70 dark:border-gray-800 midnight:border-gray-800';
const insetClasses =
  'bg-gray-50/80 dark:bg-gray-800/80 midnight:bg-gray-900/80 p-4 rounded-lg border border-gray-200/60 dark:border-gray-700/70 midnight:border-gray-700/70';
const mutedClasses = 'text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400';

const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
const isSupported = !!(api && api.setAppIcon);

const Tile = ({ src, name, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={name}
    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all
      ${selected
        ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-gray-800 midnight:bg-gray-900'
        : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-600'}`}
  >
    <span className="relative h-14 w-14">
      <img src={src} alt={name} className="h-14 w-14 rounded-2xl object-cover shadow-sm" />
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white ring-2 ring-white dark:ring-gray-900">
          <Check size={11} />
        </span>
      )}
    </span>
    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300">{name}</span>
  </button>
);

Tile.propTypes = {
  src: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};

const AppIconSection = () => {
  const [current, setCurrent] = useState({ type: 'default', key: 'default', dataUrl: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const flash = useCallback((m, ms = 2500) => {
    setMsg(m);
    setTimeout(() => setMsg(null), ms);
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    api.getAppIcon().then((cfg) => cfg && setCurrent(cfg)).catch(() => {});
  }, []);

  if (!isSupported) {
    return (
      <section className={cardClasses}>
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon size={20} className="text-gray-700 dark:text-gray-200 midnight:text-gray-200" />
          <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">App Icon</h3>
        </div>
        <div className={insetClasses}>
          <p className={`${mutedClasses} flex items-center gap-2`}>
            <Info size={15} className="flex-shrink-0" />
            App icon customization is available in the Asyncat desktop app.
          </p>
        </div>
      </section>
    );
  }

  const apply = async (run, successText) => {
    setBusy(true);
    try {
      const res = await run();
      if (res && res.success === false) throw new Error(res.error || 'Failed to update icon');
      if (res && res.type) setCurrent(res);
      flash({ type: 'success', text: successText });
    } catch (err) {
      flash({ type: 'error', text: err.message || 'Failed to update icon' });
    } finally {
      setBusy(false);
    }
  };

  const choosePreset = (key) =>
    apply(() => api.setAppIcon({ type: 'preset', key }), 'App icon updated.');

  const chooseCustom = () =>
    apply(() => api.setAppIcon({ type: 'custom' }), 'App icon updated.');

  const uploadCustom = async () => {
    const result = await api.openFilesDialog({
      title: 'Choose an app icon',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (!result || result.canceled || !result.filePaths?.length) return;
    await apply(() => api.setAppIcon({ type: 'custom', path: result.filePaths[0] }), 'App icon updated.');
  };

  const reset = () => apply(() => api.resetAppIcon(), 'Reset to the default icon.');

  const isCustom = current.type === 'custom';

  return (
    <section className={cardClasses}>
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon size={20} className="text-gray-700 dark:text-gray-200 midnight:text-gray-200" />
        <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">App Icon</h3>
      </div>

      <div className={insetClasses}>
        {msg && (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              msg.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40'
                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40'
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-2">
          {PRESETS.map((p) => (
            <Tile
              key={p.key}
              src={p.src}
              name={p.name}
              selected={!isCustom && current.key === p.key}
              onClick={() => !busy && choosePreset(p.key)}
            />
          ))}

          {current.dataUrl && (
            <Tile
              src={current.dataUrl}
              name="Custom"
              selected={isCustom}
              onClick={() => !busy && chooseCustom()}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={uploadCustom}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Upload custom
          </button>
          {(isCustom || current.key !== 'default') && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={12} />
              Reset to default
            </button>
          )}
        </div>

        <p className={`${mutedClasses} mt-4`}>
          Changes the Dock, window, and tray icons instantly. Uploads are cropped to a rounded square
          to match the app shape. The Finder / installer icon is set when the app is built and stays
          the same. PNG, JPG, or WebP — a square 512×512 image works best.
        </p>
      </div>
    </section>
  );
};

export default AppIconSection;
