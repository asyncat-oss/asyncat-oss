import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-fg text-canvas hover:opacity-90 shadow-sm',
  accent: 'bg-accent text-white hover:opacity-90 shadow-sm dark:text-canvas',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-hover',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
  destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

const SIZES = {
  xs: 'h-7 gap-1.5 rounded-md px-2 text-xs',
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
  icon: 'h-8 w-8 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-lg',
};

/**
 * The classes of a Button, for things that must look like one but can't be a
 * <button> (an <a download>, a <label> around a file input).
 */
export function buttonClass(variant = 'secondary', size = 'sm') {
  return `inline-flex shrink-0 items-center justify-center font-medium outline-none transition-[background-color,color,opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant] || VARIANTS.secondary} ${SIZES[size] || SIZES.sm}`;
}

/**
 * The app's button. `variant`: primary (solid), accent, secondary (outlined),
 * ghost, danger (red text), destructive (solid red, for confirming a
 * delete). `size`: xs, sm, md, icon, icon-sm. `loading` swaps the icon
 * for a spinner and disables the button.
 */
const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'sm', icon: Icon, loading = false, disabled, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${buttonClass(variant, size)} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className={size === 'icon' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2} /> : null}
      {children}
    </button>
  );
});

Button.propTypes = {
  variant: PropTypes.oneOf(Object.keys(VARIANTS)),
  size: PropTypes.oneOf(Object.keys(SIZES)),
  icon: PropTypes.elementType,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
  type: PropTypes.string,
};

export default Button;
