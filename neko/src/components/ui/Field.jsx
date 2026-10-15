import { forwardRef } from 'react';
import PropTypes from 'prop-types';

/** The look of a text field, for controls that can't use Input itself. */
export const CONTROL_CLASS = 'w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

/** A labelled form row: label on top, the control, then an optional hint. */
export function Field({ label, hint, error, htmlFor, action = null, className = '', children }) {
  return (
    <div className={className}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="text-[12px] font-medium text-fg-muted">{label}</label>
          {action}
        </div>
      ) : null}
      {children}
      {error ? <p className="mt-1.5 text-[12px] leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
      {!error && hint ? <p className="mt-1.5 text-[12px] leading-5 text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

Field.propTypes = {
  label: PropTypes.node,
  hint: PropTypes.node,
  error: PropTypes.node,
  htmlFor: PropTypes.string,
  action: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};

// A width the caller gives (className="w-32") replaces the full width:
// both are plain width utilities, and CSS order, not class order, would pick.
const OWN_WIDTH = /(^|\s)w-/;

export const Input = forwardRef(function Input({ className = '', ...rest }, ref) {
  const control = OWN_WIDTH.test(className) ? CONTROL_CLASS.replace(/^w-full /, '') : CONTROL_CLASS;
  return <input ref={ref} className={`h-9 ${control} ${className}`} {...rest} />;
});

Input.propTypes = { className: PropTypes.string };
