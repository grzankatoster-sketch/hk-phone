# Wdrożenie panelu menedżerskiego — krok po kroku

Wszystko po stronie **Twojego** Supabase i GitHub Pages. Zajmie ~15 minut.
Adresy stron po wdrożeniu:
- Panel: `https://grzankatoster-sketch.github.io/hk-phone/panel.html`
- Grafik pracownika: `https://grzankatoster-sketch.github.io/hk-phone/grafik.html?t=KOD`

---

## 1) Baza danych (SQL)
Supabase → **SQL Editor** → New query → wklej **całą** zawartość pliku
[`supabase/panel_install.sql`](supabase/panel_install.sql) → **Run**.

Plik zawiera WSZYSTKIE migracje `0001`–`0055` (cała aplikacja + panel) + 7 kont
startowych, sklejone w jednej kolejności. Jest w pełni idempotentny — bezpiecznie
uruchomić go w całości nawet jeśli część migracji była już wcześniej wklejona
osobno (żadna operacja się nie zdubluje/nie wywali na "już istnieje").
Wygenerowany automatycznie z `supabase/migrations/*.sql` — jeśli dojdzie kolejna
migracja, doklej ją na końcu tego pliku zamiast wklejać osobno.

## 2) Logowanie bez maila
Supabase → **Authentication → Sign In / Providers** (lub **Settings**) → **wyłącz „Confirm email"**.
(Konta używają ukrytych, syntetycznych e-maili — bez tego pierwsze hasło się nie ustawi.)

## 3) Auto-czyszczenie po 14 dniach (pg_cron)
Supabase → **Database → Extensions** → włącz **`pg_cron`**.
Potem jeszcze raz uruchom w SQL Editor sekcję TTL (sam `0015`) **albo** wklej:
```sql
select cron.schedule('panel_ttl','0 3 * * *','select public.panel_ttl_cleanup();');
```
(Jeśli pominiesz ten krok, panel działa — tylko stare dane nie kasują się same.)

## 4) AI-opisy pracownika (funkcja llm)
Dodałem nowy typ zapytania `worker`, więc trzeba przewdrożyć funkcję:
```bash
supabase functions deploy llm
```
(`GROQ_API_KEY` już masz ustawiony — AI działa w aplikacji.)

## 5) Push do konserwatora (jeśli chcesz)
Zadanie dodane konserwatorowi = wpis do `faults`. Push poleci **automatycznie**, jeśli istnieje
**Database Webhook na INSERT do `faults`** (to było w Twoim wdrożeniu push). Sprawdź:
Supabase → **Database → Webhooks** → czy jest webhook na `faults` (INSERT) → URL funkcji `push-send`.

## 5b) Eskalacja SLA usterek (migracja 0044, jeśli chcesz automatyczne przypomnienia)
Ten sam krok co (3) — wymaga `pg_cron`. Jeśli włączyłeś rozszerzenie w kroku (3),
harmonogram `escalate-overdue-faults` już się utworzył przy uruchomieniu
`panel_install.sql`. Jeśli `pg_cron` włączyłeś PO uruchomieniu instalatora,
uruchom ponownie tylko sekcję `0044_faults_sla_escalation.sql` z instalatora
(bezpieczne — idempotentne).

## 5c) Bot WhatsApp — link do grafiku (migracja 0053, opcjonalne)
Wymaga jednego ręcznego kroku, którego NIE MOŻNA trzymać w pliku migracji (trafiłby
do repo): Supabase → **SQL Editor** → uruchom raz:
```sql
alter database postgres set app.whatsapp_key = '<długi losowy sekret, np. z `openssl rand -hex 32`>';
```
Bez tego zapisywanie/wysyłka numerów telefonów pracowników (zakładka Grafik →
„📱 Numery WhatsApp") zwróci błąd. Sam serwis bota: `npm run whatsapp:bot`
(wymaga dedykowanego numeru telefonu — patrz opis w README bota/rozmowie wdrożeniowej).

## 6) Publikacja stron
W projekcie:
```bash
node scripts/deploy-hk-phone.mjs
```
Wrzuci `panel.html` i `grafik.html` (oraz pozostałe) na GitHub Pages.
Wymaga `GITHUB_TOKEN` w `.env` (masz go z wdrożenia telefonów).

---

## 7) Test po wdrożeniu (smoke test)
1. Wejdź na `…/panel.html` → widać **formularz logowania** (Login + Hasło).
2. Login: **Tetiana (HK)**, wpisz dowolne hasło (min. 6 znaków) → zostanie zapisane → pulpit **Menedżer HK**.
3. **Na żywo** → jeśli ktoś dziś sprząta, widać pokoje + pasek KPI.
4. Wyloguj, zaloguj ponownie tym hasłem → wchodzi od razu.
5. Zaloguj jako **„Admin"** → zakładka **Konta** → dodaj testowe konto (opcjonalnie z kodem).
6. **Grafik** → zaznacz okres → „Generuj linki" → skopiuj link → otwórz `grafik.html?t=…` →
   zaznacz dni → wróć do panelu, klik w grafik → odpowiedzi widoczne.
7. **Wyjazdy** → dodaj kogoś do obsady → „Zapisz obsadę" (recepcja to zobaczy).
8. **Zakładka Akcje** → widać wszystkie powyższe akcje (audyt).

## Konta startowe (zmień imiona w razie potrzeby)
Admin · Koordynator · Menedżer recepcji · Tetiana (HK) · Menedżer główny · Menedżer operacyjny · Menedżer gastronomii.
Każda osoba ustawia własne hasło przy pierwszym wejściu. Imiona edytujesz w zakładce **Konta** (jako admin)
lub w SQL (`update public.app_accounts set name=… where role=…`).

## Gdyby coś nie działało
- Spis kont pusty → seed nie wszedł (uruchom `panel_install.sql` jeszcze raz).
- „Pierwsze hasło" nie loguje → „Confirm email" nadal włączone (krok 2).
- Dane puste po zalogowaniu → sprawdź, czy migracje 0010+ przeszły (polityki dla `authenticated`).
- AI-opis „niedostępne" → funkcja `llm` niewdrożona z krokiem `worker` (krok 4).
- Stary zapisany link do „Wyjazdy" (menedżer HK) przestał działać po migracji `0054` →
  to celowe (był dostępny bez żadnego zabezpieczenia). Nowy link z tokenem: dopisz
  `?t=C59313` do adresu strony (token startowy, seedowany przez migrację) — albo
  wygeneruj nowy przez `page_access_tokens` i podmień zapisany link.
