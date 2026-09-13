import { config } from './config.js';
import { Broker } from './broker.js';
import { launchUserContext, joinMeeting, leaveMeeting, isInMeeting } from './browser/join.js';
import { AudioCapture } from './audio/capture.js';
import { AudioPlayback } from './audio/playback.js';
import { ScreenCapture } from './screen/capture.js';
import type { MeetingMessage } from './types.js';

/**
 * Meeting Runner (osoba A).
 * Przepływ: broker -> przeglądarka jako user -> join -> audio in/out + screenshoty -> broker.
 */
async function main() {
  // Chromium bierze urządzenia z PulseAudio na podstawie tych zmiennych.
  process.env.PULSE_SINK = config.audio.sinkMeeting;
  process.env.PULSE_SOURCE = `${config.audio.sinkAssistant}.monitor`;

  const broker = new Broker();
  await broker.connect();
  const meeting = (event: MeetingMessage['event'], detail?: string) =>
    broker.publish<MeetingMessage>({ channel: 'meeting', event, detail });

  const playback = new AudioPlayback(broker);
  playback.start(); // odpalamy przed joinem, żeby mikrofon istniał od początku

  meeting('joining', config.meetingUrl);
  const context = await launchUserContext();
  const page = await joinMeeting(context, {
    onLobby: () => meeting('in_lobby'),
    onJoined: () => meeting('joined'),
  });

  const capture = new AudioCapture(broker);
  capture.start();
  const screen = new ScreenCapture(page, broker);
  screen.start();

  const shutdown = async (reason: string) => {
    console.log(`[runner] kończę: ${reason}`);
    screen.stop();
    capture.stop();
    playback.stop();
    await leaveMeeting(page).catch(() => {});
    meeting('left', reason);
    await new Promise((r) => setTimeout(r, 500));
    broker.close();
    await context.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Wykrycie końca spotkania (np. organizator zakończył)
  const watchdog = setInterval(async () => {
    if (!(await isInMeeting(page))) {
      clearInterval(watchdog);
      await shutdown('spotkanie zakończone');
    }
  }, 5000);
}

main().catch((e) => {
  console.error('[runner] błąd krytyczny', e);
  process.exit(1);
});
