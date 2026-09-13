import { config } from '../config.js';

export interface AgentRequest {
  prompt: string;          // co user chce (z transkryptu)
  context: {
    recentTranscript: string;
    screenDescription?: string;
    screenJpegBase64?: string;
    userProfile: string;
    sessionId: string;
  };
}

export interface AgentResponse {
  text: string;            // krótki wynik do wypowiedzenia (fakty, status)
  ok: boolean;             // czy akcja się powiodła / czy to odpowiedź, nie błąd
  raw?: unknown;
}

export interface AgentClient {
  run(req: AgentRequest, onProgress?: (msg: string) => void): Promise<AgentResponse>;
}

/**
 * Adapter do Twojego agenta z MCP. Zakładany kontrakt:
 *   POST $AGENT_URL  { prompt, context }  ->  { text, ok }
 * Jeśli Twój agent ma inne API (streaming, SSE, inne pola) — zmieniasz TYLKO ten plik.
 */
export class HttpAgentClient implements AgentClient {
  constructor(private url: string, private apiKey: string | null) {}

  async run(req: AgentRequest, onProgress?: (msg: string) => void): Promise<AgentResponse> {
    onProgress?.('Przekazuję do agenta.');
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { text: `Agent zwrócił błąd ${res.status}.`, ok: false };
    const data = (await res.json()) as Partial<AgentResponse> & Record<string, unknown>;
    return { text: String(data.text ?? data.output ?? data.result ?? ''), ok: data.ok !== false, raw: data };
  }
}

/** Do testów bez agenta. */
export class MockAgentClient implements AgentClient {
  async run(req: AgentRequest): Promise<AgentResponse> {
    await new Promise((r) => setTimeout(r, 1200));
    const p = req.prompt.toLowerCase();
    if (/ekran|wykres|slajd|widzisz/.test(p)) {
      return { text: req.context.screenDescription ? `Na ekranie: ${req.context.screenDescription}` : 'Nie widzę teraz udostępnionego ekranu.', ok: true };
    }
    if (/follow|spotkanie|zaplanuj|kalendarz/.test(p)) {
      return { text: 'Zaplanowałem follow-up na czwartek o 14:00 i wysłałem zaproszenia do zespołu.', ok: true };
    }
    if (/zadanie|task|todo/.test(p)) {
      return { text: 'Dodałem zadanie do listy.', ok: true };
    }
    return { text: 'Zrozumiałem prośbę, ale w trybie testowym nie mam podpiętego agenta.', ok: true };
  }
}

export function createAgentClient(): AgentClient {
  if (config.agent.url) {
    console.log(`[agent] HTTP -> ${config.agent.url}`);
    return new HttpAgentClient(config.agent.url, config.agent.apiKey);
  }
  console.log('[agent] MOCK (ustaw AGENT_URL, żeby podpiąć prawdziwego agenta)');
  return new MockAgentClient();
}
