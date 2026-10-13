// Models → Images: the pictures Asyncat made, newest first. Open one to see
// what it was made from, download it, change it in a chat, or delete it.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Download, Images, Loader2, Pencil, Trash2, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { useConfirm } from '../../components/confirmContext.js';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { subscribeAppEvent } from '../../services/appEvents.js';
import eventBus from '../../utils/eventBus.js';
import { mediaApi, mediaUrl } from './mediaApi.js';

function Viewer({ image, onClose, onDeleted }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this picture?', message: 'It is removed from this computer.', confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await mediaApi.gallery.remove(image.name);
      onDeleted();
    } catch (err) {
      toast.error("Couldn't delete it", { detail: errorDetail(err) });
    }
  };

  // A new chat with the request started; the composer takes it once it is there.
  const editInChat = () => {
    navigate('/home');
    setTimeout(() => eventBus.emit('composer:prefill', `Change the picture ${image.name} from the gallery: `), 400);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog" aria-label="Picture">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-elevated shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[13px] text-fg">{image.prompt || image.name}</p>
          <Button size="icon" variant="ghost" icon={X} aria-label="Close" onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas p-3">
          <img src={mediaUrl(image.url)} alt={image.prompt || image.name} className="max-h-[65vh] max-w-full rounded-lg object-contain" />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <span className="mr-auto text-[12px] text-fg-subtle">
            {[image.runtime, image.model, image.width && image.height ? `${image.width}×${image.height}` : null, new Date(image.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
          </span>
          <Button size="sm" icon={Pencil} onClick={editInChat}>Change it in a chat</Button>
          <a href={mediaUrl(image.url)} download={image.name} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-fg hover:bg-hover">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <Button size="sm" variant="danger" icon={Trash2} onClick={remove}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

Viewer.propTypes = { image: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired, onDeleted: PropTypes.func.isRequired };

export default function GallerySection({ refreshKey = 0 }) {
  const [images, setImages] = useState(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(24);

  const load = useCallback(async () => {
    try {
      const res = await mediaApi.gallery.list({ limit });
      setImages(res.images || []);
      setTotal(res.total || 0);
    } catch {
      setImages([]);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load, refreshKey]);
  // A picture made in a chat shows up when its run finishes.
  useEffect(() => subscribeAppEvent('conversation.updated', load), [load]);

  return (
    <section className="space-y-3" data-gallery>
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
        <Images className="h-4 w-4 text-fg-subtle" /> Gallery {total ? <span className="font-normal text-fg-subtle">{total}</span> : null}
      </h2>
      {images === null ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted">Pictures Asyncat makes, in chats or here, show up here.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((image) => (
              <button
                key={image.name}
                type="button"
                onClick={() => setOpen(image)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-hover"
                title={image.prompt || image.name}
              >
                <img src={mediaUrl(image.url)} alt={image.prompt || image.name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
              </button>
            ))}
          </div>
          {total > images.length ? <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 24)}>Show more</Button> : null}
        </>
      )}
      {open ? <Viewer image={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); load(); }} /> : null}
    </section>
  );
}

GallerySection.propTypes = { refreshKey: PropTypes.number };
