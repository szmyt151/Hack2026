import type { Broker } from './broker.js';
import type { TranscriptMessage } from '../../shared/types.js';

interface Fragment { role: 'user' | 'assistant'; text: string; ts: number; speaker?: string }

/**
 * Bufor transkryptu — potrzebny, bo w client delegation event `session.delegation.created`
 * NIE zawiera treści prośby usera. Składamy ją sami z ostatnich fragmentów.
 */
export class TranscriptBuffer {
  private fragments: Fragment[] = [];
  currentSpeaker?: string; // aktualizowane z chunków `audio` (pole speaker od osoby A)

  constructor(private broker: Broker, private maxAgeMs = 30 * 60 * 1000) {}

  push(role: 'user' | 'assistant', text: string, startMs?: number, endMs?: number): void {
    if (!text) return;
    const speaker = role === 'user' ? this.currentSpeaker : undefined;
    this.fragments.push({ role, text, ts: Date.now(), speaker });
    const cutoff = Date.now() - this.maxAgeMs;
    while (this.fragments.length && this.fragments[0].ts < cutoff) this.fragments.shift();

    this.broker.publish<TranscriptMessage>({ channel: 'transcript', role, text, speaker, startMs, endMs });
  }

  /** Tekst z ostatnich `windowMs` ms, sklejony w linie "Kto: co". */
  window(windowMs: number): string {
    const cutoff = Date.now() - windowMs;
    const lines: string[] = [];
    let cur: { key: string; parts: string[] } | null = null;
    for (const f of this.fragments) {
      if (f.ts < cutoff) continue;
      const key = f.role === 'assistant' ? 'Asystent' : (f.speaker ?? 'Uczestnik');
      if (cur && cur.key === key) cur.parts.push(f.text);
      else { if (cur) lines.push(`${cur.key}: ${cur.parts.join('')}`); cur = { key, parts: [f.text] }; }
    }
    if (cur) lines.push(`${cur.key}: ${cur.parts.join('')}`);
    return lines.join('\n').trim();
  }
}
