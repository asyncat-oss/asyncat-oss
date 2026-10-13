// Profile settings that travel with a chosen model.

/** Settings to store alongside a model picked from a provider's list. */
export function settingsForModel(model, baseSettings = {}) {
  const modelId = model.id || model.name;
  const next = { ...baseSettings };
  delete next.model_name;
  delete next.model_capabilities;
  delete next.context_window;
  if (model.context_window) next.context_window = model.context_window;
  if (model.name && model.name !== modelId) next.model_name = model.name;
  if (model.capabilities) next.model_capabilities = model.capabilities;
  return next;
}
