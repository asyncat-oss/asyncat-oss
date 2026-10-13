// den/src/ai/controllers/ai/cloudSpeech.js
// Speech to text and text to speech with cloud services (OpenAI,
// ElevenLabs, Gemini, fal), using the keys and choices saved in Settings.
// Used by the /audio routes and by voice previews.

/** The upload type and name for a recording: WAV from Asyncat's mic, WebM otherwise. */
function audioUpload(audioBuffer) {
  const wav = Buffer.isBuffer(audioBuffer) && audioBuffer.length > 12
    && audioBuffer.toString('ascii', 0, 4) === 'RIFF' && audioBuffer.toString('ascii', 8, 12) === 'WAVE';
  return wav ? { type: 'audio/wav', name: 'audio.wav' } : { type: 'audio/webm', name: 'audio.webm' };
}

function requiredEnv(name, providerName) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${providerName} is selected but ${name} is not saved.`);
  return value;
}

export async function transcribeWithCloudProvider(providerId, audioBuffer, options = {}) {
  if (providerId === 'openai') {
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: audioUpload(audioBuffer).type }), audioUpload(audioBuffer).name);
    form.append('model', process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe');
    if (options.language) form.append('language', options.language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY', 'OpenAI STT')}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI transcription failed: ${error}`);
    }
    const result = await response.json();
    return {
      text: result.text || '',
      segments: result.segments || [],
      language: result.language || options.language || 'auto',
      provider: 'openai',
      model: process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe',
    };
  }

  if (providerId === 'elevenlabs') {
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: audioUpload(audioBuffer).type }), audioUpload(audioBuffer).name);
    form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v2');
    if (options.language) form.append('language_code', options.language);

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': requiredEnv('ELEVENLABS_API_KEY', 'ElevenLabs STT') },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs transcription failed: ${error}`);
    }
    const result = await response.json();
    return {
      text: result.text || '',
      words: result.words || [],
      language: result.language_code || options.language || 'auto',
      provider: 'elevenlabs',
      model: process.env.ELEVENLABS_STT_MODEL || 'scribe_v2',
    };
  }

  if (providerId === 'fal') {
    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: audioUpload(audioBuffer).type }), audioUpload(audioBuffer).name);
    if (options.language) form.append('language', options.language);
    const response = await fetch('https://fal.run/fal-ai/whisper', {
      method: 'POST',
      headers: { Authorization: `Key ${requiredEnv('FAL_KEY', 'fal.ai STT')}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`fal.ai transcription failed: ${error}`);
    }
    const result = await response.json();
    return {
      text: result.text || '',
      chunks: result.chunks || [],
      language: result.language || options.language || 'auto',
      provider: 'fal',
      model: 'whisper',
    };
  }

  throw new Error(`${providerId} speech-to-text is configured but does not have a runtime adapter yet.`);
}

export async function synthesizeWithCloudProvider(providerId, text, options = {}) {
  if (providerId === 'openai') {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY', 'OpenAI TTS')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        input: text,
        voice: options.voice || process.env.OPENAI_TTS_VOICE || 'coral',
        ...(options.instructions ? { instructions: options.instructions } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI speech generation failed: ${error}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      provider: 'openai',
    };
  }

  if (providerId === 'elevenlabs') {
    const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
    const outputFormat = options.outputFormat || process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': requiredEnv('ELEVENLABS_API_KEY', 'ElevenLabs TTS'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: options.model || process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
        ...(options.languageCode ? { language_code: options.languageCode } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs speech generation failed: ${error}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      provider: 'elevenlabs',
    };
  }

  if (providerId === 'gemini') {
    const apiKey = requiredEnv('GEMINI_API_KEY', 'Gemini TTS');
    const voice = options.voice || process.env.GEMINI_TTS_VOICE || 'Aoede';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`Gemini TTS failed: ${error}`);
    }
    const result = await response.json();
    const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error('Gemini TTS returned no audio data.');
    return {
      buffer: Buffer.from(audioData, 'base64'),
      contentType: 'audio/wav',
      provider: 'gemini',
    };
  }

  if (providerId === 'fal') {
    const response = await fetch('https://fal.run/fal-ai/kokoro', {
      method: 'POST',
      headers: {
        Authorization: `Key ${requiredEnv('FAL_KEY', 'fal.ai TTS')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        voice: options.voice || process.env.FAL_TTS_VOICE || 'af_bella',
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`fal.ai TTS failed: ${error}`);
    }
    const result = await response.json();
    const audioUrl = result.audio?.url || result.audio_url;
    if (!audioUrl) throw new Error('fal.ai TTS returned no audio URL.');
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    return {
      buffer: Buffer.from(await audioRes.arrayBuffer()),
      contentType: audioRes.headers.get('content-type') || 'audio/mpeg',
      provider: 'fal',
    };
  }

  throw new Error(`${providerId} text-to-speech is configured but does not have a runtime adapter yet.`);
}
