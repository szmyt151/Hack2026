# Hack2026 — Teams Meeting Assistant

Asystent AI dołączający do spotkań Microsoft Teams na koncie usera: słucha (gpt-live-1), notuje, wykonuje akcje przez agenta z MCP, widzi udostępniany ekran.

## Struktura

| Katalog | Osoba | Opis |
|---|---|---|
| `meeting-runner/` | A | Playwright jako user, audio in/out, screenshoty → broker |
| `voice-core/` | B | sesja gpt-live-1 + orkiestrator tool calli |
| `brain/` | C | agent MCP, vision, notatki, panel demo |

Kontrakt wiadomości na brokerze: `meeting-runner/src/types.ts`.
