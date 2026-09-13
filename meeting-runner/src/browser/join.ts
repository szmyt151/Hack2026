import { chromium, type BrowserContext, type Page } from 'playwright';
import { config } from '../config.js';

/**
 * Dołączenie do spotkania Teams przez przeglądarkę, na profilu zalogowanego usera.
 *
 * UWAGA: selektory Teams zmieniają się często. Każdy krok ma listę kandydatów
 * (PL + EN) i miękkie timeouty — jeśli coś nie klika, dopisz selektor tutaj,
 * nie w logice. Podczas hackathonu trzymaj `HEADLESS=false` i patrz, co się dzieje.
 */

const t = (page: Page, names: string[], role: 'button' | 'link' = 'button') =>
  names.map((n) => page.getByRole(role, { name: new RegExp(n, 'i') }));

async function clickFirst(page: Page, names: string[], timeout = 8000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const loc of t(page, names)) {
      const el = loc.first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        return true;
      }
    }
    await page.waitForTimeout(300);
  }
  return false;
}

export async function launchUserContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone', 'camera'],
    ignoreDefaultArgs: ['--mute-audio'],
    args: [
      '--use-fake-ui-for-media-stream',   // brak popupu o mikrofon
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,720',
    ],
    // Chromium bierze urządzenia audio z PulseAudio — sink/source ustawiamy przez env
    // (patrz scripts/setup-audio.sh i src/index.ts).
  });
}

export type JoinEvents = {
  onLobby?: () => void;
  onJoined?: () => void;
};

export async function joinMeeting(context: BrowserContext, events: JoinEvents = {}): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.meetingUrl, { waitUntil: 'domcontentloaded' });

  // 1. Ekran wyboru: "Kontynuuj w tej przeglądarce" / "Continue on this browser"
  await clickFirst(page, ['Kontynuuj w tej przeglądarce', 'Continue on this browser', 'Join on the web instead'], 10000);

  // 2. Jeśli join anonimowy (użytkownik niezalogowany) — wpisz nazwę
  const nameInput = page.getByPlaceholder(/nazw|name/i).first();
  if (await nameInput.isVisible({ timeout: 4000 }).catch(() => false)) {
    await nameInput.fill(config.displayName);
  }

  // 3. Wyłącz kamerę (mikrofon zostawiamy — to nasz wirtualny mikrofon)
  const camToggle = page.getByRole('switch', { name: /kamer|camera|video/i }).first();
  if (await camToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    const checked = await camToggle.getAttribute('aria-checked');
    if (checked === 'true') await camToggle.click().catch(() => {});
  }

  // 4. Dołącz
  const clicked = await clickFirst(page, ['Dołącz teraz', 'Join now', 'Dołącz', 'Join'], 15000);
  if (!clicked) throw new Error('Nie znaleziono przycisku "Dołącz" — sprawdź selektory w join.ts');

  // 5. Lobby vs. w spotkaniu
  const inLobby = page.getByText(/poczekalni|lobby|Someone in the meeting should let you in/i).first();
  const leaveBtn = page.getByRole('button', { name: /opuść|leave|hang up/i }).first();

  const result = await Promise.race([
    inLobby.waitFor({ state: 'visible', timeout: 60000 }).then(() => 'lobby' as const),
    leaveBtn.waitFor({ state: 'visible', timeout: 60000 }).then(() => 'joined' as const),
  ]).catch(() => 'unknown' as const);

  if (result === 'lobby') {
    events.onLobby?.();
    console.log('[join] w poczekalni, czekam na wpuszczenie (max 10 min)');
    await leaveBtn.waitFor({ state: 'visible', timeout: 10 * 60 * 1000 });
  }
  events.onJoined?.();
  console.log('[join] w spotkaniu');
  return page;
}

export async function leaveMeeting(page: Page): Promise<void> {
  await clickFirst(page, ['Opuść', 'Leave', 'Hang up'], 5000);
}

/** Czy nadal jesteśmy w spotkaniu (przycisk "Opuść" widoczny). */
export async function isInMeeting(page: Page): Promise<boolean> {
  return page.getByRole('button', { name: /opuść|leave|hang up/i }).first().isVisible().catch(() => false);
}
