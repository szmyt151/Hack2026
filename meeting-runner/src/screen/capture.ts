import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { Page } from 'playwright';
import type { Broker } from '../broker.js';
import type { ScreenMessage } from '../types.js';
import { config } from '../config.js';

/**
 * Co SCREEN_INTERVAL_MS robi screenshot zakładki Teams, porównuje z poprzednią klatką
 * i publikuje na `screen` tylko gdy zmieniło się więcej niż SCREEN_DIFF_THRESHOLD pikseli.
 * Pierwszą klatkę wysyła zawsze.
 */
export class ScreenCapture {
  private timer?: NodeJS.Timeout;
  private prev?: PNG;

  constructor(private page: Page, private broker: Broker) {}

  start(): void {
    const tick = async () => {
      try {
        const pngBuf = await this.page.screenshot({ type: 'png' });
        const png = PNG.sync.read(pngBuf);
        let changeRatio = 1;

        if (this.prev && this.prev.width === png.width && this.prev.height === png.height) {
          const diff = pixelmatch(this.prev.data, png.data, null, png.width, png.height, { threshold: 0.15 });
          changeRatio = diff / (png.width * png.height);
        }
        this.prev = png;

        if (changeRatio >= config.screen.diffThreshold) {
          const jpeg = await this.page.screenshot({ type: 'jpeg', quality: 60 });
          this.broker.publish<ScreenMessage>({
            channel: 'screen',
            format: 'jpeg',
            width: png.width,
            height: png.height,
            data: jpeg.toString('base64'),
            changeRatio,
          });
          console.log(`[screen] wysłano klatkę (zmiana ${(changeRatio * 100).toFixed(1)}%)`);
        }
      } catch (e) {
        console.warn('[screen] błąd screenshotu', (e as Error).message);
      }
    };
    void tick();
    this.timer = setInterval(tick, config.screen.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
