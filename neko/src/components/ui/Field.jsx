import { forwardRef } from 'react';
import PropTypes from 'prop-types';

const CONTROL = 'w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

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

export const Input = forwardRef(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`h-9 ${CONTROL} ${className}`} {...rest} />;
});

Input.propTypes = { className: PropTypes.string };

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`h-9 ${CONTROL} pr-8 ${className}`} {...rest}>
      {children}
    </select>
  );
});

Select.propTypes = { className: PropTypes.string, children: PropTypes.node };
