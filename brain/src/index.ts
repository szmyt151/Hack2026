import { config } from './config.js';
import { Broker } from './broker.js';
import { MeetingState } from './state.js';
import { createAgentClient } from './agent/client.js';
import { VisionWorker } from './workers/vision.js';
import { NotesWorker } from './workers/notes.js';
import { DelegationWorker } from './workers/delegation.js';
import { startPanel } from './panel-server.js';
import type { ContextMessage, MeetingMessage, TranscriptMessage } from '../../shared/types.js';

/**
 * Brain (osoba C).
 *   broker[transcript] -> state (notatki, kontekst dla agenta)
 *   broker[screen]     -> vision -> broker[context] + state.lastScreen
 *   broker[tool_call]  -> agent (MCP) -> broker[tool_result]
 *   co 60 s            -> notes -> broker[notes]
 *   meeting:left       -> final notes -> agent: wyślij podsumowanie
 */
async function main() {
  const broker = new Broker();
  await broker.connect();

  const state = new MeetingState();
  const agent = createAgentClient();

  new VisionWorker(broker, state).start();
  new DelegationWorker(broker, state, agent).start();
  const notes = new NotesWorker(broker, state);

  broker.subscribe<TranscriptMessage>('transcript', (m) => state.pushTranscript(m));

  broker.subscribe<MeetingMessage>('meeting', async (m) => {
    if (m.event === 'joined') {
      notes.start();
      if (config.userProfile) {
        broker.publish<ContextMessage>({ channel: 'context', kind: 'user_profile', content: config.userProfile.slice(0, 1500) });
      }
    }
    if (m.event === 'left') {
      const final = await notes.final();
      if (final) {
        try {
          const res = await agent.run({
            prompt: 'Spotkanie się zakończyło. Wyślij poniższe notatki do chatu tego spotkania w Teams i zapisz je w Notion (lub innym skonfigurowanym miejscu). Nie pytaj o potwierdzenie.',
            context: {
              recentTranscript: JSON.stringify(final, null, 2),
              userProfile: config.userProfile,
              sessionId: m.sessionId,
            },
          });
          console.log(`[brain] podsumowanie wysłane: ${res.text}`);
        } catch (e) {
          console.warn('[brain] nie udało się wysłać podsumowania', (e as Error).message);
        }
      }
    }
  });

  startPanel(state, broker);

  const shutdown = () => { notes.stop(); broker.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log('[brain] gotowy');
}

main().catch((e) => { console.error(e); process.exit(1); });
