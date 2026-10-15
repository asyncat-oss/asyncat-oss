// Tools & Skills (/tools, /skills): what the agent can do, in three tabs:
// the tools it can call, the skills it can follow and what it remembers.
// The tabs' lists, searches and filters live here so a tab keeps them while
// another one is open.

import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { BookMarked, Bot, Wrench } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import MemoryTab from './MemoryTab.jsx';
import SkillsTab from './SkillsTab.jsx';
import ToolsTab from './ToolsTab.jsx';
import { useSkillCatalog, useToolCatalog } from './useCatalogs.js';
import { useMemories } from './useMemories.js';
import { useMemoryOwners } from './useMemoryOwners.js';

const TABS = ['tools', 'skills', 'memory'];

// The instructions file was the Soul tab here; it lives in Settings now.
export default function AgentToolsSkillsPage(props) {
  const [searchParams] = useSearchParams();
  if (searchParams.get('tab') === 'soul') return <Navigate to="/settings/personalization#instructions" replace />;
  return <ToolsSkillsTabs {...props} />;
}

function ToolsSkillsTabs({ initialTab = 'tools' }) {
  // `?tab=memory` (or skills/tools) opens a specific tab, e.g. from ⌘K.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const startTab = TABS.includes(requestedTab) ? requestedTab : initialTab;
  const [activeTab, setActiveTab] = useState(startTab);
  const toolCatalog = useToolCatalog();
  const skillCatalog = useSkillCatalog();
  const memory = useMemories(activeTab === 'memory', searchParams.get('scope'));
  const memoryOwners = useMemoryOwners(activeTab === 'memory');

  useEffect(() => {
    setActiveTab(startTab);
  }, [startTab]);

  const count = (list) => (list.length ? String(list.length) : null);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Tools & Skills"
        description="What the agent can do: actions it can take, skills it can follow and what it remembers."
      >
        <Tabs
          className="mt-4"
          label="Tools and skills sections"
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { value: 'tools', label: 'Tools', icon: Wrench, meta: count(toolCatalog.tools) },
            { value: 'skills', label: 'Skills', icon: Bot, meta: count(skillCatalog.skills) },
            { value: 'memory', label: 'Memory', icon: BookMarked },
          ]}
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {activeTab === 'tools' && <ToolsTab catalog={toolCatalog} />}
        {activeTab === 'skills' && <SkillsTab catalog={skillCatalog} />}
        {activeTab === 'memory' && <MemoryTab memory={memory} owners={memoryOwners} />}
      </div>
    </div>
  );
}

AgentToolsSkillsPage.propTypes = {
  initialTab: PropTypes.oneOf(TABS),
};

ToolsSkillsTabs.propTypes = AgentToolsSkillsPage.propTypes;
