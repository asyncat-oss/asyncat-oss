// Small pieces every Files listing shares: an item's icon or thumbnail, its
// badges, and its menu (the "…" button and what it offers).

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUpRight, Copy, Download, ExternalLink, FolderOpen, Lock, MessageSquare, MoreHorizontal, Pencil, Trash2,
} from 'lucide-react';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu.jsx';
import { menuItems } from './fileActions.js';
import { kindIcon } from './fileIcons.js';
import { serverUrl } from './storageApi.js';

/** A picture's thumbnail, or the item's icon, in a `size` px rounded box. */
export function ItemThumb({ item, size = 28, className = '' }) {
  const [broken, setBroken] = useState(false);
  const Icon = kindIcon(item);
  const box = { width: size, height: size };
  if (item.thumbUrl && !broken) {
    return (
      <img
        src={serverUrl(item.thumbUrl)}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        style={box}
        className={`shrink-0 rounded-md bg-hover object-cover ${className}`}
      />
    );
  }
  return (
    <span style={box} className={`flex shrink-0 items-center justify-center ${className}`}>
      <Icon className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
    </span>
  );
}

ItemThumb.propTypes = { item: PropTypes.object.isRequired, size: PropTypes.number, className: PropTypes.string };

const TONES = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  info: 'bg-accent-soft text-accent',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  neutral: 'bg-hover text-fg-muted',
};

/** The item's badges: "Loaded", "Downloading 42%", "Not used" … */
export function Badges({ badges = [], className = '' }) {
  if (!badges.length) return null;
  return (
    <span className={`flex shrink-0 items-center gap-1 ${className}`}>
      {badges.map((badge) => (
        <span key={badge.label} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium leading-4 ${TONES[badge.tone] || TONES.neutral}`}>
          {badge.tone === 'success' ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
          {badge.label}
        </span>
      ))}
    </span>
  );
}

Badges.propTypes = { badges: PropTypes.arrayOf(PropTypes.shape({ tone: PropTypes.string, label: PropTypes.string })), className: PropTypes.string };

const ACTION_ICONS = {
  open: ExternalLink,
  reveal: FolderOpen,
  download: Download,
  copy: Copy,
  chat: Pencil,
  source: MessageSquare,
  manage: ArrowUpRight,
  remove: Trash2,
  locked: Lock,
};

/**
 * The "…" button and its menu. `onAction(item, id)` runs the chosen action
 * (fileActions.js names them). Hidden until the row is hovered or focused,
 * unless `always`; `onOpenChange` lets the row show it is the one open.
 */
export function ItemMenu({ item, desktop, onAction, onOpenChange, always = false, className = '' }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const entries = menuItems(item, { desktop });
  if (!entries.length) return <span className="w-7 shrink-0" aria-hidden="true" />;
  const toggle = (next) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle(!open);
        }}
        aria-label={`Options for ${item.title || item.name || 'this'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-file-options={item.id}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle outline-none transition-opacity hover:bg-selected hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 ${
          open || always ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } ${className}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => toggle(false)} placement="bottom-end" width={232} label={`Options for ${item.title || 'this'}`}>
        {entries.map((entry, index) => (entry.separator ? <MenuSeparator key={`sep-${index}`} /> : (
          <MenuItem
            key={entry.id}
            icon={ACTION_ICONS[entry.id]}
            label={entry.label}
            hint={entry.hint}
            danger={entry.danger}
            disabled={entry.disabled}
            onSelect={() => onAction(item, entry.id)}
          />
        )))}
      </Menu>
    </>
  );
}

ItemMenu.propTypes = {
  item: PropTypes.object.isRequired,
  desktop: PropTypes.bool,
  onAction: PropTypes.func.isRequired,
  onOpenChange: PropTypes.func,
  always: PropTypes.bool,
  className: PropTypes.string,
};
