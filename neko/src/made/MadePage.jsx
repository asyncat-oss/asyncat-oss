// "Made by agents": everything agents have made in one place. Pictures,
// documents, pages, data and diagrams they saved in any project, Cat or
// agent folder, and notes they wrote, with a viewer for each.

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Code2, Download, FileText, Globe, Image as ImageIcon, LayoutGrid, MessageSquare, Music, Network, NotebookPen, Table } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';
import apiClient from '../services/apiClient.js';
import { mediaUrl } from '../Models/media/mediaApi.js';
import { BlockRenderer, parseAIResponseToBlocks } from '../CommandCenter/components/renderers/BlockBasedMessageRenderer.jsx';
import { InteractiveTable } from '../CommandCenter/components/renderers/InteractiveBlocks.jsx';
import { parseCsv } from './csv.js';

const KINDS = [
  { id: 'picture', label: 'Pictures', icon: ImageIcon },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'page', label: 'Pages', icon: Globe },
  { id: 'data', label: 'Data', icon: Table },
  { id: 'diagram', label: 'Diagrams', icon: Network },
  { id: 'note', label: 'Notes', icon: NotebookPen },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'code', label: 'Code', icon: Code2 },
];
const KIND = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));

const fileUrl = (item, download = false) => `${API_BASE_URL}/made/file?root=${encodeURIComponent(item.root)}&name=${encodeURIComponent(item.name)}${download ? '&download=1' : ''}`;

function ago(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Card({ item, onOpen }) {
  const kind = KIND[item.kind] || KIND.code;
  const Icon = kind.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/40"
      data-made-item={item.kind}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-hover/60">
        {item.kind === 'picture' ? (
          <img src={mediaUrl(item.url)} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        ) : (
          <Icon className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 px-3 py-2.5">
        <p className="truncate text-[13px] font-medium text-fg" title={item.title}>{item.title}</p>
        <p className="truncate text-[11px] text-fg-subtle">{kind.label.replace(/s$/, '')} · {item.where} · {ago(item.createdAt)}</p>
      </div>
    </button>
  );
}

Card.propTypes = { item: PropTypes.object.isRequired, onOpen: PropTypes.func.isRequired };

function FileBody({ item }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState('');
  const textual = ['document', 'page', 'data', 'diagram', 'code'].includes(item.kind) && !/\.(pdf|docx|xlsx)$/i.test(item.name || '');
  useEffect(() => {
    if (!textual) return undefined;
    let alive = true;
    apiClient.request(fileUrl(item))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`It couldn't be opened (${res.status}).`))))
      .then((body) => { if (alive) setText(body); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [item, textual]);
  const svgUrl = useMemo(() => (text !== null && /\.svg$/i.test(item.name || '') ? URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })) : null), [item.name, text]);
  useEffect(() => () => { if (svgUrl) URL.revokeObjectURL(svgUrl); }, [svgUrl]);

  if (!textual) {
    return <p className="text-[13px] text-fg-muted">This kind of file opens in another app. Download it to open it.</p>;
  }
  if (error) return <p role="alert" className="text-[13px] text-red-600">{error}</p>;
  if (text === null) return <p className="text-[13px] text-fg-muted">Opening…</p>;
  if (item.kind === 'page') {
    // Shown in a sandbox: its scripts run apart from Asyncat.
    return <iframe title={item.title} sandbox="allow-scripts" srcDoc={text} className="h-[60vh] w-full rounded-lg border border-line bg-white" />;
  }
  if (svgUrl) return <img src={svgUrl} alt={item.title} className="mx-auto max-h-[60vh] max-w-full rounded-lg bg-white p-2" />;
  if (item.kind === 'data' && /\.(csv|tsv)$/i.test(item.name || '')) {
    const rows = parseCsv(text);
    if (rows.length > 1) {
      const width = Math.max(...rows.map((row) => row.length));
      return <InteractiveTable rows={rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''))} renderCell={(cell) => cell} />;
    }
  }
  if (/\.(md|markdown)$/i.test(item.name || '')) {
    return (
      <div className="max-h-[60vh] overflow-y-auto">
        {parseAIResponseToBlocks(text).map((block, index) => <BlockRenderer key={index} block={block} />)}
      </div>
    );
  }
  return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-hover/50 p-3 font-mono text-[12px] leading-5 text-fg">{text}</pre>;
}

