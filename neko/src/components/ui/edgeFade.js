// A row that scrolls sideways (tabs, a switch) fades out at an edge with
// more beyond it, so a label cut at the edge reads as "more this way"
// rather than broken. Its scrollbar is hidden (the .scroll-row class).

import { useEffect } from 'react';

const FADE = 24;

/** The fades for a scroll position: { left, right } in px. */
export function edgeFades({ scrollLeft, scrollWidth, clientWidth }) {
  if (scrollWidth <= clientWidth + 1) return { left: 0, right: 0 };
  return {
    left: scrollLeft > 1 ? FADE : 0,
    right: scrollLeft + clientWidth < scrollWidth - 1 ? FADE : 0,
  };
}

/** Keeps --fade-left and --fade-right on the element in `ref` up to date. */
export function useEdgeFade(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => {
      const { left, right } = edgeFades(element);
      element.style.setProperty('--fade-left', `${left}px`);
      element.style.setProperty('--fade-right', `${right}px`);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref]);
}
