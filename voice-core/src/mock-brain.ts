import WebSocket from 'ws';
import type { BrokerMessage, ToolCallMessage, ToolResultMessage } from '../../shared/types.js';

/**
 * Udaje osobę C: na każdy tool_call odpowiada po 1,5 s stałym wynikiem.
 * Pozwala przetestować pełną pętlę głos -> delegacja -> mowa bez prawdziwego agenta.
 */
const url = process.env.BROKER_URL ?? 'ws://localhost:8080';
const ws = new WebSocket(url);
ws.on('open', () => console.log(`[mock-brain] podłączony do ${url}`));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString()) as BrokerMessage;
  if (msg.channel !== 'tool_call') return;
  const call = msg as ToolCallMessage;
  console.log(`[mock-brain] tool_call ${call.delegationId}: ${call.request.slice(-120)}`);
  setTimeout(() => {
    const result: Omit<ToolResultMessage, 'ts' | 'sessionId'> & { ts: number; sessionId: string } = {
      channel: 'tool_result', ts: Date.now(), sessionId: call.sessionId,
      delegationId: call.delegationId, mode: 'speak', done: true,
      content: 'Sprawdziłem: follow-up jest zaplanowany na czwartek o 14:00, zaproszenia poszły do zespołu.',
    };
    ws.send(JSON.stringify(result));
  }, 1500);
});
