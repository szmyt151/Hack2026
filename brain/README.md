# brain (osoba C)

Agent z MCP + vision + notatki + panel demo. Dostaje delegacje od gpt-live-1 (przez B), wykonuje akcje przez Twojego istniejącego agenta, opisuje ekran, prowadzi notatki, na koniec wysyła podsumowanie.

## Jak to działa

```
broker[tool_call]  ──► DelegationWorker ──► AgentClient (Twój agent z MCP) ──► broker[tool_result]
broker[screen]     ──► VisionWorker (model z obrazem) ──► broker[context] + state.lastScreen
broker[transcript] ──► MeetingState ──► NotesWorker (co 60 s) ──► broker[notes]
meeting:left       ──► notatki końcowe ──► agent: "wyślij do chatu Teams + Notion"
panel/index.html   ◄── WS z brain: transkrypt, notatki, akcje, ekran (http://localhost:3000)
```

Kontrakt: `../shared/types.ts`.

## Uruchomienie

```bash
npm install
cp .env.example .env            # OPENAI_API_KEY + VIRTUOSO_API_URL/TOKEN (lub AGENT_URL / mock)
cp user-profile.example.md user-profile.md   # uzupełnij
(cd ../meeting-runner && npm run mock-broker) # terminal 1
npm start                                     # terminal 2 -> panel na :3000
```

Test bez B i A: wyślij ręcznie `tool_call` do brokera (np. `wscat -c ws://localhost:8080`):
```json
{"channel":"tool_call","ts":0,"sessionId":"t","delegationId":"item_x","request":"Adrian: Asystencie, zaplanuj follow-up na czwartek","recentTranscript":""}
```
W logu pojawi się `tool_result`, w panelu akcja.

## Podpięcie Virtuoso (zalecane)

Brain ma gotowy adapter do endpointu Virtuoso `POST /virtuoso/chat`. Dzięki temu delegacje ze spotkania korzystają z tej samej bazy wiedzy, MCP tools i polityki zatwierdzeń co chat Virtuoso.

```env
VIRTUOSO_API_URL=https://twoj-virtuoso.example.com
VIRTUOSO_API_TOKEN=<IAM-lub-gateway-JWT>
# opcjonalnie; ID z GET /virtuoso/chat/models
VIRTUOSO_MODEL=
```

`VIRTUOSO_API_TOKEN` musi być JWT IAM albo gateway akceptowany przez schemat `mcp-iam-or-gateway`, identyfikujący provisioned użytkownika Virtuoso z podłączonym Slackiem. Endpointy OAuth w `src/api/auth` służą do podłączania integracji użytkownika i nie wydają tego tokenu. Adapter tworzy jedną trwałą rozmowę `hack2026-<sessionId>` na spotkanie, dołącza świeży screenshot (maks. 8 MB) i przekazuje transkrypt, opis ekranu oraz profil użytkownika jako kontekst spotkania.

## Podpięcie innego agenta

`src/agent/client.ts` → `HttpAgentClient`. Założony kontrakt: `POST $AGENT_URL {prompt, context} → {text, ok}`.
`context` zawiera: `recentTranscript`, `screenDescription`, `screenJpegBase64` (jeśli ekran był świeży <2 min), `userProfile`, `sessionId`.
Jeśli Twój agent ma inne API — zmieniasz tylko ten plik. Agent powinien zwracać **krótki** tekst do wypowiedzenia (fakty + status), nie markdown.

Narzędzia, które agent powinien mieć na demo: kalendarz (utwórz spotkanie z uczestnikami), zadania, wyślij wiadomość do chatu spotkania Teams, zapisz do Notion. `get_screen` nie jest osobnym narzędziem — opis i JPEG ekranu jadą w `context` przy każdym wywołaniu.

## Pliki

- `src/state.ts` — transkrypt, ostatni ekran, notatki, log akcji
- `src/workers/delegation.ts` — tool_call → agent → tool_result (thinking w trakcie, speak na koniec)
- `src/workers/vision.ts` — klatka → opis (kolejka: tylko najnowsza klatka, gdy zajęty)
- `src/workers/notes.ts` — inkrementalne notatki JSON (summary/decisions/actionItems/openQuestions)
- `src/panel-server.ts` + `panel/index.html` — widok na demo
- `src/agent/client.ts` — adapter agenta (HTTP / mock)

## Co najczęściej się psuje

- **Notatki puste** — model zwrócił nie-JSON; `notes.ts` loguje błąd, prompt wymusza czysty JSON, w razie czego dodaj `text: { format: { type: 'json_object' } }` do `ask()`.
- **Vision zbyt gadatliwy** — model bierze każdą klatkę; próg zmian jest po stronie A (`SCREEN_DIFF_THRESHOLD`).
- **Agent za wolny** — B po 25 s każe modelowi powiedzieć, że się nie udało. Wysyłaj `thinking` z postępem (callback `onProgress`), żeby model wiedział, że praca trwa.

## TODO

- [ ] Streaming z agenta (SSE) → kilka `thinking` zamiast jednego `speak` na końcu
- [ ] Deduplikacja akcji: ten sam request w 30 s → nie wykonuj drugi raz
- [ ] Panel: przycisk "wyślij notatki teraz"
