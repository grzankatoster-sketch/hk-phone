# Bot WhatsApp — wysyłka linku do grafiku (WYKONANIE 4.24)

Wysyła pracownikom link do grafiku przez WhatsApp. Multi-tenant (per hotel),
sterowany kolejką — **nie spamuje**, wysyła tylko to, co panel doda do kolejki.

## Jak działa

1. **Numer bota per hotel** — w panelu superadmina (`superadmin.html`) pole
   „numer WhatsApp bota" zapisuje `tenants.whatsapp_number`.
2. **Sesja WhatsApp** — bot (biblioteka **Baileys**, protokół WhatsApp Web /
   multi-device) startuje sesję dla każdego hotelu z ustawionym numerem i
   **wypisuje QR w terminalu**. Skanujesz go telefonem z tym numerem
   (WhatsApp → Urządzenia połączone). Autoryzacja zapisywana w
   `scripts/whatsapp-bot/.auth/<tenant_id>/` (nie wersjonowane).
3. **Kolejka** — panel wysyłając grafik woła RPC `queue_whatsapp_sends`
   (wiersze `{person, token, expires_at}`) → tabela `whatsapp_send_queue`.
4. **Wysyłka** — bot co kilka sekund czyta kolejkę, deszyfruje numer pracownika
   (`decrypt_employee_phones`, dane w `employee_contacts` są szyfrowane) i wysyła
   `Link: <PHONE_BASE_URL>/grafik.html?t=<token>`.

## Wymagania

- `.env` w katalogu głównym repo:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY` — **klucz service_role (SEKRET, pełny dostęp do bazy)**.
    Tylko na Twojej maszynie, NIGDY do repo ani instalatora.
  - `PHONE_BASE_URL` — baza stron telefonów (np. GitHub Pages), gdzie żyje `grafik.html`.
- Migracje bazy: `supabase db push` (tabele z `0053_whatsapp_bot.sql`).
- Zależności: `npm install`.

## Uruchomienie i test z własnym numerem

1. Uzupełnij `.env` (wyżej) i wgraj bazę: `supabase db push`.
2. `npm install`.
3. W superadminie ustaw `whatsapp_number` hotelu na **Twój numer testowy**.
4. Dodaj kontakt testowy (swój numer) do kontaktów pracowników (`employee_contacts`).
5. Start: `npm run whatsapp:bot`.
6. Terminal pokaże **QR** → w telefonie: **WhatsApp → Ustawienia → Urządzenia
   połączone → Połącz urządzenie** → zeskanuj QR. Bot zgłosi „Połączono".
7. Wyślij grafik z panelu (albo ręcznie zawołaj `queue_whatsapp_sends`) → bot
   wyśle link na numer testowy.

Wylogowanie / nowy QR: usuń `scripts/whatsapp-bot/.auth/<tenant_id>/` i uruchom ponownie.

## ⚠️ Ryzyko i rekomendacja

- **Baileys jest NIEOFICJALNE** (protokół WhatsApp Web). Meta **może zbanować
  numer** za automatyzację, zwłaszcza przy masowej wysyłce.
- **Na test użyj ZAPASOWEGO numeru**, nie głównego prywatnego — ban nie zabierze
  Ci osobistego konta. Trzymaj mały wolumen (bot ma opóźnienia między wysyłkami).
- **Na produkcję / sprzedaż SaaS wielu hotelom → oficjalne WhatsApp Cloud API**
  (Meta Business): bez ryzyka bana, ale wymaga konta Business, weryfikacji numeru
  i zatwierdzonych szablonów wiadomości. To osobna integracja — warto zaplanować,
  zanim bot pójdzie do wielu hoteli.
