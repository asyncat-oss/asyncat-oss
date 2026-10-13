// A full-window update screen in the style of the startup screen. Opened from
// "Update available" (sidebar profile menu, Settings → About) with the
// `asyncat:open-update` window event. The download and install happen in the
// Electron main process (electron/updater.js); this screen shows the release
// notes, progress and the last step.

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Copy, ExternalLink, FolderOpen, X } from 'lucide-react';
import Cat from './ui/Cat.jsx';
import Button from './ui/Button.jsx';
import { BlockRenderer, parseAIResponseToBlocks } from '../CommandCenter/components/renderers/BlockBasedMessageRenderer';
import { OPEN_UPDATE_EVENT, SKIPPED_UPDATE_KEY } from './updateEvents.js';

const formatMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;

function primaryLabel(strategy) {
  if (strategy === 'replace-appimage' || strategy === 'run-installer') return 'Update and restart';
  if (strategy === 'open-installer') return 'Download update';
  return 'Open download page';
}

function ReadyStep({ download, platform, api }) {
  const [copied, setCopied] = useState(false);
  if (download.strategy === 'replace-appimage' || download.strategy === 'run-installer') {
    return (
      <>
        <p className="text-[13px] leading-5 text-fg-muted">
          {download.strategy === 'run-installer'
            ? 'Asyncat will close, install the update and open again. Your chats and settings stay.'
            : 'Asyncat will close and open again on the new version. Your chats and settings stay.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" size="md" onClick={() => api.finishUpdate()}>Restart now</Button>
        </div>
      </>
    );
  }
  const fileName = String(download.file || '').split(/[\\/]/).pop();
  const debCommand = `sudo apt install ./${fileName}`;
  return (
    <>
      <p className="text-[13px] leading-5 text-fg-muted">
        {platform === 'darwin'
          ? 'The update is downloaded and checked. Open the installer, quit Asyncat, then drag Asyncat into Applications and choose Replace. If macOS then says Asyncat can’t be opened, run the command below in Terminal once.'
          : 'The update is in your Downloads folder. Quit Asyncat, then install it from that folder:'}
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(platform === 'darwin' ? 'xattr -cr /Applications/Asyncat.app' : debCommand);
            setCopied(true);
          } catch { /* clipboard may be blocked */ }
        }}
        className="mx-auto mt-3 flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12px] text-fg hover:bg-hover"
        title="Copy command"
      >
        <span className="truncate">{platform === 'darwin' ? 'xattr -cr /Applications/Asyncat.app' : debCommand}</span>
        <Copy className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        {copied ? <span className="text-[11px] text-emerald-500">Copied</span> : null}
      </button>
      <div className="mt-5 flex justify-center gap-2">
        {platform === 'darwin' ? (
          <>
            <Button variant="primary" size="md" onClick={() => api.finishUpdate()}>Open installer</Button>
            <Button variant="secondary" size="md" onClick={() => api.quitForUpdate?.()}>Quit Asyncat</Button>
          </>
        ) : (
          <Button variant="secondary" size="md" icon={FolderOpen} onClick={() => api.showUpdateFile()}>Show in folder</Button>
        )}
      </div>
    </>
  );
}

ReadyStep.propTypes = {
  download: PropTypes.shape({ strategy: PropTypes.string, file: PropTypes.string }).isRequired,
  platform: PropTypes.string,
  api: PropTypes.object.isRequired,
};

