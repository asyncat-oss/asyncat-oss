/**
 * What the model a chat will use can take in: how big its context window is
 * (and how sure we are of that), and whether it can see images. Projects and
 * agents use this to decide how much knowledge fits, and the app shows it.
 */

import { getAiClientForUser } from './clientFactory.js';
import { getModelCapabilities } from './modelCapabilities.js';
import { resolveContextWindow } from './modelContextResolver.js';
import { getProviderPreset } from './providerCatalog.js';

const SOURCE_LABELS = {
  settings: 'set for this model',
  'model-metadata': 'reported by the provider',
  'model-registry': 'known for this model',
  'provider-preset': "the provider's usual size",
  fallback: 'a cautious guess',
};

/** Describe a resolved client (from getAiClientForUser and friends). */
export function describeModel(resolved) {
  const info = resolved?.providerInfo || {};
  const providerId = info.providerId || '';
  const model = resolved?.model || info.model || '';
  const settings = info.settings || {};
  const preset = getProviderPreset(providerId);
  const isLocal = Boolean(resolved?.isLocal);
  const context = resolveContextWindow({
    providerId,
    model,
    settings,
    preset,
    fallback: isLocal ? 8192 : 128000,
  });
  const capabilities = getModelCapabilities(providerId, model, settings.model_capabilities);
  return {
    ready: true,
    providerId,
    providerName: info.name || preset?.name || providerId || 'Default',
    model,
    isLocal,
    contextWindow: context.contextWindow,
    contextSource: context.source,
    contextSourceLabel: SOURCE_LABELS[context.source] || context.source,
    contextConfidence: context.confidence,
    maxContextWindow: Number(settings.max_context_window) || null,
    supportsImages: Boolean(capabilities.supportsImageInput),
    supportsTools: Boolean(resolved?.supportsNativeTools),
  };
}

/** The user's current model, or { ready: false, reason } when none can run. */
export function getActiveModelProfile(userId) {
  try {
    return describeModel(getAiClientForUser(userId));
  } catch (err) {
    return { ready: false, reason: err.message, contextWindow: null, supportsImages: false };
  }
}
