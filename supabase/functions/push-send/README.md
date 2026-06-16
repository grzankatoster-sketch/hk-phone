# Powiadomienia push na telefony HK (Web Push / VAPID)

Architektura: PWA na GitHub Pages (`sw.js` + `manifest`) → telefon zapisuje subskrypcję
w `push_subscriptions` → Database Webhook na nowe `hk_tasks`/`faults` woła Edge Function
`push-send`, która wysyła powiadomienie na zablokowany ekran.

## Wdrożenie — krok po kroku

### 1. Wygeneruj klucze VAPID (raz)
```bash
npx web-push generate-vapid-keys
```
Dostaniesz `Public Key` i `Private Key`.

### 2. Wklej PUBLIC do klienta
W [public/hk-phone/push.js](../../../public/hk-phone/push.js) podmień:
```js
const VAPID_PUBLIC_KEY = "REPLACE_WITH_VAPID_PUBLIC_KEY";  // ← wklej Public Key
```
(Public key NIE jest tajny — trafia do przeglądarek.)

### 3. Ustaw sekrety (panel Supabase → Edge Functions → Secrets, albo CLI)
```bash
supabase secrets set VAPID_PUBLIC_KEY=<Public Key>
supabase secrets set VAPID_PRIVATE_KEY=<Private Key>      # TAJNY — tylko tutaj
supabase secrets set VAPID_SUBJECT=mailto:recepcja@twojhotel.pl
```

### 4. Tabela subskrypcji
Wklej [supabase/migrations/0007_push_subscriptions.sql](../../migrations/0007_push_subscriptions.sql)
w SQL Editor → Run (lub `supabase db push`).

### 5. Wdróż funkcję (bez weryfikacji JWT — woła ją webhook bazy)
```bash
supabase functions deploy push-send --no-verify-jwt
```
W panelu: Edge Functions → push-send → **Details → Verify JWT = OFF**.

### 6. Database Webhooks (panel Supabase → Database → Webhooks → Create)
Utwórz **dwa** webhooki, oba: typ HTTP Request, metoda POST, URL = adres funkcji
`https://<projekt>.supabase.co/functions/v1/push-send`, nagłówek
`Authorization: Bearer <SERVICE_ROLE_KEY>`:
- **Nowe zadanie:** tabela `hk_tasks`, event **INSERT**
- **Nowa usterka:** tabela `faults`, event **INSERT**
- (opcjonalnie) `hk_plan`, event **UPDATE** — powiadomienie o zmianie przypisań

### 7. Wgraj pliki PWA na GitHub Pages (repo `hk-phone`)
Skopiuj do repo telefonu **wszystkie** nowe/zmienione pliki:
`index.html`, `konserwacja.html`, `push.js`, `sw.js`, `manifest.json`,
`manifest-konserwacja.json`, `icon.svg`.

### 8. Na telefonach pracowników
- **Android (Chrome):** otwórz QR → tap **„🔔 Włącz powiadomienia"** → Zezwól. Gotowe.
- **iPhone (Safari, iOS 16.4+):** otwórz QR → **Udostępnij → Dodaj do ekranu początkowego**
  → otwórz z **ikony** (nie z karty Safari!) → tap **„🔔 Włącz powiadomienia"** → Zezwól.
  To wymóg Apple dla web push — dopiero z ikony działa na ekran blokady.

## Test ręczny
```bash
curl -X POST https://<projekt>.supabase.co/functions/v1/push-send \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "content-type: application/json" \
  -d '{"title":"Test","body":"Działa!","role":"hk"}'
```
Odpowiedź `{"sent":N,...}` = wysłano do N urządzeń.

## Uwagi
- Wygasłe subskrypcje (404/410) funkcja sama usuwa z tabeli.
- `npm:web-push` w Edge Function jest zgodne z runtime Supabase (Deno + Node compat).
- v1 wysyła do wszystkich urządzeń danej roli w tenancie. Filtrowanie po konkretnym
  pracowniku (np. tylko przypisany do pokoju) można dołożyć później po `worker`.
