import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, ChevronDown, ImagePlus, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import Button from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import Select from '../components/ui/Select.jsx';
import ContextMeter from '../components/ContextMeter';
import KnowledgeFiles from '../components/KnowledgeFiles';
import { useConfirm } from '../components/confirmContext';
import { useToast, errorDetail } from '../components/toastContext';
import { profilesApi } from '../CommandCenter/api/agentApi.js';
import { aiProviderApi } from '../Settings/settingApi.js';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import eventBus from '../utils/eventBus.js';
import AgentAvatar from './AgentAvatar.jsx';
import ConnectorPicker from '../Connectors/ConnectorPicker.jsx';

// '' is no emoji: the agent shows a plain bot glyph.
const EMOJIS = ['', '🤖', '🧠', '🔍', '✍️', '🧑‍🏫', '🧑‍💻', '🎨', '📊', '🧪', '🩺', '⚖️', '🍳', '🌍', '🎧', '📚', '🐱'];
const CAPABILITY_HINTS = {
  web: 'Search the web and read or use web pages.',
  files: 'Read, write and run code in a project folder.',
  documents: 'Create documents, notes, charts and images.',
  memory: 'Remember things across chats.',
  integrations: 'Read email and RSS feeds you connected.',
  computer: 'Use this computer (apps, clipboard, screen) and manage Asyncat.',
};
const DEFAULT_CAPABILITIES = ['web', 'files', 'documents', 'memory'];

const blankAgent = () => ({
  name: '',
  icon: '',
  avatar_image: null,
  description: '',
  instructions: '',
  starter_prompts: [],
  model_profile_id: null,
  capabilities: DEFAULT_CAPABILITIES,
  connectors: null,
  is_default: false,
  auto_approve: false,
  max_rounds: 25,
  always_allowed_tools: [],
});

/** Resize a picked image to a small square avatar (data URL). */
function imageToAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image Asyncat can read.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function toPayload(agent) {
  return {
    name: agent.name.trim(),
    icon: agent.icon,
    avatarImage: agent.avatar_image || null,
    description: agent.description.trim(),
    instructions: agent.instructions,
    starterPrompts: agent.starter_prompts.map((s) => s.trim()).filter(Boolean),
    modelProfileId: agent.model_profile_id || null,
    capabilities: agent.capabilities,
    connectors: agent.connectors ?? null,
    isDefault: Boolean(agent.is_default),
    autoApprove: Boolean(agent.auto_approve),
    maxRounds: Number(agent.max_rounds) || 25,
    alwaysAllowedTools: agent.always_allowed_tools || [],
  };
}

/**
 * Create or edit an agent, like the GPT or Gem builders: who it is, what it
 * knows, what it may do, with a preview of how it appears in chats.
 */
