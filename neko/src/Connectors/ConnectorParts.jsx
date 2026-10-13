import PropTypes from 'prop-types';
import { STATUS, statusLine } from './connectorFormat.js';

const TONES = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  muted: 'bg-fg-subtle/60',
};

/** A tile with the connector's initial; local programs get a square corner mark. */
export function ConnectorIcon({ title, kind = 'remote', size = 'md' }) {
  const box = size === 'lg' ? 'h-11 w-11 text-[17px] rounded-xl' : 'h-9 w-9 text-[14px] rounded-lg';
  return (
    <span className={`relative flex shrink-0 items-center justify-center border border-line bg-surface font-semibold text-fg ${box}`} aria-hidden="true">
      {String(title || '?').trim().charAt(0).toUpperCase() || '?'}
      {kind === 'local' ? <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-[3px] border-2 border-canvas bg-fg-muted" /> : null}
    </span>
  );
}

ConnectorIcon.propTypes = { title: PropTypes.string, kind: PropTypes.string, size: PropTypes.oneOf(['md', 'lg']) };

export function ConnectorStatus({ connector }) {
  const tone = TONES[(STATUS[connector.status] || STATUS.starting).tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted" data-connector-status={connector.status}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone} ${connector.status === 'starting' ? 'animate-pulse' : ''}`} />
      {statusLine(connector)}
    </span>
  );
}

ConnectorStatus.propTypes = { connector: PropTypes.object.isRequired };
