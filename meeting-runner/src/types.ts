/**
 * Kontrakt wiadomości na brokerze (WebSocket, JSON).
 * Ustalony w H0–1 z osobami B i C — zmieniać tylko wspólnie.
 */

export type Channel =
  | 'audio'        // A -> B: PCM ze spotkania
  | 'tts_audio'    // B -> A: PCM z gpt-live-1 do wpuszczenia na mikrofon
  | 'screen'       // A -> C: klatka ekranu (jpeg base64)
  | 'transcript'   // B -> C
  | 'tool_call'    // B -> C
  | 'tool_result'  // C -> B
  | 'notes'        // C -> wszyscy
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
}

export interface ScreenMessage extends BaseMessage {
  channel: 'screen';
  format: 'jpeg';
  width: number;
  height: number;
  data: string;        // base64 JPEG
  changeRatio: number; // 0..1 — ile pikseli zmieniło się vs poprzednia klatka
}

export interface MeetingMessage extends BaseMessage {
  channel: 'meeting';
  event: 'joining' | 'in_lobby' | 'joined' | 'left' | 'error';
  detail?: string;
}

export type BrokerMessage =
  | AudioMessage
  | ScreenMessage
  | MeetingMessage
  | (BaseMessage & Record<string, unknown>);
