// "Save this as a skill?" — shown in a chat after an answer the agent worked
// through, when Settings → Privacy & safety → Suggest skills from my chats is
// on. Save writes the skill; Not now drops the draft. Nothing is saved before.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';
import { errorDetail, useToast } from '../../../components/toastContext.js';

export default function SkillSuggestionCard({ suggestion, onSave, onDismiss }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const act = async (kind) => {
    setBusy(kind);
    try {
      await (kind === 'save' ? onSave : onDismiss)(suggestion.id);
    } catch (err) {
      toast.error(kind === 'save' ? "Couldn't save the skill" : "Couldn't dismiss it", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  if (suggestion.saved) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[13px] text-fg-muted" data-skill-suggestion="saved">
        <Check className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate">Saved <span className="font-medium text-fg">{suggestion.name}</span> to your skills</span>
        <button type="button" onClick={() => navigate('/tools?tab=skills')} className="shrink-0 text-accent hover:underline">View</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3" data-skill-suggestion>
      <p className="text-[13px] font-medium text-fg">Save this as a skill?</p>
      <p className="mt-1 break-words text-[13px] text-fg">{suggestion.name}</p>
      {suggestion.description ? <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{suggestion.description}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={busy === 'save'} disabled={Boolean(busy)} onClick={() => act('save')}>Save</Button>
        <Button variant="ghost" loading={busy === 'dismiss'} disabled={Boolean(busy)} onClick={() => act('dismiss')}>Not now</Button>
      </div>
    </div>
  );
}

SkillSuggestionCard.propTypes = {
  suggestion: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    saved: PropTypes.bool,
  }).isRequired,
  onSave: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};
