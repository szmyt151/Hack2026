import type { Broker } from '../broker.js';
import type { MeetingState } from '../state.js';
import type { ContextMessage, ScreenMessage } from '../../../shared/types.js';
import { ask } from '../openai.js';
import { config } from '../config.js';

const INSTRUCTIONS = `Opisujesz zrzut ekranu ze spotkania online dla asystenta głosowego, który go nie widzi.
Zwróć 2–4 zdania po polsku: co to jest (slajd, wykres, tabela, kod, dokument), kluczowe liczby/tytuły/etykiety, i co jest istotne dla rozmowy.
Jeśli to tylko kafelki uczestników bez udostępnionej treści, napisz dokładnie: "Brak udostępnionej treści."
Bez wstępów, bez markdown.`;

/**
 * Każda klatka `screen` -> opis tekstowy -> broker[context] (B wstrzykuje do gpt-live-1 jako thinking).
 * Ostatnia klatka + opis zostają w state (agent dostaje je przy tool_call).
 */
export class VisionWorker {
  private busy = false;
  private pending?: ScreenMessage;

  constructor(private broker: Broker, private state: MeetingState) {}

  start(): void {
    this.broker.subscribe<ScreenMessage>('screen', (m) => {
      this.state.lastScreen = { jpegBase64: m.data, ts: m.ts, source: m.source, description: this.state.lastScreen?.description };
      if (this.busy) { this.pending = m; return; } // trzymamy tylko najnowszą
      void this.describe(m);
    });
  }

  private async describe(m: ScreenMessage): Promise<void> {
    this.busy = true;
    try {
      const text = await ask(config.visionModel, INSTRUCTIONS, `Źródło: ${m.source}. Opisz ekran.`, m.data);
      if (this.state.lastScreen && this.state.lastScreen.ts === m.ts) this.state.lastScreen.description = text;
      if (!/^Brak udostępnionej treści/.test(text)) {
        this.broker.publish<ContextMessage>({ channel: 'context', kind: 'screen', content: `Aktualnie na ekranie: ${text}` });
      }
      console.log(`[vision] ${text.slice(0, 120)}`);
    } catch (e) {
      console.warn('[vision] błąd', (e as Error).message);
    } finally {
      this.busy = false;
      if (this.pending) { const p = this.pending; this.pending = undefined; void this.describe(p); }
    }
  }
}
