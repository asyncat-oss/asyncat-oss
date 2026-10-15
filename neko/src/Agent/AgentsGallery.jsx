import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Pencil, Plus } from 'lucide-react';
import Button from '../components/ui/Button';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import AgentAvatar from './AgentAvatar.jsx';
import { AGENT_TEMPLATES } from './agentTemplates.js';
import { useAgents } from './useAgents.js';

/** The user's agents as cards, plus templates to start from. */
export default function AgentsGallery({ onEdit, onCreate }) {
  const navigate = useNavigate();
  const { agents, loaded } = useAgents();
  const { handleNewConversation } = useCommandCenter();

  const startChat = async (agent) => {
    await handleNewConversation({ experienceMode: 'work', metadata: { agentProfileId: agent.id } });
    navigate('/home');
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-6 lg:px-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-fg">Your agents</h2>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => onCreate(null)}>New agent</Button>
        </div>
        {!loaded ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-hover" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-fg">No agents yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-fg-muted">
              An agent is a version of Asyncat set up for one job: its own instructions, files it knows, a model and what it may do. Pick one in the message box whenever you need it.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="group flex min-h-[9rem] flex-col rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <AgentAvatar agent={agent} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-fg">{agent.name}</div>
                    {agent.is_default && <div className="text-[11px] text-fg-subtle">Picked for new chats</div>}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-fg-muted">{agent.description || agent.instructions || 'No description yet.'}</p>
                <div className="mt-auto flex gap-1.5 pt-3">
                  <Button size="xs" variant="secondary" icon={MessageSquare} onClick={() => startChat(agent)}>Chat</Button>
                  <Button size="xs" variant="ghost" icon={Pencil} onClick={() => onEdit(agent.id)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[13px] font-semibold text-fg">Start from a template</h2>
        <p className="mb-3 text-[12px] text-fg-muted">Fills in the editor; change anything before you save.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => onCreate(template)}
              className="flex flex-col rounded-2xl border border-line p-4 text-left transition-colors hover:border-line-strong hover:bg-hover"
            >
              <template.glyph className="h-5 w-5 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />
              <span className="mt-2.5 text-[13px] font-medium text-fg">{template.name}</span>
              <span className="mt-1 line-clamp-2 text-[12px] leading-5 text-fg-muted">{template.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

AgentsGallery.propTypes = {
  onEdit: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
};
