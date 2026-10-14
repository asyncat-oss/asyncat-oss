// The Files viewer: one item in a dialog. Pictures with what they were made
// from, text, Markdown, CSV tables, drawings, pages (in a sandbox, their
// scripts apart from Asyncat), sound and video, and a log's last lines.
// What can't be shown says so; the footer has what can be done with it.

import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Copy, Download, ExternalLink, FolderOpen, Loader2, MessageSquare, Pencil } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button, { buttonClass } from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import { BlockRenderer, parseAIResponseToBlocks } from '../CommandCenter/components/renderers/BlockBasedMessageRenderer.jsx';
import { InteractiveTable } from '../CommandCenter/components/renderers/InteractiveBlocks.jsx';
import { parseCsv } from './csv.js';
import { manageLabel, removeLabel } from './fileActions.js';
import { formatBytes, longDate, pictureDetails, previewKind } from './fileFormat.js';
import { storageApi, contentUrl, downloadUrl, serverUrl } from './storageApi.js';

const LOG_LINES = 1000;
const TITLE_MAX = 80;

function useText(item, kind) {
  const [state, setState] = useState({ text: null, cut: false, error: '' });
  const textual = ['page', 'svg', 'table', 'markdown', 'text', 'log'].includes(kind);
  useEffect(() => {
    if (!textual) return undefined;
    let alive = true;
    setState({ text: null, cut: false, error: '' });
    storageApi.text(item.id, { tail: kind === 'log' ? LOG_LINES : null })
      .then((result) => { if (alive) setState({ ...result, error: '' }); })
      .catch((err) => { if (alive) setState({ text: null, cut: false, error: err.message }); });
    return () => { alive = false; };
  }, [item.id, kind, textual]);
  return state;
}

function TextBody({ item, kind }) {
  const { text, cut, error } = useText(item, kind);
  const logRef = useRef(null);
  const svgUrl = useMemo(() => (kind === 'svg' && text !== null ? URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })) : null), [kind, text]);
  useEffect(() => () => { if (svgUrl) URL.revokeObjectURL(svgUrl); }, [svgUrl]);
  // A log opens at its end, where the newest lines are.
  useEffect(() => {
    if (kind === 'log' && text !== null && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [kind, text]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (text === null) return <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Opening…</p>;

  const more = cut ? (
    <Notice className="mt-3">
      {kind === 'log' ? `Showing the last ${LOG_LINES.toLocaleString()} lines. Download it to see all of it.` : 'Showing the first 2 MB. Download it to see all of it.'}
    </Notice>
  ) : null;

  let body;
  if (kind === 'page') {
    // Shown in a sandbox: its scripts run apart from Asyncat.
    body = <iframe title={item.title} sandbox="allow-scripts" srcDoc={text} className="h-[60vh] w-full rounded-lg border border-line bg-white" />;
  } else if (kind === 'svg' && svgUrl) {
    body = <img src={svgUrl} alt={item.title} className="mx-auto max-h-[60vh] max-w-full rounded-lg bg-white p-2" />;
  } else if (kind === 'table' && parseCsv(text).length > 1) {
    const rows = parseCsv(text);
    const width = Math.max(...rows.map((row) => row.length));
    body = <InteractiveTable rows={rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))} renderCell={(cell) => cell} />;
  } else if (kind === 'markdown') {
    body = (
      <div className="max-h-[60vh] overflow-y-auto">
        {parseAIResponseToBlocks(text).map((block, index) => <BlockRenderer key={index} block={block} />)}
      </div>
    );
  } else if (!text) {
    body = <p className="text-[13px] text-fg-muted">It&apos;s empty.</p>;
  } else {
    body = (
      <pre ref={logRef} className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 font-mono text-[12px] leading-5 text-fg">
        {text}
      </pre>
    );
  }
  return <>{body}{more}</>;
}

TextBody.propTypes = { item: PropTypes.object.isRequired, kind: PropTypes.string.isRequired };

function PictureBody({ item }) {
  const src = item.place === 'made' && item.thumbUrl ? serverUrl(item.thumbUrl) : contentUrl(item.id);
  const details = item.kind === 'picture' ? pictureDetails(item) : [];
  return (
    <div className="space-y-3">
      <img src={src} alt={item.prompt || item.title} className="mx-auto max-h-[60vh] max-w-full rounded-lg object-contain" />
      <div className="space-y-1">
        {/* The title has the prompt; all of it shows here when it was cut short. */}
        {item.prompt && item.prompt.length > TITLE_MAX ? <p className="text-[13px] leading-5 text-fg">{item.prompt}</p> : null}
        {details.length ? <p className="text-[12px] tabular-nums text-fg-subtle">{details.join(' · ')}</p> : null}
        {item.editedFrom ? <p className="text-[12px] text-fg-subtle">Changed from {item.editedFrom}</p> : null}
      </div>
    </div>
  );
}

