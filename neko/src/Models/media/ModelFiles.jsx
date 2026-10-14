// "Model files": every model file and voice on this computer for the tab,
// downloads still going first, which file is in use, and per file a menu
// to use it, hear it, find it, or delete it. Files are added from Hugging
// Face or picked from the computer.

import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { MoreHorizontal } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu.jsx';
import { DownloadLine } from '../../components/ui/Progress.jsx';
import { RowGroup, SettingsSection } from '../../components/ui/Rows.jsx';
import SearchField from '../../components/ui/SearchField.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { formatBytes } from '../../components/ui/progressFormat.js';
import { useConfirm } from '../../components/confirmContext.js';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { audioApi, visualModelsApi } from '../../Settings/settingApi.js';
import AddFileDialog from './AddFileDialog.jsx';
import HuggingFaceDialog from './HuggingFaceDialog.jsx';
import { mediaApi } from './mediaApi.js';
import { buildImageFiles, buildVoiceFiles, filesCountText } from './mediaFormat.js';
import { notifyImagesChanged, notifyVoiceChanged } from './notify.js';
import { usePlayer } from './usePlayer.js';

const FILTER_AFTER = 8;
const STATE_TONE = {
  accent: 'text-accent',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
};
const USED = {
  whisper: (name) => `Listening now uses ${name}`,
  tts: (name) => `Speaking now uses ${name}`,
  image: (name) => `Images now use ${name}`,
};

function matches(row, words) {
  const text = `${row.name} ${row.filename} ${row.meta}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

function FileRow({ row, highlight, playing, onUse, onHear, onStop, onDelete }) {
  const toast = useToast();
  const menuRef = useRef(null);
  const rowRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const hit = highlight?.id === row.domId ? highlight.at || highlight.id : null;

  // A search on the Language tab landed here: bring the row into view and flash it.
  useEffect(() => {
    if (!hit) return undefined;
    rowRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(timer);
  }, [hit]);

  const canShow = Boolean(window.electronAPI?.shellShowInFolder) && !row.missing;
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(row.path);
      toast.success('Path copied');
    } catch {
      toast.error("Couldn't copy the path");
    }
  };

  return (
    <div
      ref={rowRef}
      id={row.domId}
      data-file-row={row.type}
      className={`group flex items-center gap-3 px-4 py-2.5 transition-colors duration-500 ${flash ? 'bg-selected' : ''}`}
    >
      {/* One line on a wide screen; name, details and state under each other on a phone. */}
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
        <p className="truncate text-[13px] text-fg sm:max-w-[45%] sm:shrink-0" title={row.path}>{row.name}</p>
        <p className="truncate text-[12px] tabular-nums text-fg-subtle sm:min-w-0">{row.meta}</p>
        {row.state ? <p className={`shrink-0 text-[12px] sm:ml-auto ${STATE_TONE[row.state.tone] || 'text-fg-subtle'}`}>{row.state.text}</p> : null}
      </div>
      <button
        ref={menuRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={`Options for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle outline-none transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:opacity-100 ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Menu anchorRef={menuRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={208} label={`Options for ${row.name}`}>
        {row.useLabel ? (
          <MenuItem label={row.useLabel} disabled={!row.canUse || row.inUse} hint={row.inUse ? 'In use' : undefined} onSelect={() => onUse(row)} />
        ) : null}
        {row.type === 'tts' && row.canUse ? (
          <MenuItem label={playing ? 'Stop' : 'Hear it'} onSelect={() => (playing ? onStop() : onHear(row))} />
        ) : null}
        {canShow ? <MenuItem label="Show in folder" onSelect={() => window.electronAPI.shellShowInFolder(row.path)} /> : null}
        <MenuItem label="Copy path" onSelect={copyPath} />
        <MenuSeparator />
        <MenuItem label={row.deleteLabel} danger disabled={!row.canDelete} hint={row.canDelete ? undefined : 'In use'} onSelect={() => onDelete(row)} />
      </Menu>
    </div>
  );
}

