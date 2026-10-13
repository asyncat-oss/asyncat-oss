// The parts of a Cat you can set, as sections shared by the "New Cat" steps
// and a Cat's Settings tab: who it is (picture, name, mission), its brain
// (agent, model, project), what wakes it, its space (folder, browser,
// memories) and its freedom (how much it may do alone, daily limits, sites).

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Brain, FolderOpen, Globe, ImagePlus, X } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { AVATARS, FREEDOM, FREEDOM_ORDER } from './catFormat.js';
import { TEXTAREA } from './catFormState.js';
import TriggerEditor from './TriggerEditor.jsx';
import ConnectorPicker from '../Connectors/ConnectorPicker.jsx';

/** A small square picture from an image file, as a data: URL. */
function shrinkImage(file, size = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the picture."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That file isn't a picture."));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        canvas.getContext('2d').drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function Chips({ value, onChange, placeholder, list = null, mono = false, label }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft('');
  };
  return (
    <div>
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span key={item} className={`inline-flex items-center gap-1 rounded-md bg-hover py-0.5 pl-2 pr-1 text-[12px] text-fg ${mono ? 'font-mono' : ''}`}>
              {item}
              <button type="button" onClick={() => onChange(value.filter((other) => other !== item))} aria-label={`Remove ${item}`} className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-selected hover:text-fg">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        list={list || undefined}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}

Chips.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  list: PropTypes.string,
  mono: PropTypes.bool,
  label: PropTypes.string,
};

export function IdentitySection({ form, set, autoFocus = false }) {
  const fileRef = useRef(null);
  const [pictureError, setPictureError] = useState('');
  const isImage = form.avatar?.startsWith('data:image/');
  const upload = async (file) => {
    if (!file) return;
    setPictureError('');
    try {
      set({ avatar: await shrinkImage(file) });
    } catch (err) {
      setPictureError(err.message);
    }
  };
  return (
    <div className="space-y-4">
      <Field label="Picture">
        <div className="flex flex-wrap items-center gap-1.5">
          {isImage ? (
            <span className="relative">
              <img src={form.avatar} alt="" className="h-9 w-9 rounded-lg object-cover ring-2 ring-accent" />
              <button type="button" onClick={() => set({ avatar: '🐱' })} aria-label="Remove the picture" className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-fg text-canvas"><X className="h-2.5 w-2.5" /></button>
            </span>
          ) : null}
          {AVATARS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => set({ avatar: emoji })}
              aria-pressed={form.avatar === emoji}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${form.avatar === emoji ? 'bg-selected ring-1 ring-line-strong' : 'hover:bg-hover'}`}
            >
              {emoji}
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Upload a picture" title="Upload a picture" className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-line-strong text-fg-subtle hover:bg-hover hover:text-fg">
            <ImagePlus className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        {pictureError ? <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{pictureError}</p> : null}
      </Field>
      <Field label="Name" htmlFor="cat-name" hint="Shown on its card, in your inbox and on notifications.">
        <Input id="cat-name" value={form.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} placeholder="Inbox Cat" />
      </Field>
      <Field label="Mission" htmlFor="cat-mission" hint="What it looks after, in plain words. It works without you watching, so say what a good result looks like.">
        <textarea
          id="cat-mission"
          rows={5}
          autoFocus={autoFocus}
          value={form.mission}
          onChange={(event) => set({ mission: event.target.value })}
          placeholder="Read my unread email each morning and tell me what needs a reply today."
          className={TEXTAREA}
        />
      </Field>
    </div>
  );
}

IdentitySection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, autoFocus: PropTypes.bool };

export function BrainSection({ form, set, options }) {
  const agent = options.agents.find((item) => item.id === form.profileId);
  return (
    <div className="space-y-4">
      <Field
        label="Brain"
        htmlFor="cat-brain"
        hint={agent ? `It thinks like ${agent.name}: its instructions, files${agent.model_profile_id ? ' and model' : ''}.` : 'One of your agents (Customize → Agents). Without one, it uses Asyncat\'s own.'}
      >
        <Select id="cat-brain" value={form.profileId} onChange={(event) => set({ profileId: event.target.value })}>
          <option value="">Asyncat (no agent)</option>
          {options.agents.map((item) => <option key={item.id} value={item.id}>{item.icon ? `${item.icon} ` : ''}{item.name}</option>)}
        </Select>
      </Field>
      <Field label="Model" htmlFor="cat-model" hint="Kept with the Cat, so changing the chat model later doesn't change it.">
        <Select id="cat-model" value={form.providerProfileId} onChange={(event) => set({ providerProfileId: event.target.value })}>
          <option value="">{agent?.model_profile_id ? `Its brain's model` : options.activeModel?.model ? `The model in use now (${options.activeModel.model})` : 'The model in use now'}</option>
          {options.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}
        </Select>
      </Field>
      <ConnectorPicker
        value={form.connectors}
        onChange={(connectors) => set({ connectors })}
        inheritLabel={Array.isArray(agent?.connectors) ? `Same as ${agent.name}` : 'All connectors'}
        inheritHint={Array.isArray(agent?.connectors)
          ? `The ${agent.connectors.length} ${agent.connectors.length === 1 ? 'connector' : 'connectors'} its brain may use.`
          : 'Including ones you add later.'}
      />
      <Field label="Project it shares with you" htmlFor="cat-project" hint={form.projectId ? 'It gets the project\'s instructions and files, and its chat shows up in the project.' : 'Optional.'}>
        <Select id="cat-project" value={form.projectId} onChange={(event) => set({ projectId: event.target.value, ...(event.target.value ? {} : { folderMode: form.folderMode === 'project' ? 'own' : form.folderMode }) })}>
          <option value="">No project</option>
          {options.projects.map((project) => <option key={project.id} value={project.id}>{project.emoji ? `${project.emoji} ` : ''}{project.name}</option>)}
        </Select>
      </Field>
    </div>
  );
}

