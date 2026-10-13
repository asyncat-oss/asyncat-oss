import PropTypes from 'prop-types';
import { Eye, EyeOff, Info } from 'lucide-react';

const formatTokens = (n) => {
  const value = Number(n) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
};

/**
 * How a project's or agent's instructions and knowledge fit the model that
 * will answer: a bar against the model's context window, what happens when
 * it doesn't fit, and whether the model can see images.
 * `report` is the /context response from the backend.
 */
export default function ContextMeter({ report, loading = false }) {
  if (loading && !report) {
    return <div className="h-14 animate-pulse rounded-xl bg-hover" />;
  }
  if (!report) return null;

  const model = report.model;
  if (!model) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Choose or load a model to see how much of this fits. {report.modelUnavailableReason ? `(${report.modelUnavailableReason.replace(/^[A-Z_]+:\s*/, '')})` : ''}</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, report.percentOfWindow || 0));
  const budgetPct = model.contextWindow ? Math.round((report.budget / model.contextWindow) * 100) : 45;
  const fits = report.fits !== false;
  const barColor = fits ? 'bg-accent' : 'bg-amber-500';

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface px-3 py-3">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="font-medium text-fg">
          {formatTokens(report.neededTokens)} of {formatTokens(model.contextWindow)} tokens
        </span>
        <span className="truncate text-fg-subtle" title={`${model.provider} · ${model.name}`}>{model.name}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${Math.max(pct, report.neededTokens ? 1.5 : 0)}%` }} />
        <div className="absolute inset-y-0 w-px bg-fg-subtle/60" style={{ left: `${budgetPct}%` }} title="What projects may use" />
      </div>
      <p className="text-[12px] leading-5 text-fg-muted">
        {fits
          ? 'Everything goes into each chat in full.'
          : `More than fits this model, so each chat gets the parts most related to the question and the agent can search the rest.`}
        {' '}
        <span className="text-fg-subtle">Context size {model.contextSourceLabel}.</span>
      </p>
      {report.imageCount > 0 && (
        <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          {model.supportsImages ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {model.supportsImages
            ? `${model.name} can see images, so up to 4 go with each chat.`
            : `${model.name} can't see images, so the ${report.imageCount} image${report.imageCount === 1 ? ' is' : 's are'} left out.`}
        </p>
      )}
    </div>
  );
}

ContextMeter.propTypes = {
  report: PropTypes.shape({
    model: PropTypes.shape({
      name: PropTypes.string,
      provider: PropTypes.string,
      contextWindow: PropTypes.number,
      contextSourceLabel: PropTypes.string,
      supportsImages: PropTypes.bool,
    }),
    modelUnavailableReason: PropTypes.string,
    neededTokens: PropTypes.number,
    budget: PropTypes.number,
    fits: PropTypes.bool,
    percentOfWindow: PropTypes.number,
    imageCount: PropTypes.number,
  }),
  loading: PropTypes.bool,
};
