// What wakes a Cat: a list of wake-ups (a schedule, new email, a feed, a page
// or a folder), each with its own small form. The Cat's chat always wakes it
// too, so it isn't listed.

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  CalendarClock, FolderOpen, Globe, Mail, Plus, RefreshCw, Rss, Trash2, TriangleAlert,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { Menu, MenuItem } from '../components/ui/Menu.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { SCHEDULE_KINDS, WEEK_DAYS, describeSchedule, formFromTask, scheduleFromForm } from './scheduleForm.js';
import { TRIGGER_LABELS, TRIGGER_ORDER, ago, defaultTrigger, triggerText } from './catFormat.js';

const ICONS = { schedule: CalendarClock, email: Mail, rss: Rss, webpage: Globe, folder: FolderOpen };

function DayChips({ value, onChange }) {
  const toggle = (day) => onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day]);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
      {WEEK_DAYS.map((day) => {
        const on = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={on}
            title={day.long}
            onClick={() => toggle(day.value)}
            className={`h-7 min-w-10 rounded-lg px-2 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              on ? 'bg-accent text-white dark:text-gray-950' : 'border border-line-strong bg-canvas text-fg-muted hover:bg-hover hover:text-fg'
            }`}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}

DayChips.propTypes = { value: PropTypes.arrayOf(PropTypes.number).isRequired, onChange: PropTypes.func.isRequired };

/** The schedule controls; keeps a form and gives back the schedule object. */
function ScheduleFields({ schedule, onChange, idPrefix }) {
  const [form, setForm] = useState(() => formFromTask({ schedule }));
  const set = (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    try {
      onChange(scheduleFromForm(next), null);
    } catch (err) {
      onChange(null, err.message);
    }
  };
  let preview;
  try { preview = describeSchedule(scheduleFromForm(form)); } catch (err) { preview = err.message; }
  return (
    <div className="space-y-2.5">
      <Segmented label="How often" role="radiogroup" value={form.cron ? '' : form.kind} onChange={(kind) => set({ kind, cron: '' })} items={SCHEDULE_KINDS} className="flex-wrap" />
      {form.cron ? null : (
        <div className="flex flex-wrap items-end gap-3">
          {form.kind === 'once' ? (
            <Field label="Date" htmlFor={`${idPrefix}-date`}>
              <Input id={`${idPrefix}-date`} type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} className="w-44" />
            </Field>
          ) : null}
          {form.kind === 'every_hours' ? (
            <Field label="Every" htmlFor={`${idPrefix}-interval`}>
              <div className="flex items-center gap-2">
                <Input id={`${idPrefix}-interval`} type="number" min={1} max={168} value={form.interval} onChange={(event) => set({ interval: event.target.value })} className="w-20" />
                <span className="text-[13px] text-fg-muted">hours</span>
              </div>
            </Field>
          ) : (
            <Field label="Time" htmlFor={`${idPrefix}-time`}>
              <Input id={`${idPrefix}-time`} type="time" value={form.time} onChange={(event) => set({ time: event.target.value })} className="w-32" />
            </Field>
          )}
        </div>
      )}
      {!form.cron && form.kind === 'weekly' ? <DayChips value={form.days} onChange={(days) => set({ days })} /> : null}
      <details className="text-[12px] text-fg-muted" open={Boolean(form.cron)}>
        <summary className="cursor-pointer select-none text-fg-subtle hover:text-fg">Cron expression</summary>
        <Input
          value={form.cron}
          onChange={(event) => set({ cron: event.target.value })}
          placeholder="0 9 * * 1-5"
          spellCheck={false}
          className="mt-1.5 h-8 font-mono"
          aria-label="Cron expression"
        />
      </details>
      <p className="flex items-center gap-1.5 text-[12px] text-fg-muted"><CalendarClock className="h-3.5 w-3.5" />{preview}</p>
    </div>
  );
}

ScheduleFields.propTypes = { schedule: PropTypes.object, onChange: PropTypes.func.isRequired, idPrefix: PropTypes.string.isRequired };

function EveryMinutes({ value, onChange, min, id }) {
  return (
    <Field label="Look every" htmlFor={id}>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={min} max={1440} value={value ?? ''} onChange={(event) => onChange(Number(event.target.value) || min)} className="w-20" />
        <span className="text-[13px] text-fg-muted">minutes</span>
      </div>
    </Field>
  );
}

EveryMinutes.propTypes = { value: PropTypes.number, onChange: PropTypes.func.isRequired, min: PropTypes.number.isRequired, id: PropTypes.string.isRequired };

function TriggerFields({ trigger, onChange, onScheduleError, index }) {
  const config = trigger.config || {};
  const id = `trigger-${index}`;
  const setConfig = (patch) => onChange({ ...trigger, config: { ...config, ...patch } });
  switch (trigger.kind) {
    case 'schedule':
      return (
        <ScheduleFields
          idPrefix={id}
          schedule={config.schedule}
          onChange={(schedule, error) => {
            onScheduleError(error);
            if (schedule) setConfig({ schedule });
          }}
        />
      );
    case 'email':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Only from (optional)" htmlFor={`${id}-from`} hint="Part of the sender's name or address.">
            <Input id={`${id}-from`} value={config.from || ''} onChange={(event) => setConfig({ from: event.target.value })} placeholder="garden-club" />
          </Field>
          <Field label="Only about (optional)" htmlFor={`${id}-subject`} hint="Part of the subject.">
            <Input id={`${id}-subject`} value={config.subject || ''} onChange={(event) => setConfig({ subject: event.target.value })} placeholder="invoice" />
          </Field>
          <EveryMinutes id={`${id}-every`} min={2} value={config.everyMinutes} onChange={(everyMinutes) => setConfig({ everyMinutes })} />
          <p className="self-end text-[12px] leading-5 text-fg-subtle">Uses the email account in Settings → Connections.</p>
        </div>
      );
    case 'rss':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Feed address" htmlFor={`${id}-url`}>
            <Input id={`${id}-url`} value={config.url || ''} onChange={(event) => setConfig({ url: event.target.value })} placeholder="https://example.com/feed.xml" spellCheck={false} />
          </Field>
          <EveryMinutes id={`${id}-every`} min={10} value={config.everyMinutes} onChange={(everyMinutes) => setConfig({ everyMinutes })} />
        </div>
      );
    case 'webpage':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Page address" htmlFor={`${id}-url`}>
            <Input id={`${id}-url`} value={config.url || ''} onChange={(event) => setConfig({ url: event.target.value })} placeholder="https://example.com/product" spellCheck={false} />
          </Field>
          <EveryMinutes id={`${id}-every`} min={15} value={config.everyMinutes} onChange={(everyMinutes) => setConfig({ everyMinutes })} />
          <Field label="Only when it mentions (optional)" htmlFor={`${id}-contains`} hint="Wakes the Cat when the page starts saying this, instead of on every change." className="sm:col-span-2">
            <Input id={`${id}-contains`} value={config.contains || ''} onChange={(event) => setConfig({ contains: event.target.value })} placeholder="in stock" />
          </Field>
        </div>
      );
    case 'folder': {
      const browse = async () => {
        const result = await window.electronAPI?.openDirectory?.({ title: 'Choose the folder to watch', buttonLabel: 'Watch Folder' });
        if (!result?.canceled && result?.filePaths?.[0]) setConfig({ path: result.filePaths[0] });
      };
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Folder" htmlFor={`${id}-path`}>
            <div className="flex gap-1.5">
              <Input id={`${id}-path`} value={config.path || ''} onChange={(event) => setConfig({ path: event.target.value })} placeholder="/home/you/Downloads" spellCheck={false} />
              {window.electronAPI?.openDirectory ? <Button size="sm" icon={FolderOpen} onClick={browse}>Choose…</Button> : null}
            </div>
          </Field>
          <EveryMinutes id={`${id}-every`} min={1} value={config.everyMinutes} onChange={(everyMinutes) => setConfig({ everyMinutes })} />
        </div>
      );
    }
    default:
      return null;
  }
}

