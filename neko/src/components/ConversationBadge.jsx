import PropTypes from 'prop-types';
import { Cat as CatIcon } from 'lucide-react';
import { ProviderGlyph } from '../Models/modelLogos.jsx';
import AsyncatMark from './ui/AsyncatMark.jsx';
import AgentAvatar from '../Agent/AgentAvatar.jsx';
import { conversationAgentId, conversationEngine, engineDisplayName } from '../Agent/externalAgentFormat.js';

/**
 * Who answered a conversation: a small Asyncat, Claude Code, Codex (or other
 * agent) mark, with the custom agent's picture beside it when one was used.
 */
export default function ConversationBadge({ conversation, agentsById = null, className = '' }) {
  // A Cat's chat: the Cat answers there.
  if (conversation?.metadata?.catId) {
    return (
      <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`} title="A Cat's chat" aria-label="A Cat's chat">
        <CatIcon className="h-3.5 w-3.5 text-fg-subtle" />
      </span>
    );
  }
  const engine = conversationEngine(conversation);
  const agentId = conversationAgentId(conversation);
  const agent = agentId && agentsById ? agentsById.get(String(agentId)) : null;
  const engineName = engineDisplayName(engine);
  const label = agent ? `${engineName} · ${agent.name || 'Agent'}` : engineName;
  const engineMark = engine === 'asyncat'
    ? <AsyncatMark variant="glyph" className="h-3.5 w-3.5 text-fg-subtle" />
    : <EngineGlyph engine={engine} />;
  // Same width on every row: with an agent, its picture takes the spot and
  // the engine's mark sits small in its corner.
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`} title={`Answered by ${label}`} aria-label={`Answered by ${label}`}>
      {agent ? (
        <>
          <AgentAvatar agent={agent} size="xs" className="text-[12px] leading-none" />
          <span className="absolute -bottom-1 -right-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-[3px] bg-canvas [&>*]:h-2.5 [&>*]:w-2.5">
            {engineMark}
          </span>
        </>
      ) : engineMark}
    </span>
  );
}

function EngineGlyph({ engine }) {
  const glyph = <ProviderGlyph providerId={engine} className="h-3.5 w-3.5" />;
  if (glyph && (engine === 'claude-code' || engine === 'codex')) return glyph;
  // Agents without a known mark: their initial on a small tile.
  const initial = engineDisplayName(engine).charAt(0).toUpperCase();
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-hover text-[9px] font-semibold text-fg-muted" aria-hidden="true">
      {initial}
    </span>
  );
}

EngineGlyph.propTypes = { engine: PropTypes.string.isRequired };

ConversationBadge.propTypes = {
  conversation: PropTypes.object.isRequired,
  agentsById: PropTypes.instanceOf(Map),
  className: PropTypes.string,
};
