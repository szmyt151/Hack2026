import type { Page } from 'playwright';
import { findActiveSpeaker } from './dom.js';

/**
 * Sonduje DOM co `intervalMs` i trzyma nazwę aktualnego mówcy.
 * AudioCapture dokleja `current` do każdego chunku audio.
 */
export class SpeakerTracker {
  current: string | null = null;
  private timer?: NodeJS.Timeout;
  private page?: Page;

  constructor(private intervalMs = 300) {}

  attach(page: Page): void {
    this.page = page;
    this.stop();
    this.timer = setInterval(async () => {
      if (!this.page || this.page.isClosed()) return;
      const s = await findActiveSpeaker(this.page).catch(() => null);
      if (s !== this.current) {
        this.current = s;
        if (s) console.log(`[speaker] ${s}`);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.current = null;
  }
}
