# teams-meeting-runner (osoba A)

Dołącza do spotkania Teams na **prawdziwym koncie usera**, streamuje audio i klatki ekranu na brokera zespołu, odtwarza głos asystenta jako mikrofon.

## Jak to działa

```
Teams (Chromium jako user)
   │ dźwięk spotkania → PulseAudio sink `meeting_out` → ffmpeg → [audio] → broker
   │ screenshot zakładki co 3 s (tylko gdy się zmienił) → [screen] → broker
   ▲ broker → [tts_audio] → ffmpeg → sink `assistant_mic` → mikrofon Chromium
```

Kontrakt wiadomości: `src/types.ts`. To jedyna rzecz, którą trzeba uzgodnić z osobami B i C.

## Uruchomienie lokalne (Linux)

```bash
npm install
npx playwright install chromium
cp .env.example .env            # uzupełnij MEETING_URL
npm run audio:setup             # wirtualne sinki PulseAudio (raz po restarcie)
npm run login                   # zaloguj usera w oknie, zamknij okno
npm run mock-broker             # terminal 1
npm run start                   # terminal 2 (albo start:xvfb bez pulpitu)
```

Test bez zespołu: w `out/` pojawią się `audio.pcm` i `screen-N.jpg`.
Odsłuch: `ffplay -f s16le -ar 16000 -ac 1 out/audio.pcm`.
Echo w spotkaniu: `ECHO=1 npm run mock-broker` + `AUDIO_OUT_SAMPLE_RATE=16000`.

## Docker

```bash
docker build -t meeting-runner -f docker/Dockerfile .
docker run --env-file .env -e BROKER_URL=ws://host.docker.internal:8080 \
  -v $(pwd)/.chromium-profile:/app/.chromium-profile meeting-runner
```
Zaloguj profil na hoście (`npm run login`), potem montuj go do kontenera.

## macOS

Lokalny runner jest implementowany dla Linuxa: Chromium, `ffmpeg` i dwa wirtualne sinki PulseAudio. macOS używa CoreAudio i nie ma polecenia `pulseaudio`, więc `npm run audio:setup` na hoście tylko wyświetli właściwą komendę Docker i zakończy się sukcesem.

Uruchamiaj audio w kontenerze — obraz instaluje PulseAudio i `ffmpeg`, a jego polecenie startowe samo uruchamia `audio:setup`:

```bash
docker build -t meeting-runner -f docker/Dockerfile .
docker run --env-file .env -e BROKER_URL=ws://host.docker.internal:8080 \
  -v "$(pwd)/.chromium-profile:/app/.chromium-profile" meeting-runner
```

Profil Chromium nadal logujesz na hoście przez `npm run login`.

## Co najczęściej się psuje

- **Selektory Teams** — `src/browser/join.ts`, funkcja `joinMeeting`. Odpal z `HEADLESS=false` i patrz.
- **Cisza w audio.pcm** — Chromium nie trafił w sink. Sprawdź `pactl list short sink-inputs`, przesuń: `pactl move-sink-input <id> meeting_out`.
- **Teams nie słyszy asystenta** — w ustawieniach spotkania wybierz mikrofon "Monitor of assistant_mic".
- **Sesja wylogowana** — powtórz `npm run login`.
- **`speaker` zawsze pusty / `source` zawsze `full_page`** — selektory w `src/browser/dom.ts` nie trafiają. W DevTools na spotkaniu: `document.querySelectorAll('[data-tid]')` i dopisz właściwe.

## Fallback

Jeśli audio przez przeglądarkę zawiedzie, osoba B może czytać transkrypt z Graph:
`GET /me/onlineMeetings/{id}/transcripts` (wymaga włączonej transkrypcji w tenancie).

## TODO na hackathon

- [ ] Sprawdzić selektory na aktualnym Teams (PL/EN)
- [x] Wycinanie obszaru udostępnianego ekranu (`src/browser/dom.ts` → `findSharedScreenBox`; pole `source` w `screen`)
- [x] Wykrywanie mówcy (`src/browser/speaker.ts`; pole `speaker` w `audio`)
- [x] Reconnect po rozłączeniu (watchdog w `src/index.ts`: "Dołącz ponownie" → pełny rejoin → shutdown po N próbach)
- [ ] Zweryfikować selektory w `src/browser/dom.ts` na żywym Teams — SHARE_SELECTORS i SPEAKER_SELECTORS to kandydaci
