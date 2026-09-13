import OpenAI from 'openai';
import { LiveWS } from 'openai/resources/live/ws';
import { config } from './config.js';
import { buildInstructions } from './prompt.js';

/**
 * Cienka warstwa nad sesją gpt-live-1 (WebSocket, client delegation).
 * Docs:
 *  - https://developers.openai.com/api/docs/guides/voice-websockets?api=live
 *  - https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client
 *
 * Eventy typujemy luźno (any) — SDK 7.15 ma typy, ale API jest świeże i nazwy pól mogą się przesuwać.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LiveEvent = any;

export interface LiveHandlers {
  onStarted(sessionId: string): void;
  onOutputAudio(pcmBase64: string): void;
  onInputTranscript(delta: string, startMs?: number, endMs?: number): void;
  onOutputTranscript(delta: string, startMs?: number, endMs?: number): void;
  onDelegation(delegationId: string): void;
  onClosed(usage: unknown): void;
  onError(err: unknown): void;
}

export class LiveSession {
  private ws: LiveWS;
  private started = false;
  private seq = 0;

  constructor(private handlers: LiveHandlers) {
    this.ws = new LiveWS(new OpenAI({ apiKey: config.openaiApiKey }));

    this.ws.socket.on('open', () => {
      this.ws.send({
        type: 'session.start',
        event_id: 'event_start',
        session: {
          model: 'gpt-live-1',
          instructions: buildInstructions(),
          audio: {
            format: { type: 'audio/pcm', rate: config.sampleRate },
            output: { voice: config.voice },
          },
          delegation: { type: 'client' },
        },
      } as LiveEvent);
    });

    this.ws.on('event', (event: LiveEvent) => {
      switch (event.type) {
        case 'session.started':
          this.started = true;
          handlers.onStarted(event.session?.id ?? '?');
          break;
        case 'session.output_audio.delta':
          handlers.onOutputAudio(event.delta);
          break;
        case 'session.input_transcript.delta':
          handlers.onInputTranscript(event.delta, event.start_ms, event.end_ms);
          break;
        case 'session.output_transcript.delta':
          handlers.onOutputTranscript(event.delta, event.start_ms, event.end_ms);
          break;
        case 'session.delegation.created':
          handlers.onDelegation(event.delegation?.id);
          break;
        case 'session.closed':
          handlers.onClosed(event.usage);
          break;
        case 'error':
          handlers.onError(event);
          break;
        case 'session.thinking.appended':
        case 'session.commentary.appended':
        case 'session.instructions.appended':
          break; // ack — nic nie robimy
        default:
          if (process.env.LIVE_DEBUG) console.error('[live]', JSON.stringify(event).slice(0, 300));
      }
    });

    this.ws.on('error', (e: unknown) => handlers.onError(e));
  }

  get isStarted(): boolean { return this.started; }

  private id(prefix: string): string { return `${prefix}_${++this.seq}`; }

  /** PCM s16le mono w skonfigurowanym sample rate. Długość w bajtach musi być parzysta. */
  appendAudio(pcm: Buffer): void {
    if (!this.started || this.ws.socket.readyState !== 1) return;
    const even = pcm.length - (pcm.length % 2);
    if (!even) return;
    this.ws.send({ type: 'session.input_audio.append', audio: pcm.subarray(0, even).toString('base64') } as LiveEvent);
  }

  /** Wynik, który model ma WYPOWIEDZIEĆ (parafrazując). */
  commentary(delegationId: string | null, content: string): void {
    this.ws.send({ type: 'session.commentary.append', event_id: this.id('commentary'), delegation_id: delegationId, content } as LiveEvent);
  }

  /** Cicha informacja do kontekstu — model nie mówi tego sam z siebie. */
  thinking(delegationId: string | null, content: string): void {
    this.ws.send({ type: 'session.thinking.append', event_id: this.id('thinking'), delegation_id: delegationId, content } as LiveEvent);
  }

  /** Dodatkowa instrukcja systemowa (może przerwać mowę). */
  instructions(content: string): void {
    this.ws.send({ type: 'session.instructions.append', event_id: this.id('instr'), delegation_id: null, content } as LiveEvent);
  }

  mute(): void { this.ws.send({ type: 'session.input_audio.mute' } as LiveEvent); }
  unmute(): void { this.ws.send({ type: 'session.input_audio.unmute' } as LiveEvent); }

  close(): void {
    if (this.started && this.ws.socket.readyState === 1) this.ws.send({ type: 'session.close' } as LiveEvent);
    else this.ws.close();
  }
}
