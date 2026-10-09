import test from 'node:test';
import assert from 'node:assert/strict';

import { compileExpr, evalExpr } from './chartExpression.js';

test('evaluates the formulas the chart format documents', () => {
  assert.equal(evalExpr('Math.sin(x)', { x: 0 }), 0);
  assert.equal(evalExpr('a*x*x + b*x + c', { x: 2, a: 1, b: 2, c: 3 }), 11);
  assert.ok(Math.abs(evalExpr('A * Math.sin(f * x + phi)', { x: 1, A: 2, f: Math.PI / 2, phi: 0 }) - 2) < 1e-12);
  assert.equal(evalExpr('x ** 2 >= 4 ? 1 : 0', { x: 3 }), 1);
  assert.equal(evalExpr('1.5e2 + .5', {}), 150.5);
  assert.equal(evalExpr('Math.tan(x)', { x: Math.PI / 2 }) > 1e15, true);
});

test('returns null for non-finite results and invalid syntax', () => {
  assert.equal(evalExpr('1 / x', { x: 0 }), null);
  assert.equal(evalExpr('2x', { x: 1 }), null);
});

test('refuses anything beyond arithmetic on variables and Math members', () => {
  const attempts = [
    "fetch('http://127.0.0.1:8716/api/agent/run')",
    'window.location',
    'Math.constructor.constructor("return this")()',
    'x.constructor',
    '(1).constructor',
    '"a"',
    '`a`',
    'x = 1',
    '(() => 1)()',
    'globalThis',
    'Math["sin"](x)',
    '\\u0066etch',
  ];
  for (const expr of attempts) {
    assert.equal(compileExpr(expr, ['x']), null, expr);
  }
});

test('refuses parameter names that would inject code', () => {
  assert.equal(compileExpr('a', ['a=fetch(1)']), null);
  assert.equal(compileExpr('a', ['a', 'b)']), null);
});
