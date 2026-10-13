import PropTypes from 'prop-types';
import { CAT_POSES } from './catPoses.js';

/**
 * The Asyncat cat mascot.
 *   <Cat pose="sit" className="w-16" />
 * Poses: sit, head, peek, sleep, walk. It blinks, flicks its ears and swishes
 * its tail unless `still` is set (or the system asks for reduced motion).
 * `outline` sets the dark-theme outline width in drawing units; thicker
 * outlines read better when the cat is drawn small.
 */
export default function Cat({ pose = 'sit', still = false, outline, className = '', title }) {
  const data = CAT_POSES[pose] || CAT_POSES.sit;
  return (
    <svg
      viewBox={data.viewBox}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
      className={`cat cat-${pose} ${still ? '' : 'cat-animated'} ${className}`}
      style={outline ? { '--cat-o': `${outline}px` } : undefined}
      // Static artwork from catPoses.js, never user content.
      dangerouslySetInnerHTML={{ __html: data.markup }}
    />
  );
}

Cat.propTypes = {
  pose: PropTypes.oneOf(Object.keys(CAT_POSES)),
  still: PropTypes.bool,
  outline: PropTypes.number,
  className: PropTypes.string,
  title: PropTypes.string,
};
