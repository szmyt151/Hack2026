import type { ScreenMessage, TranscriptMessage, NotesMessage } from '../../shared/types.js';

/**
 * Stan spotkania trzymany w brain — jedyne źródło prawdy dla agenta, notatek i panelu.
 */
export class MeetingState {
  transcript: { role: 'user' | 'assistant'; speaker?: string; text: string; ts: number }[] = [];
  lastScreen?: { jpegBase64: string; description?: string; ts: number; source: ScreenMessage['source'] };
  notes: NotesMessage[] = [];
  actionLog: { ts: number; delegationId: string; request: string; result?: string; ok?: boolean }[] = [];
  private lastNotesIndex = 0;

  pushTranscript(m: TranscriptMessage): void {
    const last = this.transcript[this.transcript.length - 1];
    // sklejamy delty tego samego mówcy w jedną linię
    if (last && last.role === m.role && last.speaker === m.speaker && m.ts - last.ts < 4000) {
      last.text += m.text;
      last.ts = m.ts;
    } else {
      this.transcript.push({ role: m.role, speaker: m.speaker, text: m.text, ts: m.ts });
    }
  }

  /** Transkrypt jako tekst; `sinceLastNotes` = tylko to, czego jeszcze nie podsumowaliśmy. */
  transcriptText(opts: { sinceLastNotes?: boolean; maxChars?: number } = {}): string {
    const from = opts.sinceLastNotes ? this.lastNotesIndex : 0;
    const lines = this.transcript.slice(from).map((l) => `${l.role === 'assistant' ? 'Asystent' : (l.speaker ?? 'Uczestnik')}: ${l.text.trim()}`);
    const text = lines.join('\n');
    return opts.maxChars && text.length > opts.maxChars ? text.slice(-opts.maxChars) : text;
  }

  markNotesTaken(): void { this.lastNotesIndex = this.transcript.length; }

  hasNewTranscriptSinceNotes(minChars = 200): boolean {
    return this.transcriptText({ sinceLastNotes: true }).length >= minChars;
  }
}
