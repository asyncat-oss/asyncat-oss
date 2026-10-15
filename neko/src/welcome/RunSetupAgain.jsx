// Settings → General: open the first-run setup again.

import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import { RowGroup, SettingsRow } from '../components/ui/Rows.jsx';

export default function RunSetupAgain() {
  const navigate = useNavigate();
  return (
    <RowGroup data-run-setup>
      <SettingsRow label="First-run setup" hint="Choose a model, bring your chats and set how careful Asyncat is, one step at a time.">
        <Button size="sm" onClick={() => navigate('/welcome')}>Run setup again</Button>
      </SettingsRow>
    </RowGroup>
  );
}
