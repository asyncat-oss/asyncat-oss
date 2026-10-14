// "Add from Hugging Face" for one kind of file (listening models, voices or
// image models): a search narrowed to that kind, a repo's files that fit
// with the size next to each Download, and downloads that carry on, shown
// in Model files, when the dialog closes.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Notice from '../../components/ui/Notice.jsx';
import SearchField from '../../components/ui/SearchField.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Segmented } from '../../components/ui/Tabs.jsx';
import { errorDetail } from '../../components/toastContext.js';
import { localModelsApi } from '../../Settings/settingApi.js';
import ActionButton from './ActionButton.jsx';
import { HF_SCOPES, hfFilesFor, repoMeta } from './filesFormat.js';
import { notifyDownloadsChanged } from './notify.js';

function Loading() {
  return (
    <div className="divide-y divide-line" aria-busy="true">
      {[0, 1, 2].map((index) => <div key={index} className="px-1 py-3"><Skeleton className="h-5" /></div>)}
    </div>
  );
}

/**
 *   <HuggingFaceDialog open={open} onClose={close} scopes={['listening', 'speaking']} offline={!network.online} />
 *
 * `scopes` are the kinds to search ('listening', 'speaking', 'images'); with
 * more than one, a switch at the top picks between them. Nothing is fetched
 * until it opens; after the first search, a search runs on Enter.
 * `filesHere` are the names of files already on this computer, which aren't
 * offered again.
 */
