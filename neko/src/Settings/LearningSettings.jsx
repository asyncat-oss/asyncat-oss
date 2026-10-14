// Settings → Privacy & safety → Learning from chats: whether Asyncat keeps
// memories from chats on its own, and whether it offers to save a skill after
// a chat where the agent worked through a task (den/src/agent/learningRoutes.js).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked } from 'lucide-react';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import learningApi from '../services/learningApi.js';

export default function LearningSettings() {
  const toast = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    learningApi.settings()
      .then((res) => setSettings(res.settings))
      .catch((err) => setError(errorDetail(err)));
  }, []);

  const change = async (key, value) => {
    const before = settings;
    setSettings({ ...settings, [key]: value });
    try {
      const res = await learningApi.setSettings({ [key]: value });
      setSettings(res.settings);
    } catch (err) {
      setSettings(before);
      toast.error("Couldn't change that", { detail: errorDetail(err) });
    }
  };

  const rows = [
    {
      key: 'rememberChats',
      label: 'Remember things from chats',
      hint: (
        <>
          Lasting facts, preferences and corrections from your chats are saved as memories. When this is off, a memory is saved only when you ask.{' '}
          <button type="button" onClick={() => navigate('/tools?tab=memory')} className="text-accent hover:underline">See memories</button>
        </>
      ),
    },
    {
      key: 'suggestSkills',
      label: 'Suggest skills from my chats',
      hint: 'After a chat where the agent worked through a task, it offers to save the steps as a skill. Nothing is saved unless you choose Save. Each offer takes one more request to your model.',
    },
  ];

  return (
    <SettingsSection icon={BookMarked} title="Learning from chats" hint="Temporary chats never teach Asyncat anything." data-learning>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p>
      ) : (
        <RowGroup>
          {rows.map((row) => (
            <SettingsRow key={row.key} label={row.label} hint={row.hint} stack={false} data-learning-row={row.key}>
              <Switch checked={Boolean(settings?.[row.key])} disabled={!settings} onChange={(value) => change(row.key, value)} label={row.label} />
            </SettingsRow>
          ))}
        </RowGroup>
      )}
    </SettingsSection>
  );
}
