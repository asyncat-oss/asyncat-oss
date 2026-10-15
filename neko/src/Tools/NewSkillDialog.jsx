// Tools & Skills → Skills → New skill: a name, what it does, its category
// and tags, when to use it, and the instructions the agent follows.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { CONTROL_CLASS, Field, Input } from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import Select from '../components/ui/Select.jsx';
import { DEFAULT_CATEGORY, categoryOptions } from './skillCategories.js';

const EMPTY = { name: '', description: '', category: DEFAULT_CATEGORY, tags: '', when_to_use: '', body: '' };

export default function NewSkillDialog({ open, categories, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setForm(EMPTY); setError(null); }
  }, [open]);

  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const setText = (field) => (event) => set(field)(event.target.value);

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      await agentApi.createSkill({ ...form, tags });
      onCreated(form.name.trim());
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      as="form"
      onSubmit={submit}
      title="New skill"
      description="Steps the agent follows when a task matches."
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={saving} disabled={!form.name.trim()}>Create skill</Button>
        </>
      )}
    >
      <div className="space-y-4" data-new-skill>
        <Field label="Name" htmlFor="skill-name">
          <Input id="skill-name" value={form.name} onChange={setText('name')} placeholder="e.g. Summarize meeting notes" />
        </Field>
        <Field label="Description" htmlFor="skill-description">
          <Input id="skill-description" value={form.description} onChange={setText('description')} placeholder="One line on what it does" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="skill-category">
            <Select id="skill-category" value={form.category} onChange={set('category')} options={categoryOptions(categories)} />
          </Field>
          <Field label="Tags" htmlFor="skill-tags" hint="Separate them with commas.">
            <Input id="skill-tags" value={form.tags} onChange={setText('tags')} placeholder="writing, summaries" />
          </Field>
        </div>
        <Field label="When to use" htmlFor="skill-when">
          <Input id="skill-when" value={form.when_to_use} onChange={setText('when_to_use')} placeholder="When I ask to sum up a meeting…" />
        </Field>
        <Field label="Instructions" htmlFor="skill-body" hint="Markdown. Numbered steps work well.">
          <textarea
            id="skill-body"
            rows={6}
            value={form.body}
            onChange={setText('body')}
            placeholder={'1. Read the notes.\n2. List the decisions and who owns each one.'}
            className={`${CONTROL_CLASS} resize-y py-2 font-mono text-[12px] leading-5`}
          />
        </Field>
        {error ? <Notice tone="error">Couldn&apos;t create the skill: {error}</Notice> : null}
      </div>
    </Dialog>
  );
}

NewSkillDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  categories: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, description: PropTypes.string })),
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};
