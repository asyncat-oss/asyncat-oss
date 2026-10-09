// Interactive chart blocks in chat messages: data charts and plotted formulas.
// BlockBasedMessageRenderer loads this lazily because recharts is large and
// most messages have no charts.
import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { evalExpr } from '../../utils/chartExpression.js';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#d946ef', '#0ea5e9'];

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
    <div className="px-4 pb-4 pt-3 bg-white dark:bg-gray-950 midnight:bg-slate-950 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 space-y-3">
      {Object.entries(paramDefs).map(([key, p]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 w-36 shrink-0 truncate" title={p.label || key}>
            {p.label || key}
          </span>
          <input
            type="range"
            min={p.min ?? -10}
            max={p.max ?? 10}
            step={p.step ?? 0.1}
            value={paramValues[key]}
            onChange={e => setParamValues(prev => ({ ...prev, [key]: Number(e.target.value) }))}
            className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400 w-14 text-right shrink-0 tabular-nums">
            {fmtVal(paramValues[key])}
          </span>
        </div>
      ))}
      {onReset && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300 transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared tooltip style ─────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(17, 24, 39, 0.95)',
  border: '1px solid #374151',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#f3f4f6',
};

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
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">Function Plot</span>
        {title && <span className="text-[11px] text-gray-400 dark:text-gray-500">— {title}</span>}
        {hasParams && <span className="ml-auto text-[10px] text-indigo-400 dark:text-indigo-500">drag sliders to explore</span>}
      </div>
      <div className="px-4 pt-4 pb-2 bg-white dark:bg-gray-950 midnight:bg-slate-950">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" domain={yDomain} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [fmtVal(v), name]}
              labelFormatter={x => `x = ${fmtVal(Number(x))}`}
            />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
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
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">Parametric Plot</span>
        {title && <span className="text-[11px] text-gray-400 dark:text-gray-500">— {title}</span>}
        {hasParams && <span className="ml-auto text-[10px] text-indigo-400 dark:text-indigo-500">drag sliders to explore</span>}
      </div>
      <div className="px-4 pt-4 pb-2 bg-white dark:bg-gray-950 midnight:bg-slate-950">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
            <XAxis dataKey="x" type="number" name="x" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis dataKey="y" type="number" name="y" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <ZAxis range={[1, 1]} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [fmtVal(v), name]}
            />
            {seriesData.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
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

    const axes = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid #374151',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#f3f4f6',
          }}
        />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
      </>
    );

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
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={{ stroke: '#9ca3af' }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f3f4f6',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
        </PieChart>
      );
    }

    if (type === 'scatter') {
      const tooltipStyle = {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        border: '1px solid #374151',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#f3f4f6',
      };
      return (
        <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
          <XAxis dataKey="x" type="number" name={xKey} tick={{ fontSize: 11 }} stroke="#9ca3af" label={{ value: xKey, position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis dataKey="y" type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <ZAxis range={[40, 40]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} />
          {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
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
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">
            {config.type === 'pie' ? 'Pie Chart' : config.type === 'line' ? 'Line Chart' : config.type === 'area' ? 'Area Chart' : config.type === 'scatter' ? 'Scatter Plot' : 'Bar Chart'}
          </span>
          {config.title && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">— {config.title}</span>
          )}
        </div>
        <button
          onClick={() => setShowData(v => !v)}
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {showData ? 'Show chart' : 'View data'}
        </button>
      </div>
      {showData ? (
        <pre className="p-4 overflow-x-auto bg-gray-50 dark:bg-gray-950 text-[12px] font-mono text-gray-600 dark:text-gray-400">
          {JSON.stringify(config.data, null, 2)}
        </pre>
      ) : (
        <div className="p-4 bg-white dark:bg-gray-950 midnight:bg-slate-950">
          <ResponsiveContainer width="100%" height={280}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ChartBlock;
