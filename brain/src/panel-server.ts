import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { MeetingState } from './state.js';
import type { Broker } from './broker.js';
import { config } from './config.js';
import type { BrokerMessage } from '../../shared/types.js';

/**
 * Panel demo: http://localhost:3000
 * Serwuje panel/index.html i pcha przez WS: pełny stan przy połączeniu + każdą wiadomość z brokera na żywo.
 */
export function startPanel(state: MeetingState, broker: Broker): void {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'panel');
  const html = readFileSync(join(dir, 'index.html'));

  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', transcript: state.transcript, notes: state.notes, actionLog: state.actionLog, screen: state.lastScreen ? { description: state.lastScreen.description, ts: state.lastScreen.ts, jpegBase64: state.lastScreen.jpegBase64 } : null }));
  });

  const relay = (m: BrokerMessage) => {
    const payload = JSON.stringify({ type: 'event', message: m.channel === 'audio' || m.channel === 'tts_audio' ? { channel: m.channel, ts: m.ts } : m });
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(payload);
  };
  for (const ch of ['transcript', 'screen', 'tool_call', 'tool_result', 'notes', 'meeting', 'context'] as const) {
    broker.subscribe(ch, relay);
  }

  server.listen(config.panelPort, () => console.log(`[panel] http://localhost:${config.panelPort}`));
}
