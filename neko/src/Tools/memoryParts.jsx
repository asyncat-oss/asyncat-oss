// Parts of Tools & Skills → Memory: pick whose memories to see (a
// project's, an agent's, a Cat's, or shared ones), write a memory by hand,
// and edit one in place.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Check, X } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';

const MEMORY_KIND_OPTIONS = ['fact', 'preference', 'user', 'feedback', 'project', 'reference', 'context', 'task_state'];

const SELECT = 'rounded-lg border border-line bg-canvas px-2 py-2 text-xs text-fg outline-none focus:border-accent';

export function MemoryOwnerSelect({ value, onChange, owners, includeAll = true, label = 'Whose memories' }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={SELECT} aria-label={label} data-memory-owner>
      {includeAll ? <option value="all">Everyone&apos;s</option> : null}
      <option value="shared">{includeAll ? 'Shared (every chat)' : 'Every chat'}</option>
      {owners.projects.length ? (
        <optgroup label="Projects">
          {owners.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}
        </optgroup>
      ) : null}
      {owners.agents.length ? (
        <optgroup label="Agents">
          {owners.agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>)}
        </optgroup>
      ) : null}
      {owners.cats.length ? (
        <optgroup label="Cats">
          {owners.cats.map((cat) => <option key={cat.id} value={`cat:${cat.id}`}>{cat.name}</option>)}
        </optgroup>
      ) : null}
    </select>
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
    <form onSubmit={save} className="space-y-2 border-b border-line px-6 py-3" data-add-memory>
      <textarea
        autoFocus
        rows={2}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Something the agents should remember, e.g. “I water the balcony at 7 in the morning.”"
        aria-label="Memory"
        className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(event) => setKind(event.target.value)} className={SELECT} aria-label="Kind">
          {MEMORY_KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span className="text-xs text-fg-muted">for</span>
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
        className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex items-center gap-2">
        <select value={kind} onChange={(event) => setKind(event.target.value)} className={SELECT} aria-label="Kind">
          {MEMORY_KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="primary" icon={Check} loading={saving} disabled={!content.trim()} onClick={save}>Save</Button>
        </span>
      </div>
    </div>
  );
}

MemoryEditor.propTypes = { mem: PropTypes.object.isRequired, onSaved: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };
