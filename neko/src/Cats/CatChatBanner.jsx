// A Cat's chat: who you're writing to and what it's doing (at the top), and
// the steps and questions it waits for you to answer (above the composer).

import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Square } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { useCat, useInbox } from './useCats.js';
import { CatAvatar, StatusPill } from './CatParts.jsx';
import InboxItem from './InboxItem.jsx';
import { wakeSummary } from './catFormat.js';

/** Above the composer: the steps and questions it waits for you to answer. */
export function CatWaitingBar({ catId }) {
  const { items, reload } = useInbox({ catId });
  const waiting = (items || []).filter((item) => item.kind === 'approval' || item.kind === 'question');
  if (!waiting.length) return null;
  return (
    <div className="mx-auto max-h-[40vh] w-full max-w-3xl space-y-2 overflow-y-auto px-4 pt-3 sm:px-6" data-cat-waiting>
      {waiting.map((item) => <InboxItem key={item.id} item={item} onDone={reload} />)}
    </div>
  );
}

CatWaitingBar.propTypes = { catId: PropTypes.string.isRequired };

export default function CatChatBanner({ catId }) {
  const navigate = useNavigate();
  const { cat, missing } = useCat(catId);
  if (missing || !cat) return null;
  return (
    <div className="mx-auto mb-4 max-w-3xl space-y-2" data-cat-banner={cat.name}>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
        <CatAvatar cat={cat} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-fg">{cat.name}</span>
            <StatusPill cat={cat} />
          </div>
          <p className="truncate text-[12px] text-fg-muted">Messages here go to this Cat. Wakes on: {wakeSummary(cat)}</p>
        </div>
        {cat.running ? <Button size="xs" icon={Square} onClick={() => catsApi.cancel(cat.id).catch(() => {})}>Stop</Button> : null}
        <Button size="xs" variant="ghost" icon={ArrowUpRight} onClick={() => navigate(`/cats/${cat.id}`)}>Its page</Button>
      </div>
    </div>
  );
}

CatChatBanner.propTypes = { catId: PropTypes.string.isRequired };
