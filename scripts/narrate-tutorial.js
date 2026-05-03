const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

loadDotEnv(path.resolve(ROOT, '.env'));
loadDotEnv(path.resolve(ROOT, '.env.local'));

const VIDEO_FILE = path.resolve(ROOT, process.env.TUTORIAL_VIDEO || 'docs/tutorial/routeshred-tutorial.webm');
const TEXT_FILE = path.resolve(ROOT, process.env.TUTORIAL_TEXT || 'docs/TUTORIAL_NARRATION.txt');
const FINAL_FILE = path.resolve(ROOT, process.env.TUTORIAL_FINAL || 'docs/tutorial/routeshred-tutorial-narrated.mp4');
const RATE = String(process.env.TUTORIAL_RATE || '165');
const TTS_PROVIDER = String(process.env.TUTORIAL_TTS_PROVIDER || 'auto').trim().toLowerCase();
const PREFERRED_VOICES = [
  'Flo (Deutsch (Deutschland))',
  'Eddy (Deutsch (Deutschland))',
  'Anna'
];
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = String(process.env.TUTORIAL_OPENAI_MODEL || 'gpt-4o-mini-tts').trim();
const OPENAI_VOICE = String(process.env.TUTORIAL_OPENAI_VOICE || 'verse').trim();
const OPENAI_INSTRUCTIONS = String(
  process.env.TUTORIAL_OPENAI_INSTRUCTIONS
  || 'Speak in warm, very natural German for a polished product tutorial. Calm pacing, clear pronunciation, subtle energy, no hype.'
).trim();
const OPENAI_SPEED = Number(process.env.TUTORIAL_OPENAI_SPEED || '1.0');
const ELEVENLABS_API_KEY = String(process.env.ELEVENLABS_API_KEY || '').trim();
const ELEVENLABS_VOICE_ID = String(process.env.TUTORIAL_ELEVENLABS_VOICE_ID || '').trim();
const ELEVENLABS_MODEL_ID = String(process.env.TUTORIAL_ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/gu, '\n');
  }
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${path.relative(ROOT, filePath)}`);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `${command} exited with status ${result.status}`);
  }

  return result;
}

function hasCommand(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
  return result.status === 0;
}

function readNarrationPreview(filePath, maxLength = 240) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trim()}...`;
}

