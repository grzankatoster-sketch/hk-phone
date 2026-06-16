@echo off
cd /d "%~dp0..\.."
node "%~dp0service.cjs" --once --config "%~dp0config.local.json"