BrainSection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, options: PropTypes.object.isRequired };

export function WakesSection({ form, set, catId = null, onError }) {
  return (
    <div className="space-y-3">
      <TriggerEditor value={form.triggers} onChange={(triggers) => set({ triggers })} catId={catId} onError={onError} />
      <p className="text-[12px] leading-5 text-fg-subtle">You can also write to it in its chat any time; that wakes it too.</p>
    </div>
  );
}

WakesSection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, catId: PropTypes.string, onError: PropTypes.func };

export function SpaceSection({ form, set, cat = null }) {
  const browse = async () => {
    const result = await window.electronAPI?.openDirectory?.({ title: 'Choose the folder the Cat works in', buttonLabel: 'Use Folder' });
    if (!result?.canceled && result?.filePaths?.[0]) set({ folderMode: 'custom', folder: result.filePaths[0] });
  };
  const choices = [
    { value: 'own', label: 'Its own folder', hint: cat?.folderMode === 'own' ? cat.folder : 'A new folder only it uses.' },
    { value: 'project', label: "Its project's folder", hint: form.projectId ? 'The folder of the project it shares with you.' : 'Pick a project first (Brain).', disabled: !form.projectId },
    { value: 'custom', label: 'Another folder', hint: form.folder || 'One you choose.' },
  ];
  return (
    <div className="space-y-4">
      <Field label="Where it works" hint="Its file tools can't reach outside this folder.">
        <div role="radiogroup" aria-label="Where it works" className="divide-y divide-line rounded-xl border border-line">
          {choices.map((choice) => (
            <label key={choice.value} className={`flex items-start gap-3 px-3.5 py-2.5 ${choice.disabled ? 'opacity-50' : 'cursor-pointer hover:bg-hover'}`}>
              <input
                type="radio"
                name="cat-folder"
                checked={form.folderMode === choice.value}
                disabled={choice.disabled}
                onChange={() => (choice.value === 'custom' && !form.folder ? browse() : set({ folderMode: choice.value }))}
                className="mt-0.5 h-4 w-4 accent-[var(--as-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-fg">{choice.label}</span>
                <span className="block truncate text-[12px] text-fg-muted" title={choice.hint}>{choice.hint}</span>
              </span>
              {choice.value === 'custom' && window.electronAPI?.openDirectory ? (
                <Button size="xs" variant="ghost" icon={FolderOpen} onClick={(event) => { event.preventDefault(); browse(); }}>Choose…</Button>
              ) : null}
            </label>
          ))}
        </div>
        {form.folderMode === 'custom' && !window.electronAPI?.openDirectory ? (
          <Input className="mt-2" value={form.folder} onChange={(event) => set({ folder: event.target.value })} placeholder="/home/you/cat-work" aria-label="Folder path" />
        ) : null}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line px-3.5 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-fg"><Globe className="h-4 w-4 text-fg-subtle" />Its own browser</p>
          <p className="mt-1 text-[12px] leading-5 text-fg-muted">It browses with a profile of its own, so the sites it signs in to aren&apos;t shared with you or other Cats. Sign it in by opening its browser from its page.</p>
        </div>
        <div className="rounded-xl border border-line px-3.5 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-fg"><Brain className="h-4 w-4 text-fg-subtle" />Its own memories</p>
          <p className="mt-1 text-[12px] leading-5 text-fg-muted">What it learns, and your 👍 / 👎 and &ldquo;next time&rdquo; notes, stay with it. Your chats don&apos;t see them.</p>
        </div>
      </div>
    </div>
  );
}

