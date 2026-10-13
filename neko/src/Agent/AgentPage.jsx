// neko/src/Agent/AgentPage.jsx
// ─── Agent Management Shell ───────────────────────────────────────────────────
// Agent profiles, plus the coding agents (Claude Code, Codex) a chat can use.
// Scheduling lives in the top-level Automations page.

import { useSearchParams } from 'react-router-dom';
import { Layers, TerminalSquare } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import ProfilesPage from '../Profiles/ProfilesPage';
import CodingAgentsSection from './CodingAgentsSection.jsx';

const TABS = [
  { value: 'profiles', label: 'Profiles', icon: Layers },
  { value: 'coding', label: 'Coding agents', icon: TerminalSquare },
];

export default function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'coding' ? 'coding' : 'profiles';

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Agents"
        description="Profiles set an agent's personality, tools, permissions and working folder. Coding agents let Claude Code or Codex answer a chat."
      >
        <Tabs
          className="mt-4"
          label="Agents"
          value={tab}
          onChange={(value) => setSearchParams(value === 'profiles' ? {} : { tab: value }, { replace: true })}
          items={TABS}
        />
      </PageHeader>

      <div className={`flex-1 ${tab === 'coding' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {tab === 'coding' ? <CodingAgentsSection /> : <ProfilesPage embedded />}
      </div>
    </div>
  );
}
