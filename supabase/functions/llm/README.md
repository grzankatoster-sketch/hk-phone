# Edge Function `llm` — proxy do LLM (Groq, darmowy tier)

Jedyny punkt styku aplikacji z LLM. Dostawca: **Groq** (darmowy tier, API zgodne z
OpenAI, modele Llama). Klucz API żyje **wyłącznie** jako secret Supabase — nigdy w
kliencie Electron ani w repo. Prompt budowany jest po stronie serwera (klient nie
steruje promptem → brak prompt-injection z UI).

Obsługiwane zadania (`task`):
- `wiki` — RAG nad wpisami Wiki (llama-3.3-70b). Odpowiada wyłącznie z dostarczonych wpisów.
- `triage` — kategoria + priorytet + konserwator + tytuł usterki (llama-3.1-8b, tryb JSON).
- `briefing` — 5-punktowe streszczenie przekazania zmiany (llama-3.3-70b). **Redaguje nazwiska**
  podane w `payload.redactNames` zanim cokolwiek opuści naszą infrastrukturę (RODO).

> Zasada: LLM = warstwa językowa (doradcza). **Nigdy źródło liczb** (kasa, liczenie pokoi).

## Wdrożenie (jednorazowo)

```bash
# 1) Darmowy klucz Groq: console.groq.com → API Keys → Create.
#    Ustaw jako secret (NIE w .env klienta):
supabase secrets set GROQ_API_KEY=gsk_...

# 2) Zastosuj migrację tabeli zużycia:
supabase db push            # lub wklej supabase/migrations/0006_llm_usage.sql w SQL Editor

# 3) Wdróż funkcję:
supabase functions deploy llm
```

> Darmowy tier Groq ma rate-limit (zapytania/min, tokeny/dzień) — dla recepcji w zupełności
> wystarcza. Modele darmowe; gdyby któryś został wycofany, podmień ID w `MODELS` w index.ts.

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są wstrzykiwane automatycznie w runtime
Edge Functions — służą wyłącznie do zapisu logu zużycia w `public.llm_usage`.

## Test lokalny

```bash
supabase functions serve llm --env-file ./supabase/.env.local   # GROQ_API_KEY=gsk_...
curl -s localhost:54321/functions/v1/llm \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "content-type: application/json" \
  -d '{"task":"wiki","tenant_id":"...","payload":{"question":"Jak zrobić wczesny check-out?","entries":[{"topic":"Check-out","content":"..."}]}}'
```

## Bezpieczeństwo / fallback

- Klient ([src/lib/llm.js](../../../src/lib/llm.js)) łapie błędy — gdy funkcja jest
  niedostępna, każda funkcja UI degraduje się łagodnie (Wiki = ręczne szukanie,
  triage = ręczny formularz, briefing = surowe dane w panelach). Core recepcji nigdy
  nie jest blokowany przez LLM.
- `redactNames` w briefingu obecnie puste — hak gotowy, by wpiąć nazwiska gości z
  rezerwacji, gdy będą dostępne w kontekście (patrz komentarz w `runBriefing` w App.jsx).
