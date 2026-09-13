/**
 * KANONICZNY kontrakt wiadomości na brokerze (WebSocket, JSON).
 * Kopia w meeting-runner/src/types.ts musi być z nim zgodna — zmieniać tylko wspólnie.
 *
 * Przepływ:
 *   A (meeting-runner)  --audio, screen, meeting-->  broker
 *   B (voice-core)      --transcript, tts_audio, tool_call-->  broker
 *   C (brain)           --tool_result, context, notes-->  broker
 */

export type Channel =
  | 'audio'        // A -> B: PCM ze spotkania
  | 'tts_audio'    // B -> A: PCM z gpt-live-1 do wpuszczenia na mikrofon
  | 'screen'       // A -> C: klatka ekranu (jpeg base64)
  | 'transcript'   // B -> C: fragmenty transkryptu (user/assistant)
  | 'tool_call'    // B -> C: delegacja z gpt-live-1 (co user chce)
  | 'tool_result'  // C -> B: wynik do wypowiedzenia / cicha informacja
  | 'context'      // C -> B: kontekst tła (opis ekranu, profil usera) — model nie mówi tego na głos
  | 'notes'        // C -> wszyscy: notatki / action items
  | 'meeting';     // A -> wszyscy: zdarzenia stanu spotkania

export interface BaseMessage {
  channel: Channel;
  ts: number;          // epoch ms
  sessionId: string;   // jedno spotkanie = jedna sesja
}

export interface AudioMessage extends BaseMessage {
  channel: 'audio' | 'tts_audio';
  format: 'pcm_s16le';
  sampleRate: number;
  channels: 1;
  data: string;        // base64 PCM
  speaker?: string;    // tylko `audio`: nazwa aktywnego mówcy z DOM Teams
}

export interface ScreenMessage extends BaseMessage {
  channel: 'screen';
  format: 'jpeg';
  width: number;
  height: number;
  data: string;        // base64 JPEG
  changeRatio: number;
  source: 'shared_screen' | 'full_page';
}

export interface MeetingMessage extends BaseMessage {
  channel: 'meeting';
  event: 'joining' | 'in_lobby' | 'joined' | 'reconnecting' | 'left' | 'error';
  detail?: string;
}

export interface TranscriptMessage extends BaseMessage {
  channel: 'transcript';
  role: 'user' | 'assistant';
  text: string;        // fragment (delta) — C skleja
  speaker?: string;    // dla role=user: kto mówił (z ostatniego chunku audio)
  startMs?: number;
  endMs?: number;
}

export interface ToolCallMessage extends BaseMessage {
  channel: 'tool_call';
  delegationId: string;      // id z gpt-live-1 — wrócić w tool_result bez zmian
  request: string;           // ostatnie N sekund transkryptu (co user powiedział)
  recentTranscript: string;  // dłuższy kontekst rozmowy
}

export interface ToolResultMessage extends BaseMessage {
  channel: 'tool_result';
  delegationId: string;
  mode: 'speak' | 'thinking'; // speak = commentary.append (model mówi), thinking = cicha informacja
  content: string;            // max ~500 tokenów — krótko, fakty
  done: boolean;              // false = "jeszcze pracuję", true = wynik końcowy
}

export interface ContextMessage extends BaseMessage {
  channel: 'context';
  kind: 'screen' | 'user_profile' | 'meeting_info' | 'other';
  content: string;            // plain text, max ~500 tokenów
}

export interface NotesMessage extends BaseMessage {
  channel: 'notes';
  kind: 'interim' | 'final';
  summary: string;
  decisions: string[];
  actionItems: { owner?: string; text: string }[];
  openQuestions: string[];
}

export type BrokerMessage =
  | AudioMessage
  | ScreenMessage
  | MeetingMessage
  | TranscriptMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextMessage
  | NotesMessage;
