// Interactive chart blocks in chat messages: data charts and plotted formulas.
// BlockBasedMessageRenderer loads this lazily because recharts is large and
// most messages have no charts.
import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { evalExpr } from '../../utils/chartExpression.js';

// Series colours, used in this fixed order: a categorical palette checked for
// colour-blind separation, stepped for the light and the dark surfaces. The
// first is the app's blue. They are set as CSS variables on the chart's frame
// so the theme switches them; every other part of a chart uses the app's
// tokens (axes, grid, tooltip, text).
const CHART_PALETTE = [
  '[--chart-1:#2456dc] [--chart-2:#eb6834] [--chart-3:#1baf7a] [--chart-4:#eda100]',
  '[--chart-5:#e87ba4] [--chart-6:#008300] [--chart-7:#4a3aa7] [--chart-8:#e34948]',
  'dark:[--chart-1:#3987e5] dark:[--chart-2:#d95926] dark:[--chart-3:#199e70] dark:[--chart-4:#c98500]',
  'dark:[--chart-5:#d55181] dark:[--chart-6:#008300] dark:[--chart-7:#9085e9] dark:[--chart-8:#e66767]',
].join(' ');
const CHART_COLORS = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);

const AXIS = { stroke: 'var(--as-line-strong)', tick: { fontSize: 11, fill: 'var(--as-fg-subtle)' } };
const GRID = { strokeDasharray: '3 3', stroke: 'var(--as-line)' };
// Legend text stays in ink; the swatch beside it carries the colour.
const legendText = (value) => <span style={{ color: 'var(--as-fg-muted)' }}>{value}</span>;

// ─── Shared math expression evaluator ────────────────────────────────────────

function fmtVal(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 1000 || (abs < 0.001 && abs > 0)) return v.toExponential(3);
  if (abs >= 100) return v.toFixed(2);
  if (abs >= 10) return v.toFixed(3);
  return v.toFixed(4).replace(/\.?0+$/, '');
}

function defaultParams(paramDefs) {
  return Object.fromEntries(Object.entries(paramDefs).map(([k, p]) => [k, p.default ?? 0]));
}

// ─── Shared slider panel ──────────────────────────────────────────────────────

function SliderPanel({ paramDefs, paramValues, setParamValues, onReset }) {
  if (!Object.keys(paramDefs).length) return null;
  return (
    <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
      {Object.entries(paramDefs).map(([key, p]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate font-mono text-[12px] text-fg-muted" title={p.label || key}>
            {p.label || key}
          </span>
          <input
            type="range"
            min={p.min ?? -10}
            max={p.max ?? 10}
            step={p.step ?? 0.1}
            value={paramValues[key]}
            onChange={e => setParamValues(prev => ({ ...prev, [key]: Number(e.target.value) }))}
            aria-label={p.label || key}
            className="h-1.5 flex-1 cursor-pointer rounded-lg accent-[var(--as-accent)]"
          />
          <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-fg">
            {fmtVal(paramValues[key])}
          </span>
        </div>
      ))}
      {onReset && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onReset}
            className="rounded-md px-1.5 py-0.5 text-[12px] text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared header: what the chart is, its title, then actions ──────────────

function ChartHeader({ label, title, children }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3.5 py-1.5">
      <span className="shrink-0 text-[12px] font-medium text-fg-subtle">{label}</span>
      {title ? <span className="min-w-0 truncate text-[12px] text-fg-muted">{title}</span> : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

// ─── Shared tooltip style ─────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--as-elevated)',
  border: '1px solid var(--as-line-strong)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--as-fg)',
};
// Tooltip text in ink too, not in the series colour.
const TOOLTIP_TEXT = { itemStyle: { color: 'var(--as-fg)' }, labelStyle: { color: 'var(--as-fg-muted)' } };
// The hover cursor in tokens too: recharts' default #ccc glares in dark themes.
const BAR_CURSOR = { fill: 'var(--as-hover)' };
const LINE_CURSOR = { stroke: 'var(--as-line-strong)' };

// ─── Interactive Function Plot y = f(x) ──────────────────────────────────────

const FunctionPlotChart = ({ parsed }) => {
  const formulas = useMemo(() => {
    if (Array.isArray(parsed.formulas)) return parsed.formulas;
    if (parsed.formula) return [{ expr: parsed.formula, name: 'y' }];
    return [];
  }, [parsed]);

  const paramDefs = useMemo(() => parsed.params || {}, [parsed]);
  const defaults = useMemo(() => defaultParams(paramDefs), [paramDefs]);
  const [paramValues, setParamValues] = useState(defaults);

  const xRange = parsed.xRange || [-10, 10];
  const yRange = parsed.yRange || null;
  const xSteps = Math.min(Math.max(parsed.xSteps || 300, 50), 1000);
  const title = parsed.title || '';
  const hasParams = Object.keys(paramDefs).length > 0;

  const data = useMemo(() => {
    const points = [];
    for (let i = 0; i <= xSteps; i++) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * i / xSteps;
      const pt = { x: Math.round(x * 10000) / 10000 };
      formulas.forEach(f => {
        let v = evalExpr(f.expr, { x, ...paramValues });
        if (yRange && v !== null && (v < yRange[0] || v > yRange[1])) v = null;
        pt[f.name] = v;
      });
      points.push(pt);
    }
    return points;
  }, [formulas, paramValues, xRange, yRange, xSteps]);

  const yKeys = formulas.map(f => f.name);
  const yDomain = yRange ? [yRange[0], yRange[1]] : ['auto', 'auto'];

  return (
    <div className={`mb-6 overflow-hidden rounded-xl border border-line ${CHART_PALETTE}`}>
      <ChartHeader label="Function plot" title={title}>
        {hasParams && <span className="text-[12px] text-fg-subtle">Drag the sliders to explore</span>}
      </ChartHeader>
      <div className="px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="x" {...AXIS} />
            <YAxis {...AXIS} domain={yDomain} />
            <Tooltip
              cursor={LINE_CURSOR}
              contentStyle={TOOLTIP_STYLE}
              {...TOOLTIP_TEXT}
              formatter={(v, name) => [fmtVal(v), name]}
              labelFormatter={x => `x = ${fmtVal(Number(x))}`}
            />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} formatter={legendText} />}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SliderPanel
        paramDefs={paramDefs}
        paramValues={paramValues}
        setParamValues={setParamValues}
        onReset={hasParams ? () => setParamValues(defaults) : null}
      />
    </div>
  );
};

