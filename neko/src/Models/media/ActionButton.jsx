// A Button that can say why it can't be pressed: with `blocked` (a short
// reason such as "You're offline") it is disabled and the reason shows as a
// tooltip.

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import Tooltip from '../../components/ui/Tooltip.jsx';

const ActionButton = forwardRef(function ActionButton({ blocked = null, disabled = false, children, ...rest }, ref) {
  const button = <Button ref={ref} disabled={disabled || Boolean(blocked)} {...rest}>{children}</Button>;
  if (!blocked) return button;
  return <Tooltip label={blocked} side="top" className="inline-flex">{button}</Tooltip>;
});

ActionButton.propTypes = {
  blocked: PropTypes.string,
  disabled: PropTypes.bool,
  children: PropTypes.node,
};

export default ActionButton;
