import React, { useState, useEffect, useMemo } from 'react';
import { LiveProvider, LiveError, LivePreview } from 'react-live';
import * as LucideIcons from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem/mhchem.js';
import * as mathjs from 'mathjs';

// Recharts — full set so AI can use any chart type
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart,
  XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea,
  ResponsiveContainer, LabelList, Label,
  Brush, ErrorBar
} from 'recharts';

/**
 * Tiny KaTeX helper the AI can call inside its component:
 *   renderMath(latex, displayMode?)  → HTML string
 *   <MathBlock latex="..." />        → display-mode block
 *   <MathInline latex="..." />       → inline span
 */
const renderMath = (latex, displayMode = false) => {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: '#cc0000',
      trust: false
    });
  } catch {
    return `<span style="color:#cc0000">${latex}</span>`;
  }
};

const MathBlock = ({ latex }) => (
  <div
    className="my-4 overflow-x-auto text-center"
    dangerouslySetInnerHTML={{ __html: renderMath(latex, true) }}
  />
);

const MathInline = ({ latex }) => (
  <span dangerouslySetInnerHTML={{ __html: renderMath(latex, false) }} />
);

export const GenUIArtifact = ({ codeString }) => {
  // Remove markdown wrapping if it exists in the string
  let cleanCode = codeString
    .replace(/^```(jsx|react|js)[\s\S]*?\n/, '')
    .replace(/\n```$/, '')
    .trim();

  // Strip imports and exports because react-live runs in browser and crashes on them
  cleanCode = cleanCode
    .replace(/import\s+.*?from\s+['"].*?['"];?/g, '') // remove "import X from 'y';"
    .replace(/export\s+default\s+/g, '')               // remove "export default "
    .replace(/export\s+/g, '')                         // remove "export "
    .trim();

  const scope = useMemo(() => ({
    // React hooks
    useState,
    useEffect,
    useMemo,

    // All Lucide icons
    ...LucideIcons,

    // Recharts — full set
    BarChart, Bar,
    LineChart, Line,
    AreaChart, Area,
    PieChart, Pie, Cell,
    ScatterChart, Scatter,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ComposedChart,
    XAxis, YAxis, ZAxis,
    CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea,
    ResponsiveContainer, LabelList, Label,
    Brush, ErrorBar,

    // Math helpers
    renderMath,
    MathBlock,
    MathInline,
    katex,

    // mathjs — full math engine for computation, symbolic algebra, statistics
    // Usage: math.evaluate("2 + 3"), math.derivative("x^2", "x"), math.simplify("x^2 + x^2")
    math: mathjs,
    // Convenience shortcuts
    evaluate: mathjs.evaluate,
    simplify: mathjs.simplify,
    derivative: mathjs.derivative,
    parse: mathjs.parse,
    round: mathjs.round,
    format: mathjs.format,
    range: mathjs.range,
    matrix: mathjs.matrix,
    sqrt: mathjs.sqrt,
    abs: mathjs.abs,
    log: mathjs.log,
    exp: mathjs.exp,
    sin: mathjs.sin,
    cos: mathjs.cos,
    tan: mathjs.tan,
    pi: mathjs.pi,
    e: mathjs.e
  }), []);

  return (
    <div className="gen-ui-container w-full h-full min-h-[300px] rounded-xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <LiveProvider code={cleanCode} scope={scope} enableTypeScript={false}>
        <div className="relative w-full h-full flex flex-col">
          <div className="flex-1 overflow-auto p-4 ui-preview-sandbox">
            <LivePreview />
          </div>
          <LiveError className="absolute bottom-0 left-0 w-full p-3 font-mono text-xs text-red-500 bg-red-100 dark:bg-red-900/50 border-t border-red-200 dark:border-red-900 overflow-auto max-h-32" />
        </div>
      </LiveProvider>
    </div>
  );
};
