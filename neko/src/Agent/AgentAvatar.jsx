import PropTypes from 'prop-types';

const SIZES = {
  xs: 'h-4 w-4 text-[11px] rounded',
  sm: 'h-6 w-6 text-sm rounded-md',
  md: 'h-9 w-9 text-lg rounded-lg',
  lg: 'h-14 w-14 text-3xl rounded-2xl',
};

/** An agent's picture: an uploaded image, or its emoji. */
export default function AgentAvatar({ agent, size = 'sm', className = '' }) {
  const box = `${SIZES[size] || SIZES.sm} inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`;
  if (agent?.avatar_image) {
    return <img src={agent.avatar_image} alt="" className={`${box} object-cover`} />;
  }
  return <span className={`${box} ${size === 'xs' ? '' : 'border border-line bg-surface'}`} aria-hidden="true">{agent?.icon || '🤖'}</span>;
}

AgentAvatar.propTypes = {
  agent: PropTypes.shape({ avatar_image: PropTypes.string, icon: PropTypes.string }),
  size: PropTypes.oneOf(Object.keys(SIZES)),
  className: PropTypes.string,
};
