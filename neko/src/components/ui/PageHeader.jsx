import PropTypes from 'prop-types';

/**
 * The title block at the top of a page: title, a one-line description,
 * optional actions on the right and optional content (tabs) underneath.
 */
export default function PageHeader({ title, description, actions = null, children = null, className = '' }) {
  return (
    <header className={`shrink-0 border-b border-line px-6 pt-6 lg:px-8 ${children ? '' : 'pb-5'} ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  actions: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
};
