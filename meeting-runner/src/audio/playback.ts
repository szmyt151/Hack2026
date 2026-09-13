import { spawn, type ChildProcess } from 'node:child_process';
import type { Broker } from '../broker.js';
import type { AudioMessage } from '../types.js';
import { config } from '../config.js';

/**
 * Odbiera `tts_audio` (PCM z gpt-live-1) i wpuszcza je do sinka `assistant_mic`.
 * Chromium ma ustawione PULSE_SOURCE=assistant_mic.monitor, więc Teams słyszy to jako mikrofon.
 */
export class AudioPlayback {
  private proc?: ChildProcess;

  constructor(private broker: Broker) {}

  start(): void {
    const { sinkAssistant, outSampleRate } = config.audio;
    this.proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-f', 's16le', '-ar', String(outSampleRate), '-ac', '1', '-i', 'pipe:0',
      '-f', 'pulse', '-device', sinkAssistant, 'assistant',
    ]);
    this.proc.stderr!.on('data', (d) => console.warn('[playback]', d.toString().trim()));
    this.proc.on('exit', (code) => console.warn(`[playback] ffmpeg zakończył się (${code})`));

    this.broker.subscribe('tts_audio', (msg) => {
      const m = msg as AudioMessage;
      if (m.sampleRate !== outSampleRate) {
        console.warn(`[playback] sampleRate ${m.sampleRate} != ${outSampleRate}, pomijam chunk`);
        return;
      }
      this.proc?.stdin?.write(Buffer.from(m.data, 'base64'));
    });
    console.log(`[playback] gotowy, piszę do sinka ${sinkAssistant}`);
  }

  stop(): void {
    this.proc?.stdin?.end();
    this.proc?.kill('SIGINT');
  }
}
