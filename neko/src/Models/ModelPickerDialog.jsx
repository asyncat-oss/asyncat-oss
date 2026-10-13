import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { RefreshCw } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { ProviderLogo } from './modelLogos.jsx';
import ModelList from './ModelList.jsx';
import { settingsForModel } from './modelSettings.js';

/** Pick a different model for a saved provider profile. */
export default function ModelPickerDialog({ profile, loadModels, onClose, onChoose, saving = false }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setModels(await loadModels(profile.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Load once per profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const current = selected ? (selected.id || selected.name) : profile.model;
  const changed = Boolean(selected) && current !== profile.model;

  const choose = (activate) => {
    if (!selected) return;
    onChoose({ model: current, settings: settingsForModel(selected, profile.settings || {}) }, activate);
  };

  return (
    <Dialog
      size="lg"
      title="Choose a model"
      description={`${profile.name} · ${models.length ? `${models.length} models` : 'loading the model list'}`}
      icon={<ProviderLogo providerId={profile.provider_id} name={profile.name} size="md" />}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refresh} disabled={loading} className="mr-auto">Refresh list</Button>
          <Button variant="secondary" onClick={() => choose(false)} disabled={!changed || saving}>Save</Button>
          <Button variant="primary" onClick={() => choose(true)} disabled={!changed} loading={saving}>Save and use</Button>
        </>
      )}
    >
      <ModelList
        models={models}
        value={current}
        loading={loading}
        maxHeight="max-h-[52vh]"
        emptyLabel="This provider did not return a model list."
        onSelect={setSelected}
      />
    </Dialog>
  );
}

ModelPickerDialog.propTypes = {
  profile: PropTypes.object.isRequired,
  loadModels: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onChoose: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};
