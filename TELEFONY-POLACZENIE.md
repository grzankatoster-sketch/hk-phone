# Telefony HK — jak działają bez sieci LAN i bez ngrok

**Wniosek:** telefony pracownic **nie muszą** być w sieci hotelu i **nie potrzebują ngrok**.
Cała ścieżka jest chmurowa (GitHub Pages + Supabase). ngrok obsługiwał tylko *nadmiarowy*
serwer LAN (`electron/hkserver.cjs`) i został usunięty (WYKONANIE 0.1).

## Model połączenia (stan w kodzie — już gotowy)

| Warstwa | Ścieżka | Działa poza LAN? |
|---|---|---|
| Wejście na stronę | QR → `phoneUrl()` = `…github.io/hk-phone/?w=Imię` (`src/lib/supabase.js:11`, `HKLivePanel.jsx:452`) | ✅ z każdej sieci / danych mobilnych |
| Podgląd na żywo | Supabase Realtime `postgres_changes` (`public/hk-phone/index.html:911`) | ✅ |
| Push: nowe zadanie | INSERT do `hk_tasks` → **Database Webhook** → Edge Function `push-send` | ✅ *jeśli webhook skonfigurowany* |
| Push: pilne / pytanie o status | jawne `supabase.functions.invoke("push-send")` (`HKPanel.jsx:499,519`) | ✅ |
| Push LAN `localhost:3737` | dodatek dla telefonów w LAN, `.catch(()=>{})` | tylko LAN, przy braku sieci nic nie psuje |

> Uwaga dla dewelopera: **nie** dodawać jawnego `invoke("push-send")` w ścieżce zadań
> (`HKLivePanel.jsx:380`) — `hk_tasks` INSERT już wyzwala `push-send` webhookiem, drugie
> wywołanie = podwójne powiadomienie. Podział (webhook dla wstawień do tabel, jawny invoke
> dla ulotnych pilne/status) jest celowy.

## Checklist: czy telefony na pewno działają z każdej sieci?

Jeśli push „działał tylko przez link", prawie zawsze brakuje jednego z kroków konfiguracji
Supabase (opis pełny: `supabase/functions/push-send/README.md`):

1. **Edge Function wdrożona:** `supabase functions deploy push-send --no-verify-jwt`
   (panel → Edge Functions → push-send → Verify JWT = OFF).
2. **Sekrety VAPID ustawione:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (panel → Edge Functions → Secrets). Ten sam PUBLIC co w `public/hk-phone/push.js`.
3. **Tabela `push_subscriptions`** istnieje (migracja `0007_push_subscriptions.sql`).
4. **Database Webhooks** (panel → Database → Webhooks), POST na
   `https://<projekt>.supabase.co/functions/v1/push-send`, nagłówek
   `Authorization: Bearer <SERVICE_ROLE_KEY>`:
   - tabela `hk_tasks`, event **INSERT** (nowe zadanie)
   - tabela `faults`, event **INSERT** (nowa usterka)
   - (opcjonalnie) `hk_rooms` INSERT/UPDATE — pokój zwolniony + losowe kontrole jakości
   - (opcjonalnie) `hk_plan` UPDATE, `hk_reminders` INSERT
5. **Telefony subskrybują z chmury:** pracownica otwiera QR (strona `…github.io/hk-phone`),
   tapie „🔔 Włącz powiadomienia". iPhone: najpierw **Dodaj do ekranu początkowego**,
   potem otwiera z ikony (wymóg Apple dla web push na ekran blokady).
   Jeśli telefon subskrybował kiedyś przez stronę serwera LAN — musi zasubskrybować
   ponownie z adresu chmurowego, bo tamta subskrypcja nie trafia do `push_subscriptions`.

## Test ręczny (potwierdza całą ścieżkę chmurową)

```bash
curl -X POST https://<projekt>.supabase.co/functions/v1/push-send \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "content-type: application/json" \
  -d '{"title":"Test","body":"Działa z każdej sieci","role":"hk"}'
```
Odpowiedź `{"sent":N,...}` z N>0 = push dotarł do N telefonów przez internet (bez LAN, bez ngrok).

## Docelowo (plan)

- **3.2** — własna domena `app.guestsage.pl/t/{hotel}/…` zamiast prywatnego GitHub Pages.
- **3.5 / 3.8** — wygaszenie serwera LAN (`hkserver.cjs`) i jednego systemu push (tylko chmura).
- Do tego czasu serwer LAN może zostać włączony jako szybszy dodatek w sieci hotelu, ale nie
  jest już warunkiem działania telefonów.