export default function HuggingFaceDialog({ open, onClose, scopes = ['listening'], offline = false, filesHere = [] }) {
  const downloadBlocked = offline ? "You're offline" : null;
  const [scope, setScope] = useState(scopes[0]);
  const config = HF_SCOPES[scope] || HF_SCOPES.listening;
  const [query, setQuery] = useState(config.query);
  const [results, setResults] = useState({ loading: false, repos: null, error: '' });
  const [repo, setRepo] = useState(null); // { id, gated, files, loading, error }
  const [started, setStarted] = useState({}); // file path → 'starting' | 'started' | error text
  const [running, setRunning] = useState(() => new Set()); // "subDir/filename" of downloads going now

  const search = useCallback(async (text, which) => {
    const settings = HF_SCOPES[which] || HF_SCOPES.listening;
    setResults({ loading: true, repos: null, error: '' });
    try {
      const res = await localModelsApi.searchHuggingFace(text.trim() || settings.query, { limit: 20, filter: settings.filter });
      setResults({ loading: false, repos: res.models || [], error: '' });
    } catch (err) {
      setResults({ loading: false, repos: null, error: errorDetail(err) || "Couldn't search Hugging Face." });
    }
  }, []);

  // Each opening (and each switch of kind) starts from that kind's own search.
  useEffect(() => {
    if (!open) return;
    const settings = HF_SCOPES[scope] || HF_SCOPES.listening;
    setQuery(settings.query);
    setRepo(null);
    if (!offline) search(settings.query, scope);
  }, [open, scope, search, offline]);

  useEffect(() => {
    if (!open) setStarted({});
  }, [open]);

  const openRepo = async (item) => {
    const id = item.repoId || item.id;
    setRepo({ id, gated: Boolean(item.gated), files: null, loading: true, error: '' });
    // A file already downloading isn't offered twice.
    localModelsApi.listDownloads()
      .then((res) => setRunning(new Set((res?.downloads || []).filter((dl) => dl.status === 'downloading').map((dl) => `${dl.subDir}/${dl.filename}`))))
      .catch(() => {});
    try {
      const res = await localModelsApi.listHuggingFaceFiles(id);
      setRepo({ id, gated: Boolean(res.gated || item.gated), files: res.files || [], loading: false, error: '' });
    } catch (err) {
      setRepo({ id, gated: Boolean(item.gated), files: null, loading: false, error: errorDetail(err) || "Couldn't list its files." });
    }
  };

  const download = async (file) => {
    setStarted((current) => ({ ...current, [file.path]: 'starting' }));
    try {
      await localModelsApi.startDownload(file.url, file.filename, config.subDir);
      // A voice needs its settings file beside it.
      if (file.companion) await localModelsApi.startDownload(file.companion.url, file.companion.filename, config.subDir);
      setStarted((current) => ({ ...current, [file.path]: 'started' }));
      notifyDownloadsChanged();
    } catch (err) {
      setStarted((current) => ({ ...current, [file.path]: errorDetail(err) || "Couldn't start the download." }));
    }
  };

  const files = repo?.files ? hfFilesFor(repo.files, scope) : null;
  const hfLink = repo ? `https://huggingface.co/${repo.id}` : null;

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      size="lg"
      title={config.title}
      description={config.hint}
      footer={(
        <>
          <p className="mr-auto text-[12px] text-fg-subtle">Downloads keep going if you close this.</p>
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </>
      )}
    >
      <div className="space-y-3" data-hf-dialog={scope}>
        {scopes.length > 1 ? (
          <Segmented
            size="sm"
            role="radiogroup"
            label="Kind of file"
            value={scope}
            onChange={setScope}
            items={scopes.map((id) => ({ value: id, label: HF_SCOPES[id]?.label || id }))}
          />
        ) : null}

        {repo ? (
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="xs" icon={ChevronLeft} className="-ml-2" onClick={() => setRepo(null)}>Back</Button>
              <span className="min-w-0 truncate text-[13px] font-medium text-fg">{repo.id}</span>
              <a href={hfLink} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-fg-subtle">
                Open on Hugging Face <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {repo.gated ? <Notice tone="warning">Gated: accept its licence on Hugging Face first, and save a Hugging Face token in Settings.</Notice> : null}
            {repo.loading ? <Loading /> : repo.error ? (
              <Notice tone="error">{repo.error}</Notice>
            ) : files.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {files.map((file) => {
                  const here = filesHere.includes(file.filename);
                  const state = started[file.path] || (running.has(`${config.subDir}/${file.filename}`) ? 'started' : null);
                  return (
                    <li key={file.path} className="flex items-center gap-3 px-3.5 py-2.5" data-hf-file={file.filename}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-fg" title={file.path}>{file.filename}</p>
                        <p className="truncate text-[12px] tabular-nums text-fg-subtle">
                          {state && state !== 'starting' && state !== 'started' ? <span className="text-red-600 dark:text-red-400">{state}</span> : file.meta}
                        </p>
                      </div>
                      {here || state === 'started' ? (
                        <span className="shrink-0 text-[12px] text-fg-subtle">{here ? 'On this computer' : 'Downloading'}</span>
                      ) : (
                        <ActionButton size="xs" blocked={downloadBlocked} loading={state === 'starting'} onClick={() => download(file)}>Download</ActionButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-fg-muted">
                No {config.extensions.join(', ')} files in this repo.
              </p>
            )}
          </div>
        ) : (
          <>
            <SearchField
              value={query}
              onChange={setQuery}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  search(query, scope);
                }
              }}
              placeholder={config.query}
              aria-label="Search Hugging Face"
              disabled={offline}
            />
            {offline ? (
              <Notice tone="warning">You&apos;re offline. Searching Hugging Face needs the internet.</Notice>
            ) : results.loading ? <Loading /> : results.error ? (
              <Notice tone="error" action={<Button variant="ghost" size="xs" onClick={() => search(query, scope)}>Try again</Button>}>
                {results.error}
              </Notice>
            ) : results.repos?.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {results.repos.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openRepo(item)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                      data-hf-repo={item.id}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{item.id}</span>
                      <span className="hidden shrink-0 text-[12px] tabular-nums text-fg-subtle sm:inline">
                        {repoMeta(item)}{item.gated ? ' · gated' : ''}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : results.repos ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-fg-muted">Nothing found. Try other words.</p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

HuggingFaceDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  scopes: PropTypes.arrayOf(PropTypes.oneOf(['listening', 'speaking', 'images'])),
  offline: PropTypes.bool,
  filesHere: PropTypes.arrayOf(PropTypes.string),
};
