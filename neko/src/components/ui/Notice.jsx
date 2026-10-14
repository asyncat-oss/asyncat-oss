// A short inline message. Errors sit in a light red box; warnings and info
// are plain lines of text with an icon, no fill.

import PropTypes from 'prop-types';
import { AlertTriangle, Info } from 'lucide-react';

/**
 *   <Notice tone="error">Couldn't reach the server.</Notice>
 *   <Notice tone="warning">This model may be too big for your graphics card.</Notice>
 *   <Notice tone="info" icon={WifiOff}>You're offline. Downloads wait until you're back.</Notice>
 */
export default function Notice({ tone = 'info', icon, action = null, className = '', children }) {
  if (tone === 'error') {
    return (
      <div role="alert" className={`flex items-start gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400 ${className}`}>
        <div className="min-w-0 flex-1">{children}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    );
  }
  const Icon = icon || (tone === 'warning' ? AlertTriangle : Info);
  return (
    <div
      role={tone === 'info' ? 'note' : undefined}
      className={`flex items-start gap-1.5 text-[12px] leading-5 ${tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-fg-subtle'} ${className}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

Notice.propTypes = {
  tone: PropTypes.oneOf(['error', 'warning', 'info']),
  icon: PropTypes.elementType,
  action: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};
