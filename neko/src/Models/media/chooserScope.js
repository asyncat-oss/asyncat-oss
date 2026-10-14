// Which chooser on a page is open (only one at a time), and how a chooser's
// footer closes the row it sits in.

import { createContext } from 'react';

/** { openId, setOpenId } for the choosers inside a ChooserScope. */
export const ChooserScopeContext = createContext(null);

/** { close } of the chooser row a footer sits in. */
export const ChooserRowContext = createContext({ close: () => {} });
