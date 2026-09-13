import OpenAI from 'openai';
import { config } from './config.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

/** Jedno wywołanie Responses API z tekstem (i opcjonalnie obrazem), zwraca czysty tekst. */
export async function ask(model: string, instructions: string, text: string, jpegBase64?: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [{ type: 'input_text', text }];
  if (jpegBase64) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${jpegBase64}`, detail: 'low' });
  const res = await openai.responses.create({
    model,
    instructions,
    input: [{ role: 'user', content }],
  });
  return (res.output_text ?? '').trim();
}
