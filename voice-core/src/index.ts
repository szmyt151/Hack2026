import { config } from './config.js';
import { Broker } from './broker.js';
import { LiveSession } from './live.js';
import { TranscriptBuffer } from './transcript.js';
import type {
  AudioMessage, ContextMessage, MeetingMessage, ToolCallMessage, ToolResultMessage,
} from '../../shared/types.js';

/**
 * Voice Core (osoba B).
 *   broker[audio]      -> gpt-live-1 (session.input_audio.append)
 *   gpt-live-1 audio   -> broker[tts_audio]
 *   gpt-live-1 transkrypt -> broker[transcript]
 *   gpt-live-1 delegacja  -> broker[tool_call]  (z treścią prośby złożoną z transkryptu)
 *   broker[tool_result]   -> gpt-live-1 (commentary/thinking.append z delegation_id)
 *   broker[context]       -> gpt-live-1 (thinking.append, delegation_id null)
 */
async function main() {
  const broker = new Broker();
  await broker.connect();

  const transcript = new TranscriptBuffer(broker);
  let live: LiveSession | undefined;
  const pendingDelegations = new Set<string>();

  const startLive = () => {
    if (live) return;
    live = new LiveSession({
      onStarted: (id) => console.log(`[live] sesja ${id} gotowa (${config.sampleRate} Hz)`),
      onOutputAudio: (b64) =>
        broker.publish<AudioMessage>({ channel: 'tts_audio', format: 'pcm_s16le', sampleRate: config.sampleRate, channels: 1, data: b64 }),
      onInputTranscript: (d, s, e) => transcript.push('user', d, s, e),
      onOutputTranscript: (d, s, e) => transcript.push('assistant', d, s, e),
      onDelegation: (delegationId) => {
        if (!delegationId) return;
        pendingDelegations.add(delegationId);
        const request = transcript.window(config.delegation.requestWindowMs);
        const recentTranscript = transcript.window(config.delegation.contextWindowMs);
        console.log(`[live] delegacja ${delegationId}: "${request.slice(-160)}"`);
        broker.publish<ToolCallMessage>({ channel: 'tool_call', delegationId, request, recentTranscript });
        // Gdyby C milczał >25 s, model nie powinien wisieć w ciszy
        setTimeout(() => {
          if (pendingDelegations.has(delegationId)) {
            live?.commentary(delegationId, 'Backend nie odpowiedział na czas. Powiedz krótko, że nie udało się sprawdzić i zaproponuj powtórzenie.');
            pendingDelegations.delete(delegationId);
          }
        }, 25_000);
      },
      onClosed: (usage) => { console.log('[live] zamknięta, usage:', JSON.stringify(usage)); live = undefined; },
      onError: (e) => console.error('[live] błąd', JSON.stringify(e).slice(0, 500)),
    });
  };

  // Audio ze spotkania -> model
  broker.subscribe<AudioMessage>('audio', (m) => {
    if (m.sampleRate !== config.sampleRate) {
      console.warn(`[audio] sampleRate ${m.sampleRate} != ${config.sampleRate}; ustaw AUDIO_IN_SAMPLE_RATE w meeting-runner`);
      return;
    }
    if (m.speaker) transcript.currentSpeaker = m.speaker;
    live?.appendAudio(Buffer.from(m.data, 'base64'));
  });

  // Wyniki od C -> model
  broker.subscribe<ToolResultMessage>('tool_result', (m) => {
    if (!live) return;
    if (m.mode === 'speak') live.commentary(m.delegationId, m.content);
    else live.thinking(m.delegationId, m.content);
    if (m.done) pendingDelegations.delete(m.delegationId);
  });

  // Kontekst tła od C (ekran, profil usera) -> model, cicho
  broker.subscribe<ContextMessage>('context', (m) => {
    live?.thinking(null, `[${m.kind}] ${m.content}`.slice(0, 1800));
  });

  // Cykl życia spotkania
  broker.subscribe<MeetingMessage>('meeting', (m) => {
    switch (m.event) {
      case 'joined':
        startLive();
        live?.instructions('Właśnie dołączyłeś do spotkania. Przedstaw się jednym zdaniem: kim jesteś i że nagrywasz rozmowę na potrzeby notatek. Potem milcz, aż ktoś Cię zawoła.');
        break;
      case 'reconnecting':
        live?.mute();
        break;
      case 'left':
        live?.close();
        break;
    }
  });

  // Tryb dev: bez A — startujemy sesję od razu, żeby testować z lokalnym mikrofonem (scripts/mic.sh)
  if (process.env.START_IMMEDIATELY === '1') startLive();

  const shutdown = () => { live?.close(); setTimeout(() => { broker.close(); process.exit(0); }, 1500); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log('[voice-core] gotowy, czekam na meeting:joined (lub START_IMMEDIATELY=1)');
}

main().catch((e) => { console.error(e); process.exit(1); });
