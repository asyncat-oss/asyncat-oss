// Pieces the Voice and Images tabs share around their groups: the offline
// notice, the status lines with their buttons, the first-run line and its
// one download button, and the rows shown while a group loads.

import PropTypes from 'prop-types';
import { WifiOff } from 'lucide-react';
import Notice from '../../components/ui/Notice.jsx';
import { RowGroup } from '../../components/ui/Rows.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import StatusLine from '../../components/ui/StatusLine.jsx';
import ActionButton from './ActionButton.jsx';

/** "You're offline…" above the first group, only while offline. */
export function OfflineNotice({ offline }) {
  if (!offline) return null;
  return (
    <Notice tone="warning" icon={WifiOff}>
      You&apos;re offline. Services and downloads need the internet; models on this computer still work.
    </Notice>
  );
}

OfflineNotice.propTypes = { offline: PropTypes.bool };

const ACTION_LABELS = {
  reload: 'Try again',
  cancel: 'Cancel',
  retry: 'Try again',
  setup: 'Set up',
  plan: 'Try again',
};

/**
 *   <StatusLines lines={voiceStatusLines(…)} actions={{ cancel: cancelSetup, reload }} />
 *
 * Each line's `action` names its button; `actions` maps that name to what
 * the button does. A line whose action isn't given shows no button.
 */
export function StatusLines({ lines = [], actions = {} }) {
  if (!lines.length) return null;
  return (
    <div className="space-y-2.5" data-status-lines>
      {lines.map((line) => (
        <StatusLine
          key={line.key}
          tone={line.tone}
          text={line.text}
          percent={line.percent}
          action={line.action && actions[line.action] ? { label: ACTION_LABELS[line.action] || line.action, onClick: actions[line.action] } : null}
        />
      ))}
    </div>
  );
}

StatusLines.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    tone: PropTypes.string,
    text: PropTypes.node.isRequired,
    percent: PropTypes.number,
    action: PropTypes.string,
  })),
  actions: PropTypes.objectOf(PropTypes.func),
};

/** The first run's one line: what isn't set up yet, and that it can be changed first. */
export function FirstRunIntro({ children }) {
  return <p className="text-[13px] leading-5 text-fg-muted" data-first-run-intro>{children}</p>;
}

FirstRunIntro.propTypes = { children: PropTypes.node };

/**
 *   <FirstRunAction label="Download about 157 MB and set up" onStart={start} />
 *
 * The page's one ink button and the promise under it. While a setup runs it
 * becomes a line saying the page can be left. `blocked` disables the button
 * and says why ("You're offline"). `notes` say what the download leaves out
 * and why; with no `onStart` (nothing to download) only they show.
 */
export function FirstRunAction({ label, onStart = null, loading = false, blocked = null, running = false, notes = [] }) {
  if (running) return <p className="text-[12px] leading-5 text-fg-subtle">You can leave this page. Setup carries on.</p>;
  const noteLines = notes.map((note) => <p key={note} className="text-[12px] leading-5 text-fg-muted">{note}</p>);
  if (!onStart) return noteLines.length ? <div className="space-y-1" data-first-run-action>{noteLines}</div> : null;
  return (
    <div className="space-y-2" data-first-run-action>
      {/* A long label takes two lines on a phone rather than spilling out of the button. */}
      <ActionButton variant="primary" size="md" className="max-sm:h-auto max-sm:min-h-9 max-sm:py-2" loading={loading} blocked={blocked} onClick={onStart}>{label}</ActionButton>
      <div>
        {noteLines}
        <p className="text-[12px] leading-5 text-fg-subtle">Nothing downloads until you click. You can cancel at any time.</p>
      </div>
    </div>
  );
}

FirstRunAction.propTypes = {
  label: PropTypes.node,
  onStart: PropTypes.func,
  loading: PropTypes.bool,
  blocked: PropTypes.string,
  running: PropTypes.bool,
  notes: PropTypes.arrayOf(PropTypes.string),
};

/** A group's rows while its settings load: grey bars, no text. */
export function LoadingRows({ count = 3 }) {
  return (
    <RowGroup aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center px-4">
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </RowGroup>
  );
}

LoadingRows.propTypes = { count: PropTypes.number };
