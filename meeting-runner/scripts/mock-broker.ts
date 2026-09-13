import { WebSocketServer, WebSocket } from 'ws';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

/**
 * Mock hub do testowania osoby A bez B i C.
 * - broadcastuje każdą wiadomość do wszystkich klientów,
 * - zapisuje audio do out/audio.pcm (odsłuchasz: ffplay -f s16le -ar 16000 -ac 1 out/audio.pcm),
 * - zapisuje klatki ekranu do out/screen-N.jpg,
 * - ECHO TEST: po 2 s odsyła odebrane audio jako `tts_audio` (24 kHz nie pasuje do 16 kHz,
 *   więc runner je pominie — ustaw AUDIO_OUT_SAMPLE_RATE=16000, żeby usłyszeć echo w Teams).
 */
const port = Number(process.env.PORT ?? 8080);
mkdirSync('out', { recursive: true });
writeFileSync('out/audio.pcm', '');
let frame = 0;
let lastSpeaker: string | undefined;

const wss = new WebSocketServer({ port });
wss.on('connection', (ws) => {
  console.log('[mock] klient podłączony');
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    for (const c of wss.clients) if (c !== ws && c.readyState === WebSocket.OPEN) c.send(raw.toString());

    switch (msg.channel) {
      case 'audio':
        appendFileSync('out/audio.pcm', Buffer.from(msg.data, 'base64'));
        if (msg.speaker && msg.speaker !== lastSpeaker) { lastSpeaker = msg.speaker; console.log(`[mock] mówi: ${msg.speaker}`); }
        if (process.env.ECHO === '1') {
          setTimeout(() => ws.send(JSON.stringify({ ...msg, channel: 'tts_audio' })), 2000);
        }
        break;
      case 'screen':
        writeFileSync(`out/screen-${++frame}.jpg`, Buffer.from(msg.data, 'base64'));
        console.log(`[mock] klatka ${frame} [${msg.source}] (${msg.width}x${msg.height}, zmiana ${(msg.changeRatio * 100).toFixed(1)}%)`);
        break;
      case 'meeting':
        console.log(`[mock] meeting: ${msg.event} ${msg.detail ?? ''}`);
        break;
      default:
        console.log(`[mock] ${msg.channel}`);
    }
  });
});
console.log(`[mock] broker na ws://localhost:${port}  (ECHO=1 włącza echo audio)`);
