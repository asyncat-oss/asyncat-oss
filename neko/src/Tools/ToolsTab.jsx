// Tools & Skills → Tools: every action the agent can take, in groups, with
// a search, a filter for the system it runs on, and the open tool's
// description, platform notes and parameters beside the list.

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Check, X } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { Badge } from '../Models/modelPageShared.jsx';
import { CatalogGroup, CatalogRow, InspectorEmpty, InspectorSection, ListSkeleton, ListWithInspector, MarkdownPanel } from './catalogParts.jsx';
import { ALL_OS, OS_LABELS, filterTools, groupTools, permissionCounts, toolGroupLabel, toolPlatforms } from './toolCatalog.js';

const PERMISSIONS = {
  safe: { label: 'Safe', color: 'gray' },
  moderate: { label: 'Moderate', color: 'amber' },
  dangerous: { label: 'Dangerous', color: 'red' },
};

const SYSTEMS = [{ value: 'all', label: 'All' }, ...ALL_OS.map((os) => ({ value: os, label: OS_LABELS[os] }))];

function PermissionBadge({ permission }) {
  const meta = PERMISSIONS[permission] || PERMISSIONS.moderate;
  return <Badge color={meta.color}>{meta.label}</Badge>;
}

PermissionBadge.propTypes = { permission: PropTypes.string };

/** "macOS, Linux and Windows". */
function listSystems(systems) {
  const names = systems.map((os) => OS_LABELS[os]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] || '';
}

function Platforms({ name }) {
  const { platforms, deps } = toolPlatforms(name);
  if (!deps) return <p className="text-[13px] text-fg-muted">{listSystems(platforms)}</p>;
  return (
    <ul className="space-y-2">
      {ALL_OS.map((os) => {
        const runs = platforms.includes(os);
        const Icon = runs ? Check : X;
        return (
          <li key={os} className="flex items-start gap-2 text-[13px]">
            <Icon className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${runs ? 'text-fg-muted' : 'text-fg-subtle'}`} aria-hidden="true" />
            <span className={`w-16 shrink-0 ${runs ? 'text-fg' : 'text-fg-subtle'}`}>{OS_LABELS[os]}</span>
            {runs
              ? <span className="min-w-0 break-words font-mono text-[12px] leading-5 text-fg-muted">{deps[os]}</span>
              : <span className="text-fg-subtle">Not supported</span>}
          </li>
        );
      })}
    </ul>
  );
}

Platforms.propTypes = { name: PropTypes.string.isRequired };

function ToolInspector({ tool }) {
  if (!tool) return <InspectorEmpty>Pick a tool to see what it does and what it takes.</InspectorEmpty>;
  return (
    <div className="p-5 lg:p-6" data-tool-inspector={tool.name}>
      <h2 className="break-words font-mono text-[15px] font-semibold text-fg">{tool.name}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <PermissionBadge permission={tool.permission} />
        <Badge>{toolGroupLabel(tool.category)}</Badge>
      </div>
      <InspectorSection title="Description">
        <MarkdownPanel content={tool.description} />
      </InspectorSection>
      <InspectorSection title="Runs on">
        <Platforms name={tool.name} />
      </InspectorSection>
      {tool.parameters ? (
        <InspectorSection title="Parameters">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 font-mono text-[12px] leading-5 text-fg-muted">
            {typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}
          </pre>
        </InspectorSection>
      ) : null}
    </div>
  );
}

const toolShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  permission: PropTypes.string,
  category: PropTypes.string,
  parameters: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
});

ToolInspector.propTypes = { tool: toolShape };

function Summary({ tools, shown, filtered }) {
  const counts = permissionCounts(tools);
  return (
    <p className="text-[12px] tabular-nums text-fg-subtle">
      {filtered ? `${shown} of ${tools.length} tools` : `${tools.length} tools`}
      {' · '}{counts.safe} safe · {counts.moderate} moderate · {counts.dangerous} dangerous
    </p>
  );
}

Summary.propTypes = { tools: PropTypes.arrayOf(toolShape).isRequired, shown: PropTypes.number.isRequired, filtered: PropTypes.bool };

export default function ToolsTab({ catalog }) {
  const { tools, loading, error, reload, query, setQuery, os, setOs, selectedName, select } = catalog;
  const visible = useMemo(() => filterTools(tools, { query, os }), [tools, query, os]);
  const groups = useMemo(() => groupTools(visible), [visible]);
  const selected = visible.find((tool) => tool.name === selectedName) || groups[0]?.tools[0] || null;
  const filtered = Boolean(query.trim()) || os !== 'all';

  const toolbar = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search tools" className="sm:max-w-xs sm:flex-1" />
        <Segmented size="sm" role="radiogroup" label="Runs on" value={os} onChange={setOs} items={SYSTEMS} className="self-start sm:self-auto" />
      </div>
      {tools.length ? <Summary tools={tools} shown={visible.length} filtered={filtered} /> : null}
    </>
  );

  let list;
  if (error) {
    list = <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={() => reload()}>Try again</Button>}>Couldn&apos;t load the tools: {error}</Notice>;
  } else if (loading) {
    list = <ListSkeleton />;
  } else if (!groups.length) {
    list = <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted">{filtered ? 'No tools match.' : 'No tools.'}</p>;
  } else {
    list = groups.map((group) => (
      <CatalogGroup key={group.label} title={group.label} count={group.tools.length}>
        {group.tools.map((tool) => {
          const { platforms, restricted } = toolPlatforms(tool.name);
          return (
            <CatalogRow
              key={tool.name}
              mono
              name={tool.name}
              description={tool.description}
              selected={tool.name === selected?.name}
              onSelect={() => select(tool.name)}
              badges={(
                <>
                  <PermissionBadge permission={tool.permission} />
                  {restricted ? platforms.map((name) => <Badge key={name}>{OS_LABELS[name]}</Badge>) : null}
                </>
              )}
            />
          );
        })}
      </CatalogGroup>
    ));
  }

  return <ListWithInspector label="Tools" toolbar={toolbar} list={list} inspector={<ToolInspector tool={selected} />} />;
}

ToolsTab.propTypes = {
  catalog: PropTypes.shape({
    tools: PropTypes.arrayOf(toolShape).isRequired,
    loading: PropTypes.bool,
    error: PropTypes.string,
    reload: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    setQuery: PropTypes.func.isRequired,
    os: PropTypes.string.isRequired,
    setOs: PropTypes.func.isRequired,
    selectedName: PropTypes.string,
    select: PropTypes.func.isRequired,
  }).isRequired,
};
