// A ghost button that shows only an icon. Its label is both the accessible
// name and the tooltip, so it is never a mystery.

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import Button from './Button.jsx';
import Tooltip from './Tooltip.jsx';

/**
 *   <IconButton icon={Trash2} label="Delete" onClick={remove} />
 *
 * `size` is sm (28 px) or md (32 px); `side` places the tooltip. Other props
 * go to the button.
 */
const IconButton = forwardRef(function IconButton({ icon, label, size = 'md', side = 'top', ...rest }, ref) {
  return (
    <Tooltip label={label} side={side} className="inline-flex">
      <Button ref={ref} variant="ghost" size={size === 'sm' ? 'icon-sm' : 'icon'} icon={icon} aria-label={label} {...rest} />
    </Tooltip>
  );
});

IconButton.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['sm', 'md']),
  side: PropTypes.oneOf(['top', 'bottom', 'right']),
};

export default IconButton;
