import test from 'node:test';
import assert from 'node:assert/strict';

import { compileExpr, evalExpr, toJavaScript } from './chartExpression.js';

test('evaluates the formulas the chart format documents', () => {
  assert.equal(evalExpr('Math.sin(x)', { x: 0 }), 0);
  assert.equal(evalExpr('a*x*x + b*x + c', { x: 2, a: 1, b: 2, c: 3 }), 11);
  assert.ok(Math.abs(evalExpr('A * Math.sin(f * x + phi)', { x: 1, A: 2, f: Math.PI / 2, phi: 0 }) - 2) < 1e-12);
  assert.equal(evalExpr('x ** 2 >= 4 ? 1 : 0', { x: 3 }), 1);
  assert.equal(evalExpr('1.5e2 + .5', {}), 150.5);
  assert.equal(evalExpr('Math.tan(x)', { x: Math.PI / 2 }) > 1e15, true);
});

test('^ is a power, as in maths', () => {
  assert.equal(evalExpr('a*x^2', { a: 3, x: 2 }), 12);
  assert.equal(evalExpr('x^2 + 2*x + 1', { x: 3 }), 16);
  assert.equal(evalExpr('2^3^2', {}), 512, 'powers group from the right');
  assert.equal(evalExpr('2^-1', {}), 0.5);
  assert.ok(Math.abs(evalExpr('Math.sin(x)^2 + Math.cos(x)^2', { x: 0.7 }) - 1) < 1e-12);
  assert.equal(evalExpr('(x + 1)^2', { x: 1 }), 4);
});

test('a leading minus applies after the power, so a bell curve works', () => {
  assert.equal(evalExpr('-x^2', { x: 3 }), -9);
  assert.equal(evalExpr('-x ** 2', { x: 3 }), -9);
  assert.ok(Math.abs(evalExpr('Math.exp(-x^2 / 2)', { x: 1 }) - Math.exp(-0.5)) < 1e-12);
  assert.equal(evalExpr('(-x)^2', { x: 3 }), 9);
});

test('the rest of the arithmetic keeps its usual order', () => {
  assert.equal(evalExpr('1 + 2 * 3 - 4 / 2', {}), 5);
  assert.equal(evalExpr('10 % 4 * 2', {}), 4);
  assert.equal(evalExpr('x > 1 && x < 3 ? 1 : x == 5 ? 2 : 0', { x: 5 }), 2);
  assert.equal(evalExpr('Math.max(1, x, 3)', { x: 7 }), 7);
  assert.equal(evalExpr('Math.PI', {}), Math.PI);
  assert.equal(toJavaScript('a*x^2', ['a', 'x']), '(a * (x ** 2))');
});

test('returns null for non-finite results and invalid syntax', () => {
  assert.equal(evalExpr('1 / x', { x: 0 }), null);
  assert.equal(evalExpr('2x', { x: 1 }), null);
  for (const expr of ['x^', '(x + 1', 'x + 1)', '', 'Math.sin(', 'x(2)', '1..5', 'x ? 1', 'Math.sin(x,)']) {
    assert.equal(evalExpr(expr, { x: 1 }), null, expr);
  }
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
