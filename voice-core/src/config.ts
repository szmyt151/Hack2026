import 'dotenv/config';

const env = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Brak zmiennej środowiskowej ${key}`);
  return v;
};

export const config = {
  openaiApiKey: env('OPENAI_API_KEY'),
  brokerUrl: env('BROKER_URL', 'ws://localhost:8080'),
  sampleRate: Number(env('AUDIO_SAMPLE_RATE', '16000')) as 16000 | 24000,
  wakeWord: env('WAKE_WORD', 'Asystencie'),
  assistantName: env('ASSISTANT_NAME', 'Asystent'),
  voice: env('VOICE', 'marin'),
  language: env('LANGUAGE', 'pl'),
  delegation: {
    requestWindowMs: Number(env('DELEGATION_REQUEST_WINDOW_S', '20')) * 1000,
    contextWindowMs: Number(env('DELEGATION_CONTEXT_WINDOW_S', '180')) * 1000,
  },
};
