import WebSocket from 'ws';
import type { BrokerMessage, Channel } from './types.js';
import { config } from './config.js';

type Handler = (msg: BrokerMessage) => void;

/**
 * Cienki klient WebSocket z auto-reconnectem i kolejką na czas rozłączenia.
 * Jeśli zespół wybierze Redis pub/sub zamiast WS, wymieniasz tylko ten plik.
 */
export class Broker {
  private ws?: WebSocket;
  private handlers = new Map<Channel, Handler[]>();
  private queue: string[] = [];
  private closed = false;

  constructor(private url = config.brokerUrl) {}

  connect(): Promise<void> {
    return new Promise((resolve) => {
      const open = () => {
        this.ws = new WebSocket(this.url);
        this.ws.on('open', () => {
          console.log(`[broker] połączono z ${this.url}`);
          for (const m of this.queue.splice(0)) this.ws!.send(m);
          resolve();
        });
        this.ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as BrokerMessage;
            for (const h of this.handlers.get(msg.channel) ?? []) h(msg);
          } catch (e) {
            console.warn('[broker] zły JSON', e);
          }
        });
        this.ws.on('close', () => {
          if (this.closed) return;
          console.warn('[broker] rozłączono, retry za 2s');
          setTimeout(open, 2000);
        });
        this.ws.on('error', (e) => console.warn('[broker] błąd', e.message));
      };
      open();
    });
  }

  publish<T extends BrokerMessage>(msg: Omit<T, 'ts' | 'sessionId'>): void {
    const full = JSON.stringify({ ...msg, ts: Date.now(), sessionId: config.sessionId });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(full);
    else this.queue.push(full);
  }

  subscribe(channel: Channel, handler: Handler): void {
    this.handlers.set(channel, [...(this.handlers.get(channel) ?? []), handler]);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
