// Change a connector's address or command, its keys and its name. Keys show
// as ********; leaving them so keeps what is saved.

import { useState } from 'react';
import PropTypes from 'prop-types';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { connectorsApi } from './connectorsApi.js';
import { localFormFrom, localPayload, remoteFormFrom, remotePayload } from './connectorFormat.js';
import { LocalFields, RemoteFields } from './ConnectorFields.jsx';

export default function EditConnectorDialog({ connector, onClose, onSaved }) {
  const remote = connector.kind === 'remote';
  const [form, setForm] = useState(() => (remote ? remoteFormFrom(connector) : localFormFrom(connector)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const save = async (event) => {
    event.preventDefault();
    const payload = remote ? remotePayload(form) : localPayload(form);
    if (!remote && !payload.command) {
      setError('Type the command that starts it.');
      return;
    }
    // An empty name goes back to the default one.
    if (!payload.title) payload.title = '';
    setBusy(true);
    setError('');
    try {
      const res = await connectorsApi.update(connector.name, payload);
      onSaved(res.connector);
    } catch (err) {
      setError(err.message || "Couldn't save it.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      as="form"
      onSubmit={save}
      size="md"
      title={`Edit ${connector.title}`}
      description={remote ? 'A server on the internet or your network.' : 'A program on this computer.'}
      onClose={() => !busy && onClose()}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" loading={busy}>Save</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {remote ? <RemoteFields form={form} set={set} /> : <LocalFields form={form} set={set} />}
        {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </Dialog>
  );
}

EditConnectorDialog.propTypes = {
  connector: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
