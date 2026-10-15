// The parts of a Cat you can set, as sections shared by the "New Cat" steps
// and a Cat's Settings tab: who it is (picture, name, mission), its brain
// (agent, model, project), what wakes it, its space (folder, browser,
// memories) and its freedom (how much it may do alone, daily limits, sites).

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Brain, Cat as CatIcon, FolderOpen, Globe, ImagePlus, X } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import Select from '../components/ui/Select.jsx';
import Combobox from '../components/ui/Combobox.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
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

const NO_SUGGESTIONS = [];

/**
 * A list of short entries (sites, tool names) typed into one field: Enter or
 * a comma adds what's typed. `suggestions` ({ value, hint }) show under the
 * field while typing.
 */
export function Chips({ value, onChange, placeholder, suggestions = NO_SUGGESTIONS, mono = false, label }) {
  const [draft, setDraft] = useState('');
  const add = (items) => {
    if (items.length) onChange([...new Set([...value, ...items])]);
    setDraft('');
  };
  const commit = () => add(draft.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean));
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
      <Combobox
        value={draft}
        options={suggestions}
        placeholder={placeholder}
        aria-label={label}
        mono={mono}
        onChange={setDraft}
        onSelect={(option) => add([String(option.value)])}
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
  suggestions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, hint: PropTypes.node })),
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
              <button type="button" onClick={() => set({ avatar: '' })} aria-label="Remove the picture" className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-fg text-canvas"><X className="h-2.5 w-2.5" /></button>
            </span>
          ) : null}
          {AVATARS.map((emoji) => (
            <button
              key={emoji || 'none'}
              type="button"
              onClick={() => set({ avatar: emoji })}
              aria-pressed={form.avatar === emoji}
              aria-label={emoji ? undefined : 'No picture'}
              title={emoji ? undefined : 'No picture'}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${form.avatar === emoji ? 'bg-selected ring-1 ring-line-strong' : 'hover:bg-hover'}`}
            >
              {emoji || <CatIcon className="h-[18px] w-[18px] text-fg-subtle" strokeWidth={1.75} />}
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
        <Select
          id="cat-brain"
          value={form.profileId}
          onChange={(profileId) => set({ profileId })}
          options={[
            { value: '', label: 'Asyncat (no agent)' },
            ...options.agents.map((item) => ({ value: item.id, label: `${item.icon ? `${item.icon} ` : ''}${item.name}`, text: item.name })),
          ]}
        />
      </Field>
      <Field
        label="Model"
        htmlFor="cat-model"
        hint={form.providerProfileId
          ? 'Kept with the Cat, whatever the default model is.'
          : agent?.model_profile_id
            ? `The model ${agent.name} is set to use.`
            : 'The default model is the one you last picked in a chat. Pick one here to keep the Cat on it.'}
      >
        <Select
          id="cat-model"
          value={form.providerProfileId}
          onChange={(providerProfileId) => set({ providerProfileId })}
          options={[
            { value: '', label: agent?.model_profile_id ? `Its brain's model` : options.defaultModelName ? `Default model (now: ${options.defaultModelName})` : 'Default model' },
            ...options.models.map((model) => ({ value: model.id, label: `${model.name} · ${model.model}` })),
          ]}
        />
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
        <Select
          id="cat-project"
          value={form.projectId}
          onChange={(projectId) => set({ projectId, ...(projectId ? {} : { folderMode: form.folderMode === 'project' ? 'own' : form.folderMode }) })}
          options={[
            { value: '', label: 'No project' },
            ...options.projects.map((project) => ({ value: project.id, label: `${project.emoji ? `${project.emoji} ` : ''}${project.name}`, text: project.name })),
          ]}
        />
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
        <RadioGroup
          label="Where it works"
          value={form.folderMode}
          onChange={(value) => (value === 'custom' && !form.folder ? browse() : set({ folderMode: value }))}
          options={choices.map((choice) => ({
            value: choice.value,
            label: choice.label,
            disabled: choice.disabled,
            description: <span className="block truncate" title={choice.hint}>{choice.hint}</span>,
            extra: choice.value === 'custom' && window.electronAPI?.openDirectory
              ? <Button size="xs" variant="ghost" icon={FolderOpen} onClick={browse}>Choose…</Button>
              : null,
          }))}
        />
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
          {cat?.id ? <Link to={`/tools?tab=memory&scope=cat:${cat.id}`} className="mt-1 inline-block text-[12px] text-accent hover:underline">See and edit its memories</Link> : null}
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
      <RadioGroup
        label="Freedom"
        value={form.freedom}
        onChange={(level) => set({ freedom: level })}
        options={FREEDOM_ORDER.map((level) => ({ value: level, label: FREEDOM[level].label, description: FREEDOM[level].description }))}
      />

      <Field label="When it asks, wait for your answer for" htmlFor="cat-wait" hint="After that it carries on without that step.">
        <Select
          id="cat-wait"
          fullWidth={false}
          className="w-48"
          value={Number(form.approvalTimeoutMinutes)}
          onChange={(minutes) => set({ approvalTimeoutMinutes: Number(minutes) })}
          options={WAIT_CHOICES.some((choice) => choice.value === Number(form.approvalTimeoutMinutes))
            ? WAIT_CHOICES
            : [...WAIT_CHOICES, { value: Number(form.approvalTimeoutMinutes), label: `${form.approvalTimeoutMinutes} minutes` }]}
        />
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
        <Chips
          value={form.allowedTools}
          onChange={(allowedTools) => set({ allowedTools })}
          placeholder="e.g. mail_send_message"
          suggestions={options.tools.filter((tool) => !form.allowedTools.includes(tool.name)).map((tool) => ({
            value: tool.name,
            hint: tool.permission === 'dangerous' ? 'Risky' : 'Changes things',
          }))}
          mono
          label="Add a tool"
        />
      </Field>
    </div>
  );
}

FreedomSection.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, options: PropTypes.object.isRequired };
