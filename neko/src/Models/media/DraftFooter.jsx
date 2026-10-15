// The last row of a group with a change that isn't in use yet (a service
// picked but its key not saved, ComfyUI not answering): what is still in
// use, Cancel, and the group's one primary button.

import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';

/**
 *   <DraftFooter text={draftText({ draft, current, currentWorks, cloud })} onCancel={dropDraft}
 *     primary={<Button variant="primary" size="sm" onClick={use}>Use ComfyUI</Button>} />
 */
export default function DraftFooter({ text, onCancel, primary = null }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4" data-draft-footer>
      <p className="min-w-0 flex-1 text-[12px] leading-5 text-fg-muted">{text}</p>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        {primary}
      </div>
    </div>
  );
}

DraftFooter.propTypes = {
  text: PropTypes.node.isRequired,
  onCancel: PropTypes.func.isRequired,
  primary: PropTypes.node,
};
