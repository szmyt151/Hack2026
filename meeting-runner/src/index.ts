import { config } from './config.js';
import { Broker } from './broker.js';
import { launchUserContext, joinMeeting, leaveMeeting } from './browser/join.js';
import { detectMeetingState, clickRejoin } from './browser/dom.js';
import { SpeakerTracker } from './browser/speaker.js';
import { AudioCapture } from './audio/capture.js';
import { AudioPlayback } from './audio/playback.js';
import { ScreenCapture } from './screen/capture.js';
import type { MeetingMessage } from './types.js';
import type { BrowserContext, Page } from 'playwright';

/**
 * Meeting Runner (osoba A).
 * broker -> przeglądarka jako user -> join -> audio in/out + screenshoty + mówca -> broker.
 * Watchdog co 5 s: w spotkaniu / rozłączeni (rejoin) / zakończone (shutdown).
 */
async function main() {
  process.env.PULSE_SINK = config.audio.sinkMeeting;
  process.env.PULSE_SOURCE = `${config.audio.sinkAssistant}.monitor`;

  const broker = new Broker();
  await broker.connect();
  const meeting = (event: MeetingMessage['event'], detail?: string) =>
    broker.publish<MeetingMessage>({ channel: 'meeting', event, detail });

  const playback = new AudioPlayback(broker);
  playback.start();

  const speakers = new SpeakerTracker();
  const capture = new AudioCapture(broker, speakers);
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let screen: ScreenCapture | undefined;
  let shuttingDown = false;

  const join = async (): Promise<void> => {
    context ??= await launchUserContext();
    page = await joinMeeting(context, {
      onLobby: () => meeting('in_lobby'),
      onJoined: () => meeting('joined'),
    });
    speakers.attach(page);
    if (screen) screen.setPage(page);
    else { screen = new ScreenCapture(page, broker); screen.start(); }
  };

  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[runner] kończę: ${reason}`);
    screen?.stop();
    speakers.stop();
    capture.stop();
    playback.stop();
    if (page && !page.isClosed()) await leaveMeeting(page).catch(() => {});
    meeting('left', reason);
    await new Promise((r) => setTimeout(r, 500));
    broker.close();
    await context?.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  meeting('joining', config.meetingUrl);
  await join();
  capture.start();

  // --- Reconnect ---
  let unknownStreak = 0;
  let checking = false;
  const watchdog = setInterval(async () => {
    if (shuttingDown || checking || !page) return;
    checking = true;
    try {
      const state = await detectMeetingState(page);
      if (state === 'in_meeting') { unknownStreak = 0; return; }
      if (state === 'ended') { clearInterval(watchdog); await shutdown('spotkanie zakończone'); return; }
      if (state === 'unknown' && ++unknownStreak < 4) return; // ~20 s tolerancji na przejściowe stany
      unknownStreak = 0;

      meeting('reconnecting', state);
      for (let attempt = 1; attempt <= config.reconnect.maxAttempts && !shuttingDown; attempt++) {
        console.warn(`[runner] próba ponownego dołączenia ${attempt}/${config.reconnect.maxAttempts}`);
        try {
          if (!page.isClosed() && (await clickRejoin(page))) {
            await page.getByRole('button', { name: /opuść|leave|hang up/i }).first()
              .waitFor({ state: 'visible', timeout: 30000 });
            speakers.attach(page);
            screen?.setPage(page);
          } else {
            if (!page.isClosed()) await page.close().catch(() => {});
            await join();
          }
          console.log('[runner] ponownie w spotkaniu');
          return;
        } catch (e) {
          console.warn('[runner] rejoin nieudany:', (e as Error).message);
          await new Promise((r) => setTimeout(r, config.reconnect.delayMs * attempt));
        }
      }
      clearInterval(watchdog);
      await shutdown('nie udało się ponownie dołączyć');
    } finally {
      checking = false;
    }
  }, 5000);
}

main().catch((e) => {
  console.error('[runner] błąd krytyczny', e);
  process.exit(1);
});
