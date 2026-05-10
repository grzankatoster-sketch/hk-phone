@echo off
cd /d "%~dp0"
title Conrad Comfort — Publikowanie aktualizacji

echo.
echo  ================================================
echo   Conrad Comfort - Publikowanie aktualizacji
echo  ================================================
echo.

if "%GH_TOKEN%"=="" (
    echo  [BLAD] Brak tokenu GitHub!
    echo.
    echo  Ustaw token:
    echo  Win+S - "Zmienne srodowiskowe" - Nowa
    echo  Nazwa: GH_TOKEN
    echo  Wartosc: twoj_token_z_github.com/settings/tokens
    echo.
    pause
    exit /b 1
)

echo  Aktualna wersja:
node -e "console.log('  v' + require('./package.json').version)"
echo.
set /p NEW_VERSION= Nowa wersja (np. 1.1.0, Enter = bez zmiany): 

if not "%NEW_VERSION%"=="" (
    node -e "const fs=require('fs');const p=require('./package.json');p.version='%NEW_VERSION%';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"
    echo  [OK] Wersja zmieniona na %NEW_VERSION%
)

echo.
echo  Budowanie i wysylanie...
call npm run release

if %ERRORLEVEL% NEQ 0 (
    echo  [BLAD] Cos poszlo nie tak!
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   SUKCES! Hotel dostanie aktualizacje automatycznie
echo  ================================================
pause
