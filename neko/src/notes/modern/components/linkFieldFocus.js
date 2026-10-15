// The link field of an empty embed or link preview block takes focus when
// someone starts editing the block: they just added it (it is the block being
// worked on) or pressed Edit. A note that opens with an empty one stays where
// it is instead of scrolling down to that block.

import { useEffect, useRef } from 'react';

/** Where to start: a block nobody is working on counts as already editing, so mounting it doesn't focus the field. */
export function initialLinkFieldState(editing, active) {
  return active ? false : Boolean(editing);
}

/** Whether the field takes focus now: only when editing starts. */
export function shouldFocusLinkField(wasEditing, editing) {
  return Boolean(editing && !wasEditing);
}

/** Focuses `inputRef` when the block starts editing (see above). */
export function useLinkFieldFocus(inputRef, editing, active) {
  const wasEditing = useRef(initialLinkFieldState(editing, active));
  useEffect(() => {
    if (shouldFocusLinkField(wasEditing.current, editing)) inputRef.current?.focus();
    wasEditing.current = editing;
  }, [editing, inputRef]);
}