SpaceSection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, cat: PropTypes.object };

const WAIT_CHOICES = [
  { value: 30, label: '30 minutes' },
  { value: 120, label: '2 hours' },
  { value: 480, label: '8 hours' },
  { value: 1440, label: 'A day' },
];

export function FreedomSection({ form, set, options }) {
  const setLimit = (key, value) => set({ limits: { ...form.limits, [key]: value } });
  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Freedom" className="grid gap-2 sm:grid-cols-3">
        {FREEDOM_ORDER.map((level) => {
          const selected = form.freedom === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => set({ freedom: level })}
              className={`flex flex-col items-start justify-start rounded-xl border px-3.5 py-3 text-left transition-colors ${selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent' : 'border-line hover:bg-hover'}`}
            >
              <span className="block text-[13px] font-medium text-fg">{FREEDOM[level].label}</span>
              <span className="mt-1 block text-[12px] leading-5 text-fg-muted">{FREEDOM[level].description}</span>
            </button>
          );
        })}
      </div>

      <Field label="When it asks, wait for your answer for" htmlFor="cat-wait" hint="After that it carries on without that step.">
        <Select id="cat-wait" value={String(form.approvalTimeoutMinutes)} onChange={(event) => set({ approvalTimeoutMinutes: Number(event.target.value) })} className="w-48">
          {WAIT_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          {!WAIT_CHOICES.some((choice) => choice.value === Number(form.approvalTimeoutMinutes)) ? <option value={form.approvalTimeoutMinutes}>{form.approvalTimeoutMinutes} minutes</option> : null}
        </Select>
      </Field>

      <Field label="Daily limits" hint="Leave empty for no limit. It stops for the day when one is reached and tells you.">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="text-[12px] text-fg-muted">Runs
            <Input type="number" min={0} value={form.limits.runsPerDay} onChange={(event) => setLimit('runsPerDay', event.target.value)} placeholder="No limit" className="mt-1" />
          </label>
          <label className="text-[12px] text-fg-muted">Tokens
            <Input type="number" min={0} step={1000} value={form.limits.tokensPerDay} onChange={(event) => setLimit('tokensPerDay', event.target.value)} placeholder="No limit" className="mt-1" />
          </label>
          <label className="text-[12px] text-fg-muted">Minutes of work
            <Input type="number" min={0} value={form.limits.minutesPerDay} onChange={(event) => setLimit('minutesPerDay', event.target.value)} placeholder="No limit" className="mt-1" />
          </label>
          <label className="text-[12px] text-fg-muted">Spend, in $
            <Input type="number" min={0} step={0.1} value={form.limits.costPerDay} onChange={(event) => setLimit('costPerDay', event.target.value)} placeholder="No limit" className="mt-1" />
          </label>
          <label className="text-[12px] text-fg-muted sm:col-span-2">At this price per million tokens ($)
            <Input type="number" min={0} step={0.01} value={form.limits.pricePerMillion} onChange={(event) => setLimit('pricePerMillion', event.target.value)} placeholder="Your model's price; local models are free" className="mt-1" />
          </label>
        </div>
      </Field>

      <Field label="Sites it may visit" hint="Leave empty to allow any site. example.com also covers its subdomains.">
        <Chips value={form.allowedSites} onChange={(allowedSites) => set({ allowedSites })} placeholder="example.com" label="Add a site" />
      </Field>

      <Field label="Tools it may always use without asking" hint="On top of what its freedom allows. Answering “Always allow” adds one here.">
        <Chips value={form.allowedTools} onChange={(allowedTools) => set({ allowedTools })} placeholder="e.g. mail_send_message" list="cat-tools" mono label="Add a tool" />
        <datalist id="cat-tools">
          {options.tools.filter((tool) => !form.allowedTools.includes(tool.name)).map((tool) => (
            <option key={tool.name} value={tool.name}>{tool.permission === 'dangerous' ? 'Risky' : 'Changes things'}</option>
          ))}
        </datalist>
      </Field>
    </div>
  );
}

FreedomSection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, options: PropTypes.object.isRequired };