PictureBody.propTypes = { item: PropTypes.object.isRequired };

function Unshown({ item, desktop }) {
  let text = "This kind of file can't be shown here.";
  if (item.isFolder) text = 'A folder.';
  if (item.place === 'models') text = item.can?.manage ? 'A model file. Use it from Models.' : 'A model file.';
  const next = desktop && item.can?.open ? 'Open it in another app to see it.' : item.can?.download && !item.isFolder ? 'Download it to open it.' : '';
  return <p className="text-[13px] leading-5 text-fg-muted">{text}{next ? ` ${next}` : ''}</p>;
}

Unshown.propTypes = { item: PropTypes.object.isRequired, desktop: PropTypes.bool };

function PathLine({ item, onAction }) {
  if (!item.path) return null;
  return (
    <div className="mt-4 flex min-w-0 items-center gap-1 border-t border-line pt-3">
      <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-muted" title={item.path}>{item.path}</p>
      <IconButton icon={Copy} label="Copy path" size="sm" onClick={() => onAction(item, 'copy')} />
    </div>
  );
}

PathLine.propTypes = { item: PropTypes.object.isRequired, onAction: PropTypes.func.isRequired };

export default function FileViewer({ item, desktop = false, onClose, onAction }) {
  const kind = previewKind(item);
  const can = item.can || {};
  const description = item.kind === 'picture'
    ? [item.kindLabel, longDate(item.modifiedAt)].filter(Boolean).join(' · ')
    : [item.kindLabel, item.where, longDate(item.modifiedAt), formatBytes(item.bytes)].filter(Boolean).join(' · ');
  const title = item.kind === 'picture' && item.prompt
    ? (item.prompt.length > TITLE_MAX ? `${item.prompt.slice(0, TITLE_MAX - 1).trimEnd()}…` : item.prompt)
    : item.title || item.name || 'Untitled';

  let body;
  if (item.kind === 'note') {
    body = <p className="text-[13px] leading-5 text-fg-muted">A note an agent wrote. Notes open in the chat they were made in, where you can edit them.</p>;
  } else if (kind === 'picture') {
    body = <PictureBody item={item} />;
  } else if (kind === 'audio') {
    body = <audio controls src={contentUrl(item.id)} className="w-full" />;
  } else if (kind === 'video') {
    body = <video controls src={contentUrl(item.id)} className="mx-auto max-h-[60vh] max-w-full rounded-lg" />;
  } else if (kind) {
    body = <TextBody item={item} kind={kind} />;
  } else {
    body = <Unshown item={item} desktop={desktop} />;
  }

  return (
    <Dialog
      size="xl"
      title={title}
      description={description}
      onClose={onClose}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-end gap-2" data-file-viewer-actions>
          {can.delete ? (
            <Button variant="danger" className="mr-auto" onClick={() => onAction(item, 'remove')}>{removeLabel(item, { desktop })}</Button>
          ) : item.lockedReason ? (
            <p className="mr-auto text-[12px] text-fg-subtle">{item.lockedReason}</p>
          ) : null}
          {can.chat && item.kind === 'picture' ? <Button icon={Pencil} onClick={() => onAction(item, 'chat')}>Change it in a chat</Button> : null}
          {can.chat && item.kind === 'note' && item.conversationId ? (
            <Button icon={MessageSquare} onClick={() => onAction(item, 'source')}>Open the chat it came from</Button>
          ) : null}
          {can.manage && item.manageRoute ? <Button onClick={() => onAction(item, 'manage')}>{manageLabel(item)}</Button> : null}
          {desktop && can.reveal ? <Button icon={FolderOpen} onClick={() => onAction(item, 'reveal')}>Show in folder</Button> : null}
          {desktop && can.open ? <Button icon={ExternalLink} onClick={() => onAction(item, 'open')}>Open in another app</Button> : null}
          {can.download ? (
            <a href={downloadUrl(item.id)} download={item.name || undefined} className={buttonClass('secondary', 'sm')}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} /> Download
            </a>
          ) : null}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      )}
    >
      <div data-file-viewer={item.kind}>
        {body}
        {item.kind !== 'note' ? <PathLine item={item} onAction={onAction} /> : null}
      </div>
    </Dialog>
  );
}

FileViewer.propTypes = {
  item: PropTypes.object.isRequired,
  desktop: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
};