FileBody.propTypes = { item: PropTypes.object.isRequired };

function Viewer({ item, onClose }) {
  const navigate = useNavigate();
  const downloadable = item.kind !== 'note' && item.kind !== 'picture';
  return (
    <Dialog
      size="xl"
      title={item.title}
      description={`${(KIND[item.kind] || KIND.code).label.replace(/s$/, '')} · ${item.where} · ${ago(item.createdAt)}`}
      onClose={onClose}
      footer={(
        <>
          {item.kind === 'note' && item.conversationId ? (
            <Button icon={MessageSquare} onClick={() => navigate(`/conversations/${item.conversationId}`)}>Open the chat it came from</Button>
          ) : null}
          {downloadable ? <a href={fileUrl(item, true)} download={item.name} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-fg hover:bg-hover"><Download className="h-3.5 w-3.5" /> Download</a> : null}
          {item.kind === 'picture' ? <a href={mediaUrl(item.url)} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-fg hover:bg-hover"><Download className="h-3.5 w-3.5" /> Download</a> : null}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>
      )}
    >
      {item.kind === 'picture' ? (
        <div className="space-y-2">
          <img src={mediaUrl(item.url)} alt={item.title} className="mx-auto max-h-[60vh] max-w-full rounded-lg object-contain" />
          {item.prompt ? <p className="text-[12px] leading-5 text-fg-muted">{item.prompt}</p> : null}
        </div>
      ) : item.kind === 'note' ? (
        <p className="text-[13px] leading-5 text-fg-muted">A note an agent wrote. Notes open in the chat they were made in, where you can edit them.</p>
      ) : (
        <FileBody item={item} />
      )}
    </Dialog>
  );
}

Viewer.propTypes = { item: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired };

export default function MadePage() {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('all');
  const [where, setWhere] = useState('all');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    apiRequest(`${API_BASE_URL}/made`).then(setData).catch((err) => setData({ error: err.message, items: [], counts: {} }));
  }, []);

  const places = useMemo(() => [...new Set((data?.items || []).map((item) => item.where))].sort(), [data]);
  const shown = (data?.items || []).filter((item) => (kind === 'all' || item.kind === kind) && (where === 'all' || item.where === where));
  const chip = (id, label, count) => (
    <button
      key={id}
      type="button"
      onClick={() => setKind(id)}
      aria-pressed={kind === id}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${kind === id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'}`}
    >
      {label}<span className="text-fg-subtle">{count}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader title="Made by agents" description="Pictures, documents, pages, data and notes your agents and Cats have made, wherever they saved them." />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5" data-made-page>
          {data?.error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{data.error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {chip('all', 'Everything', data?.total ?? 0)}
            {KINDS.filter((item) => data?.counts?.[item.id]).map((item) => chip(item.id, item.label, data.counts[item.id]))}
            {places.length > 1 ? (
              <select value={where} onChange={(event) => setWhere(event.target.value)} aria-label="Where" className="ml-auto rounded-lg border border-line bg-canvas px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent">
                <option value="all">Everywhere</option>
                {places.map((place) => <option key={place} value={place}>{place}</option>)}
              </select>
            ) : null}
          </div>
          {!data ? (
            <p className="text-[13px] text-fg-muted">Loading…</p>
          ) : shown.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((item) => <Card key={item.id} item={item} onOpen={setOpen} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-fg-muted">
              <LayoutGrid className="h-7 w-7 text-fg-subtle" />
              <p className="text-[13px]">Nothing here yet. Pictures, documents and pages agents make show up here.</p>
            </div>
          )}
        </div>
      </div>
      {open ? <Viewer item={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
