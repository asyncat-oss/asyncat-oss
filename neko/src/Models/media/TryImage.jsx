// Images → Try it: describe an image and make it with what is chosen, with
// options for its shape, seed and the rest. The result shows here with its
// size, seed and time, and like every image Asyncat makes it is kept in
// Files with what it was made from.

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import IconButton from '../../components/ui/IconButton.jsx';
import Notice from '../../components/ui/Notice.jsx';
import { errorDetail } from '../../components/toastContext.js';
import { subscribeAppEvent } from '../../services/appEvents.js';
import eventBus from '../../utils/eventBus.js';
import ImageOptions from './ImageOptions.jsx';
import { changedCount, imagesMadeText, optionFields, optionsSummary, picturesUrl, resultMeta, saveOptions, savedOptions, tryOptions } from './imageOptions.js';
import { mediaApi, mediaUrl } from './mediaApi.js';

export const TRY_PROMPT = 'A small cat asleep on a sunny windowsill';
const LINK = 'font-medium text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-fg-subtle';

/**
 * "34 images made · Open in Files", for the Try it heading. It counts again
 * when `refreshKey` changes and when a chat finishes (images are made there
 * too).
 */
export function ImagesMade({ refreshKey = 0 }) {
  const [total, setTotal] = useState(null);
  const load = useCallback(() => {
    mediaApi.gallery.list({ limit: 1 }).then((res) => setTotal(Number(res?.total) || 0)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => subscribeAppEvent('conversation.updated', load), [load]);
  if (total === null) return null;
  return (
    <span data-images-made={total}>
      {imagesMadeText(total)}
      {total ? <> · <Link to={picturesUrl()} className={LINK}>Open in Files</Link></> : null}
    </span>
  );
}

ImagesMade.propTypes = { refreshKey: PropTypes.any };

/**
 *   <TryImage status={status} ready={status.ready} comfy={comfyStatus} onMade={() => setMade((n) => n + 1)} />
 *
 * `status` is GET /media/images's status (provider, defaults, samplers,
 * schedulers, checkpoint); `comfy` is ComfyUI's status, for its
 * checkpoints. Before images are set up it is disabled.
 */
export default function TryImage({ status, ready = false, comfy = null, onMade }) {
  const navigate = useNavigate();
  const optionsRef = useRef(null);
  const [prompt, setPrompt] = useState(TRY_PROMPT);
  const [options, setOptionsState] = useState(savedOptions);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null); // { image, seconds }
  const [error, setError] = useState('');
  const provider = status?.provider || 'local';
  const defaults = status?.defaults || {};
  const fields = optionFields(provider);
  const changed = changedCount(options, provider);

  const setOptions = (next) => setOptionsState(saveOptions(next));

  // Seconds since "Make it", while it works.
  useEffect(() => {
    if (!busy) return undefined;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const make = async (event) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || busy || !ready) return;
    setBusy(true);
    setError('');
    setOptionsOpen(false);
    const started = Date.now();
    try {
      const res = await mediaApi.images.tryIt(text, tryOptions(options, provider, defaults));
      setResult({ image: res.image, seconds: (Date.now() - started) / 1000 });
      onMade?.(res.image);
    } catch (err) {
      // The image above was made from something else: it goes with the error.
      setResult(null);
      setError(errorDetail(err) || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  // A new chat with the request started; the composer takes it once it is there.
  const changeInChat = () => {
    const name = result?.image?.name;
    navigate('/home');
    setTimeout(() => eventBus.emit('composer:prefill', name ? `Change the image ${name} from the gallery: ` : 'Change this image: '), 400);
  };

  const image = result?.image;
  const line = !ready
    ? 'Set up images above to try one.'
    : busy
      ? `${elapsed} s · The first image takes longest while the model loads.`
      : optionsSummary(options, provider, defaults);

  return (
    <div className="space-y-3 rounded-xl border border-line p-4" data-try-image>
      <form className="flex flex-wrap items-center gap-2" onSubmit={make}>
        <Input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          aria-label="Describe an image"
          placeholder={TRY_PROMPT}
          disabled={!ready}
          className="min-w-0 flex-1 basis-full sm:basis-0"
        />
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            ref={optionsRef}
            icon={SlidersHorizontal}
            label={changed ? `Image options (${changed} set)` : 'Image options'}
            aria-haspopup="dialog"
            aria-expanded={optionsOpen}
            disabled={!ready}
            onClick={() => setOptionsOpen((open) => !open)}
          />
          <Button type="submit" variant="primary" size="md" loading={busy} disabled={!ready || !prompt.trim()}>Make it</Button>
        </div>
      </form>
      <p className="text-[12px] tabular-nums leading-5 text-fg-subtle" aria-live="polite">{line}</p>
      {error ? <Notice tone="error">Couldn&apos;t make the image: {error}</Notice> : null}
      {image?.url ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start" data-try-result>
          <img src={mediaUrl(image.url)} alt={image.prompt || 'The test image'} className="max-h-56 max-w-full self-start rounded-xl border border-line" />
          <div className="min-w-0 space-y-1">
            <p className="text-[12px] tabular-nums text-fg-subtle">{resultMeta(image, result.seconds)}</p>
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {image.name ? <Button variant="ghost" size="xs" onClick={() => navigate(picturesUrl(image.name))}>Open in Files</Button> : null}
              {fields.seed && image.seed !== null && image.seed !== undefined ? (
                <Button variant="ghost" size="xs" disabled={String(image.seed) === options.seed} onClick={() => setOptions({ ...options, seed: String(image.seed) })}>Use this seed</Button>
              ) : null}
              <Button variant="ghost" size="xs" onClick={changeInChat}>Change it in a chat</Button>
            </div>
          </div>
        </div>
      ) : null}
      <ImageOptions
        anchorRef={optionsRef}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        options={options}
        onChange={setOptions}
        provider={provider}
        defaults={defaults}
        samplers={status?.samplers || []}
        schedulers={status?.schedulers || []}
        checkpoints={comfy?.checkpoints || []}
        checkpoint={status?.checkpoint || null}
      />
    </div>
  );
}

TryImage.propTypes = {
  status: PropTypes.object,
  ready: PropTypes.bool,
  comfy: PropTypes.object,
  onMade: PropTypes.func,
};
