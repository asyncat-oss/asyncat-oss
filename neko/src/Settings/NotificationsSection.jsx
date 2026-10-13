// Settings → Notifications: which events show a desktop notification (for
// chats and Cats alike) and quiet hours. Sending to Discord, Slack,
// Telegram or email lives in Connections → Services.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Bell, Loader2, Moon } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { Switch } from '../Cats/CatParts.jsx';
import { notifyStatus, saveNotifyPrefs, testNotification } from '../services/notifyPrefs.js';

const EVENTS = [
  { id: 'done', label: 'Something finished', hint: 'A chat answered while Asyncat was in the background, or a Cat finished a run.' },
  { id: 'approval', label: 'An agent needs your OK', hint: 'Before a step it has to ask about. Without an answer it waits, then gives up.' },
  { id: 'question', label: 'An agent asks you something', hint: 'A question it needs answered to carry on.' },
  { id: 'failed', label: 'A Cat run failed', hint: 'It stopped on an error or hit a daily limit.' },
];

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        {hint ? <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

Row.propTypes = { label: PropTypes.string.isRequired, hint: PropTypes.string, children: PropTypes.node };

export default function NotificationsSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    notifyStatus().then(setState).catch((err) => setState({ error: err.message }));
  }, []);

  const save = async (patch) => {
    const prefs = { ...state.prefs, ...patch, quietHours: { ...state.prefs.quietHours, ...(patch.quietHours || {}) } };
    setState((current) => ({ ...current, prefs }));
    try {
      const res = await saveNotifyPrefs(prefs);
      setState((current) => ({ ...current, prefs: res.prefs, quietNow: res.quietNow }));
    } catch (err) {
      toast.error("Couldn't save that", { detail: errorDetail(err) });
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await testNotification();
      toast.success('Sent a test notification');
    } catch (err) {
      toast.error("Couldn't send it", { detail: errorDetail(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!state) return <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (state.error) return <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{state.error}</p>;
  const { prefs } = state;

  return (
    <div className="space-y-6" data-notifications>
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-fg"><Bell className="h-4 w-4 text-fg-subtle" /> Show a notification when</h2>
        <p className="mb-3 text-[12px] text-fg-subtle">Chats notify only when Asyncat&apos;s window isn&apos;t in front. Clicking one opens what it is about.</p>
        <div className="divide-y divide-line rounded-xl border border-line">
          {EVENTS.map((event) => (
            <Row key={event.id} label={event.label} hint={event.hint}>
              <Switch checked={prefs[event.id] !== false} onChange={(value) => save({ [event.id]: value })} label={event.label} />
            </Row>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-fg"><Moon className="h-4 w-4 text-fg-subtle" /> Quiet hours</h2>
        <p className="mb-3 text-[12px] text-fg-subtle">Nothing pops up between these times. Nothing is lost: questions and results still wait in the Cats inbox and in their chats.</p>
        <div className="rounded-xl border border-line">
          <Row label="Use quiet hours" hint={prefs.quietHours.enabled && state.quietNow ? "It's quiet hours now." : null}>
            <Switch checked={prefs.quietHours.enabled} onChange={(value) => save({ quietHours: { enabled: value } })} label="Use quiet hours" />
          </Row>
          {prefs.quietHours.enabled ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-[13px] text-fg-muted">
              From
              <Input type="time" className="w-32" value={prefs.quietHours.start} onChange={(event) => save({ quietHours: { start: event.target.value } })} aria-label="Quiet from" />
              until
              <Input type="time" className="w-32" value={prefs.quietHours.end} onChange={(event) => save({ quietHours: { end: event.target.value } })} aria-label="Quiet until" />
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Bell} loading={testing} onClick={test} disabled={!state.desktop}>Send a test notification</Button>
        {!state.desktop ? <span className="text-[12px] text-fg-subtle">Notifications come from the desktop app.</span> : null}
      </div>
      <p className="text-[12px] text-fg-subtle">
        To get messages on Discord, Slack, Telegram or by email, set them up in{' '}
        <button type="button" onClick={() => navigate('/settings/integrations')} className="text-accent hover:underline">Connections → Services</button>.
      </p>
    </div>
  );
}
