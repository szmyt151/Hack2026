import type { Broker } from '../broker.js';
import type { MeetingState } from '../state.js';
import type { NotesMessage } from '../../../shared/types.js';
import { ask } from '../openai.js';
import { config } from '../config.js';

const INSTRUCTIONS = `Jesteś sekretarzem spotkania. Dostajesz fragment transkryptu (może zawierać błędy rozpoznawania mowy) i poprzednie notatki.
Zwróć WYŁĄCZNIE JSON bez markdown, w formacie:
{"summary": "2-3 zdania", "decisions": ["..."], "actionItems": [{"owner": "imię lub null", "text": "..."}], "openQuestions": ["..."]}
Zasady: po polsku; łącz z poprzednimi notatkami (nie gub wcześniejszych decyzji); nie wymyślaj; puste listy są OK.`;

/**
 * Co NOTES_INTERVAL_S: nowy fragment transkryptu + poprzednie notatki -> zaktualizowane notatki -> broker[notes].
 * `final()` na koniec spotkania robi ostatnie podsumowanie.
 */
export class NotesWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private broker: Broker, private state: MeetingState) {}

  start(): void {
    this.timer = setInterval(() => void this.tick('interim'), config.notesIntervalMs);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  async final(): Promise<NotesMessage | undefined> {
    this.stop();
    return this.tick('final', true);
  }

  private async tick(kind: 'interim' | 'final', force = false): Promise<NotesMessage | undefined> {
    if (this.running) return;
    if (!force && !this.state.hasNewTranscriptSinceNotes()) return;
    this.running = true;
    try {
      const prev = this.state.notes[this.state.notes.length - 1];
      const fragment = this.state.transcriptText({ sinceLastNotes: true, maxChars: 12000 });
      if (!fragment && !prev) return;
      const raw = await ask(config.notesModel, INSTRUCTIONS,
        `POPRZEDNIE NOTATKI:\n${prev ? JSON.stringify({ summary: prev.summary, decisions: prev.decisions, actionItems: prev.actionItems, openQuestions: prev.openQuestions }) : 'brak'}\n\nNOWY FRAGMENT TRANSKRYPTU:\n${fragment || '(brak nowych wypowiedzi)'}`);
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Omit<NotesMessage, 'channel' | 'ts' | 'sessionId' | 'kind'>;
      const notes: Omit<NotesMessage, 'ts' | 'sessionId'> = {
        channel: 'notes', kind,
        summary: parsed.summary ?? '', decisions: parsed.decisions ?? [],
        actionItems: parsed.actionItems ?? [], openQuestions: parsed.openQuestions ?? [],
      };
      this.state.markNotesTaken();
      this.broker.publish<NotesMessage>(notes);
      const full = { ...notes, ts: Date.now(), sessionId: this.broker.sessionId } as NotesMessage;
      this.state.notes.push(full);
      console.log(`[notes] ${kind}: ${notes.summary.slice(0, 100)} | decyzje ${notes.decisions.length}, zadania ${notes.actionItems.length}`);
      return full;
    } catch (e) {
      console.warn('[notes] błąd', (e as Error).message);
      return undefined;
    } finally {
      this.running = false;
    }
  }
}
