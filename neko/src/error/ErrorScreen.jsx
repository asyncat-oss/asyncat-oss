// The page shown when there is nothing to show: one that doesn't exist, or
// one that broke. The cat peeks in, a line says what happened, and a button
// or two lead out.
import PropTypes from 'prop-types';
import Cat from '../components/ui/Cat.jsx';

export default function ErrorScreen({ title, message, detail = '', children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-8 text-center">
      <Cat pose="peek" className="w-24" outline={5} />
      <h1 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-fg">{title}</h1>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-fg-muted">{message}</p>
      {detail ? <p className="mt-2 max-w-sm break-words font-mono text-[12px] leading-5 text-fg-subtle">{detail}</p> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

ErrorScreen.propTypes = {
  title: PropTypes.node.isRequired,
  message: PropTypes.node.isRequired,
  detail: PropTypes.node,
  children: PropTypes.node,
};
