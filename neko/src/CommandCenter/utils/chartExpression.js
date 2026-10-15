// Evaluate the math formulas in chart blocks (`"expr": "A * Math.sin(f * x)"`).
//
// Chart formulas come from model output, so they are compiled only when every
// token is a number, an operator, a declared variable, or a Math member: no
// strings, property access, assignment, or function literals.
//
// The tokens are parsed and written back out fully bracketed, which lets the
// formulas read as maths does: `^` is a power like `**`, powers bind tighter
// than a leading minus (`-x^2` is `-(x^2)`, which JavaScript refuses to
// guess), and they group from the right (`2^3^2` is `2^9`).
const MATH_MEMBERS = new Set(Object.getOwnPropertyNames(Math));
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const EXPR_TOKEN = /\s+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|Math\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*|===|!==|\*\*|==|!=|<=|>=|&&|\|\||[-+*/%(),?:<>!^]/y;
const compiledExprs = new Map();

// Binary operators from the loosest to the tightest; each level is left-to-right.
const BINARY_LEVELS = [
  ['||'],
  ['&&'],
  ['===', '!==', '==', '!='],
  ['<', '>', '<=', '>='],
  ['+', '-'],
  ['*', '/', '%'],
];

function tokenize(expr, variables) {
  const tokens = [];
  EXPR_TOKEN.lastIndex = 0;
  while (EXPR_TOKEN.lastIndex < expr.length) {
    const match = EXPR_TOKEN.exec(expr);
    if (!match) return null;
    const token = match[0];
    if (/^\s/.test(token)) continue;
    if (token.startsWith('Math.')) {
      if (!MATH_MEMBERS.has(token.slice(5))) return null;
    } else if (/^[A-Za-z_$]/.test(token) && !variables.has(token)) {
      return null;
    }
    tokens.push(token);
  }
  return tokens;
}

/** The formula as bracketed JavaScript, or null when it doesn't parse. */
export function toJavaScript(expr, names = []) {
  if (typeof expr !== 'string' || expr.length > 500) return null;
  const tokens = tokenize(expr, new Set(names));
  if (!tokens || !tokens.length) return null;
  let at = 0;
  const peek = () => tokens[at];
  const take = (token) => {
    if (tokens[at] !== token) throw new SyntaxError(`expected ${token}`);
    at += 1;
  };

  const conditional = () => {
    const test = binary(0);
    if (peek() !== '?') return test;
    at += 1;
    const yes = conditional();
    take(':');
    return `(${test} ? ${yes} : ${conditional()})`;
  };

  const binary = (level) => {
    if (level === BINARY_LEVELS.length) return unary();
    let left = binary(level + 1);
    while (BINARY_LEVELS[level].includes(peek())) {
      const op = tokens[at++];
      left = `(${left} ${op} ${binary(level + 1)})`;
    }
    return left;
  };

  const unary = () => {
    const op = peek();
    if (op === '-' || op === '+' || op === '!') {
      at += 1;
      return `(${op}${unary()})`;
    }
    return power();
  };

  // The exponent may carry its own sign (`2^-1`).
  const power = () => {
    const base = call();
    if (peek() !== '^' && peek() !== '**') return base;
    at += 1;
    return `(${base} ** ${unary()})`;
  };

  const call = () => {
    const callee = primary();
    if (peek() !== '(') return callee;
    if (!callee.startsWith('Math.')) throw new SyntaxError('only Math functions can be called');
    at += 1;
    const args = [];
    if (peek() !== ')') {
      args.push(conditional());
      while (peek() === ',') {
        at += 1;
        args.push(conditional());
      }
    }
    take(')');
    return `${callee}(${args.join(', ')})`;
  };

  const primary = () => {
    const token = tokens[at++];
    if (token === '(') {
      const inner = conditional();
      take(')');
      return `(${inner})`;
    }
    if (token !== undefined && /^[\d.A-Za-z_$]/.test(token)) return token;
    throw new SyntaxError(`unexpected ${token ?? 'end'}`);
  };

  try {
    const js = conditional();
    return at === tokens.length ? js : null;
  } catch {
    return null;
  }
}

export function compileExpr(expr, names) {
  const key = `${names.join(',')}|${expr}`;
  if (compiledExprs.has(key)) return compiledExprs.get(key);

  const ok = names.every((name) => IDENTIFIER.test(name));
  const js = ok ? toJavaScript(expr, names) : null;
  let fn = null;
  if (js) {
    try {
      fn = new Function('Math', ...names, `"use strict"; return (${js});`);
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
