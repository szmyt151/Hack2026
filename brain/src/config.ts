import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';

const env = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Brak zmiennej środowiskowej ${key}`);
  return v;
};

const profilePath = env('USER_PROFILE_FILE', './user-profile.md');

export const config = {
  openaiApiKey: env('OPENAI_API_KEY'),
  brokerUrl: env('BROKER_URL', 'ws://localhost:8080'),
  agent: {
    url: process.env.AGENT_URL || null,
    apiKey: process.env.AGENT_API_KEY || null,
  },
  visionModel: env('VISION_MODEL', 'gpt-5.6-luna'),
  notesModel: env('NOTES_MODEL', 'gpt-5.6-luna'),
  userProfile: existsSync(profilePath) ? readFileSync(profilePath, 'utf8') : '',
  notesIntervalMs: Number(env('NOTES_INTERVAL_S', '60')) * 1000,
  panelPort: Number(env('PANEL_PORT', '3000')),
};
