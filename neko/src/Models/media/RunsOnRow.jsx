// The "Runs on" row of a group: whether listening, speaking or making images
// happens on this computer, in ComfyUI, with a service (and whether its key
// is saved), or not at all, chosen in place, and why a switch failed.

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import Select from '../../components/ui/Select.jsx';
import { PropertyRow } from '../../components/ui/Rows.jsx';
import { runsOnOptions } from './providers.js';

const NAMES = { stt: 'Where listening runs', tts: 'Where speaking runs', image: 'Where images are made' };

/**
 *   <RunsOnRow kind="stt" value={status.stt.provider} cloud={catalog.cloud}
 *     unsupportedReason={runtime?.unsupportedReason} onChange={draftProvider} />
 *
 * `onChange(provider)` gets 'local', 'comfyui', a service id or 'off'.
 * `error` ("Couldn't switch to OpenAI: …") shows under the row.
 */
export default function RunsOnRow({ kind, value, cloud, unsupportedReason = null, onChange, disabled = false, error = null, highlight }) {
  const options = useMemo(() => runsOnOptions(kind, cloud || {}, { unsupportedReason }), [kind, cloud, unsupportedReason]);
  return (
    <PropertyRow
      label="Runs on"
      highlight={highlight}
      data-runs-on={kind}
      value={(
        <Select
          variant="inline"
          value={value}
          onChange={onChange}
          options={options}
          disabled={disabled}
          // Images list ComfyUI and four services, some with a second line: all show at once.
          menuWidth={kind === 'image' ? 300 : 260}
          menuHeight={kind === 'image' ? 380 : undefined}
          aria-label={NAMES[kind]}
        />
      )}
      open={Boolean(error)}
    >
      <p role="alert" className="-mt-1.5 text-[12px] leading-5 text-red-600 dark:text-red-400 sm:pl-36">{error}</p>
    </PropertyRow>
  );
}

RunsOnRow.propTypes = {
  kind: PropTypes.oneOf(['stt', 'tts', 'image']).isRequired,
  value: PropTypes.string,
  cloud: PropTypes.object,
  unsupportedReason: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  error: PropTypes.node,
  highlight: PropTypes.any,
};
