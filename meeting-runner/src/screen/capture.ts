import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { Page } from 'playwright';
import type { Broker } from '../broker.js';
import type { ScreenMessage } from '../types.js';
import { config } from '../config.js';
import { findSharedScreenBox } from '../browser/dom.js';

/**
 * Co SCREEN_INTERVAL_MS robi screenshot: jeśli ktoś udostępnia ekran — wycina tylko ten obszar
 * (findSharedScreenBox), w przeciwnym razie całą zakładkę. Porównuje z poprzednią klatką
 * i publikuje na `screen` tylko gdy zmieniło się więcej niż SCREEN_DIFF_THRESHOLD pikseli.
 * Zmiana źródła (pełny ekran <-> share) zawsze wymusza wysyłkę.
 */
export class ScreenCapture {
  private timer?: NodeJS.Timeout;
  private prev?: PNG;
  private prevSource?: 'shared_screen' | 'full_page';

  constructor(private page: Page, private broker: Broker) {}

  /** Po reconnect podmieniamy stronę bez restartu pętli. */
  setPage(page: Page): void {
    this.page = page;
    this.prev = undefined;
  }

  start(): void {
    const tick = async () => {
      if (this.page.isClosed()) return;
      try {
        const box = await findSharedScreenBox(this.page).catch(() => null);
        const source = box ? 'shared_screen' : 'full_page';
        const clip = box ? { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height } : undefined;

        const pngBuf = await this.page.screenshot({ type: 'png', clip });
        const png = PNG.sync.read(pngBuf);
        let changeRatio = 1;

        if (source === this.prevSource && this.prev && this.prev.width === png.width && this.prev.height === png.height) {
          const diff = pixelmatch(this.prev.data, png.data, null, png.width, png.height, { threshold: 0.15 });
          changeRatio = diff / (png.width * png.height);
        }
        this.prev = png;
        this.prevSource = source;

        if (changeRatio >= config.screen.diffThreshold) {
          const jpeg = await this.page.screenshot({ type: 'jpeg', quality: 60, clip });
          this.broker.publish<ScreenMessage>({
            channel: 'screen',
            format: 'jpeg',
            width: png.width,
            height: png.height,
            data: jpeg.toString('base64'),
            changeRatio,
            source,
          });
          console.log(`[screen] ${source} (zmiana ${(changeRatio * 100).toFixed(1)}%)`);
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