// ─── Parametric Curve Plot x(t), y(t) ────────────────────────────────────────

const ParametricPlotChart = ({ parsed }) => {
  const seriesDefs = useMemo(() => {
    if (Array.isArray(parsed.formulas)) return parsed.formulas;
    if (parsed.xFormula && parsed.yFormula) return [{ x: parsed.xFormula, y: parsed.yFormula, name: 'curve' }];
    return [];
  }, [parsed]);

  const paramDefs = useMemo(() => parsed.params || {}, [parsed]);
  const defaults = useMemo(() => defaultParams(paramDefs), [paramDefs]);
  const [paramValues, setParamValues] = useState(defaults);

  const tRange = parsed.tRange || [0, 2 * Math.PI];
  const tSteps = Math.min(Math.max(parsed.tSteps || 500, 50), 2000);
  const title = parsed.title || '';
  const hasParams = Object.keys(paramDefs).length > 0;

  const seriesData = useMemo(() => {
    return seriesDefs.map(s => {
      const pts = [];
      for (let i = 0; i <= tSteps; i++) {
        const t = tRange[0] + (tRange[1] - tRange[0]) * i / tSteps;
        const xv = evalExpr(s.x, { t, ...paramValues });
        const yv = evalExpr(s.y, { t, ...paramValues });
        if (xv !== null && yv !== null) pts.push({ x: xv, y: yv });
      }
      return { name: s.name || 'curve', data: pts };
    });
  }, [seriesDefs, paramValues, tRange, tSteps]);

  return (
    <div className={`mb-6 overflow-hidden rounded-xl border border-line ${CHART_PALETTE}`}>
      <ChartHeader label="Parametric plot" title={title}>
        {hasParams && <span className="text-[12px] text-fg-subtle">Drag the sliders to explore</span>}
      </ChartHeader>
      <div className="px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="x" type="number" name="x" {...AXIS} />
            <YAxis dataKey="y" type="number" name="y" {...AXIS} />
            <ZAxis range={[1, 1]} />
            <Tooltip
              cursor={LINE_CURSOR}
              contentStyle={TOOLTIP_STYLE}
              {...TOOLTIP_TEXT}
              formatter={(v, name) => [fmtVal(v), name]}
            />
            {seriesData.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} formatter={legendText} />}
            {seriesData.map((s, i) => (
              <Scatter
                key={s.name}
                name={s.name}
                data={s.data}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                line={{ stroke: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2 }}
                lineType="joint"
                shape={() => null}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <SliderPanel
        paramDefs={paramDefs}
        paramValues={paramValues}
        setParamValues={setParamValues}
        onReset={hasParams ? () => setParamValues(defaults) : null}
      />
    </div>
  );
};

// `fallback` is rendered when the block is not valid chart JSON.
const ChartBlock = ({ content, fallback = null }) => {
  const [showData, setShowData] = useState(false);

  const config = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      if (parsed?.type === 'parametric' || parsed?.xFormula || parsed?.yFormula) {
        return { type: 'parametric', parsed };
      }
      if (parsed?.type === 'function' || parsed?.formula || (Array.isArray(parsed?.formulas) && parsed?.formulas[0]?.expr)) {
        return { type: 'function', parsed };
      }
      if (!parsed?.data || !Array.isArray(parsed.data)) return null;
      return {
        type: parsed.type || 'bar',
        data: parsed.data,
        xKey: parsed.xKey || parsed.x || Object.keys(parsed.data[0] || {})[0] || 'name',
        yKeys: parsed.yKeys || parsed.y || Object.keys(parsed.data[0] || {}).filter(k => k !== (parsed.xKey || parsed.x || Object.keys(parsed.data[0] || {})[0])),
        title: parsed.title || '',
      };
    } catch {
      return null;
    }
  }, [content]);

  if (!config) {
    return fallback;
  }

  if (config.type === 'function') return <FunctionPlotChart parsed={config.parsed} />;
  if (config.type === 'parametric') return <ParametricPlotChart parsed={config.parsed} />;

  const renderChart = () => {
    const { type, data, xKey, yKeys } = config;

    const commonProps = {
      data,
      margin: { top: 5, right: 20, left: 0, bottom: 5 },
    };

    // An array, not a fragment: recharts only finds its axes, grid and
    // tooltip among a chart's direct children.
    const axes = [
      <CartesianGrid key="grid" {...GRID} />,
      <XAxis key="x" dataKey={xKey} {...AXIS} />,
      <YAxis key="y" {...AXIS} />,
      <Tooltip key="tooltip" cursor={type === 'line' || type === 'area' ? LINE_CURSOR : BAR_CURSOR} contentStyle={TOOLTIP_STYLE} {...TOOLTIP_TEXT} />,
      yKeys.length > 1 ? <Legend key="legend" wrapperStyle={{ fontSize: '12px' }} formatter={legendText} /> : null,
    ];

    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          {axes}
          {yKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart {...commonProps}>
          {axes}
          {yKeys.map((key, i) => (
            <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      );
    }

    if (type === 'pie') {
      const valueKey = yKeys[0] || 'value';
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={xKey}
            cx="50%" cy="50%"
            outerRadius={80}
            label={({ name, percent, x, y, textAnchor }) => (
              <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fontSize={12} fill="var(--as-fg-muted)">
                {`${name} ${(percent * 100).toFixed(0)}%`}
              </text>
            )}
            labelLine={{ stroke: 'var(--as-line-strong)' }}
            stroke="var(--as-canvas)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
          {...TOOLTIP_TEXT}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} formatter={legendText} />
        </PieChart>
      );
    }

    if (type === 'scatter') {
      return (
        <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="x" type="number" name={xKey} {...AXIS} label={{ value: xKey, position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--as-fg-subtle)' }} />
          <YAxis dataKey="y" type="number" {...AXIS} />
          <ZAxis range={[40, 40]} />
          <Tooltip cursor={{ ...LINE_CURSOR, strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} {...TOOLTIP_TEXT} />
          {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} formatter={legendText} />}
          {yKeys.map((key, i) => (
            <Scatter
              key={key}
              name={key}
              data={data.map(d => ({ x: Number(d[xKey]), y: Number(d[key]) }))}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </ScatterChart>
      );
    }

    // Default: bar chart
    return (
      <BarChart {...commonProps}>
        {axes}
        {yKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    );
  };

  return (
    <div className={`mb-6 overflow-hidden rounded-xl border border-line ${CHART_PALETTE}`}>
      <ChartHeader
        label={config.type === 'pie' ? 'Pie chart' : config.type === 'line' ? 'Line chart' : config.type === 'area' ? 'Area chart' : config.type === 'scatter' ? 'Scatter plot' : 'Bar chart'}
        title={config.title}
      >
        <button
          type="button"
          onClick={() => setShowData(v => !v)}
          className="flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {showData ? 'Show chart' : 'View data'}
        </button>
      </ChartHeader>
      {showData ? (
        <pre className="overflow-x-auto p-4 font-mono text-[12px] text-fg-muted">
          {JSON.stringify(config.data, null, 2)}
        </pre>
      ) : (
        <div className="p-4">
          <ResponsiveContainer width="100%" height={280}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ChartBlock;
