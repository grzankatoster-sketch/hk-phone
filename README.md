# Conrad Comfort — Panel Recepcji

## Szybki start (na Twoim laptopie)

```bash
# 1. Zainstaluj zależności (raz)
npm install

# 2. Uruchom w trybie deweloperskim (przeglądarka)
npm run dev

# 3. Uruchom jako aplikacja Electron
npm run electron:dev

# 4. Zbuduj instalator .exe (bez wysyłki)
npm run dist

# 5. Zbuduj i wyślij aktualizację na GitHub (hotel pobierze automatycznie)
npm run release
```

## Wysyłanie aktualizacji do hotelu

Przed pierwszym `npm run release`:
1. Zmień `TWOJ_LOGIN_GITHUB` w package.json na swój login GitHub
2. Ustaw token: zmienna środowiskowa `GH_TOKEN = twój_token`
3. `npm install` (żeby zainstalować electron-updater)

Szczegółowa instrukcja: `auto-update/INSTRUKCJA.md`
