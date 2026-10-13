// The question a connector asks before it downloads anything: what it
// fetches, from where, and how big it is. Nothing downloads until the user
// clicks the button.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Download, Loader2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { downloadSizeText } from './connectorFormat.js';

const SOURCES = { npm: 'npm', pypi: 'the Python package index', image: 'its image registry' };

function whatText(download) {
  const name = download.version ? `${download.name} ${download.version}` : download.name;
  if (download.kind === 'image') return `${download.launcher} pulls the image ${name}`;
  return `${download.launcher || 'It'} downloads ${name} from ${SOURCES[download.kind] || 'the internet'}`;
}

/**
 * `check({ deep })` resolves to { download } (see den's downloadSize).
 * `onApprove(version)` is called with the version that was shown, so the OK
 * covers exactly that one.
 */
export default function DownloadNotice({ check, onApprove, approveLabel = 'Download and start', busy = false, children = null }) {
  const [download, setDownload] = useState(null);
  const [error, setError] = useState('');
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    check({ deep: false })
      .then((res) => { if (!cancelled) setDownload(res.download); })
      .catch((err) => { if (!cancelled) setError(err.message || "Couldn't check the size."); });
    return () => { cancelled = true; };
  }, [check]);

  const countAll = async () => {
    setCounting(true);
    try {
      const res = await check({ deep: true });
      setDownload(res.download);
    } catch (err) {
      setError(err.message || "Couldn't count them.");
    } finally {
      setCounting(false);
    }
  };

  if (!download && !error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-hover/40 px-3 py-2.5 text-[13px] text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking what it downloads…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3" data-download-notice>
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <Download className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Downloads before it first runs
      </p>
      {download ? (
        <>
          <p className="mt-1 text-[13px] leading-5 text-fg-muted">
            {whatText(download)}: <span className="font-medium text-fg">{downloadSizeText(download)}</span>.
            {download.shallow && download.dependencies ? (
              <>
                {' '}
                <button type="button" onClick={countAll} disabled={counting} className="text-accent underline-offset-2 hover:underline disabled:opacity-60">
                  {counting ? 'Counting…' : 'Count those too'}
                </button>
                <span className="text-fg-subtle"> (looks each one up, which uses a little data)</span>
              </>
            ) : null}
          </p>
          {download.error ? <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{download.error}</p> : null}
          {download.note ? <p className="mt-1 text-[12px] leading-5 text-fg-subtle">{download.note}</p> : null}
        </>
      ) : (
        <p className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={Download} loading={busy} onClick={() => onApprove(download?.version || null)}>{approveLabel}</Button>
        {children}
      </div>
    </div>
  );
}

DownloadNotice.propTypes = {
  check: PropTypes.func.isRequired,
  onApprove: PropTypes.func.isRequired,
  approveLabel: PropTypes.string,
  busy: PropTypes.bool,
  children: PropTypes.node,
};
