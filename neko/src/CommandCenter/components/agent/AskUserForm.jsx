// A small form for an agent's question (ask_user with `fields`): text,
// longer text, a number, or one of a few choices per field.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Send } from 'lucide-react';
import { formAnswer, formHasAnswer } from './askForm.js';

const INPUT = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200';

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
          <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">{field.label}</span>
          {field.kind === 'choice' ? (
            <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
              {field.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={values[field.id] === choice}
                  onClick={() => set(field.id, choice)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${values[field.id] === choice ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                >
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
      <button
        type="submit"
        disabled={!ready}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        <Send className="h-3 w-3" /> Send
      </button>
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
