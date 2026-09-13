import 'dotenv/config';

const env = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Brak zmiennej środowiskowej ${key}`);
  return v;
};

export const config = {
  meetingUrl: env('MEETING_URL'),
  brokerUrl: env('BROKER_URL', 'ws://localhost:8080'),
  displayName: env('ASSISTANT_DISPLAY_NAME', 'Asystent'),
  userDataDir: env('USER_DATA_DIR', './.chromium-profile'),
  headless: env('HEADLESS', 'false') === 'true',
  audio: {
    sinkMeeting: env('PULSE_SINK_MEETING', 'meeting_out'),
    sinkAssistant: env('PULSE_SINK_ASSISTANT', 'assistant_mic'),
    inSampleRate: Number(env('AUDIO_IN_SAMPLE_RATE', '16000')),
    outSampleRate: Number(env('AUDIO_OUT_SAMPLE_RATE', '24000')),
    chunkMs: Number(env('AUDIO_CHUNK_MS', '100')),
  },
  screen: {
    intervalMs: Number(env('SCREEN_INTERVAL_MS', '3000')),
    diffThreshold: Number(env('SCREEN_DIFF_THRESHOLD', '0.02')),
  },
  sessionId: `meeting-${Date.now()}`,
};