function readNarrationText(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function resolveProvider() {
  if (TTS_PROVIDER === 'auto') {
    if (OPENAI_API_KEY) {
      return 'openai';
    }
    if (ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID) {
      return 'elevenlabs';
    }
    return 'local';
  }

  if (['local', 'openai', 'elevenlabs'].includes(TTS_PROVIDER)) {
    return TTS_PROVIDER;
  }

  throw new Error(`Unsupported TTS provider: ${TTS_PROVIDER}`);
}

function getAudioFile(provider) {
  if (process.env.TUTORIAL_AUDIO) {
    return path.resolve(ROOT, process.env.TUTORIAL_AUDIO);
  }

  const defaultFile = provider === 'local'
    ? 'docs/tutorial/routeshred-tutorial-narration.aiff'
    : 'docs/tutorial/routeshred-tutorial-narration.mp3';

  return path.resolve(ROOT, defaultFile);
}

function getAudioExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function ensureAudioExtension(provider, audioFile) {
  const ext = getAudioExtension(audioFile);

  if (provider === 'local' && !['.aiff', '.aif'].includes(ext)) {
    throw new Error('Local macOS narration currently expects TUTORIAL_AUDIO to end with .aiff or .aif');
  }

  if (provider === 'openai' && !['.mp3', '.aac', '.opus', '.flac', '.wav', '.pcm'].includes(ext)) {
    throw new Error('OpenAI narration expects TUTORIAL_AUDIO to end with .mp3, .aac, .opus, .flac, .wav, or .pcm');
  }

  if (provider === 'elevenlabs' && ext !== '.mp3') {
    throw new Error('ElevenLabs narration currently expects TUTORIAL_AUDIO to end with .mp3');
  }
}

function canUseVoice(voice) {
  const result = spawnSync('say', ['-v', voice, 'Test'], {
    stdio: 'ignore',
    encoding: 'utf8'
  });
  return result.status === 0;
}

function resolveVoice() {
  const requestedVoice = String(process.env.TUTORIAL_VOICE || '').trim();

  if (requestedVoice) {
    if (!canUseVoice(requestedVoice)) {
      throw new Error(`Requested voice is not installed: ${requestedVoice}`);
    }
    return requestedVoice;
  }

  const autoVoice = PREFERRED_VOICES.find((voice) => canUseVoice(voice));
  return autoVoice || 'Anna';
}

function getOpenAiResponseFormat(audioFile) {
  return getAudioExtension(audioFile).slice(1);
}

async function writeResponseToFile(response, filePath) {
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(bodyText || `TTS request failed with HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
}

async function synthesizeWithLocal(audioFile) {
  if (!hasCommand('say')) {
    throw new Error('macOS `say` command is not available on this system.');
  }

  const voice = resolveVoice();

  fs.mkdirSync(path.dirname(audioFile), { recursive: true });

  console.log('Provider: local');
  console.log(`Voice: ${voice}`);
  console.log(`Rate: ${RATE} wpm`);
  console.log(`Text: ${path.relative(ROOT, TEXT_FILE)}`);
  console.log(`Audio: ${path.relative(ROOT, audioFile)}`);

  runCommand('say', ['-v', voice, '-r', RATE, '-f', TEXT_FILE, '-o', audioFile]);
}

async function synthesizeWithOpenAi(audioFile, narrationText) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for TUTORIAL_TTS_PROVIDER=openai');
  }

  console.log('Provider: openai');
  console.log(`Model: ${OPENAI_MODEL}`);
  console.log(`Voice: ${OPENAI_VOICE}`);
  console.log(`Text: ${path.relative(ROOT, TEXT_FILE)}`);
  console.log(`Audio: ${path.relative(ROOT, audioFile)}`);

  const body = {
    model: OPENAI_MODEL,
    voice: OPENAI_VOICE,
    input: narrationText,
    response_format: getOpenAiResponseFormat(audioFile),
    speed: OPENAI_SPEED
  };

  if (OPENAI_MODEL.startsWith('gpt-4o-mini-tts') && OPENAI_INSTRUCTIONS) {
    body.instructions = OPENAI_INSTRUCTIONS;
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  await writeResponseToFile(response, audioFile);
}

async function synthesizeWithElevenLabs(audioFile, narrationText) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is required for TUTORIAL_TTS_PROVIDER=elevenlabs');
  }
  if (!ELEVENLABS_VOICE_ID) {
    throw new Error('TUTORIAL_ELEVENLABS_VOICE_ID is required for TUTORIAL_TTS_PROVIDER=elevenlabs');
  }

  console.log('Provider: elevenlabs');
  console.log(`Model: ${ELEVENLABS_MODEL_ID}`);
  console.log(`Voice ID: ${ELEVENLABS_VOICE_ID}`);
  console.log(`Text: ${path.relative(ROOT, TEXT_FILE)}`);
  console.log(`Audio: ${path.relative(ROOT, audioFile)}`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: narrationText,
      model_id: ELEVENLABS_MODEL_ID,
      language_code: 'de'
    })
  });

  await writeResponseToFile(response, audioFile);
}

async function synthesizeAudio() {
  const provider = resolveProvider();
  const audioFile = getAudioFile(provider);
  const narrationText = readNarrationText(TEXT_FILE);

  ensureAudioExtension(provider, audioFile);

  if (provider === 'local') {
    await synthesizeWithLocal(audioFile);
    return { provider, audioFile };
  }

  if (provider === 'openai') {
    await synthesizeWithOpenAi(audioFile, narrationText);
    return { provider, audioFile };
  }

  await synthesizeWithElevenLabs(audioFile, narrationText);
  return { provider, audioFile };
}

function buildFfmpegMuxArgs(audioFile) {
  const ext = path.extname(FINAL_FILE).toLowerCase();

  if (ext === '.webm') {
    return [
      '-y',
      '-i', VIDEO_FILE,
      '-i', audioFile,
      '-c:v', 'copy',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-shortest',
      FINAL_FILE
    ];
  }

  if (ext === '.mp4' || ext === '.m4v' || ext === '.mov') {
    return [
      '-y',
      '-i', VIDEO_FILE,
      '-i', audioFile,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-shortest',
      FINAL_FILE
    ];
  }

  return [
    '-y',
    '-i', VIDEO_FILE,
    '-i', audioFile,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    FINAL_FILE
  ];
}

function getSuggestedFfmpegCommand(audioFile) {
  const quoteForShell = (value) => {
    const arg = String(value);
    // POSIX-safe quoting: wrap in single quotes and escape embedded single quotes.
    return `'${arg.replace(/'/g, `'"'"'`)}'`;
  };

  return `ffmpeg ${buildFfmpegMuxArgs(audioFile)
    .map((arg) => quoteForShell(arg))
    .join(' ')}`;
}

function muxVideoAndAudio(audioFile) {
  if (!hasCommand('ffmpeg')) {
    console.log('\nffmpeg is not installed. Audio was generated successfully, but final muxing was skipped.');
    console.log('Install ffmpeg, then run this command to create the narrated video:');
    console.log(getSuggestedFfmpegCommand(audioFile));
    return false;
  }

  fs.mkdirSync(path.dirname(FINAL_FILE), { recursive: true });

  runCommand('ffmpeg', buildFfmpegMuxArgs(audioFile));

  return true;
}

async function main() {
  ensureFile(TEXT_FILE, 'Narration text');
  ensureFile(VIDEO_FILE, 'Tutorial video');

  console.log('Generating RouteShred tutorial narration...');
  console.log(`Preview: ${readNarrationPreview(TEXT_FILE)}`);

  const { audioFile } = await synthesizeAudio();
  const muxed = muxVideoAndAudio(audioFile);

  console.log(`\nDone: ${path.relative(ROOT, audioFile)}`);
  if (muxed) {
    console.log(`Done: ${path.relative(ROOT, FINAL_FILE)}`);
  }
}

main().catch((error) => {
  console.error('\nFATAL:', error.message);
  process.exit(1);
});