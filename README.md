# Hack2026 — Teams Meeting Assistant

Asystent AI dołączający do spotkań Microsoft Teams na koncie usera: słucha (gpt-live-1), notuje, wykonuje akcje przez agenta z MCP, widzi udostępniany ekran.

## Struktura

| Katalog | Osoba | Opis |
|---|---|---|
| `meeting-runner/` | A | Playwright jako user, audio in/out, screenshoty → broker |
| `voice-core/` | B | sesja gpt-live-1 + orkiestrator tool calli |
| `brain/` | C | agent MCP, vision, notatki, panel demo |

Kontrakt wiadomości na brokerze: `meeting-runner/src/types.ts`.

## Branche

| Branch | Osoba | Katalog |
|---|---|---|
| `main` | A | `meeting-runner/` |
| `person-b/voice-core` | B | `voice-core/` + `shared/types.ts` |
| `person-c/brain` | C | `brain/` + `shared/types.ts` |

Wszystko zmergowane do `main`. `shared/types.ts` to jedyny kontrakt (meeting-runner re-eksportuje go z `src/types.ts`). Sample rate audio: **16000** wszędzie (`AUDIO_IN/OUT_SAMPLE_RATE` w A, `AUDIO_SAMPLE_RATE` w B).

## Start całości (npm workspaces)

```bash
npm install                 # instaluje wszystkie 3 pakiety
npm run typecheck
npm run broker              # terminal 1 — mock-broker (broadcast; wystarczy na hackathon)
npm run brain               # terminal 2 — panel na http://localhost:3000
npm run voice               # terminal 3
npm run runner              # terminal 4 — dołącza do spotkania
```

Każdy pakiet ma własny `.env` (patrz `.env.example`); `BROKER_URL` ten sam wszędzie.

## Jeden kontenerowy start

Repozytorium ma już jeden rootowy `package.json` z npm workspaces. Docker Compose buduje jeden wspólny obraz Node 22 i uruchamia z niego broker, brain oraz voice-core. Skopiuj konfigurację i wpisz klucze:

```bash
cp .env.example .env
npm run docker:up
```

Panel demo będzie pod `http://localhost:3000`; broker pod `ws://localhost:8080`. `brain` używa `VIRTUOSO_API_URL` i `VIRTUOSO_API_TOKEN`, więc wszystkie delegacje trafiają do wiedzy i MCP tools Virtuoso.

Prawdziwe dołączanie do Teams jest świadomie osobnym profilem, aby zwykły start nie otwierał spotkania:

```bash
npm run docker:meeting
```

Wypełnij wcześniej `MEETING_URL` w rootowym `.env`. Runner działa w Linuxowym Xvfb z PulseAudio. Jeśli spotkanie wymaga zalogowanego konta Teams, trzeba utworzyć sesję Chromium wewnątrz kontenera (albo dołączyć anonimowo); profil Chromium z macOS nie jest przenośny do Linuxowego kontenera.
