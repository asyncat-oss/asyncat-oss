// den/src/agent/tools/audioTools.js
// ─── Audio Tools ────────────────────────────────────────────────────────────
// Tools for speech-to-text (transcribe) and text-to-speech (speak) operations.
// These tools are available when audio models are loaded.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { safePath, formatSize } from './shared.js';
import { getArtifactsDir } from '../workspacePaths.js';
import {
  getStatus as getWhisperStatus,
  transcribe,
} from '../../ai/controllers/ai/whisperServerManager.js';
import {
  getStatus as getTtsStatus,
  synthesize,
} from '../../ai/controllers/ai/ttsServerManager.js';
import { synthesizeWithCloudProvider, transcribeWithCloudProvider } from '../../ai/controllers/ai/cloudSpeech.js';
import { ensureLocalListening, ensureLocalSpeaking, speechProvider } from '../../media/voiceService.js';

// ── transcribe_audio ─────────────────────────────────────────────────────────

export const transcribeAudioTool = {
  name: 'transcribe_audio',
  description:
    'Transcribe an audio file to text with the listening model chosen in Models → Voice (on this computer or a cloud service). ' +
    'Supports WAV, MP3, OGG, FLAC, and other common audio formats. ' +
    'Returns the transcribed text.',
  category: 'audio',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the audio file (relative to working directory)',
      },
      language: {
        type: 'string',
        description: 'Language code (e.g. "en", "es", "fr"). Leave empty for auto-detection.',
      },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const provider = speechProvider('stt');
    if (provider === 'local') {
      try {
        await ensureLocalListening();
      } catch (err) {
        return { success: false, error: `Listening isn't set up: ${err.message}` };
      }
    }
    const whisperStatus = getWhisperStatus();

    const filePath = safePath(args.path, context.workingDir);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Audio file not found: ${args.path}` };
    }

    const stat = fs.statSync(filePath);
    if (stat.size > 100 * 1024 * 1024) {
      return { success: false, error: 'Audio file too large (>100MB). Consider splitting into smaller segments.' };
    }

    try {
      const audioBuffer = fs.readFileSync(filePath);
      const options = { language: args.language || undefined };
      const result = provider === 'local'
        ? await transcribe(audioBuffer, options)
        : await transcribeWithCloudProvider(provider, audioBuffer, options);

      return {
        success: true,
        path: args.path,
        text: result.text,
        language: result.language,
        segments: result.segments?.length || 0,
        model: provider === 'local' ? whisperStatus.model : provider,
      };
    } catch (err) {
      return {
        success: false,
        error: `Transcription failed: ${err.message}`,
      };
    }
  },
};

// ── speak_text ───────────────────────────────────────────────────────────────

export const speakTextTool = {
  name: 'speak_text',
  description:
    'Convert text to speech with the voice chosen in Models → Voice (on this computer or a cloud service). ' +
    'Generates an audio file from the given text. ' +
    'Returns the path to the generated audio file.',
  category: 'audio',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to convert to speech',
      },
      output_path: {
        type: 'string',
        description: 'Where to save the audio file (relative to working directory). Defaults to a timestamped file.',
      },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const provider = speechProvider('tts');
    if (provider === 'local') {
      try {
        await ensureLocalSpeaking();
      } catch (err) {
        return { success: false, error: `Speaking isn't set up: ${err.message}` };
      }
    }
    const ttsStatus = provider === 'local' ? getTtsStatus() : { model: provider };

    if (!args.text || args.text.trim().length === 0) {
      return { success: false, error: 'Text cannot be empty.' };
    }

    if (args.text.length > 50000) {
      return { success: false, error: 'Text too long (>50,000 characters). Split into smaller segments.' };
    }

    try {
      let audioBuffer;
      let ext = 'wav';
      if (provider === 'local') {
        audioBuffer = await synthesize(args.text);
      } else {
        const spoken = await synthesizeWithCloudProvider(provider, args.text, {});
        audioBuffer = spoken.buffer;
        ext = /mpeg|mp3/.test(spoken.contentType || '') ? 'mp3' : 'wav';
      }

      // Save to artifacts dir so the UI can display it inline
      const artifactsDir = getArtifactsDir(context.workingDir);
      fs.mkdirSync(artifactsDir, { recursive: true });

      const id = randomUUID().slice(0, 12);
      const baseName = args.output_path
        ? path.basename(args.output_path, path.extname(args.output_path))
        : `speech_${Date.now()}`;
      const artifactFilename = `${baseName}_${id}.${ext}`;
      const artifactPath = path.join(artifactsDir, artifactFilename);
      fs.writeFileSync(artifactPath, audioBuffer);

      // Also write to the requested output path if specified
      if (args.output_path) {
        const outputPath = safePath(args.output_path, context.workingDir);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, audioBuffer);
      }

      const relArtifactPath = path.relative(context.workingDir, artifactPath);
      const label = args.text.slice(0, 60) + (args.text.length > 60 ? '…' : '');

      return {
        success: true,
        path: args.output_path || relArtifactPath,
        artifact: {
          id,
          title: `Audio: ${label}`,
          filename: artifactFilename,
          path: relArtifactPath,
          absolutePath: artifactPath,
          type: 'audio',
          size: audioBuffer.length,
          createdAt: new Date().toISOString(),
          voice: ttsStatus.model,
          format: ext.toUpperCase(),
          textLength: args.text.length,
        },
        text_length: args.text.length,
        audio_size: formatSize(audioBuffer.length),
        audio_bytes: audioBuffer.length,
        voice: ttsStatus.model,
        format: ext === 'wav' ? 'WAV (16-bit PCM, mono)' : 'MP3',
      };
    } catch (err) {
      return {
        success: false,
        error: `Speech synthesis failed: ${err.message}`,
      };
    }
  },
};

/** All audio tools for batch registration. */
export const audioTools = [transcribeAudioTool, speakTextTool];
export default audioTools;
