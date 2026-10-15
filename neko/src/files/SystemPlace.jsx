// Files → System: where Asyncat keeps its own files, one row each. They are
// shown, copied and opened, never removed here; each says which page
// changes it. Export and Delete everything stay in Privacy & safety.

import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Copy, FolderOpen } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import { RowGroup } from '../components/ui/Rows.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { manageLabel } from './fileActions.js';
import { formatBytes } from './fileFormat.js';

// The rows in the order Privacy listed them, then the extras.
const ORDER = ['data', 'database', 'key', 'uploads', 'models', 'home', 'connections', 'skills', 'agent-workspace', 'logs-folder'];
const rank = (item) => {
  const index = ORDER.indexOf(item.whereId);
  return index === -1 ? ORDER.length : index;
};

function Hint({ item }) {
  const navigate = useNavigate();
  const hint = item.hint || '';
  if (!item.manageRoute) return hint ? <span className="text-fg-subtle"> · {hint}</span> : null;
  // "Manage in Models" is itself the link; otherwise the link follows the hint.
  const says = /^(Change|Manage|Clear)/.test(hint);
  const link = (
    <button type="button" onClick={() => navigate(item.manageRoute)} className="text-accent hover:underline">
      {says ? hint : manageLabel(item)}
    </button>
  );
  return (
    <span className="font-normal text-fg-subtle">
      {' · '}
      {says ? link : <>{hint}{hint ? ' · ' : ''}{link}</>}
    </span>
  );
}

Hint.propTypes = { item: PropTypes.object.isRequired };

export default function SystemPlace({ items, loading, desktop, onAction }) {
  const navigate = useNavigate();
  const rows = [...items].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="space-y-3" data-system-place>
      {loading && !items.length ? (
        <RowGroup>
          {[0, 1, 2, 3].map((index) => <div key={index} className="px-4 py-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-2 h-3 w-2/3" /></div>)}
        </RowGroup>
      ) : (
        <RowGroup>
          {rows.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4" data-system-row={item.whereId}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">{item.title}<Hint item={item} /></p>
                <p className="truncate font-mono text-[12px] text-fg-muted" title={item.path}>{item.path}{item.exists ? '' : ' (not made yet)'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.bytes !== null && item.bytes !== undefined ? <span className="mr-2 text-[12px] tabular-nums text-fg-subtle">{formatBytes(item.bytes)}</span> : null}
                {desktop && item.can?.open ? (
                  <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => onAction(item, 'open')}>Open</Button>
                ) : desktop && item.can?.reveal ? (
                  <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => onAction(item, 'reveal')}>Show</Button>
                ) : null}
                <IconButton icon={Copy} label={`Copy the path of ${item.title}`} onClick={() => onAction(item, 'copy')} />
              </div>
            </div>
          ))}
        </RowGroup>
      )}
      <p className="text-[12px] leading-5 text-fg-subtle">
        Export everything or delete everything in{' '}
        <button type="button" onClick={() => navigate('/settings/privacy')} className="text-accent hover:underline">Settings → Privacy &amp; safety</button>.
      </p>
    </div>
  );
}

SystemPlace.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  desktop: PropTypes.bool,
  onAction: PropTypes.func.isRequired,
};
