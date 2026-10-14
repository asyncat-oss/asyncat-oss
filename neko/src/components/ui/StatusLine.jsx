// One line saying how something is doing: a coloured dot, a short sentence,
// an optional detail and action, and a bar while it is working. No box.

import PropTypes from 'prop-types';
import Button from './Button.jsx';
import { Progress } from './Progress.jsx';

const DOTS = {
  progress: 'bg-accent animate-pulse',
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  off: 'bg-fg-subtle/50',
};

/**
 *   <StatusLine tone="progress" text="Setting up voice…" detail="Whisper base" percent={40} />
 *   <StatusLine tone="error" text="Couldn't start the engine" action={{ label: 'Try again', onClick: retry }} />
 *
 * `action` is { label, onClick } or a node.
 */
export default function StatusLine({ tone = 'ok', text, detail, percent, action, className = '' }) {
  const actionNode = action && typeof action === 'object' && 'label' in action && 'onClick' in action
    ? <Button variant="ghost" size="sm" onClick={action.onClick}>{action.label}</Button>
    : action;
  return (
    <div role="status" aria-live="polite" className={className} data-status-line={tone}>
      <div className="flex items-center gap-2 text-[13px] text-fg">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[tone] || DOTS.ok}`} aria-hidden="true" />
        <span className="min-w-0">
          {text}
          {detail ? <span className="ml-2 text-[12px] text-fg-subtle">{detail}</span> : null}
        </span>
        {actionNode ? <span className="ml-auto shrink-0">{actionNode}</span> : null}
      </div>
      {Number.isFinite(percent) ? <Progress className="mt-2" value={percent} tone={tone === 'error' ? 'error' : 'accent'} /> : null}
    </div>
  );
}

StatusLine.propTypes = {
  tone: PropTypes.oneOf(Object.keys(DOTS)),
  text: PropTypes.node.isRequired,
  detail: PropTypes.node,
  percent: PropTypes.number,
  action: PropTypes.oneOfType([
    PropTypes.node,
    PropTypes.shape({ label: PropTypes.node.isRequired, onClick: PropTypes.func.isRequired }),
  ]),
  className: PropTypes.string,
};
