// Short numbers for the training charts' axes, so a label fits beside the
// chart: 1200 → 1.2k, 2.4567 → 2.46, 0.0002 → 2e-4.

export function axisNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  if (abs >= 10) return String(Math.round(n));
  if (abs >= 0.01) return String(+n.toFixed(2));
  return n.toExponential(0).replace('e+', 'e');
}
