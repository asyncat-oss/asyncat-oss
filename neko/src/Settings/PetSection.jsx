// Settings/PetSection.jsx — on-screen companion ("pet") overlay controls
import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Cat, Upload, RotateCcw, Check, Loader2, Info } from "lucide-react";

// Mirrors the default sprite in electron/pet.js (file lives in neko/public).
const DEFAULT_SPRITE = "/app-icon-512.png";

const cardClasses =
  "bg-white dark:bg-gray-900 midnight:bg-gray-950 p-6 rounded-xl shadow-sm border border-gray-200/70 dark:border-gray-800 midnight:border-gray-800";
const insetClasses =
  "bg-gray-50/80 dark:bg-gray-800/80 midnight:bg-gray-900/80 p-4 rounded-lg border border-gray-200/60 dark:border-gray-700/70 midnight:border-gray-700/70";
const mutedClasses =
  "text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400";

const api = typeof window !== "undefined" ? window.electronAPI : undefined;
const isSupported = !!(api && api.setPet);

const Tile = ({ src, name, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={name}
    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all
      ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-gray-800 midnight:bg-gray-900"
          : "border-transparent hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-600"
      }`}
  >
    <span className="relative h-14 w-14">
      <img
        src={src}
        alt={name}
        className="h-14 w-14 rounded-2xl object-contain"
      />
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white ring-2 ring-white dark:ring-gray-900">
          <Check size={11} />
        </span>
      )}
    </span>
    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300">
      {name}
    </span>
  </button>
);

Tile.propTypes = {
  src: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};

const PetSection = () => {
  const [pet, setPetState] = useState({
    enabled: false,
    sprite: "default",
    dataUrl: null,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const flash = useCallback((m, ms = 2500) => {
    setMsg(m);
    setTimeout(() => setMsg(null), ms);
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    api
      .getPet()
      .then((p) => p && setPetState(p))
      .catch(() => {});
  }, []);

  if (!isSupported) {
    return (
      <section className={cardClasses}>
        <div className="flex items-center gap-2 mb-4">
          <Cat
            size={20}
            className="text-gray-700 dark:text-gray-200 midnight:text-gray-200"
          />
          <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">
            Desktop Pet
          </h3>
        </div>
        <div className={insetClasses}>
          <p className={`${mutedClasses} flex items-center gap-2`}>
            <Info size={15} className="shrink-0" />
            The desktop pet is available in the Asyncat desktop app.
          </p>
        </div>
      </section>
    );
  }

  const apply = async (run, successText) => {
    setBusy(true);
    try {
      const res = await run();
      if (res && res.success === false)
        throw new Error(res.error || "Failed to update pet");
      if (res && typeof res.enabled === "boolean") setPetState(res);
      if (successText) flash({ type: "success", text: successText });
    } catch (err) {
      flash({ type: "error", text: err.message || "Failed to update pet" });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = () =>
    apply(
      () => api.setPet({ enabled: !pet.enabled }),
      pet.enabled ? "Pet hidden." : "Pet is now on screen.",
    );

  const chooseDefault = () =>
    apply(() => api.setPet({ sprite: "default" }), "Pet updated.");
  const chooseCustom = () =>
    apply(() => api.setPet({ sprite: "custom" }), "Pet updated.");

  const uploadCustom = async () => {
    const result = await api.openFilesDialog({
      title: "Choose a pet sprite",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
    });
    if (!result || result.canceled || !result.filePaths?.length) return;
    await apply(
      () => api.setPet({ sprite: "custom", path: result.filePaths[0] }),
      "Pet updated.",
    );
  };

  const reset = () => apply(() => api.resetPet(), "Reset to the default pet.");

  const isCustom = pet.sprite === "custom";

  return (
    <section className={cardClasses}>
      <div className="flex items-center gap-2 mb-4">
        <Cat
          size={20}
          className="text-gray-700 dark:text-gray-200 midnight:text-gray-200"
        />
        <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">
          Desktop Pet
        </h3>
      </div>

      <div className={insetClasses}>
        {msg && (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              msg.type === "success"
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40"
                : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Enable toggle */}
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-200">
              Show the pet on screen
            </span>
            <span className={mutedClasses}>
              A floating companion that stays on top across windows and shows
              agent activity.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pet.enabled}
            disabled={busy}
            onClick={toggleEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
              ${pet.enabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${pet.enabled ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </label>

        {pet.enabled && (
          <>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <Tile
                src={DEFAULT_SPRITE}
                name="Asyncat"
                selected={!isCustom}
                onClick={() => !busy && chooseDefault()}
              />
              {pet.dataUrl && (
                <Tile
                  src={pet.dataUrl}
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
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Upload size={12} />
                )}
                Upload sprite
              </button>
              {isCustom && (
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
          </>
        )}

        <p className={`${mutedClasses} mt-4`}>
          Drag the pet anywhere on screen. It shows a ⚙️ bubble while agents are
          running and a green ✓ when a run finishes. PNG, JPG, WebP, or an
          animated GIF works as a sprite.
        </p>
      </div>
    </section>
  );
};

export default PetSection;
