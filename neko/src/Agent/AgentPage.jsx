// neko/src/Agent/AgentPage.jsx
// ─── Agents ───────────────────────────────────────────────────────────────────
// Custom agents (like GPTs and Gems) and the coding agents (Claude Code,
// Codex) a chat can hand work to. ?edit=<id> or ?edit=new opens the editor.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, TerminalSquare } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import AgentsGallery from './AgentsGallery.jsx';
import AgentEditor from './AgentEditor.jsx';
import CodingAgentsSection from './CodingAgentsSection.jsx';

const TABS = [
  { value: 'agents', label: 'Your agents', icon: Sparkles },
  { value: 'coding', label: 'Coding agents', icon: TerminalSquare },
];

export default function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'coding' ? 'coding' : 'agents';
  const editing = searchParams.get('edit');
  const [template, setTemplate] = useState(null);

  const openEditor = (id, nextTemplate = null) => {
    setTemplate(nextTemplate);
    setSearchParams({ edit: id || 'new' });
  };
  const closeEditor = () => {
    setTemplate(null);
    setSearchParams({}, { replace: true });
  };

  if (editing) {
    return (
      <AgentEditor
        key={editing === 'new' ? `new:${template?.key || 'blank'}` : editing}
        agentId={editing === 'new' ? null : editing}
        template={editing === 'new' ? template : null}
        onClose={closeEditor}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Agents"
        description="Make agents for jobs you do often, then pick one in the message box. Coding agents let Claude Code or Codex answer a chat."
      >
        <Tabs
          className="mt-4"
          label="Agents"
          value={tab}
          onChange={(value) => setSearchParams(value === 'agents' ? {} : { tab: value }, { replace: true })}
          items={TABS}
        />
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {tab === 'coding'
          ? <CodingAgentsSection />
          : <AgentsGallery onEdit={(id) => openEditor(id)} onCreate={(nextTemplate) => openEditor(null, nextTemplate)} />}
      </div>
    </div>
  );
}
