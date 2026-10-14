// One chart block for notes: line, area, bar, pie, donut and scatter. It
// replaces six hand-drawn canvas copies and draws with recharts, like charts
// in chat. Saved notes keep the same shape: block.properties = { data, config }
// with chart.js-style labels/datasets, which the DOCX/PDF export also reads.

import { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../../../components/ui/Button.jsx';
import { Input } from '../../../../components/ui/Field.jsx';
import Select from '../../../../components/ui/Select.jsx';
import { CHART_HEIGHT_OPTIONS, getHeightKey, getHeightValue } from './chartConstants';

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6b7280'];

const SIZE_OPTIONS = Object.entries(CHART_HEIGHT_OPTIONS).map(([key, option]) => ({ value: key, label: option.label }));
const BAR_DIRECTIONS = [
  { value: 'vertical', label: 'Vertical bars' },
  { value: 'horizontal', label: 'Horizontal bars' },
];

const NAMES = { line: 'Line chart', area: 'Area chart', bar: 'Bar chart', pie: 'Pie chart', donut: 'Donut chart', scatter: 'Scatter chart' };

// What a new chart starts with (the same as the old blocks).
const DEFAULTS = {
  line: {
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        { label: 'Dataset 1', data: [12, 19, 3, 5, 2, 3], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4 },
        { label: 'Dataset 2', data: [8, 15, 7, 12, 9, 6], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4 },
      ],
    },
    config: { title: 'Line Chart', showGrid: true, showLegend: true, showPoints: true, heightSize: 'medium' },
  },
  area: {
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        { label: 'Dataset 1', data: [12, 19, 3, 5, 2, 3], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.3)', tension: 0.4 },
        { label: 'Dataset 2', data: [8, 15, 7, 12, 9, 6], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.3)', tension: 0.4 },
      ],
    },
    config: { title: 'Area Chart', showGrid: true, showLegend: true, showPoints: true, heightSize: 'medium' },
  },
  bar: {
    data: {
      labels: ['01', '02', '03', '04'],
      datasets: [
        { label: 'Dataset One', data: [65, 59, 80, 81], backgroundColor: '#3b82f6' },
        { label: 'Dataset Two', data: [45, 78, 65, 92], backgroundColor: '#ef4444' },
        { label: 'Dataset Three', data: [35, 48, 55, 71], backgroundColor: '#10b981' },
      ],
    },
    config: { title: 'Bar Chart', showGrid: true, showLegend: true, orientation: 'vertical', heightSize: 'medium' },
  },
  pie: {
    data: { labels: ['Desktop', 'Mobile', 'Tablet', 'Other'], datasets: [{ data: [45, 35, 15, 5], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] }] },
    config: { title: 'Pie Chart', showLegend: true, showPercentages: true, showValues: true, heightSize: 'medium' },
  },
  donut: {
    data: { labels: ['Desktop', 'Mobile', 'Tablet'], datasets: [{ data: [45, 35, 20], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'] }] },
    config: { title: 'Donut Chart', showLegend: true, showPercentages: true, heightSize: 'medium', innerRadius: 0.5 },
  },
  scatter: {
    data: {
      datasets: [
        { label: 'Dataset 1', data: [{ x: 10, y: 20 }, { x: 15, y: 10 }, { x: 25, y: 25 }, { x: 30, y: 15 }], backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
        { label: 'Dataset 2', data: [{ x: 5, y: 15 }, { x: 20, y: 30 }, { x: 35, y: 5 }, { x: 40, y: 20 }], backgroundColor: '#ef4444', borderColor: '#ef4444' },
      ],
    },
    config: { title: 'Scatter Chart', showGrid: true, showLegend: true, showTrendline: false, heightSize: 'medium', pointSize: 6 },
  },
};

const TOGGLES = {
  line: [['showGrid', 'Grid'], ['showLegend', 'Legend'], ['showPoints', 'Points']],
  area: [['showGrid', 'Grid'], ['showLegend', 'Legend'], ['showPoints', 'Points']],
  bar: [['showGrid', 'Grid'], ['showLegend', 'Legend']],
  pie: [['showLegend', 'Legend'], ['showPercentages', 'Percentages'], ['showValues', 'Values']],
  donut: [['showLegend', 'Legend'], ['showPercentages', 'Percentages']],
  scatter: [['showGrid', 'Grid'], ['showLegend', 'Legend'], ['showTrendline', 'Trend line']],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** A #rrggbb colour for a colour input, from hex or rgb()/rgba(). */
function toHex(color, fallback) {
  const text = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text.slice(1).split('').map((c) => c + c).join('')}`;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(text);
  if (rgb) return `#${rgb.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

function withAlpha(hex, alpha) {
  const value = toHex(hex, '#3b82f6');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seriesColor(dataset, index) {
  const base = dataset?.borderColor || (Array.isArray(dataset?.backgroundColor) ? null : dataset?.backgroundColor);
  return toHex(base, PALETTE[index % PALETTE.length]);
}

function sliceColor(dataset, index) {
  const colors = Array.isArray(dataset?.backgroundColor) ? dataset.backgroundColor : [];
  return toHex(colors[index % (colors.length || 1)], PALETTE[index % PALETTE.length]);
}

/** Saved properties with defaults filled in and old height values converted. */
function readChart(type, properties = {}) {
  const fallback = DEFAULTS[type] || DEFAULTS.bar;
  const data = properties.data?.datasets?.length ? properties.data : fallback.data;
  const config = { ...fallback.config, ...(properties.config || {}) };
  if (config.height && !properties.config?.heightSize) config.heightSize = getHeightKey(config.height);
  delete config.height;
  return { data: clone(data), config };
}

/** Rows recharts can draw for label-based charts: one row per label. */
function labelRows(data) {
  const labels = data.labels || [];
  return labels.map((label, i) => {
    const row = { label };
    (data.datasets || []).forEach((dataset, d) => { row[`s${d}`] = num(dataset.data?.[i]); });
    return row;
  });
}

function ChartView({ type, data, config }) {
  const height = getHeightValue(config.heightSize);
  const axis = { tick: { fill: 'currentColor', fontSize: 11 }, stroke: 'currentColor', strokeOpacity: 0.3 };
  const grid = config.showGrid ? <CartesianGrid stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" /> : null;
  const legend = config.showLegend ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null;
  const tooltip = <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />;
  const datasets = data.datasets || [];

  let chart = null;
  if (type === 'line' || type === 'area') {
    const Chart = type === 'line' ? LineChart : AreaChart;
    chart = (
      <Chart data={labelRows(data)} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={44} />
        {tooltip}
        {legend}
        {datasets.map((dataset, d) => {
          const color = seriesColor(dataset, d);
          const curve = Number(dataset.tension) > 0 ? 'monotone' : 'linear';
          return type === 'line'
            ? <Line key={d} dataKey={`s${d}`} name={dataset.label || `Series ${d + 1}`} type={curve} stroke={color} strokeWidth={2} dot={config.showPoints !== false} isAnimationActive={false} />
            : <Area key={d} dataKey={`s${d}`} name={dataset.label || `Series ${d + 1}`} type={curve} stroke={color} fill={color} fillOpacity={0.25} dot={config.showPoints !== false} isAnimationActive={false} />;
        })}
      </Chart>
    );
  } else if (type === 'bar') {
    const horizontal = config.orientation === 'horizontal';
    chart = (
      <BarChart data={labelRows(data)} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        {grid}
        {horizontal ? <XAxis type="number" {...axis} /> : <XAxis dataKey="label" {...axis} />}
        {horizontal ? <YAxis type="category" dataKey="label" {...axis} width={64} /> : <YAxis {...axis} width={44} />}
        {tooltip}
        {legend}
        {datasets.map((dataset, d) => (
          <Bar key={d} dataKey={`s${d}`} name={dataset.label || `Series ${d + 1}`} fill={toHex(dataset.backgroundColor, PALETTE[d % PALETTE.length])} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false}>
            {(dataset.dataPointColors || []).some(Boolean)
              ? (data.labels || []).map((_, i) => <Cell key={i} fill={toHex(dataset.dataPointColors[i], toHex(dataset.backgroundColor, PALETTE[d % PALETTE.length]))} />)
              : null}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (type === 'pie' || type === 'donut') {
    const dataset = datasets[0] || { data: [] };
    const rows = (data.labels || []).map((name, i) => ({ name, value: num(dataset.data?.[i]) }));
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    const label = (config.showPercentages || config.showValues)
      ? ({ value }) => [config.showValues && type === 'pie' ? value : null, config.showPercentages ? `${Math.round((value / total) * 100)}%` : null].filter((v) => v !== null).join(' · ')
      : false;
    const inner = type === 'donut' ? `${Math.round(Math.min(0.9, Math.max(0.1, num(config.innerRadius) || 0.5)) * 80)}%` : 0;
    chart = (
      <PieChart>
        {tooltip}
        {legend}
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={inner} outerRadius="80%" label={label} labelLine={false} isAnimationActive={false}>
          {rows.map((_, i) => <Cell key={i} fill={sliceColor(dataset, i)} />)}
        </Pie>
      </PieChart>
    );
  } else if (type === 'scatter') {
    const size = Math.max(2, num(config.pointSize) || 6);
    chart = (
      <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        {grid}
        <XAxis type="number" dataKey="x" name="x" {...axis} />
        <YAxis type="number" dataKey="y" name="y" {...axis} width={44} />
        <ZAxis range={[size * size * 2, size * size * 2]} />
        {tooltip}
        {legend}
        {datasets.map((dataset, d) => (
          <Scatter
            key={d}
            name={dataset.label || `Series ${d + 1}`}
            data={(dataset.data || []).map((p) => ({ x: num(p?.x), y: num(p?.y) }))}
            fill={seriesColor(dataset, d)}
            line={config.showTrendline ? { stroke: seriesColor(dataset, d), strokeDasharray: '4 3' } : false}
            lineType="fitting"
            isAnimationActive={false}
          />
        ))}
      </ScatterChart>
    );
  }

  return (
    <div className="text-fg-subtle" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  );
}

ChartView.propTypes = { type: PropTypes.string.isRequired, data: PropTypes.object.isRequired, config: PropTypes.object.isRequired };

const cell = 'h-8 w-full min-w-[4.5rem] rounded-md border border-line bg-canvas px-2 text-[12px] text-fg outline-none focus:border-accent';
const iconButton = 'rounded-md p-1 text-fg-subtle hover:bg-hover hover:text-fg';

/** Labels as rows, one column per series (line, area, bar, pie, donut). */
function LabelTable({ type, data, setData }) {
  const single = type === 'pie' || type === 'donut';
  const datasets = data.datasets || [];
  const update = (fn) => setData((prev) => { const next = clone(prev); fn(next); return next; });

  const setColor = (d, hex) => update((next) => {
    const dataset = next.datasets[d];
    if (type === 'bar') dataset.backgroundColor = hex;
    else { dataset.borderColor = hex; dataset.backgroundColor = withAlpha(hex, type === 'area' ? 0.3 : 0.1); }
  });
  const setSliceColor = (i, hex) => update((next) => {
    const dataset = next.datasets[0];
    const colors = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : [];
    while (colors.length <= i) colors.push(PALETTE[colors.length % PALETTE.length]);
    colors[i] = hex;
    dataset.backgroundColor = colors;
  });
  const addRow = () => update((next) => {
    next.labels = [...(next.labels || []), `Item ${(next.labels || []).length + 1}`];
    next.datasets.forEach((dataset) => { dataset.data = [...(dataset.data || []), 0]; });
  });
  const removeRow = (i) => update((next) => {
    next.labels.splice(i, 1);
    next.datasets.forEach((dataset) => {
      dataset.data?.splice(i, 1);
      if (Array.isArray(dataset.backgroundColor)) dataset.backgroundColor.splice(i, 1);
      if (Array.isArray(dataset.dataPointColors)) dataset.dataPointColors.splice(i, 1);
    });
  });
  const addSeries = () => update((next) => {
    const color = PALETTE[next.datasets.length % PALETTE.length];
    const dataset = { label: `Series ${next.datasets.length + 1}`, data: (next.labels || []).map(() => 0) };
    if (type === 'bar') dataset.backgroundColor = color;
    else Object.assign(dataset, { borderColor: color, backgroundColor: withAlpha(color, type === 'area' ? 0.3 : 0.1), tension: 0.4 });
    next.datasets.push(dataset);
  });
  const removeSeries = (d) => update((next) => { next.datasets.splice(d, 1); });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-[12px]">
        <thead>
          <tr>
            <th className="text-left font-medium text-fg-muted">Label</th>
            {single ? <th className="text-left font-medium text-fg-muted">Value</th> : datasets.map((dataset, d) => (
              <th key={d} className="text-left font-medium">
                <div className="flex items-center gap-1">
                  <input type="color" aria-label="Series colour" value={seriesColor(dataset, d)} onChange={(e) => setColor(d, e.target.value)} className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <input className={cell} value={dataset.label || ''} placeholder={`Series ${d + 1}`} onChange={(e) => update((next) => { next.datasets[d].label = e.target.value; })} />
                  {datasets.length > 1 && <button type="button" className={iconButton} title="Remove series" onClick={() => removeSeries(d)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {(data.labels || []).map((label, i) => (
            <tr key={i}>
              <td>
                <div className="flex items-center gap-1">
                  {single && <input type="color" aria-label="Slice colour" value={sliceColor(datasets[0], i)} onChange={(e) => setSliceColor(i, e.target.value)} className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />}
                  <input className={cell} value={label} onChange={(e) => update((next) => { next.labels[i] = e.target.value; })} />
                </div>
              </td>
              {(single ? datasets.slice(0, 1) : datasets).map((dataset, d) => (
                <td key={d}>
                  <input type="number" className={cell} value={dataset.data?.[i] ?? 0} onChange={(e) => update((next) => { next.datasets[d].data[i] = num(e.target.value); })} />
                </td>
              ))}
              <td className="w-6">
                {(data.labels || []).length > 1 && <button type="button" className={iconButton} title="Remove row" onClick={() => removeRow(i)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <Button size="xs" variant="secondary" icon={Plus} onClick={addRow}>Row</Button>
        {!single && <Button size="xs" variant="secondary" icon={Plus} onClick={addSeries}>Series</Button>}
      </div>
    </div>
  );
}

LabelTable.propTypes = { type: PropTypes.string.isRequired, data: PropTypes.object.isRequired, setData: PropTypes.func.isRequired };

/** One x/y list per series (scatter). */
function PointTable({ data, setData }) {
  const update = (fn) => setData((prev) => { const next = clone(prev); fn(next); return next; });
  const datasets = data.datasets || [];
  return (
    <div className="space-y-3">
      {datasets.map((dataset, d) => (
        <div key={d} className="rounded-lg border border-line p-2">
          <div className="mb-2 flex items-center gap-1">
            <input
              type="color"
              aria-label="Series colour"
              value={seriesColor(dataset, d)}
              onChange={(e) => update((next) => { next.datasets[d].backgroundColor = e.target.value; next.datasets[d].borderColor = e.target.value; })}
              className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <input className={cell} value={dataset.label || ''} placeholder={`Series ${d + 1}`} onChange={(e) => update((next) => { next.datasets[d].label = e.target.value; })} />
            {datasets.length > 1 && <button type="button" className={iconButton} title="Remove series" onClick={() => update((next) => { next.datasets.splice(d, 1); })}><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
          {(dataset.data || []).map((point, i) => (
            <div key={i} className="mb-1 flex items-center gap-1">
              <span className="w-4 text-[11px] text-fg-subtle">x</span>
              <input type="number" className={cell} value={point?.x ?? 0} onChange={(e) => update((next) => { next.datasets[d].data[i].x = num(e.target.value); })} />
              <span className="w-4 text-[11px] text-fg-subtle">y</span>
              <input type="number" className={cell} value={point?.y ?? 0} onChange={(e) => update((next) => { next.datasets[d].data[i].y = num(e.target.value); })} />
              <button type="button" className={iconButton} title="Remove point" onClick={() => update((next) => { next.datasets[d].data.splice(i, 1); })}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <Button size="xs" variant="ghost" icon={Plus} onClick={() => update((next) => { next.datasets[d].data = [...(next.datasets[d].data || []), { x: 0, y: 0 }]; })}>Point</Button>
        </div>
      ))}
      <Button
        size="xs"
        variant="secondary"
        icon={Plus}
        onClick={() => update((next) => {
          const color = PALETTE[next.datasets.length % PALETTE.length];
          next.datasets.push({ label: `Series ${next.datasets.length + 1}`, data: [{ x: 0, y: 0 }], backgroundColor: color, borderColor: color });
        })}
      >
        Series
      </Button>
    </div>
  );
}

PointTable.propTypes = { data: PropTypes.object.isRequired, setData: PropTypes.func.isRequired };

/** Save the drawn chart as a PNG, at twice the screen size. */
async function downloadPng(container, title) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  copy.style.color = getComputedStyle(container).color;
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * 2);
    canvas.height = Math.round(height * 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getComputedStyle(container.parentElement || container).backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(image, 0, 0, width, height);
    const link = document.createElement('a');
    link.download = `${String(title || 'chart').replace(/[^\w\- ]+/g, '').trim() || 'chart'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function NoteChartBlock({ type, block, onChange, readOnly = false }) {
  const saved = useMemo(() => readChart(type, block.properties), [type, block.properties]);
  const [editing, setEditing] = useState(false);
  const [draftData, setDraftData] = useState(saved.data);
  const [draftConfig, setDraftConfig] = useState(saved.config);
  const viewRef = useRef(null);
  const canEdit = !readOnly && typeof onChange === 'function';

  const startEditing = () => {
    setDraftData(clone(saved.data));
    setDraftConfig({ ...saved.config });
    setEditing(true);
  };
  const save = () => {
    onChange(block.id, { properties: { ...block.properties, data: draftData, config: draftConfig } });
    setEditing(false);
  };
  const setConfig = (key, value) => setDraftConfig((prev) => ({ ...prev, [key]: value }));

  const data = editing ? draftData : saved.data;
  const config = editing ? draftConfig : saved.config;

  return (
    <div className="group my-2 rounded-xl border border-line bg-surface p-3" contentEditable={false}>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{config.title || NAMES[type]}</h4>
        {!editing && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" className={iconButton} title="Download as PNG" onClick={() => downloadPng(viewRef.current, config.title)}><Download className="h-4 w-4" /></button>
            {canEdit && <button type="button" className={iconButton} title="Edit chart" onClick={startEditing}><Pencil className="h-4 w-4" /></button>}
          </div>
        )}
      </div>

      <div ref={viewRef}>
        <ChartView type={type} data={data} config={config} />
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* Wraps instead of a fixed grid: the note can sit in a narrow side panel. */}
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-40 flex-1" value={config.title || ''} placeholder="Title" aria-label="Chart title" onChange={(e) => setConfig('title', e.target.value)} />
            <Select fullWidth={false} aria-label="Chart size" value={config.heightSize || 'medium'} onChange={(value) => setConfig('heightSize', value)} options={SIZE_OPTIONS} />
            {type === 'bar' && (
              <Select fullWidth={false} aria-label="Bar direction" value={config.orientation || 'vertical'} onChange={(value) => setConfig('orientation', value)} options={BAR_DIRECTIONS} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(TOGGLES[type] || []).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                <input type="checkbox" checked={Boolean(config[key] ?? key !== 'showTrendline')} onChange={(e) => setConfig(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          {type === 'scatter'
            ? <PointTable data={draftData} setData={setDraftData} />
            : <LabelTable type={type} data={draftData} setData={setDraftData} />}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

NoteChartBlock.propTypes = {
  type: PropTypes.oneOf(['line', 'area', 'bar', 'pie', 'donut', 'scatter']).isRequired,
  block: PropTypes.shape({ id: PropTypes.string, properties: PropTypes.object }).isRequired,
  onChange: PropTypes.func,
  readOnly: PropTypes.bool,
};
