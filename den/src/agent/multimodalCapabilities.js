import { getAiClientForUser } from '../ai/controllers/ai/clientFactory.js';
import { listVisualModels } from '../ai/controllers/ai/visualModelManager.js';
import { checkSdCpp } from '../ai/controllers/ai/sdCppManager.js';
import { checkComfyUi } from '../ai/controllers/ai/comfyUiManager.js';
import { getStatus as getWhisperStatus } from '../ai/controllers/ai/whisperServerManager.js';
import { getStatus as getTtsStatus } from '../ai/controllers/ai/ttsServerManager.js';

function modelLooksVisionCapable(providerId = '', model = '') {
  const text = `${providerId} ${model}`.toLowerCase();
  return /(gpt-4o|gpt-4\.1|gpt-5|o3|o4|gemini|claude-3|claude-4|vision|vl|llava|pixtral|qwen.*vl|qwen.*omni|grok)/i.test(text);
}

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

  let visualModels = { vision: [], image: [] };
  try { visualModels = listVisualModels(); } catch {}

  const [simpleImage, comfyui] = await Promise.all([
    checkSdCpp().catch(err => ({ found: false, status: 'missing', error: err.message })),
    checkComfyUi().catch(err => ({ found: false, status: 'offline', error: err.message })),
  ]);

  const whisper = getWhisperStatus();
  const tts = getTtsStatus();
  const visionProviderReady = Boolean(provider && modelLooksVisionCapable(provider.providerId, provider.model));
  const imageRuntime = comfyui.found ? 'comfyui' : simpleImage.found ? 'simple' : null;

  return {
    vision: {
      ready: visionProviderReady,
      providerReady: visionProviderReady,
      providerId: provider?.providerId || null,
      model: provider?.model || null,
      indexedAssets: visualModels.vision?.length || 0,
      note: visionProviderReady
        ? 'Active AI provider appears to support image input.'
        : 'Image inspection requires a vision-capable active AI provider.',
    },
    stt: {
      ready: whisper.status === 'ready',
      status: whisper.status,
      model: whisper.model || null,
    },
    tts: {
      ready: tts.status === 'ready',
      status: tts.status,
      model: tts.model || null,
    },
    image: {
      ready: Boolean(imageRuntime),
      runtime: imageRuntime,
      simple: {
        ready: Boolean(simpleImage.found),
        status: simpleImage.status,
        models: simpleImage.models?.length || 0,
      },
      comfyui: {
        ready: Boolean(comfyui.found),
        status: comfyui.status,
        checkpoints: comfyui.checkpoints?.length || 0,
      },
      indexedAssets: visualModels.image?.length || 0,
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
    `- Image generation: ${image.ready ? `ready via ${image.runtime}` : 'not ready'}. Use generate_image for text-to-image when ready.`,
    `- Image editing/image-to-image: ${image.comfyui?.ready ? 'ready via ComfyUI' : 'not ready unless ComfyUI is running'}. Use edit_image only when ComfyUI is ready.`,
    '- Attachments: use inspect_attachment first when the user attaches a file and asks about its contents; it routes by MIME/type.',
  ].join('\n');
}
