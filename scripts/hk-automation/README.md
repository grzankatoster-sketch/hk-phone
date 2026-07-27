# Automatyczne statusy HK z raportow KWHotel

Ten modul pobiera PDF-y z maila, odczytuje raport przyjazdow i wyjazdow KWHotel,
wylicza statusy HK i zapisuje plany w formacie czytanym przez panel recepcji.

## Konfiguracja

1. Skopiuj `config.example.json` do `config.local.json`.
2. Ustaw IMAP dla skrzynki `raporty@conradcomfort.pl`.
3. Haslo trzymaj w zmiennej srodowiskowej podanej w `passwordEnv`, np.
   `HK_AUTOMATION_MAIL_PASSWORD`.
4. Na poczatek zostaw `"dryRun": true`.

Domyslny folder wynikow:

```text
C:\zmiany i raporty\hk-automation
```

Panel recepcji czyta plany z:

```text
C:\zmiany i raporty\hk-automation\plans\hk-plan-YYYY-MM-DD.json
```

## Komendy

```bash
npm run hk:auto:once -- --config scripts/hk-automation/config.local.json
npm run hk:auto -- --config scripts/hk-automation/config.local.json
npm run hk:auto:test
```

Tryb `hk:auto` dziala ciagle i sprawdza mail co 15 minut.

Alternatywnie mozna zainstalowac zadanie Windows Task Scheduler:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\hk-automation\install-windows-task.ps1
```

Zadanie jest uruchamiane przez `run-once-hidden.vbs`, wiec cykliczne sprawdzanie
poczty nie pokazuje okna terminala.

## Usuwanie starych maili

Po kazdym cyklu (poza `dryRun`) skrypt trwale usuwa z folderu `mailbox.folder`
wszystkie maile starsze niz `mailbox.deleteAfterDays` (domyslnie 4 dni, liczone
od daty odebrania). Dotyczy calego folderu, nie tylko przetworzonych raportow —
skrzynka `raporty@conradcomfort.pl` sluzy wylacznie do odbioru raportow KWHotel.
Ustaw `"deleteAfterDays": 0` w configu, zeby wylaczyc usuwanie.

## Lista przyjazdow / wyjazdow (goscie, grupy, firmy) — ekstrakcja LLM

Oprocz siatek (tygodniowy, dzienny, posilki) KWHotel wysyla tez "Liste
przyjazdow" i "Liste wyjazdow" — to wolny tekst (imie, telefon, grupa, uwagi),
nie da sie tego parsowac tak niezawodnie regexem jak siatek. Te dwa raporty sa
czytane przez LLM (Groq), co daje dwie rzeczy naraz:

1. Wyciaga to, czego nie bylo wczesniej: gosc, telefon, pelna liste pokoi
   grupy z jej nazwa/numerem, typ pokoju z uwag (tylko gdy uwaga opisuje
   KONKRETNY pokoj, nie zbiorczy sklad calej grupy), czy rezerwacja jest
   firmowa/grupowa.
2. Rezerwacje firmowe/grupowe dostaja automatycznie wymuszone `PG` (pelne
   sprzatanie generalne) na kazdy dzien pobytu, bez czekania az recepcja
   wpisze to recznie w uwagach KWHotel (dotychczasowa konwencja z literalnym
   "PG" w tekscie nadal dziala, ale teraz jest tez automatyczna detekcja po
   zrodle rezerwacji / nazwie firmy).

Wlaczenie:

```json
"llm": {
  "enabled": true,
  "apiKeyEnv": "HK_AUTOMATION_GROQ_API_KEY",
  "model": "llama-3.3-70b-versatile"
}
```

Klucz Groq API w zmiennej srodowiskowej `HK_AUTOMATION_GROQ_API_KEY` (albo
`.env` w katalogu, z ktorego uruchamiasz serwis — patrz `loadDotEnvIfPresent`
w `lib/config.cjs`). Gdy `llm.enabled` jest `false` albo klucza brakuje,
te dwa raporty nadal dzialaja, ale generycznym parserem (samo pokoj+data,
bez gościa/grupy/PG-wymuszenia) — nic sie nie wywala, po prostu mniej danych.

Wyciagniete dane gosci/grup zapisywane sa lokalnie do wgladu w:

```text
C:\zmiany i raporty\hk-automation\guests\guests-<timestamp>.json
```

To na razie TYLKO lokalny podglad — nie leci jeszcze do Supabase/hk_plan
(wymaga nowej tabeli, do ustalenia osobno). Liczba osob w grupie jest
korygowana liczba sniadan z Raportu Posilkow (patrz nizej), jesli oba
raporty przyszly w tej samej paczce maili — pole "Liczba os." przy samej
rezerwacji grupowej bywa zawyzone wzgledem realnej frekwencji.

## Logika statusow

- `W`: pokoj ma wyjazd danego dnia.
- `WP`: pokoj ma wyjazd i przyjazd tego samego dnia.
- `PG`: pobyt trwa przez dany dzien, bez wyjazdu.
- `PGZ`: pobyt trwa przez dany dzien i jest to co najmniej N-ta noc pobytu,
  gdzie `N` ustawia `statusLogic.pgzAfterStayNights`.

Regula `PGZ` jest konfigurowalna, bo w hotelach bywa roznie rozumiana.
