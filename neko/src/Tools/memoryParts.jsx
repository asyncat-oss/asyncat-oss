// Parts of Tools & Skills → Memory: pick whose memories to see (a
// project's, an agent's, a Cat's, or shared ones), write a memory by hand,
// and edit one in place.

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, X } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import { CONTROL_CLASS } from '../components/ui/Field.jsx';
import Select from '../components/ui/Select.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { MEMORY_KIND_OPTIONS } from './memoryKinds.js';

/** The choices for whose memories to show or save: everyone's, shared, then each project, agent and Cat. */
function ownerOptions(owners, includeAll) {
  return [
    ...(includeAll ? [{ value: 'all', label: "Everyone's" }] : []),
    { value: 'shared', label: includeAll ? 'Shared (every chat)' : 'Every chat' },
    ...owners.projects.map((project) => ({ value: `project:${project.id}`, label: project.name, group: 'Projects' })),
    ...owners.agents.map((agent) => ({ value: `agent:${agent.id}`, label: agent.name, group: 'Agents' })),
    ...owners.cats.map((cat) => ({ value: `cat:${cat.id}`, label: cat.name, group: 'Cats' })),
  ];
}

export function MemoryOwnerSelect({ value, onChange, owners, includeAll = true, label = 'Whose memories' }) {
  const options = useMemo(() => ownerOptions(owners, includeAll), [owners, includeAll]);
  return (
    <Select
      size="sm"
      fullWidth={false}
      className="max-w-56"
      value={value}
      onChange={onChange}
      options={options}
      aria-label={label}
      data-memory-owner
    />
  );
}

MemoryOwnerSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  owners: PropTypes.object.isRequired,
  includeAll: PropTypes.bool,
  label: PropTypes.string,
};

export function AddMemoryForm({ owners, defaultScope, onAdded, onCancel }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('fact');
  const [scope, setScope] = useState(defaultScope && defaultScope !== 'all' ? defaultScope : 'shared');
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await agentApi.addMemory({ content, kind, scope });
      onAdded(res.memory);
    } catch (err) {
      toast.error("Couldn't save the memory", { detail: errorDetail(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className="mb-3 space-y-2 rounded-xl border border-line p-3" data-add-memory>
      <textarea
        autoFocus
        rows={2}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Something the agents should remember, e.g. “I water the balcony at 7 in the morning.”"
        aria-label="Memory"
        className={`${CONTROL_CLASS} resize-y py-2 leading-6`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select size="sm" fullWidth={false} value={kind} onChange={setKind} options={MEMORY_KIND_OPTIONS} aria-label="Kind" />
        <span className="text-[12px] text-fg-muted">for</span>
        <MemoryOwnerSelect value={scope} onChange={setScope} owners={owners} includeAll={false} label="Who it is for" />
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="primary" type="submit" loading={saving} disabled={!content.trim()}>Remember</Button>
        </span>
      </div>
    </form>
  );
}

AddMemoryForm.propTypes = { owners: PropTypes.object.isRequired, defaultScope: PropTypes.string, onAdded: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };

export function MemoryEditor({ mem, onSaved, onCancel }) {
  const toast = useToast();
  const [content, setContent] = useState(mem.content || '');
  const [kind, setKind] = useState(mem.kind || mem.memory_type || 'fact');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const res = await agentApi.updateMemory(mem.id, { content, kind });
      onSaved(res.memory);
    } catch (err) {
      toast.error("Couldn't save the change", { detail: errorDetail(err) });
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2" data-memory-editor>
      <textarea
        autoFocus
        rows={Math.min(8, Math.max(2, Math.ceil(content.length / 90)))}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="Memory text"
        className={`${CONTROL_CLASS} resize-y py-2 leading-6`}
      />
      <div className="flex items-center gap-2">
        <Select size="sm" fullWidth={false} value={kind} onChange={setKind} options={MEMORY_KIND_OPTIONS} aria-label="Kind" />
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="primary" icon={Check} loading={saving} disabled={!content.trim()} onClick={save}>Save</Button>
        </span>
      </div>
    </div>
  );
}

MemoryEditor.propTypes = { mem: PropTypes.object.isRequired, onSaved: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };
