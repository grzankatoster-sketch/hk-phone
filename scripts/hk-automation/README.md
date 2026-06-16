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

## Logika statusow

- `W`: pokoj ma wyjazd danego dnia.
- `WP`: pokoj ma wyjazd i przyjazd tego samego dnia.
- `PG`: pobyt trwa przez dany dzien, bez wyjazdu.
- `PGZ`: pobyt trwa przez dany dzien i jest to co najmniej N-ta noc pobytu,
  gdzie `N` ustawia `statusLogic.pgzAfterStayNights`.

Regula `PGZ` jest konfigurowalna, bo w hotelach bywa roznie rozumiana.
