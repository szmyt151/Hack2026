import 'dotenv/config';
import { chromium } from 'playwright';

/**
 * Jednorazowe logowanie na konto usera (z MFA) w widocznej przeglądarce.
 * Profil zapisuje się w USER_DATA_DIR i jest potem używany przez runner.
 * Uruchom: npm run login  -> zaloguj się w oknie -> zamknij okno.
 */
const userDataDir = process.env.USER_DATA_DIR ?? './.chromium-profile';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: 'chromium',
  viewport: { width: 1280, height: 720 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://teams.microsoft.com');
console.log('Zaloguj się w oknie przeglądarki. Gdy zobaczysz Teams, zamknij okno — profil zostanie zapisany.');
await new Promise<void>((resolve) => context.on('close', () => resolve()));
console.log(`Profil zapisany w ${userDataDir}`);
