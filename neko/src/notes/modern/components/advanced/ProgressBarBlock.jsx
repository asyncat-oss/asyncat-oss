import { useState } from 'react';
import { BarChart3 } from 'lucide-react';

const ProgressBarBlock = ({ block, onChange }) => {
  const [config, setConfig] = useState(block.properties?.config || {
    title: 'Progress',
    value: 50,
    max: 100,
    showPercentage: true,
    color: '#3b82f6'
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
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4" />
        <input
          type="text"
          value={config.title}
          onChange={(e) => updateConfig({ title: e.target.value })}
          className="font-medium bg-transparent border-none outline-none dark:text-white midnight:text-white"
        />
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={config.value}
            onChange={(e) => updateConfig({ value: parseInt(e.target.value) || 0 })}
            className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 midnight:border-gray-600 rounded text-sm dark:bg-gray-700 midnight:bg-gray-800 dark:text-white midnight:text-white"
            min="0"
            max={config.max}
          />
          <span className="text-sm text-gray-500 midnight:text-gray-400">/ {config.max}</span>
          {config.showPercentage && (
            <span className="text-sm font-medium">{percentage.toFixed(1)}%</span>
          )}
        </div>
        
        <div className="w-full bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full h-4">
          <div
            className="h-4 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: config.color
            }}
          />
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Max value:
            <input
              type="number"
              value={config.max}
              onChange={(e) => updateConfig({ max: parseInt(e.target.value) || 100 })}
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 midnight:border-gray-600 rounded dark:bg-gray-700 midnight:bg-gray-800 dark:text-white midnight:text-white"
              min="1"
            />
          </label>
          <label className="flex items-center gap-2">
            Color:
            <input
              type="color"
              value={config.color}
              onChange={(e) => updateConfig({ color: e.target.value })}
              className="w-8 h-8 border border-gray-300 dark:border-gray-600 midnight:border-gray-600 rounded"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default ProgressBarBlock;