export default function UpdateScreen() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [download, setDownload] = useState({ status: 'idle' });
  const [platform, setPlatform] = useState(null);

  const refresh = useCallback(async () => {
    if (!api?.getUpdateState) return;
    const state = await api.getUpdateState().catch(() => null);
    if (!state) return;
    setInfo(state.updateInfo || null);
    setCurrentVersion(state.currentVersion || '');
    if (state.download) setDownload(state.download);
  }, [api]);

  useEffect(() => {
    if (!api) return undefined;
    api.getPlatform?.().then(setPlatform).catch(() => {});
    const onOpen = () => { refresh(); setOpen(true); };
    window.addEventListener(OPEN_UPDATE_EVENT, onOpen);
    const offState = api.onUpdateDownloadState?.((state) => setDownload(state));
    const offAvailable = api.onUpdateAvailable?.((next) => setInfo(next));
    return () => {
      window.removeEventListener(OPEN_UPDATE_EVENT, onOpen);
      if (typeof offState === 'function') offState();
      if (typeof offAvailable === 'function') offAvailable();
    };
  }, [api, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const notes = useMemo(() => {
    const text = String(info?.releaseNotes || '').trim();
    if (!text) return [];
    try { return parseAIResponseToBlocks(text); } catch { return [{ type: 'text', content: text, properties: {} }]; }
  }, [info?.releaseNotes]);

  if (!open || !api) return null;

  const status = download.status || 'idle';
  const downloading = status === 'downloading';
  const percent = download.total ? Math.min(100, Math.round((download.received / download.total) * 100)) : null;

  const skip = () => {
    try { localStorage.setItem(SKIPPED_UPDATE_KEY, info?.version || ''); } catch { /* localStorage may be unavailable */ }
    window.dispatchEvent(new CustomEvent('asyncat:update-flag', { detail: false }));
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-canvas text-fg animate-[fadeIn_160ms_ease-out]" role="dialog" aria-modal="true" aria-label="Update Asyncat">
      <div className="flex justify-end p-3">
        <Button variant="ghost" size="icon" icon={X} onClick={() => setOpen(false)} aria-label="Close" title={downloading ? 'Close (the download continues)' : 'Close'} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-10">
        <div className="my-auto w-full max-w-lg py-6 text-center">
          <div className="mx-auto w-[132px] bg-canvas">
            <Cat pose={downloading ? 'walk' : 'sit'} className={`mx-auto ${downloading ? 'w-[92px]' : 'w-[64px]'}`} outline={6} />
          </div>
          <div className="mt-5 text-[22px] font-bold tracking-[-0.045em]">asyncat</div>

          {!info ? (
            <p className="mt-2 text-[13px] text-fg-muted">You’re on the latest version{currentVersion ? ` (${currentVersion})` : ''}.</p>
          ) : (
            <>
              <h2 className="mt-1 text-[15px] font-semibold">
                {status === 'ready' ? `Version ${download.version || info.version} is ready` : `Version ${info.version} is available`}
              </h2>
              {currentVersion ? <p className="mt-0.5 text-[12px] text-fg-subtle">You have {currentVersion}</p> : null}

              <div className="mt-6">
                {status === 'downloading' ? (
                  <>
                    <div className="mx-auto h-1.5 max-w-sm overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={percent ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress">
                      <div className={`h-full rounded-full bg-accent transition-[width] duration-300 ${percent == null ? 'w-1/3 animate-pulse' : ''}`} style={percent == null ? undefined : { width: `${Math.max(2, percent)}%` }} />
                    </div>
                    <p className="mt-2 text-[12px] tabular-nums text-fg-muted">
                      Downloading{download.total ? ` ${formatMb(download.received || 0)} of ${formatMb(download.total)}` : '…'}
                    </p>
                    <div className="mt-4">
                      <Button variant="ghost" size="sm" onClick={() => api.cancelUpdate()}>Cancel</Button>
                    </div>
                  </>
                ) : status === 'ready' ? (
                  <ReadyStep download={download} platform={platform} api={api} />
                ) : (
                  <>
                    {status === 'error' ? (
                      <p className="mb-4 text-[13px] leading-5 text-red-600 dark:text-red-400">{download.error || 'The update failed.'}</p>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" size="md" onClick={() => api.startUpdate()}>
                        {status === 'error' ? 'Try again' : primaryLabel(info.strategy)}
                      </Button>
                      {status === 'error' ? (
                        <Button variant="secondary" size="md" icon={ExternalLink} onClick={() => api.downloadUpdate()}>Download from GitHub</Button>
                      ) : (
                        <Button variant="secondary" size="md" onClick={() => setOpen(false)}>Later</Button>
                      )}
                    </div>
                    <button type="button" onClick={skip} className="mt-3 text-[12px] text-fg-subtle underline-offset-2 hover:text-fg-muted hover:underline">
                      Skip this version
                    </button>
                  </>
                )}
              </div>

              {notes.length > 0 && status !== 'ready' ? (
                <div className="mt-8 text-left">
                  <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-line bg-surface px-4 py-3 text-[13px] leading-6 text-fg-muted [overflow-wrap:anywhere] [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px]">
                    {notes.map((block, index) => <BlockRenderer key={index} block={block} />)}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
