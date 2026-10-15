import PropTypes from 'prop-types';
import { Bot } from 'lucide-react';

const SIZES = {
  xs: 'h-4 w-4 text-[11px] rounded',
  sm: 'h-6 w-6 text-[14px] rounded-md',
  md: 'h-9 w-9 text-lg rounded-lg',
  lg: 'h-14 w-14 text-3xl rounded-2xl',
};
const ICON_SIZES = { xs: 'h-3.5 w-3.5', sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' };

/** An agent's picture: an uploaded image, the emoji it was given, or a plain bot glyph. */
export default function AgentAvatar({ agent, size = 'sm', className = '' }) {
  const box = `${SIZES[size] || SIZES.sm} inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`;
  if (agent?.avatar_image) {
    return <img src={agent.avatar_image} alt="" className={`${box} object-cover`} />;
  }
  return (
    <span className={`${box} ${size === 'xs' ? '' : 'border border-line bg-surface'}`} aria-hidden="true">
      {agent?.icon || <Bot className={`${ICON_SIZES[size] || ICON_SIZES.sm} text-fg-subtle`} strokeWidth={1.75} />}
    </span>
  );
}

AgentAvatar.propTypes = {
  agent: PropTypes.shape({ avatar_image: PropTypes.string, icon: PropTypes.string }),
  size: PropTypes.oneOf(Object.keys(SIZES)),
  className: PropTypes.string,
};