export default function AgentEditor({ agentId = null, template = null, onClose }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { handleNewConversation } = useCommandCenter();
  const [agent, setAgent] = useState(() => {
    const base = blankAgent();
    if (!template) return base;
    return { ...base, name: template.name, description: template.description, instructions: template.instructions, starter_prompts: template.starters, capabilities: template.capabilities };
  });
  const [savedId, setSavedId] = useState(agentId);
  const [loading, setLoading] = useState(Boolean(agentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [capabilityOptions, setCapabilityOptions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [files, setFiles] = useState([]);
  const [fit, setFit] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dirty, setDirty] = useState(Boolean(template));
  const avatarInput = useRef(null);

  const update = (patch) => {
    setAgent((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const loadKnowledge = useCallback(async (id) => {
    if (!id) return;
    const [fileRes, fitRes] = await Promise.allSettled([profilesApi.listKnowledge(id), profilesApi.getContextFit(id)]);
    if (fileRes.status === 'fulfilled') setFiles(fileRes.value?.data || []);
    if (fitRes.status === 'fulfilled') setFit(fitRes.value?.data || null);
  }, []);

  useEffect(() => {
    profilesApi.getCapabilities().then((res) => setCapabilityOptions(res?.capabilities || [])).catch(() => {});
    aiProviderApi.listProfiles().then((res) => setProviders(res?.profiles || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    profilesApi.listProfiles().then((res) => {
      if (cancelled) return;
      const found = (res?.profiles || []).find((p) => p.id === agentId);
      if (found) {
        setAgent({
          ...blankAgent(),
          ...found,
          instructions: found.instructions || '',
          starter_prompts: found.starter_prompts || [],
          capabilities: found.capabilities ?? null,
          connectors: found.connectors ?? null,
        });
      } else {
        setError('This agent no longer exists.');
      }
      setLoading(false);
    });
    loadKnowledge(agentId);
    return () => { cancelled = true; };
  }, [agentId, loadKnowledge]);

  const save = async () => {
    if (!agent.name.trim()) {
      setError('Give the agent a name.');
      return null;
    }
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(agent);
      const res = savedId
        ? await profilesApi.updateProfile(savedId, payload)
        : await profilesApi.createProfile(payload);
      const id = res?.profile?.id || savedId;
      setSavedId(id);
      setDirty(false);
      eventBus.emit('agentsUpdated');
      loadKnowledge(id);
      return id;
    } catch (err) {
      setError(err.message || 'Could not save the agent.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const tryIt = async () => {
    const id = dirty || !savedId ? await save() : savedId;
    if (!id) return;
    await handleNewConversation({ experienceMode: 'work', metadata: { agentProfileId: id } });
    navigate('/home');
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${agent.name}”?`,
      message: 'Its knowledge files are deleted too. Chats that used it keep their history.',
      confirmLabel: 'Delete agent',
      destructive: true,
    });
    if (!ok) return;
    try {
      await profilesApi.deleteProfile(savedId);
      eventBus.emit('agentsUpdated');
      onClose();
    } catch (err) {
      toast.error("Couldn't delete the agent", { detail: errorDetail(err) });
    }
  };

  const upload = async (list) => {
    const id = savedId || await save();
    if (!id) return;
    setUploading(true);
    setUploadErrors([]);
    try {
      const { data, errors } = await profilesApi.uploadKnowledge(id, list);
      if (data.length) setFiles((prev) => [...prev, ...data]);
      setUploadErrors(errors);
      loadKnowledge(id);
    } catch (err) {
      setUploadErrors([{ name: 'Upload', error: err.message }]);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (file) => {
    try {
      await profilesApi.deleteKnowledge(savedId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      loadKnowledge(savedId);
    } catch (err) {
      toast.error("Couldn't remove the file", { detail: errorDetail(err) });
    }
  };

  const pickAvatar = async (file) => {
    if (!file) return;
    try {
      update({ avatar_image: await imageToAvatar(file) });
    } catch (err) {
      setError(err.message);
    }
  };

  const capabilities = agent.capabilities;
  const allCapabilities = capabilities === null;
  const toggleCapability = (key) => {
    const current = allCapabilities ? capabilityOptions.map((c) => c.id) : capabilities;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    update({ capabilities: next });
  };
  const capabilityOn = (key) => allCapabilities || capabilities.includes(key);

  const modelOptions = useMemo(() => [
    { value: '', label: "The chat's current model" },
    ...providers.map((p) => ({ value: p.id, label: `${p.name || p.provider_id} · ${p.model || 'default model'}` })),
  ], [providers]);

  if (loading) return <div className="h-full bg-canvas" aria-busy="true" />;

  const starters = agent.starter_prompts;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <Button variant="ghost" size="icon" icon={ArrowLeft} onClick={onClose} aria-label="Back to agents" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-fg">{savedId ? agent.name || 'Agent' : 'New agent'}</div>
          <div className="text-[12px] text-fg-subtle">{dirty ? 'Unsaved changes' : savedId ? 'Saved' : 'Not saved yet'}</div>
        </div>
        {savedId && <Button variant="danger" size="sm" icon={Trash2} onClick={remove}>Delete</Button>}
        <Button variant="secondary" icon={MessageSquare} onClick={tryIt} disabled={saving}>Start a chat</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty && Boolean(savedId)}>{savedId ? 'Save' : 'Create agent'}</Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p>}

            <section className="space-y-4">
              <Field label="Picture">
                <div className="flex flex-wrap items-center gap-1.5">
                  {agent.avatar_image ? (
                    <span className="relative">
                      <AgentAvatar agent={agent} size="md" />
                      <button type="button" onClick={() => update({ avatar_image: null })} className="absolute -right-1.5 -top-1.5 rounded-full border border-line bg-elevated p-0.5 text-fg-subtle hover:text-fg" aria-label="Remove picture"><X className="h-3 w-3" /></button>
                    </span>
                  ) : EMOJIS.map((emoji) => (
                    <button
                      key={emoji || 'none'}
                      type="button"
                      onClick={() => update({ icon: emoji })}
                      aria-pressed={(agent.icon || '') === emoji}
                      aria-label={emoji ? undefined : 'No emoji'}
                      title={emoji ? undefined : 'No emoji'}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${(agent.icon || '') === emoji ? 'bg-selected ring-1 ring-line-strong' : 'hover:bg-hover'}`}
                    >
                      {emoji || <Bot className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />}
                    </button>
                  ))}
                  <Button size="xs" variant="ghost" icon={ImagePlus} onClick={() => avatarInput.current?.click()}>Upload</Button>
                  <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              </Field>
              <Field label="Name" htmlFor="agent-name">
                <Input id="agent-name" value={agent.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Research assistant" maxLength={80} />
              </Field>
              <Field label="Description" htmlFor="agent-description" hint="One line people see in the agent picker.">
                <Input id="agent-description" value={agent.description} onChange={(e) => update({ description: e.target.value })} placeholder="What this agent is for" maxLength={200} />
              </Field>
              <Field label="Instructions" htmlFor="agent-instructions" hint="How it should behave: its role, tone, steps to follow, what to avoid. This is the most important part.">
                <textarea
                  id="agent-instructions"
                  value={agent.instructions}
                  onChange={(e) => update({ instructions: e.target.value })}
                  rows={10}
                  placeholder={'For example:\nYou are a friendly travel planner.\n- Ask about budget and dates first.\n- Suggest three options with prices.\n- Keep answers short.'}
                  className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[13px] leading-6 text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </Field>
              <Field label="Conversation starters" hint="Shown under the message box when someone picks this agent.">
                <div className="space-y-2">
                  {starters.map((starter, index) => (
                    <div key={index} className="flex gap-2">
                      <Input value={starter} onChange={(e) => update({ starter_prompts: starters.map((s, i) => (i === index ? e.target.value : s)) })} maxLength={200} placeholder="A question people often ask" />
                      <Button variant="ghost" size="icon" icon={X} onClick={() => update({ starter_prompts: starters.filter((_, i) => i !== index) })} aria-label="Remove starter" />
                    </div>
                  ))}
                  {starters.length < 4 && (
                    <Button size="xs" variant="ghost" icon={Plus} onClick={() => update({ starter_prompts: [...starters, ''] })}>Add a starter</Button>
                  )}
                </div>
              </Field>
            </section>

            <section>
              <h2 className="mb-1 text-[13px] font-semibold text-fg">Knowledge</h2>
              <p className="mb-2.5 text-[12px] leading-5 text-fg-muted">Files this agent should know. They go into its chats, or are searched when there are too many for the model.</p>
              <div className="space-y-2.5">
                {savedId && <ContextMeter report={fit} />}
                <KnowledgeFiles
                  files={files}
                  onUpload={upload}
                  onDelete={removeFile}
                  uploading={uploading}
                  errors={uploadErrors}
                  emptyHint={savedId ? undefined : 'Drop files here; the agent is saved first.'}
                />
              </div>
            </section>

            <section>
              <h2 className="mb-1 text-[13px] font-semibold text-fg">Capabilities</h2>
              <p className="mb-2.5 text-[12px] leading-5 text-fg-muted">
                What this agent may do. Anything switched off is not available to it at all.
                {savedId ? <> <button type="button" onClick={() => navigate(`/tools?tab=memory&scope=agent:${savedId}`)} className="text-accent hover:underline">See its memories</button></> : null}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {capabilityOptions.map((cap) => (
                  <label key={cap.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${capabilityOn(cap.id) ? 'border-line-strong bg-surface' : 'border-line hover:bg-hover'}`}>
                    <input type="checkbox" checked={capabilityOn(cap.id)} onChange={() => toggleCapability(cap.id)} className="mt-0.5 accent-current" />
                    <span>
                      <span className="block text-[13px] font-medium text-fg">{cap.label}</span>
                      <span className="block text-[12px] leading-5 text-fg-muted">{CAPABILITY_HINTS[cap.id]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <ConnectorPicker value={agent.connectors ?? null} onChange={(connectors) => update({ connectors })} />
            </section>

            <section>
              <Field label="Model" htmlFor="agent-model" hint="Use a specific model for this agent, or whichever model the chat uses.">
                <Select id="agent-model" value={agent.model_profile_id || ''} onChange={(value) => update({ model_profile_id: value || null })} options={modelOptions} />
              </Field>
            </section>

            <section className="rounded-xl border border-line">
              <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium text-fg">
                Advanced
                <ChevronDown className={`h-4 w-4 text-fg-subtle transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="space-y-4 border-t border-line px-3 py-3">
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={Boolean(agent.is_default)} onChange={(e) => update({ is_default: e.target.checked })} className="mt-0.5" />
                    <span className="text-[13px] text-fg">Pick this agent for new chats<span className="block text-[12px] text-fg-muted">It shows in the agent picker, and you can switch it off per chat.</span></span>
                  </label>
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={Boolean(agent.auto_approve)} onChange={(e) => update({ auto_approve: e.target.checked })} className="mt-0.5" />
                    <span className="text-[13px] text-fg">Run actions without asking<span className="block text-[12px] text-amber-700 dark:text-amber-400">Commands and file changes run without an approval card. Only for agents you trust with your files.</span></span>
                  </label>
                  <Field label="Most steps per answer" htmlFor="agent-rounds" hint="How many tool steps it may take before it has to answer.">
                    <Input id="agent-rounds" type="number" min={1} max={100} value={agent.max_rounds} onChange={(e) => update({ max_rounds: e.target.value })} className="w-28" />
                  </Field>
                  {agent.handle && <p className="text-[12px] text-fg-muted">Mention it in any chat with <code className="rounded bg-hover px-1">#{agent.handle}</code> to hand it one message.</p>}
                </div>
              )}
            </section>
          </div>

          <aside className="lg:pt-1">
            <div className="sticky top-6 space-y-3">
              <div className="text-[12px] font-medium text-fg-subtle">Preview</div>
              <div className="rounded-2xl border border-line bg-surface p-5 text-center">
                <div className="flex justify-center"><AgentAvatar agent={agent} size="lg" /></div>
                <div className="mt-3 text-[16px] font-semibold text-fg">{agent.name || 'Your agent'}</div>
                <p className="mt-1 text-[12px] leading-5 text-fg-muted">{agent.description || 'Its description appears here.'}</p>
                {starters.filter(Boolean).length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {starters.filter(Boolean).map((s) => (
                      <span key={s} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-fg-muted">{s.length > 36 ? `${s.slice(0, 34)}…` : s}</span>
                    ))}
                  </div>
                )}
              </div>
              <Button className="w-full" variant="secondary" icon={MessageSquare} onClick={tryIt}>Start a chat with it</Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

AgentEditor.propTypes = {
  agentId: PropTypes.string,
  template: PropTypes.object,
  onClose: PropTypes.func.isRequired,
};
