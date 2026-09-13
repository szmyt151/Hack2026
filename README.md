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

`shared/types.ts` (identyczny na obu branchach) to kanoniczny kontrakt — `meeting-runner/src/types.ts` ma być z nim zgodny. Sample rate audio: **16000** wszędzie (`AUDIO_IN/OUT_SAMPLE_RATE` w A, `AUDIO_SAMPLE_RATE` w B).

Integracja (H12–18): merge obu branchy do `main`, jeden `.env` z `BROKER_URL`, jeden broker (na start `meeting-runner/scripts/mock-broker.ts` — broadcastuje wszystko, wystarczy na hackathon).