TriggerFields.propTypes = {
  trigger: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onScheduleError: PropTypes.func.isRequired,
  index: PropTypes.number.isRequired,
};

/**
 * `value`: the triggers being edited (without the chat one). `catId` (an
 * existing Cat) adds "Look now" to saved watchers.
 */
export default function TriggerEditor({ value, onChange, catId = null, onError }) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [checking, setChecking] = useState(null);
  const errors = useRef({});
  const addRef = useRef(null);

  const update = (index, next) => onChange(value.map((trigger, i) => (i === index ? next : trigger)));
  const remove = (index) => onChange(value.filter((_, i) => i !== index));
  const setError = (index, error) => {
    errors.current = { ...errors.current, [index]: error };
    onError?.(Object.values(errors.current).find(Boolean) || null);
  };

  const lookNow = async (trigger) => {
    setChecking(trigger.id);
    try {
      const result = await catsApi.checkTrigger(catId, trigger.id);
      if (result.error) toast.error("Couldn't look", { detail: result.error });
      else toast.success(result.fired ? `Something new: ${result.reason}` : result.note || 'Nothing new.');
    } catch (err) {
      toast.error("Couldn't look", { detail: errorDetail(err) });
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="space-y-2.5">
      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[12px] leading-5 text-fg-muted">
          Nothing wakes it yet, so it only works when you write to it. Add a schedule, or something to watch.
        </p>
      ) : null}
      {value.map((trigger, index) => {
        const Icon = ICONS[trigger.kind] || CalendarClock;
        const saved = Boolean(trigger.id);
        return (
          <div key={trigger.id || `new-${index}`} className="rounded-xl border border-line bg-surface p-3.5" data-trigger={trigger.kind}>
            <div className="mb-3 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{TRIGGER_LABELS[trigger.kind]}</span>
              {saved && trigger.kind !== 'schedule' && catId ? (
                <Button size="xs" variant="ghost" icon={RefreshCw} loading={checking === trigger.id} onClick={() => lookNow(trigger)}>Look now</Button>
              ) : null}
              <button type="button" onClick={() => remove(index)} aria-label={`Remove “${triggerText(trigger)}”`} className="rounded-md p-1 text-fg-subtle hover:bg-hover hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <TriggerFields trigger={trigger} index={index} onChange={(next) => update(index, next)} onScheduleError={(error) => setError(index, error)} />
            {trigger.lastError ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{trigger.lastError}</p>
            ) : trigger.lastCheckedAt ? (
              <p className="mt-2 text-[11px] text-fg-subtle">Last looked {ago(trigger.lastCheckedAt)}{trigger.lastFiredAt ? ` · last woke it ${ago(trigger.lastFiredAt)}` : ''}</p>
            ) : null}
          </div>
        );
      })}
      <div ref={addRef} className="inline-block">
        <Button size="sm" icon={Plus} onClick={() => setMenuOpen((open) => !open)}>Add a wake-up</Button>
      </div>
      <Menu anchorRef={addRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-start" width={240} label="Add a wake-up">
        {TRIGGER_ORDER.map((kind) => (
          <MenuItem key={kind} icon={ICONS[kind]} label={TRIGGER_LABELS[kind]} onSelect={() => onChange([...value, defaultTrigger(kind)])} />
        ))}
      </Menu>
    </div>
  );
}

TriggerEditor.propTypes = {
  value: PropTypes.arrayOf(PropTypes.object).isRequired,
  onChange: PropTypes.func.isRequired,
  catId: PropTypes.string,
  onError: PropTypes.func,
};
