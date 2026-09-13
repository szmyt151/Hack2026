import type { Page } from 'playwright';

/**
 * Odczyty z DOM Teams. Selektory są listami kandydatów — Teams zmienia je często,
 * więc dopisuj tutaj, nie w logice modułów.
 */

const SHARE_SELECTORS = [
  '[data-tid="screen-share-stage"]',
  '[data-tid*="share-stage"]',
  '[data-tid*="screenshare"]',
  '[data-tid*="share"] video',
  'video[data-tid*="share"]',
  '[aria-label*="shared content" i]',
  '[aria-label*="udostępnion" i]',
];

const SPEAKER_SELECTORS = [
  '[data-tid*="speaking"]',
  '[data-is-speaking="true"]',
  '[data-tid*="participant"][aria-label*="speaking" i]',
  '[aria-label*="is speaking" i]',
  '[aria-label*="mówi" i]',
];

export interface Box { x: number; y: number; width: number; height: number }

/** Największy widoczny element wyglądający na udostępniany ekran, albo null. */
export async function findSharedScreenBox(page: Page): Promise<Box | null> {
  return page.evaluate((selectors) => {
    let best: Box | null = null;
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width < 200 || r.height < 120) continue; // miniaturki pomijamy
        if (!best || r.width * r.height > best.width * best.height) {
          best = { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
    }
    return best;
  }, SHARE_SELECTORS);
}

/** Nazwa aktywnego mówcy (z aria-label / tekstu kafelka), albo null. */
export async function findActiveSpeaker(page: Page): Promise<string | null> {
  return page.evaluate((selectors) => {
    const clean = (s: string) =>
      s.replace(/\b(is speaking|speaking|mówi|muted|wyciszon\w*)\b/gi, '').replace(/[,.:]+/g, ' ').trim();
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const label = el.getAttribute('aria-label') ?? el.closest('[aria-label]')?.getAttribute('aria-label') ?? el.innerText;
      const name = clean(label ?? '');
      if (name.length > 1 && name.length < 80) return name;
    }
    return null;
  }, SPEAKER_SELECTORS);
}

const ENDED_RE = /spotkanie (zostało )?zakończone|the meeting has ended|call ended|rozmowa zakończona|you've been removed|usunięt/i;
const REJOIN_RE = /dołącz ponownie|rejoin|reconnect|połącz ponownie/i;

export type MeetingState = 'in_meeting' | 'disconnected' | 'ended' | 'unknown';

/** Stan spotkania na podstawie DOM: w spotkaniu / rozłączeni (jest "Dołącz ponownie") / zakończone. */
export async function detectMeetingState(page: Page): Promise<MeetingState> {
  if (page.isClosed()) return 'disconnected';
  const leave = page.getByRole('button', { name: /opuść|leave|hang up/i }).first();
  if (await leave.isVisible().catch(() => false)) return 'in_meeting';
  const body = await page.locator('body').innerText().catch(() => '');
  if (ENDED_RE.test(body)) return 'ended';
  if (REJOIN_RE.test(body)) return 'disconnected';
  return 'unknown';
}

/** Kliknij "Dołącz ponownie", jeśli jest. */
export async function clickRejoin(page: Page): Promise<boolean> {
  const btn = page.getByRole('button', { name: REJOIN_RE }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    return true;
  }
  return false;
}
