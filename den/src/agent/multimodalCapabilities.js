import { getAiClientForUser } from '../ai/controllers/ai/clientFactory.js';
import { getModelCapabilities } from '../ai/controllers/ai/modelCapabilities.js';
import { listVisualModels } from '../ai/controllers/ai/visualModelManager.js';
import { checkSdCpp } from '../ai/controllers/ai/sdCppManager.js';
import { checkComfyUi } from '../ai/controllers/ai/comfyUiManager.js';
import { voiceStatus } from '../media/voiceService.js';
import { imageStatus } from '../media/imageService.js';

export async function getMultimodalCapabilities(userId = null) {
  let provider = null;
  try {
    const resolved = userId ? getAiClientForUser(userId) : null;
    provider = resolved?.providerInfo || {};
    provider.model = resolved?.model || provider.model || '';
    provider.providerId = provider.providerId || provider.provider_id || '';
  } catch {
    provider = null;
  }

  let imageModels = [];
  try { imageModels = listVisualModels().image || []; } catch {}

  const [simpleImage, comfyui, voice, pictures] = await Promise.all([
    checkSdCpp().catch(err => ({ found: false, status: 'missing', error: err.message })),
    checkComfyUi().catch(err => ({ found: false, status: 'offline', error: err.message })),
    voiceStatus().catch(() => null),
    imageStatus().catch(() => null),
  ]);

  const modelCapabilities = getModelCapabilities(
    provider?.providerId,
    provider?.model,
    provider?.settings?.model_capabilities,
  );
  const visionProviderReady = Boolean(provider && modelCapabilities.supportsImageInput);
  // Local engines start when first used, so a chosen model counts as ready.
  const cloudImage = pictures && !['local', 'comfyui'].includes(pictures.provider) ? pictures : null;
  const simpleReady = Boolean(simpleImage.found && pictures?.model);
  const imageRuntime = cloudImage?.ready
    ? cloudImage.provider
    : pictures?.provider === 'comfyui' && comfyui.found ? 'comfyui'
      : simpleReady ? 'simple' : comfyui.found ? 'comfyui' : null;
  const editRuntime = cloudImage?.ready && cloudImage.edits
    ? cloudImage.provider
    : comfyui.found ? 'comfyui' : simpleReady ? 'simple' : null;

  return {
    vision: {
      ready: visionProviderReady,
      providerReady: visionProviderReady,
      providerId: provider?.providerId || null,
      model: provider?.model || null,
      supportsImageInput: visionProviderReady,
      inputModalities: modelCapabilities.inputModalities,
      note: visionProviderReady
        ? 'The active language model supports image input.'
        : 'Choose a language model that supports image input to attach photos.',
    },
    stt: {
      ready: Boolean(voice?.stt?.ready),
      status: voice?.stt?.ready ? 'ready' : voice?.stt?.reason || 'unknown',
      provider: voice?.stt?.provider || null,
      model: voice?.stt?.model?.name || voice?.stt?.model || null,
    },
    tts: {
      ready: Boolean(voice?.tts?.ready),
      status: voice?.tts?.ready ? 'ready' : voice?.tts?.reason || 'unknown',
      provider: voice?.tts?.provider || null,
      model: voice?.tts?.voice?.name || null,
    },
    image: {
      ready: Boolean(imageRuntime),
      runtime: imageRuntime,
      editRuntime,
      simple: {
        ready: simpleReady,
        status: simpleImage.status,
        models: simpleImage.models?.length || 0,
      },
      comfyui: {
        ready: Boolean(comfyui.found),
        status: comfyui.status,
        checkpoints: comfyui.checkpoints?.length || 0,
      },
      indexedAssets: imageModels.length,
    },
    pdf: {
      ready: true,
      note: 'PDF extraction uses pdftotext when installed.',
    },
  };
}

export function formatMultimodalCapabilityPrompt(capabilities = {}) {
  const vision = capabilities.vision || {};
  const stt = capabilities.stt || {};
  const image = capabilities.image || {};
  const tts = capabilities.tts || {};
  return [
    '## Multimodal Capability Status',
    `- Vision/image inspection: ${vision.ready ? 'ready' : 'not ready'}${vision.model ? ` (${vision.providerId || 'provider'} / ${vision.model})` : ''}. Use image_describe only when ready; otherwise explain what is missing.`,
    `- Speech-to-text/audio transcription: ${stt.ready ? 'ready' : `not ready (${stt.status || 'unknown'})`}. Use transcribe_audio only when ready.`,
    `- Text-to-speech/audio generation: ${tts.ready ? 'ready' : `not ready (${tts.status || 'unknown'})`}. Use speak_text only when useful and ready.`,
    `- Image generation: ${image.ready ? `ready via ${image.runtime}` : 'not ready (set up in Models → Images)'}. Use generate_image for text-to-image when ready.`,
    `- Image editing/image-to-image: ${image.editRuntime ? `ready via ${image.editRuntime}` : 'not ready'}. Use edit_image when ready; it takes a working-folder path or a gallery picture name.`,
    '- Attachments: use inspect_attachment first when the user attaches a file and asks about its contents; it routes by MIME/type.',
  ].join('\n');
}
