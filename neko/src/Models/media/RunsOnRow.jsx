// The "Runs on" row of a group: whether listening, speaking or making images
// happens on this computer, in ComfyUI, with a service (and whether its key
// is saved), or not at all, chosen in place.

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
 */
export default function RunsOnRow({ kind, value, cloud, unsupportedReason = null, onChange, disabled = false, highlight }) {
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
          menuWidth={260}
          aria-label={NAMES[kind]}
        />
      )}
    />
  );
}

RunsOnRow.propTypes = {
  kind: PropTypes.oneOf(['stt', 'tts', 'image']).isRequired,
  value: PropTypes.string,
  cloud: PropTypes.object,
  unsupportedReason: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  highlight: PropTypes.any,
};
