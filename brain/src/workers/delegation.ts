import type { Broker } from '../broker.js';
import type { MeetingState } from '../state.js';
import type { AgentClient } from '../agent/client.js';
import type { ToolCallMessage, ToolResultMessage } from '../../../shared/types.js';
import { config } from '../config.js';

/**
 * tool_call (od B) -> agent z MCP -> tool_result (do B).
 * W trakcie pracy wysyła ciche "thinking" z postępem, na końcu "speak" z wynikiem.
 */
export class DelegationWorker {
  constructor(private broker: Broker, private state: MeetingState, private agent: AgentClient) {}

  start(): void {
    this.broker.subscribe<ToolCallMessage>('tool_call', (m) => void this.handle(m));
  }

  private async handle(m: ToolCallMessage): Promise<void> {
    const entry: MeetingState['actionLog'][number] = { ts: Date.now(), delegationId: m.delegationId, request: m.request };
    this.state.actionLog.push(entry);
    console.log(`[delegation] ${m.delegationId}: ${m.request.slice(-160)}`);

    const reply = (mode: ToolResultMessage['mode'], content: string, done: boolean) =>
      this.broker.publish<ToolResultMessage>({ channel: 'tool_result', delegationId: m.delegationId, mode, content: content.slice(0, 1800), done });

    try {
      const screen = this.state.lastScreen;
      const res = await this.agent.run(
        {
          prompt: m.request,
          context: {
            recentTranscript: m.recentTranscript,
            screenDescription: screen?.description,
            screenJpegBase64: screen && Date.now() - screen.ts < 2 * 60_000 ? screen.jpegBase64 : undefined,
            userProfile: config.userProfile,
            sessionId: m.sessionId,
          },
        },
        (progress) => reply('thinking', progress, false),
      );
      entry.result = res.text; entry.ok = res.ok;
      reply('speak', res.text || 'Zrobione.', true);
    } catch (e) {
      entry.result = (e as Error).message; entry.ok = false;
      reply('speak', 'Nie udało się wykonać tej akcji. Spróbujmy jeszcze raz za chwilę.', true);
    }
  }
}
