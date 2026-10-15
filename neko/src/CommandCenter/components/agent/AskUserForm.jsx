// A small form for an agent's question (ask_user with `fields`): text,
// longer text, a number, or one of a few choices per field.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Send } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';
import { formAnswer, formHasAnswer } from './askForm.js';

const INPUT = 'w-full rounded-lg border border-line-strong bg-canvas px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 dark:[color-scheme:dark]';

export default function AskUserForm({ fields, onSubmit }) {
  const [values, setValues] = useState({});
  const set = (id, value) => setValues((current) => ({ ...current, [id]: value }));
  const ready = formHasAnswer(fields, values);
  return (
    <form
      className="mt-2 space-y-2"
      data-ask-form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(formAnswer(fields, values));
      }}
    >
      {fields.map((field, index) => (
        <label key={field.id} className="block">
          <span className="mb-1 block text-[12px] font-medium text-fg-muted">{field.label}</span>
          {field.kind === 'choice' ? (
            <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
              {field.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={values[field.id] === choice}
                  onClick={() => set(field.id, choice)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${values[field.id] === choice ? 'border-line-strong bg-selected text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'}`}
                >
                  {values[field.id] === choice ? <Check className="h-3.5 w-3.5" /> : null}
                  {choice}
                </button>
              ))}
            </span>
          ) : field.kind === 'long_text' ? (
            <textarea rows={3} className={INPUT} placeholder={field.placeholder} value={values[field.id] || ''} onChange={(event) => set(field.id, event.target.value)} autoFocus={index === 0} />
          ) : (
            <input
              type={field.kind === 'number' ? 'number' : 'text'}
              className={INPUT}
              placeholder={field.placeholder}
              value={values[field.id] || ''}
              onChange={(event) => set(field.id, event.target.value)}
              autoFocus={index === 0}
            />
          )}
        </label>
      ))}
      <Button type="submit" variant="primary" icon={Send} disabled={!ready}>
        Send
      </Button>
    </form>
  );
}

AskUserForm.propTypes = {
  fields: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    kind: PropTypes.string,
    choices: PropTypes.arrayOf(PropTypes.string),
    placeholder: PropTypes.string,
  })).isRequired,
  onSubmit: PropTypes.func.isRequired,
};