FileRow.propTypes = {
  row: PropTypes.object.isRequired,
  highlight: PropTypes.object,
  playing: PropTypes.bool,
  onUse: PropTypes.func.isRequired,
  onHear: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 *   const files = useModelFiles('voice');
 *   const { downloads, cancel } = useDownloads('audio/', { job });
 *   <ModelFiles kind="voice" status={status} catalog={catalog} library={files.library}
 *     downloads={downloads} onCancelDownload={cancel} onChanged={reload} />
 *
 * `highlight` ({ id, at }) flashes the row with that id (voice-file-whisper-…,
 * image-file-…), for a search that jumps here. `comfy` is ComfyUI's status
 * on the Images tab. `offline` stops Hugging Face searches and downloads.
 */
export default function ModelFiles({
  kind,
  status,
  catalog,
  library,
  downloads = [],
  onCancelDownload,
  comfy = null,
  highlight = null,
  offline = false,
  onChanged,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const player = usePlayer();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // 'hf' | 'file'
  const voice = kind === 'voice';

  const built = useMemo(() => (voice
    ? buildVoiceFiles(status, catalog, library, downloads)
    : buildImageFiles(status, catalog, library, comfy, downloads)), [voice, status, catalog, library, comfy, downloads]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = built.groups.map((group) => ({ ...group, rows: words.length ? group.rows.filter((row) => matches(row, words)) : group.rows }));
  const shownRows = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const otherFiles = built.groups.find((group) => group.id === 'other')?.rows.length || 0;
  const notify = voice ? notifyVoiceChanged : notifyImagesChanged;

  const use = async (row) => {
    try {
      if (row.type === 'whisper') await mediaApi.voice.choose({ stt: { provider: 'local', model: row.path } });
      else if (row.type === 'tts') await mediaApi.voice.choose({ tts: { provider: 'local', voice: row.path } });
      else await mediaApi.images.choose({ provider: 'local', model: row.path });
      toast.success(USED[row.type](row.name));
      notify();
      await onChanged?.();
    } catch (err) {
      toast.error(`Couldn't switch to ${row.name}`, { detail: errorDetail(err) });
    }
  };

  const remove = async (row) => {
    const ok = row.external
      ? await confirm({ title: `Remove ${row.filename} from the list?`, message: 'The file stays where it is.', confirmLabel: 'Remove', destructive: true })
      : await confirm({
        title: `Delete ${row.name}?`,
        message: `It's removed from this computer${row.bytes ? ` (${formatBytes(row.bytes)})` : ''}. You can download it again.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
    if (!ok) return;
    try {
      if (row.type === 'image') await visualModelsApi.deleteModel(row.id, 'image');
      // A file outside Asyncat's folder only leaves the list.
      else await audioApi.deleteModel(row.id, row.external ? undefined : row.type);
      toast.success(row.external ? `Removed ${row.filename} from the list` : `Deleted ${row.name}`);
      notify();
      await onChanged?.();
    } catch (err) {
      toast.error(`Couldn't ${row.external ? 'remove' : 'delete'} ${row.name}`, { detail: errorDetail(err) });
    }
  };

  const cancelDownload = async (item) => {
    try {
      await onCancelDownload?.(item.id);
      toast.success('Download cancelled');
    } catch (err) {
      toast.error("Couldn't cancel the download", { detail: errorDetail(err) });
    }
  };

  const loading = !library;
  const empty = !loading && built.count === 0 && built.downloads.length === 0;

  return (
    <SettingsSection
      title="Model files"
      aside={loading ? null : filesCountText(built.count)}
      data-model-files={kind}
    >
      {built.count > FILTER_AFTER ? (
        <SearchField className="mb-2" size="sm" value={query} onChange={setQuery} placeholder="Filter files" />
      ) : null}
      {loading ? (
        <RowGroup aria-busy="true">
          {[0, 1, 2].map((index) => <div key={index} className="px-4 py-3"><Skeleton className="h-5" /></div>)}
        </RowGroup>
      ) : empty ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-fg-muted">
          No model files yet. Downloads and files you add show up here.
        </p>
      ) : (
        <RowGroup>
          {built.downloads.map((item) => (
            <div key={item.id} className="px-4 py-3" data-file-download={item.filename}>
              <DownloadLine
                label={<>{item.name}<span className="ml-2 text-[12px] text-fg-subtle">{item.kindText}</span></>}
                bytes={item.bytes || undefined}
                total={item.total || undefined}
                percent={item.percent}
                error={item.error}
                onCancel={item.error ? undefined : () => cancelDownload(item)}
              />
            </div>
          ))}
          {groups.map((group) => (group.rows.length ? (
            <div key={group.id}>
              {group.label && !voice ? <div className="px-4 pb-1 pt-3 text-[11px] font-medium text-fg-subtle">{group.label}</div> : null}
              <div className="divide-y divide-line">
                {group.rows.map((row) => (
                  <FileRow
                    key={row.domId}
                    row={row}
                    highlight={highlight}
                    playing={player.playing === row.domId}
                    onUse={use}
                    onHear={(item) => player.play(item.domId, () => mediaApi.voice.preview({ provider: 'local', voice: item.path }))}
                    onStop={player.stop}
                    onDelete={remove}
                  />
                ))}
              </div>
            </div>
          ) : null))}
          {words.length && !shownRows ? <p className="px-4 py-3 text-[13px] text-fg-muted">No files match.</p> : null}
        </RowGroup>
      )}
      {!voice && otherFiles ? (
        <p className="mt-2 text-[12px] leading-5 text-fg-subtle">
          LoRAs, VAEs and ControlNets are listed so you can see and delete them; Asyncat draws with image models only.
        </p>
      ) : null}
      {player.error ? <p role="alert" className="mt-2 text-[12px] leading-5 text-red-600 dark:text-red-400">{player.error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDialog('hf')}>Add from Hugging Face</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog('file')}>Add a file…</Button>
      </div>
      <HuggingFaceDialog
        open={dialog === 'hf'}
        onClose={() => setDialog(null)}
        scopes={voice ? ['listening', 'speaking'] : ['images']}
        offline={offline}
        filesHere={built.groups.flatMap((group) => group.rows.filter((row) => !row.missing).map((row) => row.filename))}
      />
      <AddFileDialog
        open={dialog === 'file'}
        onClose={() => setDialog(null)}
        scope={voice ? 'voice' : 'images'}
        onAdded={onChanged}
      />
    </SettingsSection>
  );
}

ModelFiles.propTypes = {
  kind: PropTypes.oneOf(['voice', 'images']).isRequired,
  status: PropTypes.object,
  catalog: PropTypes.object,
  library: PropTypes.object,
  downloads: PropTypes.array,
  onCancelDownload: PropTypes.func,
  comfy: PropTypes.object,
  highlight: PropTypes.object,
  offline: PropTypes.bool,
  onChanged: PropTypes.func,
};
