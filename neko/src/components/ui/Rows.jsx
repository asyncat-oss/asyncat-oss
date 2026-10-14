// Settings layout pieces: a section (title, one-line hint), a bordered group
// of rows, and two kinds of row: SettingsRow (label and hint on the left, a
// control on the right) and PropertyRow (label, current value, one control).

import { Fragment, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

/**
 *   <SettingsSection icon={Bell} title="Notifications" hint="…" aside="3 on">
 *     <RowGroup>…rows…</RowGroup>
 *   </SettingsSection>
 */
export function SettingsSection({ icon: Icon, title, hint, aside, className = '', children, ...rest }) {
  return (
    <section className={className} {...rest}>
      <div className={`flex items-baseline justify-between gap-3 ${hint ? 'mb-1' : 'mb-3'}`}>
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-fg">
          {Icon ? <Icon className="h-4 w-4 shrink-0 self-center text-fg-subtle" /> : null}
          {title}
        </h2>
        {aside ? <div className="shrink-0 text-[12px] tabular-nums text-fg-subtle">{aside}</div> : null}
      </div>
      {hint ? <p className="mb-3 text-[12px] leading-5 text-fg-subtle">{hint}</p> : null}
      {children}
    </section>
  );
}

SettingsSection.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.node.isRequired,
  hint: PropTypes.node,
  aside: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};

/** Rows in one bordered box, with lines between them. */
export function RowGroup({ className = '', children, ...rest }) {
  return <div className={`divide-y divide-line rounded-xl border border-line ${className}`} {...rest}>{children}</div>;
}

RowGroup.propTypes = { className: PropTypes.string, children: PropTypes.node };

/**
 * A setting: label and hint on the left, its control on the right. On narrow
 * screens the control goes under the text; pass `stack={false}` to keep a
 * small control (a Switch) beside it.
 */
export function SettingsRow({ label, hint, stack = true, children, ...rest }) {
  return (
    <div
      className={`flex gap-2 px-4 py-3 ${stack ? 'flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4' : 'items-start justify-between gap-4'}`}
      {...rest}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        {hint ? <div className="mt-0.5 text-[12px] leading-5 text-fg-muted">{hint}</div> : null}
      </div>
      {children ? <div className={`shrink-0 ${stack ? 'sm:pt-0.5' : 'pt-0.5'}`}>{children}</div> : null}
    </div>
  );
}

SettingsRow.propTypes = { label: PropTypes.node.isRequired, hint: PropTypes.node, stack: PropTypes.bool, children: PropTypes.node };

/**
 * One property: its label, the current value (with `meta` details after it),
 * an optional `status` and one `control`. While `open`, `children` show under
 * the row (a chooser, say). A truthy `highlight` that changes flashes the row
 * for a moment, to show where something just landed.
 *
 *   <PropertyRow label="Model" value="Whisper base" meta={['142 MB', 'English']}
 *     control={<Button size="sm">Change</Button>} />
 */
export function PropertyRow({ label, value, meta, status, control, open = false, highlight, children, className = '', ...rest }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!highlight) return undefined;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(timer);
  }, [highlight]);

  const details = (Array.isArray(meta) ? meta : [meta]).filter((part) => part !== null && part !== undefined && part !== false && part !== '');
  // Text is cut off with an ellipsis. A control in the value (an inline
  // Select, a field) isn't clipped, so its hover fill and focus ring show.
  const plain = value === null || value === undefined || typeof value === 'string' || typeof value === 'number';
  return (
    <div className={`transition-colors duration-500 first:rounded-t-[11px] last:rounded-b-[11px] ${flash ? 'bg-selected' : ''} ${className}`} {...rest}>
      {/* On a phone the label and control share the top line and the value goes under them. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:flex sm:min-h-14 sm:gap-4">
        <div className="col-start-1 row-start-1 shrink-0 text-[13px] text-fg-muted sm:w-32">{label}</div>
        <div className={`col-span-2 row-start-2 min-w-0 flex-1 text-[13px] text-fg ${plain ? 'truncate' : ''}`}>
          {value}
          {details.length ? (
            <span className="ml-2 text-[12px] tabular-nums text-fg-subtle">
              {details.map((part, index) => <Fragment key={index}>{index ? ' · ' : ''}{part}</Fragment>)}
            </span>
          ) : null}
        </div>
        {status || control ? (
          <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-3">
            {status ? <div className="text-[12px] text-fg-subtle">{status}</div> : null}
            {control ? <div className="shrink-0">{control}</div> : null}
          </div>
        ) : null}
      </div>
      {open && children ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

PropertyRow.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
  meta: PropTypes.oneOfType([PropTypes.node, PropTypes.arrayOf(PropTypes.node)]),
  status: PropTypes.node,
  control: PropTypes.node,
  open: PropTypes.bool,
  highlight: PropTypes.any,
  children: PropTypes.node,
  className: PropTypes.string,
};
