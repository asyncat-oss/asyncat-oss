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

// ── transcribe_audio ─────────────────────────────────────────────────────────

export const transcribeAudioTool = {
  name: 'transcribe_audio',
  description:
    'Transcribe an audio file to text using the local Whisper speech-to-text model. ' +
    'Supports WAV, MP3, OGG, FLAC, and other common audio formats. ' +
    'The Whisper STT model must be loaded (check the Models page → Audio tab). ' +
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
    // Check whisper is running
    const whisperStatus = getWhisperStatus();
    if (whisperStatus.status !== 'ready') {
      return {
        success: false,
        error: 'Whisper STT model is not loaded. Load a Whisper model from the Models page → Audio tab before using transcription.',
      };
    }

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
      const result = await transcribe(audioBuffer, {
        language: args.language || undefined,
      });

      return {
        success: true,
        path: args.path,
        text: result.text,
        language: result.language,
        segments: result.segments?.length || 0,
        model: whisperStatus.model,
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
    'Convert text to speech using the local Piper TTS model. ' +
    'Generates a WAV audio file from the given text. ' +
    'The TTS voice model must be loaded (check the Models page → Audio tab). ' +
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
    // Check TTS is running
    const ttsStatus = getTtsStatus();
    if (ttsStatus.status !== 'ready') {
      return {
        success: false,
        error: 'TTS voice model is not loaded. Load a voice model from the Models page → Audio tab before using text-to-speech.',
      };
    }

    if (!args.text || args.text.trim().length === 0) {
      return { success: false, error: 'Text cannot be empty.' };
    }

    if (args.text.length > 50000) {
      return { success: false, error: 'Text too long (>50,000 characters). Split into smaller segments.' };
    }

    try {
      const audioBuffer = await synthesize(args.text);

      // Save to artifacts dir so the UI can display it inline
      const artifactsDir = getArtifactsDir(context.workingDir);
      fs.mkdirSync(artifactsDir, { recursive: true });

      const id = randomUUID().slice(0, 12);
      const baseName = args.output_path
        ? path.basename(args.output_path, path.extname(args.output_path))
        : `speech_${Date.now()}`;
      const artifactFilename = `${baseName}_${id}.wav`;
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
          format: 'WAV',
          textLength: args.text.length,
        },
        text_length: args.text.length,
        audio_size: formatSize(audioBuffer.length),
        audio_bytes: audioBuffer.length,
        voice: ttsStatus.model,
        format: 'WAV (16-bit PCM, 22050 Hz, mono)',
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
