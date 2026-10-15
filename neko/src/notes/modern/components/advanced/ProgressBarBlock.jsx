// A progress bar block: a title, a value out of a maximum, and a bar in the
// theme's accent or a colour the user picks.

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { CONTROL_CLASS } from '../../../../components/ui/Field.jsx';

// The theme's accent as #rrggbb, for the colour input before a colour is
// picked (the input can't take a CSS variable).
function accentHex() {
  if (typeof document === 'undefined') return '#2456dc';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--as-accent').trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#2456dc';
}

const ProgressBarBlock = ({ block, onChange }) => {
  const [config, setConfig] = useState(block.properties?.config || {
    title: 'Progress',
    value: 50,
    max: 100,
    showPercentage: true,
  });

  const updateConfig = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onChange(block.id, {
      properties: { ...block.properties, config: newConfig }
    });
  };

  const percentage = (config.value / config.max) * 100;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-fg-subtle" />
        <input
          type="text"
          value={config.title}
          onChange={(e) => updateConfig({ title: e.target.value })}
          aria-label="Title"
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] font-medium text-fg outline-none"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="w-20">
            <input
              type="number"
              value={config.value}
              onChange={(e) => updateConfig({ value: parseInt(e.target.value) || 0 })}
              aria-label="Value"
              className={`h-8 ${CONTROL_CLASS}`}
              min="0"
              max={config.max}
            />
          </span>
          <span className="text-fg-subtle">of {config.max}</span>
          {config.showPercentage && (
            <span className="font-medium tabular-nums text-fg">{percentage.toFixed(1)}%</span>
          )}
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-hover">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: config.color || 'var(--as-accent)'
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[12px] text-fg-muted">
          <label className="flex items-center gap-2">
            Out of
            <span className="w-20">
              <input
                type="number"
                value={config.max}
                onChange={(e) => updateConfig({ max: parseInt(e.target.value) || 100 })}
                className={`h-8 ${CONTROL_CLASS}`}
                min="1"
              />
            </span>
          </label>
          <label className="flex items-center gap-2">
            Color
            <input
              type="color"
              value={config.color || accentHex()}
              onChange={(e) => updateConfig({ color: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded-md border border-line-strong bg-canvas p-0.5"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default ProgressBarBlock;
