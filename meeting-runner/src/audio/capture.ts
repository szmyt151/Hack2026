import { spawn, type ChildProcess } from 'node:child_process';
import type { Broker } from '../broker.js';
import type { AudioMessage } from '../types.js';
import { config } from '../config.js';
import type { SpeakerTracker } from '../browser/speaker.js';

/**
 * Przechwytuje dźwięk spotkania z monitora sinka PulseAudio (to, co "słyszy" Chromium)
 * i publikuje PCM s16le mono na kanał `audio` w kawałkach po AUDIO_CHUNK_MS.
 */
export class AudioCapture {
  private proc?: ChildProcess;

  constructor(private broker: Broker, private speakers?: SpeakerTracker) {}

  start(): void {
    const { sinkMeeting, inSampleRate, chunkMs } = config.audio;
    const bytesPerChunk = (inSampleRate * 2 * chunkMs) / 1000; // 16-bit mono

    this.proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'pulse', '-i', `${sinkMeeting}.monitor`,
      '-ac', '1', '-ar', String(inSampleRate),
      '-f', 's16le', 'pipe:1',
    ]);

    let buf = Buffer.alloc(0);
    this.proc.stdout!.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= bytesPerChunk) {
        const slice = buf.subarray(0, bytesPerChunk);
        buf = buf.subarray(bytesPerChunk);
        this.broker.publish<AudioMessage>({
          channel: 'audio',
          format: 'pcm_s16le',
          sampleRate: inSampleRate,
          channels: 1,
          data: slice.toString('base64'),
          speaker: this.speakers?.current ?? undefined,
        });
      }
    });
    this.proc.stderr!.on('data', (d) => console.warn('[capture]', d.toString().trim()));
    this.proc.on('exit', (code) => console.warn(`[capture] ffmpeg zakończył się (${code})`));
    console.log(`[capture] nagrywam z ${sinkMeeting}.monitor @ ${inSampleRate}Hz`);
  }

  stop(): void {
    this.proc?.kill('SIGINT');
  }
}
