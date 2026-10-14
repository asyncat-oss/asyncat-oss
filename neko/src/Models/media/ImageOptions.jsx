// Images → Try it → Options: the shape, what to avoid, the seed, and on
// this computer or in ComfyUI the steps, guidance, sampler (and scheduler
// and checkpoint in ComfyUI). Empty fields mean the model's own default.

import { useId } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Popover from '../../components/ui/Popover.jsx';
import Select from '../../components/ui/Select.jsx';
import { Segmented } from '../../components/ui/Tabs.jsx';
import { EMPTY_OPTIONS, SHAPES, optionFields } from './imageOptions.js';

const NUMBER = 'h-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function Label({ htmlFor, children }) {
  return <label htmlFor={htmlFor} className="self-center text-[12px] text-fg-muted">{children}</label>;
}

Label.propTypes = { htmlFor: PropTypes.string, children: PropTypes.node };

const defaultOption = (label = 'Model default') => ({ value: '', label });

/**
 *   <ImageOptions anchorRef={ref} open={open} onClose={close} options={options} onChange={setOptions}
 *     provider={status.provider} defaults={status.defaults} samplers={status.samplers} schedulers={status.schedulers} />
 */
export default function ImageOptions({
  anchorRef,
  open,
  onClose,
  options,
  onChange,
  provider = 'local',
  defaults = {},
  samplers = [],
  schedulers = [],
  checkpoints = [],
  checkpoint = null,
}) {
  const ids = { avoid: useId(), seed: useId(), steps: useId(), cfg: useId(), sampler: useId(), scheduler: useId(), checkpoint: useId() };
  const fields = optionFields(provider);
  const set = (key, value) => onChange({ ...options, [key]: value });
  const digits = (value) => value.replace(/[^\d]/g, '');

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} label="Image options" width={320} placement="bottom-end">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2.5" data-image-options>
        <span className="self-center text-[12px] text-fg-muted">Shape</span>
        <Segmented size="sm" role="radiogroup" label="Shape" className="justify-self-start" value={options.shape} onChange={(value) => set('shape', value)} items={SHAPES} />

        {fields.avoid ? (
          <>
            <Label htmlFor={ids.avoid}>Avoid</Label>
            <Input id={ids.avoid} className="h-8" value={options.negativePrompt} onChange={(event) => set('negativePrompt', event.target.value)} placeholder="blurry, extra fingers" autoComplete="off" />
          </>
        ) : null}

        {fields.seed ? (
          <>
            <Label htmlFor={ids.seed}>Seed</Label>
            <Input id={ids.seed} className={NUMBER} inputMode="numeric" value={options.seed} onChange={(event) => set('seed', digits(event.target.value))} placeholder="Random" autoComplete="off" />
          </>
        ) : null}

        {fields.steps ? (
          <>
            <Label htmlFor={ids.steps}>Steps</Label>
            <div className="flex items-center gap-3">
              <Input id={ids.steps} className={`${NUMBER} w-16`} inputMode="numeric" value={options.steps} onChange={(event) => set('steps', digits(event.target.value))} placeholder={defaults.steps ? String(defaults.steps) : 'Default'} autoComplete="off" />
              <label htmlFor={ids.cfg} className="text-[12px] text-fg-muted">Guidance</label>
              <Input id={ids.cfg} className={`${NUMBER} w-16`} inputMode="decimal" value={options.cfg} onChange={(event) => set('cfg', event.target.value.replace(/[^\d.]/g, ''))} placeholder={defaults.cfg ? String(defaults.cfg) : 'Default'} autoComplete="off" />
            </div>
          </>
        ) : null}

        {fields.sampler && samplers.length ? (
          <>
            <Label htmlFor={ids.sampler}>Sampler</Label>
            <Select id={ids.sampler} size="sm" value={options.sampler} onChange={(value) => set('sampler', value)} options={[defaultOption(defaults.sampler ? `Model default (${defaults.sampler})` : 'Model default'), ...samplers.map((name) => ({ value: name, label: name }))]} />
          </>
        ) : null}

        {fields.scheduler && schedulers.length ? (
          <>
            <Label htmlFor={ids.scheduler}>Scheduler</Label>
            <Select id={ids.scheduler} size="sm" value={options.scheduler} onChange={(value) => set('scheduler', value)} options={[defaultOption(), ...schedulers.map((name) => ({ value: name, label: name }))]} />
          </>
        ) : null}

        {fields.checkpoint && checkpoints.length > 1 ? (
          <>
            <Label htmlFor={ids.checkpoint}>Checkpoint</Label>
            <Select
              id={ids.checkpoint}
              size="sm"
              value={options.checkpoint}
              onChange={(value) => set('checkpoint', value)}
              options={[defaultOption(checkpoint ? `As chosen (${checkpoint})` : 'As chosen'), ...checkpoints.map((name) => ({ value: name, label: name }))]}
            />
          </>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="xs" onClick={() => onChange({ ...EMPTY_OPTIONS })}>Reset</Button>
      </div>
    </Popover>
  );
}

ImageOptions.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  options: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  provider: PropTypes.string,
  defaults: PropTypes.object,
  samplers: PropTypes.arrayOf(PropTypes.string),
  schedulers: PropTypes.arrayOf(PropTypes.string),
  checkpoints: PropTypes.arrayOf(PropTypes.string),
  checkpoint: PropTypes.string,
};
