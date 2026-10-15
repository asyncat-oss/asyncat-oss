// A button block: a button the note's reader can press to open a link or
// write an email, with its text, style, size and action set below it.

import { useState } from 'react';
import { MousePointer } from 'lucide-react';
import { buttonClass } from '../../../../components/ui/Button.jsx';
import Checkbox from '../../../../components/ui/Checkbox.jsx';
import { Field, Input } from '../../../../components/ui/Field.jsx';
import Select from '../../../../components/ui/Select.jsx';

const SIZES = { small: 'xs', medium: 'sm', large: 'md' };

// The look of the button the user styled, from the app's own buttons.
function previewClass(style, size) {
  const sizeKey = SIZES[size] || 'sm';
  switch (style) {
    case 'secondary':
      return buttonClass('secondary', sizeKey);
    case 'outline':
      return `${buttonClass('ghost', sizeKey)} border border-line-strong`;
    case 'ghost':
      return buttonClass('ghost', sizeKey);
    case 'danger':
      return buttonClass('destructive', sizeKey);
    case 'success':
      return buttonClass('destructive', sizeKey)
        .replace('bg-red-600', 'bg-emerald-600')
        .replace('hover:bg-red-700', 'hover:bg-emerald-700');
    default:
      return buttonClass('primary', sizeKey);
  }
}

const ButtonBlock = ({ block, onChange }) => {
  const [config, setConfig] = useState(block.properties?.config || {
    text: 'Click me',
    style: 'primary',
    size: 'medium',
    action: 'none',
    url: '',
    fullWidth: false
  });

  const styleOptions = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'outline', label: 'Outline' },
    { value: 'ghost', label: 'Ghost' },
    { value: 'danger', label: 'Danger' },
    { value: 'success', label: 'Success' }
  ];

  const sizeOptions = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' }
  ];

  const actionOptions = [
    { value: 'none', label: 'Nothing' },
    { value: 'url', label: 'Open a link' },
    { value: 'email', label: 'Write an email' }
  ];

  const updateConfig = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onChange(block.id, {
      properties: { ...block.properties, config: newConfig }
    });
  };

  const handleButtonClick = () => {
    switch (config.action) {
      case 'url':
        if (config.url) {
          window.open(config.url, '_blank');
        }
        break;
      case 'email':
        if (config.url) {
          window.location.href = `mailto:${config.url}`;
        }
        break;
      default:
        // No action
        break;
    }
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-fg">
        <MousePointer className="h-4 w-4 text-fg-subtle" />
        Button
      </div>

      <div className="space-y-4">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleButtonClick}
            className={`${previewClass(config.style, config.size)} ${config.fullWidth ? 'w-full' : ''}`}
          >
            {config.text}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <Field label="Text" htmlFor={`button-text-${block.id}`}>
            <Input
              id={`button-text-${block.id}`}
              type="text"
              value={config.text}
              onChange={(e) => updateConfig({ text: e.target.value })}
            />
          </Field>

          <Field label="Style" htmlFor={`button-style-${block.id}`}>
            <Select
              id={`button-style-${block.id}`}
              value={config.style}
              onChange={(value) => updateConfig({ style: value })}
              options={styleOptions}
            />
          </Field>

          <Field label="Size" htmlFor={`button-size-${block.id}`}>
            <Select
              id={`button-size-${block.id}`}
              value={config.size}
              onChange={(value) => updateConfig({ size: value })}
              options={sizeOptions}
            />
          </Field>

          <Field label="When pressed" htmlFor={`button-action-${block.id}`}>
            <Select
              id={`button-action-${block.id}`}
              value={config.action}
              onChange={(value) => updateConfig({ action: value })}
              options={actionOptions}
            />
          </Field>
        </div>

        {(config.action === 'url' || config.action === 'email') && (
          <Field label={config.action === 'email' ? 'Email address' : 'Link'} htmlFor={`button-url-${block.id}`}>
            <Input
              id={`button-url-${block.id}`}
              type={config.action === 'email' ? 'email' : 'url'}
              value={config.url}
              onChange={(e) => updateConfig({ url: e.target.value })}
              placeholder={config.action === 'email' ? 'name@example.com' : 'https://example.com'}
            />
          </Field>
        )}

        <Checkbox
          checked={Boolean(config.fullWidth)}
          onChange={(fullWidth) => updateConfig({ fullWidth })}
          label="Full width"
        />
      </div>
    </div>
  );
};

export default ButtonBlock;
