// Settings → General → New chats: whether a new chat starts in Plan, in
// Action, or in the mode used last (services/chatDefaults.js).

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Segmented } from '../components/ui/Tabs.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { newChatMode, setNewChatMode } from '../services/chatDefaults.js';

const MODE_HINTS = {
  last: 'Each new chat starts in the mode you used last.',
  plan: 'New chats start in Plan: the agent reads, searches and suggests, and changes nothing.',
  action: 'New chats start in Action: the agent can change files and run commands, and asks first for risky steps.',
};

export default function NewChatsSection() {
  const [mode, setMode] = useState(() => newChatMode());

  const changeMode = (value) => {
    setMode(value);
    setNewChatMode(value);
  };

  return (
    <SettingsSection icon={MessageSquarePlus} title="New chats" hint="You can switch between Plan and Action in the composer at any time." data-new-chats>
      <RowGroup>
        <SettingsRow label="New chats start in" hint={MODE_HINTS[mode]}>
          <Segmented
            value={mode}
            onChange={changeMode}
            items={[{ value: 'last', label: 'Last used' }, { value: 'plan', label: 'Plan' }, { value: 'action', label: 'Action' }]}
            label="New chats start in"
            role="radiogroup"
          />
        </SettingsRow>
      </RowGroup>
    </SettingsSection>
  );
}
