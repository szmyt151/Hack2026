# voice-core (osoba B)

Sesja **gpt-live-1** (full-duplex, *client delegation*) + orkiestrator: audio ze spotkania → model, mowa modelu → spotkanie, delegacje → osoba C, wyniki → model.

## Jak to działa

```
broker[audio]        ──► session.input_audio.append ──► gpt-live-1
gpt-live-1 audio     ──► broker[tts_audio]               (A wpuszcza na mikrofon)
gpt-live-1 transkrypt──► broker[transcript]              (C robi notatki)
session.delegation.created ──► broker[tool_call]{delegationId, request, recentTranscript}   (do C)
broker[tool_result]  ──► session.commentary.append / thinking.append (delegation_id)
broker[context]      ──► session.thinking.append (delegation_id: null)   (opis ekranu, profil usera)
```

Kluczowa rzecz z dokumentacji: w trybie client delegation event delegacji **nie zawiera treści prośby** — składamy ją sami z ostatnich 20 s transkryptu (`src/transcript.ts`). Dlatego `tool_call` niesie `request` + `recentTranscript`.

Kontrakt: `../shared/types.ts`.

## Uruchomienie

```bash
npm install
cp .env.example .env   # OPENAI_API_KEY
# terminal 1: broker
(cd ../meeting-runner && npm run mock-broker)
# terminal 2: udawana osoba C
npm run mock-brain
# terminal 3: voice-core z lokalnym mikrofonem (bez Teams)
START_IMMEDIATELY=1 npm start
# terminal 4: mikrofon -> broker
bash scripts/mic.sh
```

Powiedz: „Asystencie, zaplanuj follow-up na czwartek” → w logu voice-core pojawi się delegacja, mock-brain odpowie, model wypowie wynik.

Z prawdziwym A: uruchom bez `START_IMMEDIATELY` — sesja startuje na `meeting:joined`, kończy na `meeting:left`.

## Ustawienia audio

`AUDIO_SAMPLE_RATE` (16000 lub 24000) musi być równe `AUDIO_IN_SAMPLE_RATE` **i** `AUDIO_OUT_SAMPLE_RATE` w meeting-runner. Jeden format obowiązuje w obie strony. Domyślnie 16000 — mniej danych, jakość wystarczająca do mowy.

## Pliki

- `src/live.ts` — sesja Live (start, audio in/out, commentary/thinking/instructions append, close)
- `src/prompt.ts` — prompt konwersacyjny: wake word, milczenie, kiedy delegować
- `src/transcript.ts` — bufor transkryptu + `window(ms)` do budowania prośby
- `src/index.ts` — spinacz z brokerem i cyklem życia spotkania
- `src/mock-brain.ts` — udawane C do testów

## Co najczęściej się psuje

- **Model gada bez pytania** — dokręć prompt w `prompt.ts` (sekcja NAJWAŻNIEJSZA ZASADA) albo wyślij `session.instructions.append` z korektą.
- **Delegacja bez treści** — `request` pusty, bo transkrypt jeszcze nie dotarł. Zwiększ `DELEGATION_REQUEST_WINDOW_S` lub opóźnij publikację `tool_call` o 300 ms.
- **Cisza po delegacji** — C nie odpowiedział; po 25 s voice-core sam każe modelowi powiedzieć, że się nie udało.
- **`error` z API** — odpal z `LIVE_DEBUG=1`, event ma `client_event_id` wskazujący winną komendę.

## TODO

- [ ] Wyciąć własny głos asystenta z audio wejściowego, jeśli Teams nie robi echo cancellation (na razie liczymy na Teams)
- [ ] Sideband WebSocket dla panelu C (podgląd/sterowanie sesją bez dotykania audio)
- [ ] Twarde odcięcie odpowiedzi, gdy w `request` nie ma wake worda (guardrail w `onDelegation`)
