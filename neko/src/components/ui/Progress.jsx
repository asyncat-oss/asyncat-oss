// A thin progress bar, and a download line built on it: what is downloading,
// how far along, how fast and how long is left, with a Cancel button.

import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from './Button.jsx';
import { trackRate, transferDetail } from './progressFormat.js';

/**
 *   <Progress value={42} label="Downloading Whisper base" />
 *   <Progress indeterminate label="Starting" />
 *
 * `tone="error"` turns the bar red. An indeterminate bar slides back and
 * forth, and holds still for people who ask for reduced motion.
 */
export function Progress({ value = 0, tone = 'accent', indeterminate = false, label, className = '' }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const fill = tone === 'error' ? 'bg-red-500' : 'bg-accent';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      className={`relative h-1 overflow-hidden rounded-full bg-hover ${className}`}
    >
      {indeterminate ? (
        <div className={`progress-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full ${fill}`} />
      ) : (
        <div className={`h-full rounded-full transition-[width] duration-300 ${fill}`} style={{ width: `${percent}%` }} />
      )}
    </div>
  );
}

Progress.propTypes = {
  value: PropTypes.number,
  tone: PropTypes.oneOf(['accent', 'error']),
  indeterminate: PropTypes.bool,
  label: PropTypes.string,
  className: PropTypes.string,
};

/**
 * One download: its name and "24 of 60 MB · 3 MB/s · 20 s left" (speed
 * worked out from successive `bytes` values), the bar, and Cancel.
 *
 *   <DownloadLine label="ggml-base.bin" bytes={job.downloaded} total={job.total} onCancel={cancel} />
 *
 * Pass `detail` to replace the worked-out line, `percent` when bytes aren't
 * known, and `error` to show what went wrong under a red bar.
 */
export function DownloadLine({ label, bytes, total, percent, detail, error, onCancel, cancelLabel = 'Cancel', className = '' }) {
  const [speed, setSpeed] = useState({ samples: [], rate: null, bytes: null });
  if (Number.isFinite(bytes) && bytes !== speed.bytes) {
    // Each new byte count from a poll is a sample for the speed.
    setSpeed({ ...trackRate(speed.samples, { bytes, at: Date.now() }), bytes });
  }
  const known = Number.isFinite(total) && total > 0 && Number.isFinite(bytes);
  const value = known ? (bytes / total) * 100 : percent;
  const text = detail ?? transferDetail({ done: bytes, total, rate: speed.rate });
  return (
    <div className={`space-y-1.5 ${className}`} data-download-line>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] text-fg">{label}</span>
        {text ? <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">{text}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <Progress
          className="flex-1"
          value={value}
          indeterminate={!error && !Number.isFinite(value)}
          tone={error ? 'error' : 'accent'}
          label={typeof label === 'string' ? label : undefined}
        />
        {onCancel ? <Button variant="ghost" size="xs" onClick={onCancel}>{cancelLabel}</Button> : null}
      </div>
      {error ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

DownloadLine.propTypes = {
  label: PropTypes.node.isRequired,
  bytes: PropTypes.number,
  total: PropTypes.number,
  percent: PropTypes.number,
  detail: PropTypes.node,
  error: PropTypes.node,
  onCancel: PropTypes.func,
  cancelLabel: PropTypes.string,
  className: PropTypes.string,
};
