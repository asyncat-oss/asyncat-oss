// The dialog for creating or editing a scheduled task: what to do, when,
// where (project and agent), and under Advanced a cron expression, the model
// and the tools it may use without asking.

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { CalendarClock, ChevronDown, X } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { scheduledTasksApi } from '../CommandCenter/api/scheduledTasksApi.js';
import {
  SCHEDULE_KINDS, WEEK_DAYS, describeSchedule, formFromTask, localTimeZone, scheduleFromForm, timeZoneList,
} from './scheduleForm.js';

const TEXTAREA = 'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[13px] leading-5 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20';
const KEEP_MODEL = '__keep__';

function DayChips({ value, onChange }) {
  const toggle = (day) => {
    onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day]);
  };
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
            className={`h-8 min-w-11 rounded-lg px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
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

function ToolChips({ value, onChange, tools }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const name = raw.trim();
    if (!name || value.includes(name)) return;
    onChange([...value, name]);
  };
  const commit = () => {
    draft.split(/[\s,]+/).forEach(add);
    setDraft('');
  };
  return (
    <div>
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tool) => (
            <span key={tool} className="inline-flex items-center gap-1 rounded-md bg-hover py-0.5 pl-2 pr-1 font-mono text-[12px] text-fg">
              {tool}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tool))}
                aria-label={`Remove ${tool}`}
                className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-selected hover:text-fg"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        list="scheduled-task-tools"
        placeholder="Add a tool, e.g. send_email"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <datalist id="scheduled-task-tools">
        {tools.filter((tool) => !value.includes(tool.name)).map((tool) => (
          <option key={tool.name} value={tool.name}>{tool.permission === 'dangerous' ? 'Needs care' : 'Asks first'}</option>
        ))}
      </datalist>
    </div>
  );
}

ToolChips.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  tools: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, permission: PropTypes.string })).isRequired,
};

export default function TaskEditor({ task = null, initial = null, projects, profiles, models, activeModel, tools, onClose, onSaved }) {
  const editing = Boolean(task);
  const [form, setForm] = useState(() => formFromTask(task || initial));
  const initialModel = editing ? (task.providerProfileId || KEEP_MODEL) : '';
  const [modelChoice, setModelChoice] = useState(initialModel);
  const [advanced, setAdvanced] = useState(() => Boolean(form.cron || form.allowedTools.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const zones = useMemo(() => timeZoneList(), []);
  const localZone = localTimeZone();
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  let preview = '';
  try {
    preview = describeSchedule(scheduleFromForm(form));
  } catch (err) {
    preview = err.message;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.prompt.trim()) {
      setError('Write what the task should do.');
      return;
    }
    let schedule;
    try {
      schedule = scheduleFromForm(form);
    } catch (err) {
      setError(err.message);
      return;
    }
    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule,
      timezone: form.timezone.trim() || localZone,
      projectId: form.projectId || null,
      profileId: form.profileId || null,
      allowedTools: form.allowedTools,
    };
    if (modelChoice !== initialModel && modelChoice !== KEEP_MODEL) payload.providerProfileId = modelChoice || null;
    setSaving(true);
    try {
      const result = editing
        ? await scheduledTasksApi.update(task.id, payload)
        : await scheduledTasksApi.create(payload);
      onSaved(result.task);
    } catch (err) {
      setError(err.message || "Couldn't save the task.");
      setSaving(false);
    }
  };

  const activeLabel = activeModel?.model ? `The model in use now (${activeModel.model})` : 'The model in use now';

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      size="lg"
      title={editing ? 'Edit scheduled task' : 'New scheduled task'}
      description="Asyncat runs the prompt on its own at the times you pick. Each answer lands in the task's chat and a notification."
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>{editing ? 'Save' : 'Create task'}</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="What should it do?" htmlFor="scheduled-prompt" hint="Write it as a complete instruction: nobody is around to answer questions while it runs.">
          <textarea
            id="scheduled-prompt"
            autoFocus
            rows={6}
            value={form.prompt}
            onChange={(event) => set({ prompt: event.target.value })}
            placeholder="Summarise my unread email and tell me what needs a reply today."
            className={TEXTAREA}
          />
        </Field>

        <Field label="Name" htmlFor="scheduled-name" hint="Shown in the list and on notifications. Leave empty to use the start of the prompt.">
          <Input id="scheduled-name" value={form.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} placeholder="Morning email" />
        </Field>

        <div className="space-y-3">
          <Field label="When">
            <Segmented
              label="How often"
              value={form.cron ? '' : form.kind}
              onChange={(kind) => set({ kind, cron: '' })}
              items={SCHEDULE_KINDS}
              className="flex-wrap"
            />
          </Field>
          {form.cron ? (
            <p className="text-[12px] text-fg-muted">A cron expression is set under Advanced; it replaces these choices.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              {form.kind === 'once' ? (
                <Field label="Date" htmlFor="scheduled-date">
                  <Input id="scheduled-date" type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} className="w-44" />
                </Field>
              ) : null}
              {form.kind === 'every_hours' ? (
                <Field label="Every" htmlFor="scheduled-interval">
                  <div className="flex items-center gap-2">
                    <Input
                      id="scheduled-interval"
                      type="number"
                      min={1}
                      max={168}
                      value={form.interval}
                      onChange={(event) => set({ interval: event.target.value })}
                      className="w-24"
                    />
                    <span className="text-[13px] text-fg-muted">hours, starting from when you save</span>
                  </div>
                </Field>
              ) : (
                <Field label="Time" htmlFor="scheduled-time">
                  <Input id="scheduled-time" type="time" value={form.time} onChange={(event) => set({ time: event.target.value })} className="w-32" />
                </Field>
              )}
            </div>
          )}
          {!form.cron && form.kind === 'weekly' ? <DayChips value={form.days} onChange={(days) => set({ days })} /> : null}
          <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {preview}
          </p>
        </div>

        <Field
          label="Time zone"
          htmlFor="scheduled-timezone"
          hint={form.timezone === localZone ? 'This computer’s time zone.' : `This computer uses ${localZone}.`}
        >
          <Input
            id="scheduled-timezone"
            list="scheduled-time-zones"
            value={form.timezone}
            onChange={(event) => set({ timezone: event.target.value })}
            onFocus={(event) => event.target.select()}
            placeholder={localZone}
            spellCheck={false}
          />
          <datalist id="scheduled-time-zones">
            {zones.map((zone) => <option key={zone} value={zone}>{zone === localZone ? 'This computer' : ''}</option>)}
          </datalist>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Project"
            htmlFor="scheduled-project"
            hint={form.projectId ? 'It can use this project’s folders, like a chat in it.' : 'Without a project it can’t read files or run commands.'}
          >
            <Select id="scheduled-project" value={form.projectId} onChange={(event) => set({ projectId: event.target.value })}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.emoji ? `${project.emoji} ` : ''}{project.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Agent" htmlFor="scheduled-agent" hint="Its personality and how many steps it may take.">
            <Select id="scheduled-agent" value={form.profileId} onChange={(event) => set({ profileId: event.target.value })}>
              <option value="">Default agent</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setAdvanced((open) => !open)}
            aria-expanded={advanced}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Advanced
            <ChevronDown className={`h-4 w-4 text-fg-subtle transition-transform ${advanced ? 'rotate-180' : ''}`} />
          </button>
          {advanced ? (
            <div className="space-y-4 border-t border-line px-4 py-4">
              <Field
                label="Cron expression"
                htmlFor="scheduled-cron"
                hint="Replaces the schedule above when filled in: minute, hour, day of month, month, day of week. Runs at most every 15 minutes."
              >
                <Input
                  id="scheduled-cron"
                  value={form.cron}
                  onChange={(event) => set({ cron: event.target.value })}
                  placeholder="0 9 * * 1-5"
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
              <Field label="Model" htmlFor="scheduled-model" hint="Saved with the task, so changing the chat model later doesn’t change it.">
                <Select id="scheduled-model" value={modelChoice} onChange={(event) => setModelChoice(event.target.value)}>
                  {editing && !task.providerProfileId ? (
                    <option value={KEEP_MODEL}>Keep {task.model?.model || 'the saved model'}</option>
                  ) : null}
                  <option value="">{activeLabel}</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}
                </Select>
              </Field>
              <Field
                label="Pre-approved tools"
                hint="Nobody is there to approve tools while a task runs, so tools that normally ask first are refused unless listed here."
              >
                <ToolChips value={form.allowedTools} onChange={(allowedTools) => set({ allowedTools })} tools={tools} />
              </Field>
            </div>
          ) : null}
        </div>

        {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </Dialog>
  );
}

TaskEditor.propTypes = {
  task: PropTypes.object,
  initial: PropTypes.object,
  projects: PropTypes.array.isRequired,
  profiles: PropTypes.array.isRequired,
  models: PropTypes.array.isRequired,
  activeModel: PropTypes.object,
  tools: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
