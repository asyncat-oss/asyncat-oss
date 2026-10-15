// Tools & Skills → Skills: the instructions the agent can follow, in their
// plain categories, with a search, a filter for where each came from, and the
// open skill's description, when to use it and its steps beside the list.

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { Badge } from '../Models/modelPageShared.jsx';
import { CatalogGroup, CatalogRow, InspectorEmpty, InspectorSection, ListSkeleton, ListWithInspector, MarkdownPanel, TagChip } from './catalogParts.jsx';
import NewSkillDialog from './NewSkillDialog.jsx';
import { groupByCategory, skillCategory, skillMatches } from './skillCategories.js';
import { ORIGIN_LABELS, filterByOrigin, getSkillOrigin, originCounts } from './skillOrigin.js';

function formatSkillAge(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

const skillShape = PropTypes.shape({
  category: PropTypes.string,
  name: PropTypes.string.isRequired,
  source: PropTypes.string,
  created_by: PropTypes.string,
  description: PropTypes.string,
  tags: PropTypes.arrayOf(PropTypes.string),
  when_to_use: PropTypes.string,
  body: PropTypes.string,
  updatedAt: PropTypes.string,
});

function SkillInspector({ skill, onDelete, deleting }) {
  if (!skill) return <InspectorEmpty>Pick a skill to read when it applies and what it asks the agent to do.</InspectorEmpty>;
  const origin = getSkillOrigin(skill);
  const deletable = origin === 'user' || origin === 'auto';
  const age = formatSkillAge(skill.updatedAt);

  return (
    <div className="p-5 lg:p-6" data-skill-inspector={skill.name}>
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 break-words text-[15px] font-semibold tracking-[-0.01em] text-fg">{skill.name}</h2>
        {deletable ? <IconButton icon={Trash2} label="Delete this skill" size="sm" onClick={onDelete} loading={deleting} className="-mr-1.5 -mt-0.5" /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge>{ORIGIN_LABELS[origin]}</Badge>
        <Badge>{skillCategory(skill)}</Badge>
        {skill.tags?.map((tag) => <TagChip key={tag}>{tag}</TagChip>)}
      </div>
      {age ? <p className="mt-3 text-[12px] text-fg-subtle">Updated {age}</p> : null}
      <InspectorSection title="Description">
        <MarkdownPanel content={skill.description} />
      </InspectorSection>
      {skill.when_to_use ? (
        <InspectorSection title="When to use">
          <MarkdownPanel content={skill.when_to_use} />
        </InspectorSection>
      ) : null}
      {skill.body ? (
        <InspectorSection title="Instructions">
          <MarkdownPanel content={skill.body} emptyText="No instructions" />
        </InspectorSection>
      ) : null}
    </div>
  );
}

SkillInspector.propTypes = { skill: skillShape, onDelete: PropTypes.func.isRequired, deleting: PropTypes.bool };

export default function SkillsTab({ catalog }) {
  const { skills, categories, loading, error, reload, query, setQuery, origin, setOrigin, selectedName, select } = catalog;
  const confirm = useConfirm();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visible = useMemo(() => filterByOrigin(skills, origin).filter((skill) => skillMatches(skill, query)), [skills, origin, query]);
  const groups = useMemo(() => groupByCategory(visible, categories), [visible, categories]);
  const selected = visible.find((skill) => skill.name === selectedName) || groups[0]?.skills[0] || null;
  const counts = originCounts(skills);
  const filters = [
    { value: 'all', label: 'All', meta: String(skills.length) },
    ...['default', 'user', 'auto'].map((value) => ({ value, label: ORIGIN_LABELS[value], meta: String(counts[value]) })),
  ];

  async function reloadFromDisk() {
    setReloading(true);
    setReloaded(false);
    try {
      await agentApi.reloadSkills();
      await reload({ quiet: true });
      setReloaded(true);
      setTimeout(() => setReloaded(false), 2000);
    } catch (err) {
      toast.error("Couldn't reload the skills", { detail: errorDetail(err) });
    } finally {
      setReloading(false);
    }
  }

  async function deleteSkill(skill) {
    const ok = await confirm({
      title: 'Delete this skill?',
      message: `“${skill.name}” will be deleted. This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await agentApi.deleteSkill(skill.name);
      select(null);
      await reload({ quiet: true });
    } catch (err) {
      toast.error("Couldn't delete the skill", { detail: errorDetail(err) });
    } finally {
      setDeleting(false);
    }
  }

  const toolbar = (
    <>
      <div className="flex items-center gap-2">
        <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search skills" className="min-w-0 flex-1 sm:max-w-xs" />
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            icon={reloaded ? Check : RefreshCw}
            label={reloaded ? 'Reloaded' : 'Reload from the skills folder'}
            onClick={reloadFromDisk}
            loading={reloading}
            disabled={loading}
          />
          <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
            New<span className="hidden sm:inline"> skill</span>
          </Button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <Segmented size="sm" role="radiogroup" label="Where they came from" value={origin} onChange={setOrigin} items={filters} className="w-max" />
      </div>
    </>
  );

  let list;
  if (error) {
    list = <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={() => reload()}>Try again</Button>}>Couldn&apos;t load the skills: {error}</Notice>;
  } else if (loading) {
    list = <ListSkeleton />;
  } else if (!groups.length) {
    list = <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted">{query.trim() || origin !== 'all' ? 'No skills match.' : 'No skills yet.'}</p>;
  } else {
    list = groups.map((group) => (
      <CatalogGroup key={group.name} title={group.name} count={group.skills.length} hint={group.description}>
        {group.skills.map((skill) => {
          const skillOrigin = getSkillOrigin(skill);
          return (
            <CatalogRow
              key={skill.name}
              name={skill.name}
              description={skill.description}
              meta={skill.tags?.length ? skill.tags.slice(0, 4).join(' · ') : null}
              selected={skill.name === selected?.name}
              onSelect={() => select(skill.name)}
              badges={skillOrigin === 'default' ? null : <Badge>{ORIGIN_LABELS[skillOrigin]}</Badge>}
            />
          );
        })}
      </CatalogGroup>
    ));
  }

  return (
    <>
      <NewSkillDialog
        open={newOpen}
        categories={categories}
        onClose={() => setNewOpen(false)}
        onCreated={(name) => {
          setNewOpen(false);
          select(name);
          reload({ quiet: true });
        }}
      />
      <ListWithInspector
        label="Skills"
        toolbar={toolbar}
        list={list}
        inspector={<SkillInspector skill={selected} onDelete={() => deleteSkill(selected)} deleting={deleting} />}
        opened={Boolean(selectedName && selected)}
        onBack={() => select(null)}
      />
    </>
  );
}

SkillsTab.propTypes = {
  catalog: PropTypes.shape({
    skills: PropTypes.arrayOf(skillShape).isRequired,
    categories: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, description: PropTypes.string })).isRequired,
    loading: PropTypes.bool,
    error: PropTypes.string,
    reload: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    setQuery: PropTypes.func.isRequired,
    origin: PropTypes.string.isRequired,
    setOrigin: PropTypes.func.isRequired,
    selectedName: PropTypes.string,
    select: PropTypes.func.isRequired,
  }).isRequired,
};
