// Evaluate the math formulas in chart blocks (`"expr": "A * Math.sin(f * x)"`).
//
// Chart formulas come from model output, so they are compiled only when every
// token is a number, an operator, a declared variable, or a Math member: no
// strings, property access, assignment, or function literals.
const MATH_MEMBERS = new Set(Object.getOwnPropertyNames(Math));
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const EXPR_TOKEN = /\s+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|Math\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*|===|!==|\*\*|==|!=|<=|>=|&&|\|\||[-+*/%(),?:<>!]/y;
const compiledExprs = new Map();

export function compileExpr(expr, names) {
  const key = `${names.join(',')}|${expr}`;
  if (compiledExprs.has(key)) return compiledExprs.get(key);

  let ok = typeof expr === 'string' && expr.length <= 500 && names.every((name) => IDENTIFIER.test(name));
  const variables = new Set(names);
  EXPR_TOKEN.lastIndex = 0;
  while (ok && EXPR_TOKEN.lastIndex < expr.length) {
    const match = EXPR_TOKEN.exec(expr);
    if (!match) {
      ok = false;
    } else if (match[0].startsWith('Math.')) {
      ok = MATH_MEMBERS.has(match[0].slice(5));
    } else if (/^[A-Za-z_$]/.test(match[0])) {
      ok = variables.has(match[0]);
    }
  }

  let fn = null;
  if (ok) {
    try {
      fn = new Function('Math', ...names, `"use strict"; return (${expr});`);
    } catch {
      fn = null;
    }
  }
  if (compiledExprs.size >= 500) compiledExprs.clear();
  compiledExprs.set(key, fn);
  return fn;
}

export function evalExpr(expr, vars) {
  const names = Object.keys(vars);
  const fn = compileExpr(expr, names);
  if (!fn) return null;
  try {
    const v = fn(Math, ...names.map(k => vars[k]));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
